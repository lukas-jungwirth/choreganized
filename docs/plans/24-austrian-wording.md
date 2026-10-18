# 24 · Austrian wording (fixed word list)

**Goal:** an Austrian household imports German recipes that say Sahne, Quark and Hackfleisch. It
cooks with Obers, Topfen and Faschiertes, and shops for them too. A household setting, **Recipe
wording: as written / Austrian German**, adapts imported German recipes to Austrian terms. The
word list is **fixed in code** for v1, reviewed by Lukas. An editable list is a later step.

Depends on: 22. SPEC: §6, §9. Design: there is no frame. This is a Settings row plus a
`SheetOption` sheet, the Language pattern.

## Build

- **Schema**: `households.recipe_wording` (text, null). Null means as written; `'austrian'`
  means Austrian German. It is an enum so more targets can follow.
- **Settings → Household**: a "Recipe wording" row. The owner sets it, and members see it
  read-only.
- `utils/wording.ts` `AUSTRIAN_TERMS`: about 40 pairs, longest first. For example Schlagsahne →
  Schlagobers, Sahne → Obers, saure Sahne / Schmand → Sauerrahm, Quark → Topfen, Hackfleisch →
  Faschiertes, Kartoffeln → Erdäpfel, Tomaten → Paradeiser, Aprikosen → Marillen, Blumenkohl →
  Karfiol, Meerrettich → Kren, Puderzucker → Staubzucker, Eiweiß → Eiklar, Eigelb → Dotter.
- It applies **on import only, and to German recipes only**. Saved recipes are never rewritten.
  - **AI path**: the prompt asks for Austrian German, with the list as a glossary. The model gets
    articles and grammar right.
  - **Non-AI import**: `applyWording()` on **ingredient names only**. It matches whole words with
    Unicode boundaries (`(?<!\p{L})…(?!\p{L})`, `u` flag) and keeps the case. The same pass runs
    over AI output for consistency.
  - **Highlighting**: each pair is a synonym in `step-highlight.ts` `aliases()`, so an "Obers"
    ingredient still underlines (and plan 23 still scales) "Sahne" in a step a non-AI import left
    as written.
- Docs: SPEC §6, §9 (the language switch never translates household content, but a household's
  wording choice applies at import), DECISIONS.

## Acceptance

- [ ] With wording set to Austrian, a German JSON-LD recipe with AI off arrives with "Obers" and
      "Topfen" in the ingredient list, and cook mode still underlines "Sahne" in its steps.
- [ ] With AI on, ingredients and steps arrive in Austrian German.
- [ ] An English recipe is untouched. A compound word ("Sahnejoghurt") is untouched.
- [ ] A member sees the setting read-only.
- [ ] `npm run verify` and `npm run test:visual` clean.

Out of scope: editing the word list; translating between languages; rewriting saved recipes.
