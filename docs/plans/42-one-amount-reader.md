# 42 · One amount reader for lists, recipes and steps

**Status: done (2026-11-23, v0.8.0, DECISIONS #319).** Agreed with Lukas on 2026-11-23 (DECISIONS #311, #313). Depends on: 37.
First of the recipe rebuild (plans 42–48). SPEC: §3.1, §4.4. Design: no frame.

**Goal:** Lukas, 2026-11-23: "I'm not sure if the detection of the measures for the ingredients
is the same as on the lists now, because I think it works slightly worse … probably should be
one shared helper." It is not the same. `parseIngredient` (`utils/ingredients.ts`) and
`parseQuickAdd` (`utils/lists.ts`) are separate code and disagree, measured on 2026-11-23:

| Typed               | Recipe line today     | List line today       |
| ------------------- | --------------------- | --------------------- |
| `20 dag Extrawurst` | 20 × "dag Extrawurst" | 200 g Extrawurst      |
| `Mehl 500g`         | name only             | 500 g Mehl            |
| `1 - 2 EL Olivenöl` | 1 tbsp Olivenöl       | 1 × "2 EL Olivenöl"   |
| `½ TL Zimt`         | 0.5 tsp Zimt          | 0.5 × "TL Zimt"       |
| `1 x Backpulver`    | 1 pcs Backpulver      | 1 × Backpulver        |
| `ca. 200 g Butter`  | name only             | name only             |
| `2 Zehen Knoblauch` | 2 × "Zehen Knoblauch" | 2 × "Zehen Knoblauch" |
| `2 cups flour`      | 2 × "cups flour"      | 2 × "cups flour"      |

## What it does

1. **One module reads an amount**, `utils/amounts.ts`: number spellings, unit words, ranges,
   fused units, the Deka. `ingredients.ts`, `lists.ts` and `step-amounts.ts` all call it and
   keep no number or unit patterns of their own.
2. **Two profiles, one reader.** A list line and a recipe line are typed differently, so the
   rules that decide _where_ an amount may stand stay apart:
   - `list`: plan 37's seven rules, unchanged. Its 119-case contract must pass untouched.
   - `recipe`: the amount leads the line (a trailing fused amount, "Mehl 500g", is read too).
     tbsp and tsp count as units here and not on a list.
3. **A recipe line may carry a counting word** (DECISIONS #313). When the word after the number
   is not one of the eight units but is on the counting-word list below, it is returned as the
   line's unit **as written**, and the name is what follows: "2 Zehen Knoblauch" → 2 · "Zehen" ·
   Knoblauch. The list profile does not read counting words (plan 37 said so on purpose, and a
   shopping row has nowhere to put one).
4. **Reads it did not read before**, in the recipe profile:
   - a leading "ca.", "ca", "etwa", "about", "approx." is skipped: "ca. 200 g Butter" → 200 g;
   - `dag`, `dkg`, `deka` are ten grams, as on lists;
   - "1 - 2 EL", "2-3", "2 bis 3", "2 to 3" keep the first value (as today, now in one place);
   - a decimal point or comma in either language: "0.5 Liter", "0,5 l", "12.5 ml";
   - "1 1/2", "1 ½", "1½", "1 and 1/2";
   - spelled-out units in both languages already known ("Gramm", "Esslöffel", "Teelöffel",
     "Liter") plus `Tbsp.`, `tsp.`, `EL.`, `TL.` with a dot, and `El` / `Tl` in any casing;
   - a plural bracket on the name is dropped: "Zwiebel(n)" → Zwiebel, "Ei(er)" → Ei,
     "Zehe/n" → Zehe.
5. **Not read, on purpose:** cups, oz and lb (the AI import converts them, plan 44; a typed
   "2 cups flour" stays 2 × "cups flour"); number words ("zwei"); two measures in one line
   ("1 kg / 2 lb" keeps the first); a weight in a trailing bracket ("4 Schnitzel (à 150 g)"
   stays 4).

## Counting words

Matched case-insensitively, singular or plural, stored the way the line wrote them.

- German: Zehe(n), Bund, Dose(n), Becher, Glas / Gläser, Flasche(n), Prise(n), Msp. /
  Messerspitze(n), Schuss, Spritzer, Scheibe(n), Stange(n), Zweig(e), Blatt / Blätter,
  Würfel, Handvoll, Tasse(n), Kopf / Köpfe, Knolle(n), Stiel(e), Tropfen, Beutel, Tafel(n).
- English: clove(s), bunch(es), can(s), tin(s), jar(s), bottle(s), pinch(es), dash(es),
  slice(s), stick(s), stalk(s), sprig(s), leaf / leaves, cube(s), handful(s), head(s), bag(s).

A word that is also a common ingredient is left out ("Kugel", "Rolle", "Stück" is a unit).
`containerWord(word)` says whether a counting word is a container (Dose, Becher, Glas, Flasche,
Beutel, can, tin, jar, bottle, bag): plan 43 uses it to put a container on the shopping list as
Packung.

## Build

As built (deviations from the first draft of this plan are in DECISIONS #319):

- `src/lib/utils/amounts.ts` (new, pure, written with `.ts` import extensions like its
  neighbours) owns every spelling: `unitFromWord`, `measureOf` (with the Deka), `countingWord`,
  `isContainerWord`, `measureKey`, `numberOf`, `fusedOf`, `markerOf`, `isTimes`,
  `leadingAmount`, `rangeLength`, `parseQuantity`, `NUMBER_PATTERN`, `UNIT_WORDS`,
  `COUNTING_WORDS`.
- The rules about where an amount stands stay with each line's parser: `lists.ts`
  (`parseQuickAdd`, plan 37's seven rules) and `ingredients.ts` (`parseIngredient`, the amount
  leads). Neither keeps a number or unit pattern of its own.
- `ParsedIngredient.unit` may hold a counting word; `formatIngredient` prints a known unit
  through the catalog label and a counting word as stored. The round trip
  (`parse(format(row))`) holds for both.
- `step-amounts.ts`: its number and unit patterns come from `amounts.ts`, it reads counting
  words too, and compares by `measureKey` ("2 Zehen" in the step agrees with a row in "Zehe").
- `IngredientSheet.svelte` offers the row's own counting word beside the eight units.
- Storage is unchanged: `recipe_ingredients.unit` is already free text.
- Shopping is unchanged: a counting word reaches the list as written ("Knoblauch · 2 Zehen")
  until plan 43 applies DECISIONS #313.
- Docs: SPEC §4.4, DATA-MODEL (`unit`), DECISIONS #319.

## Tests

- `utils/amounts.test.ts`: number and unit reading, table-driven.
- `utils/lists.test.ts`: the 119 cases, unchanged.
- `utils/ingredients.test.ts`: a contract table for the recipe profile, at least 80 lines,
  built from the real lines of the 2026-11-23 probe (plan 44 lists the pages): every row of the
  table above, "1 Bund Petersilie (oder TK)", "1 Msp. Muskatnuss, frisch geriebene", "0.5 Liter
  Milch", "3,5 kg Gans", "1/8 l Orangensaft", "130 Gramm Mehl", "1 1/2 Teelöffel Zimt",
  "750g beef mince", "2 cloves garlic", "etwas Rotwein", "Salz und Pfeffer", "7up",
  "1. Mai Kerzen".
- Round trip for every contract row.

## Acceptance

- [x] The eight rows of the table above read the same in a recipe line and in a list line,
      apart from the two documented differences (tbsp/tsp and counting words are recipe-only).
- [x] No number or unit regular expression is left outside `amounts.ts`, apart from
      `timer-parse.ts`, whose durations are not amounts.
- [x] In the editor, typing "2 Zehen Knoblauch" shows the chip "2 Zehen"; the recipe shows
      "Knoblauch" with "2 Zehen"; reopening the editor shows the same line (e2e).
- [x] Adding that recipe to the shopping list puts "Knoblauch" on it, with "2 Zehen" as its
      amount until plan 43 (integration).
- [x] `npm run verify` clean; no screen changed, so no new baselines.
