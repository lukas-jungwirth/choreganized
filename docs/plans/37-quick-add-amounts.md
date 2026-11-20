# 37 · Quick add reads the amount wherever it is typed

**Status: done (2026-11-20, v0.5.0, DECISIONS #269).** Agreed with Lukas on 2026-11-20. Depends on: 36 (both steps merged, because it
edits the same files).
SPEC: §3.1 (the add field) gains the rules below. Design: no frame; the chip is described here.

**Goal:** since plan 36 the add field has no sliders button, so the only way to give an amount
while adding is to type it. Lukas's wording: "i input Gurken x3 or 3 stk or so and this is
automatically decided … but this must work as good as possible". Today only an amount typed
**in front** of the name is read ("3 Gurken", "500g Mehl"). "Gurken x3", "Gurken 3 Stk" and
"Milch 2l" are added as plain names, "1. Mai Kerzen" becomes ". Mai Kerzen" ×1, and nothing
shows what was understood until the row appears.

## What it does

1. **The amount may stand at either end of the line**, with or without a space before its unit.
2. **A chip in the field shows what was understood, before Enter.** One tap switches it off and
   the line is added exactly as typed.
3. **A correction sticks.** A line the household already uses as a name is that name and is
   never split again.

A separate number field beside the name was considered and dropped: it costs width on every add
although most items have no amount, and it needs a tap to move between the two.

## The rules, in the order they are tried

The first rule that produces a name and an amount wins. A result is only accepted when a name
is left that contains a letter and is not itself a unit word; otherwise the line stays a name.

1. **Known name.** The whole line, trimmed and lowercased (`suggestionKey`), is in
   `shopping_suggestions` → name only. This is what makes a correction stick.
2. **Brackets at the end.** "Eier (10)", "Mehl (1 kg)", "Bier (6x)": the bracket holds an
   amount and nothing else. "LED bulbs (E27)" is not one and falls through.
3. **A count marker in front.** "3x Gurken", "x3 Gurken", "3 x Gurken". Not when a number
   follows the x ("3 x 40 Schrauben" is a size).
4. **A count marker at the end.** "Gurken x3", "Gurken 3x", "Gurken ×3", "Gurken x 3",
   "Gurken 3 x". Not when a number stands before the x ("Schrauben 4 x 40").
5. **An amount in front.** A number fused with a unit ("500g Mehl"), a number and a unit word
   ("2 l Milch", "3 Stk Gurken"), or a bare whole number or fraction ("3 Gurken", "½ Brot").
   Not a decimal without a unit ("0,5 Cola" is a name), not an ordinal ("1. Mai Kerzen"), not
   when "%", "x" or "in" plus a number follows ("100 % Orangensaft", "2 in 1 Shampoo").
6. **A measured amount at the end.** "Milch 2l", "Gurken 3 Stk", "Erdäpfel 1,5 kg". Not right
   after an x ("Wasser 6 x 1,5l" stays a name).
7. **A bare whole number at the end, 1 to 99.** "Gurken 3", "Eier 10". Not after a size word
   (gr, gr., größe, grösse, groesse, nr, nr., no, no., typ, type, size, lsf, spf, stufe, klasse,
   din), not after an x. Three digits never ("Mehl 480").

**Counts** are whole numbers from 1 to `QUANTITY_MAX`; a count marker stores no unit, "Stk"
stores `pcs` (both render "×3").
**Units**: the spellings `UNIT_ALIASES` already knows for g, kg, ml, L, pcs and pack, plus
`pkg` / `pkg.` (pack), `stueck` (pcs), and the Austrian deli counter: **`dag`, `dkg`, `deka`
are ten grams** ("20 dag Extrawurst" → 200 g). `tbsp`/`tsp` are recipe units and are not read
here.
**Past the ceiling**: 1000 g and more becomes kg, 1000 ml and more becomes L ("Mehl 1500g" →
1.5 kg). Any other amount above `QUANTITY_MAX` leaves the line a name, as today.
**The name** keeps its spelling; separators left at its edges (", ; : -") are trimmed.

Not read, on purpose: number words ("zwei Zitronen"), container words as units ("2 Dosen
Tomaten" stays Dosen Tomaten ×2, which reads fine), several items in one line.

**Misreads that are accepted**, because the chip shows them and one tap fixes them for good:
"Windeln 4" → Windeln ×4, "7 Tage Müsli" → Tage Müsli ×7, "3 Wetter Taft". No word list can
end these; rule 1 does.

## The chip

```
[ 🧺⌄ ]  Gurken x3                         ( ×3 )  [ + ]
```

- Appears at the right of the field, before the + button, as soon as the typed line parses to
  an amount. It shows the amount the way a row does: "×3", "500 g", "1.5 kg", "2 L".
- It is a toggle button (`aria-pressed`, a label like "Amount ×3. Tap to add the line as
  typed"). On: sage tint. Off: muted and struck through, so it can be switched back on. It goes
  back to on when the field is emptied.
- The typed text is not rewritten while typing. After Enter the row shows the name and the
  amount, and the field is empty.
- The remembered-list rule and the suggestions already key on `quickAddName`, so they follow
  the new parse without further work: "Shampoo x2" still moves the icon to Drugstore.
- In an opened checklist (plan 36 step 2) the chip and the parse behave the same.

**Client and server.** `parseQuickAdd(text, known)` stays one pure function in `utils/lists.ts`.
The field calls it on every keystroke with the suggestion names it already has. The form posts
the raw line plus `literal=1` when the chip is off. The action parses again (it never trusts
the browser), with the known-name check against the table, unless `literal` is set. A literal
add writes the whole line to `shopping_suggestions`, which is what rule 1 reads next time.
Without JavaScript the server's parse still applies; there is just no chip.

## The contract

`utils/lists.test.ts` must carry every line below (`[typed, name, quantity, unit]`, `N` =
`null`; quantity `N` means the line stays a name exactly as typed, whitespace collapsed). They
were run against a reference prototype on 2026-11-20: 119 of 119 pass. A case that turns out to
be wrong for a reason found while building is changed here, with a line in DECISIONS, not
silently in the test.

```js
const N = null;
// [typed, name, quantity, unit]  ·  quantity null = stays a name, exactly as typed
const CASES = [
	// Lukas's own examples and their neighbours
	['Gurken x3', 'Gurken', 3, N],
	['Gurken X3', 'Gurken', 3, N],
	['Gurken ×3', 'Gurken', 3, N],
	['Gurken 3x', 'Gurken', 3, N],
	['Gurken x 3', 'Gurken', 3, N],
	['Gurken 3 x', 'Gurken', 3, N],
	['Gurken 3', 'Gurken', 3, N],
	['Gurken 3 Stk', 'Gurken', 3, 'pcs'],
	['Gurken 3 stk.', 'Gurken', 3, 'pcs'],
	['Gurken 3 Stück', 'Gurken', 3, 'pcs'],
	['Gurken 3stk', 'Gurken', 3, 'pcs'],
	['3 Gurken', 'Gurken', 3, N],
	['3x Gurken', 'Gurken', 3, N],
	['3 x Gurken', 'Gurken', 3, N],
	['x3 Gurken', 'Gurken', 3, N],
	['3 Stk Gurken', 'Gurken', 3, 'pcs'],
	['3 Stück Gurken', 'Gurken', 3, 'pcs'],
	// Weights and volumes, either end, fused or spaced
	['500g Faschiertes', 'Faschiertes', 500, 'g'],
	['500 g Faschiertes', 'Faschiertes', 500, 'g'],
	['Faschiertes 500g', 'Faschiertes', 500, 'g'],
	['Faschiertes 500 g', 'Faschiertes', 500, 'g'],
	['1,5 kg Erdäpfel', 'Erdäpfel', 1.5, 'kg'],
	['Erdäpfel 1,5 kg', 'Erdäpfel', 1.5, 'kg'],
	['Erdäpfel 1.5kg', 'Erdäpfel', 1.5, 'kg'],
	['2 l Milch', 'Milch', 2, 'L'],
	['2l Milch', 'Milch', 2, 'L'],
	['Milch 2l', 'Milch', 2, 'L'],
	['Milch 2 L', 'Milch', 2, 'L'],
	['Milch 2 Liter', 'Milch', 2, 'L'],
	['250 ml Schlagobers', 'Schlagobers', 250, 'ml'],
	['Schlagobers 250ml', 'Schlagobers', 250, 'ml'],
	['1/2 kg Butter', 'Butter', 0.5, 'kg'],
	['½ kg Butter', 'Butter', 0.5, 'kg'],
	['½ Brot', 'Brot', 0.5, N],
	// Austrian deli counter: Deka
	['20 dag Extrawurst', 'Extrawurst', 200, 'g'],
	['Extrawurst 20 dag', 'Extrawurst', 200, 'g'],
	['15dkg Käse', 'Käse', 150, 'g'],
	['10 Deka Schinken', 'Schinken', 100, 'g'],
	// Past the field's ceiling: grams and millilitres step up, counts stay a name
	['1000 g Mehl', 'Mehl', 1, 'kg'],
	['Mehl 1500g', 'Mehl', 1.5, 'kg'],
	['1500 ml Wasser', 'Wasser', 1.5, 'L'],
	['5000 eggs', '5000 eggs', N, N],
	// Packs
	['2 Pck. Butter', 'Butter', 2, 'pack'],
	['2 Packungen Nudeln', 'Nudeln', 2, 'pack'],
	['Nudeln 2 Pkg', 'Nudeln', 2, 'pack'],
	['Nudeln 2 Pkg.', 'Nudeln', 2, 'pack'],
	['2 pack butter', 'butter', 2, 'pack'],
	// A count plus a size in the name
	['6x Cola 0,5l', 'Cola 0,5l', 6, N],
	['Cola 0,5l 6x', 'Cola 0,5l', 6, N],
	['2 Cola 0,5l', 'Cola 0,5l', 2, N],
	['Milch 3,5% 2l', 'Milch 3,5%', 2, 'L'],
	['Batterien AA 4', 'Batterien AA', 4, N],
	['Batterien AA x4', 'Batterien AA', 4, N],
	['2 Dosen Tomaten', 'Dosen Tomaten', 2, N],
	['3 Flaschen Wein', 'Flaschen Wein', 3, N],
	// Punctuation and brackets
	['Gurken, 3 Stk', 'Gurken', 3, 'pcs'],
	['Gurken: 3', 'Gurken', 3, N],
	['Eier (10)', 'Eier', 10, N],
	['Mehl (1 kg)', 'Mehl', 1, 'kg'],
	['Bier (6x)', 'Bier', 6, N],
	['6 x 1,5l Wasser', '1,5l Wasser', 6, N],
	['M8 Muttern 10', 'M8 Muttern', 10, N],
	['Semmeln 12', 'Semmeln', 12, N],
	['Eier 10', 'Eier', 10, N],
	['Eier 100', 'Eier 100', N, N],
	['100 Eier', 'Eier', 100, N],
	['0 Gurken', '0 Gurken', N, N],
	['Gurken x0', 'Gurken x0', N, N],
	['Gurken 0', 'Gurken 0', N, N],
	['  3   Gurken ', 'Gurken', 3, N],
	['6 eggs', 'eggs', 6, N],
	['eggs x12', 'eggs', 12, N],
	// Names that only look like amounts: all stay exactly as typed
	['Gurken', 'Gurken', N, N],
	['7up', '7up', N, N],
	['4-Kornbrot', '4-Kornbrot', N, N],
	['WD-40', 'WD-40', N, N],
	['Tempo 10er', 'Tempo 10er', N, N],
	['LED bulbs (E27)', 'LED bulbs (E27)', N, N],
	['Schrauben 4x40', 'Schrauben 4x40', N, N],
	['Schrauben 4 x 40', 'Schrauben 4 x 40', N, N],
	['1. Mai Kerzen', '1. Mai Kerzen', N, N],
	['2 in 1 Shampoo', '2 in 1 Shampoo', N, N],
	['100 % Orangensaft', '100 % Orangensaft', N, N],
	['Milch 3,5%', 'Milch 3,5%', N, N],
	['Windeln Gr. 4', 'Windeln Gr. 4', N, N],
	['Windeln Größe 4', 'Windeln Größe 4', N, N],
	['Sonnencreme LSF 30', 'Sonnencreme LSF 30', N, N],
	['Kaffee Nr 3', 'Kaffee Nr 3', N, N],
	['Mehl 480', 'Mehl 480', N, N],
	['Mehl Typ 480', 'Mehl Typ 480', N, N],
	['Cola 0,5', 'Cola 0,5', N, N],
	['0,5 Cola', '0,5 Cola', N, N],
	['Papier A4', 'Papier A4', N, N],
	['Batterien CR2032', 'Batterien CR2032', N, N],
	['Öl 5W30', 'Öl 5W30', N, N],
	['Fotos 10 x 15', 'Fotos 10 x 15', N, N],
	['3 x 40 Schrauben', '3 x 40 Schrauben', N, N],
	['Wasser 6 x 1,5l', 'Wasser 6 x 1,5l', N, N],
	['Wasser 6 x 1,5 l', 'Wasser 6 x 1,5 l', N, N],
	['Joghurt 0%', 'Joghurt 0%', N, N],
	['Bier 6er', 'Bier 6er', N, N],
	['M8 Muttern', 'M8 Muttern', N, N],
	['Zwei Zitronen', 'Zwei Zitronen', N, N],
	['ein Brot', 'ein Brot', N, N],
	// Nothing to name: stays as typed
	['2', '2', N, N],
	['2 kg', '2 kg', N, N],
	['500g', '500g', N, N],
	['2 Stk.', '2 Stk.', N, N],
	['x3', 'x3', N, N],
	['3x', '3x', N, N],
	['', '', N, N],
	// Accepted misreads: the chip shows them, one tap fixes them, and the name is remembered
	['Windeln 4', 'Windeln', 4, N],
	['7 Tage Müsli', 'Tage Müsli', 7, N],
	['3 Wetter Taft', 'Wetter Taft', 3, N]
];
// The same lines once the household has used them as names: never split again.
const KNOWN = new Set(['windeln 4', '7 tage müsli', '3 wetter taft', 'cola 6'].map(key));
const KNOWN_CASES = [
	['Windeln 4', 'Windeln 4', N, N],
	['7 Tage Müsli', '7 Tage Müsli', N, N],
	['windeln 4', 'windeln 4', N, N],
	['Cola 6', 'Cola 6', N, N],
	['Windeln 4 x2', 'Windeln 4', 2, N]
];
```

## Build

- `utils/ingredients.ts`: add the `pkg`, `pkg.`, `stueck` spellings to `UNIT_ALIASES`. The
  Deka factor lives in `utils/lists.ts` (a recipe line does not convert).
- `utils/lists.ts`: `parseQuickAdd(text, known?)` by the rules above. It no longer delegates to
  `parseIngredient`, whose leniency is right for recipes and wrong here. `quickAddName` keeps
  its signature.
- `components/shopping/QuickAdd.svelte`: the chip, the `literal` field. Tokens and `--fs-*`
  steps only; the chip must survive 200% text (`min()` on its size if the field cannot grow).
- `server/shopping-actions.ts`: honour `literal`; pass the known names to the parse.
- Copy in `en.ts` / `de.ts` for the chip's label (a function, it carries the amount).
- SPEC §3.1 rewritten for the add field; one line in DECISIONS.
- Version: a feature, next minor above the last `v*` tag unless `dev` already carries it.

**Tests that fail without it**: the contract in `utils/lists.test.ts` · integration: a literal
add writes the suggestion and the same line is not split on the second add; "Gurken x3" stores
name "Gurken", quantity 3 · Playwright: type "Gurken x3" → the chip says ×3 → Enter → the row
reads Gurken ×3; type "Windeln 4", tap the chip, Enter → the row reads "Windeln 4"; type it
again → no chip · visual baseline of the field with the chip, light and dark.

## Acceptance (walk these in the running app)

1. "Gurken x3", "3x Gurken", "Gurken 3 Stk", "Milch 2l", "20 dag Extrawurst" each show the
   chip while typing and land as name + amount.
2. "7up", "Schrauben 4x40", "1. Mai Kerzen", "Windeln Gr. 4" show no chip and land as typed.
3. "Windeln 4": chip ×4. Tap it, Enter: the row is "Windeln 4". Type "Windeln 4" again: no
   chip. Type "Windeln 4 x2": chip ×2, row "Windeln 4" ×2.
4. The chip is reachable and operable by keyboard and announces its state.
5. "Shampoo x2" (Shampoo known in Drugstore) moves the list icon and lands in Drugstore ×2.
6. The same lines typed into an opened list behave the same.
7. 200% text: the field, the chip and the + button stay on one line and usable.
