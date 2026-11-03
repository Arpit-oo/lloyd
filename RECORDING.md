# Screen recording script (~10 minutes)

Covers every item the brief asks for. Before recording, run `npm run dev` and open http://localhost:3000 at about 1600×950. Start with an empty Memory panel: Memory → delete everything, or use a fresh `DATA_DIR`.

## 1. The brand layer (2 min)

1. Click **Brand**.
2. **Which document wins**: the brand's own order of authority, quoted. Point at `Brand_Guidelines_v3_FINAL.md` sitting in the last tier, and the principle "File names, version numbers and words like FINAL or CURRENT decide nothing".
3. **Conflicts**: open *FedRAMP authorization status* (sales deck vs. legal sheet, USE / DON'T USE with quotes), then *Approved customer count* (300+ vs. "more than 140").
4. **Names**: Tallowatch → Evenburn, Field Report → Containment Report.
5. **Images**: the excluded ones, each with its reason (deprecated logo, person who left, events only).
6. **Brand kernel**: "this ~2.5k-token block is the only part of the brand that is always in context; everything else is retrieved per asset".

## 2. Brief 3 end to end (4 min)

1. **New campaign**, then drag in `briefs/brief-3-regulated-teams-push.md`.
2. **Brand check card**: FedRAMP Authorized refused with the cert sheet quote; Vaskell name, result and quote refused; the strategy flagged ("would still lead with authorization not yet achieved") with a stronger lead proposed.
3. **Question**: one question, what should lead now, with a default. Pick an option or *Use defaults*.
4. **Plan**: read the mix rationale. Make an adjustment: drop one asset with the ✕, or type "add an X post for platform engineers". Then **Approve and write**.
5. Assets fill in on the right. Click through the landing page, email and LinkedIn previews. Show a **Checks** tab, and a version picker where the automatic fix made v2.

## 3. An edit in chat (1 min)

Type "Shorten the first LinkedIn post by about a third". Show:
- the edit card says one asset changed
- the version picker shows v1 → v2
- the other assets are untouched
- the turn cost under the card (about $0.01–0.02)

## 4. The exact prompt for one asset (1.5 min)

1. Open an asset's **Prompt** tab, or **Inspector** in the header.
2. Walk through the blocks in order: *agent rules + brand kernel* (cache breakpoint), *campaign* (cache breakpoint), *playbook* (cache breakpoint), *asset context* (retrieved facts with their tier and source, persona, past examples marked "style only", image candidates after filters).
3. Point at the cached-tokens figure in the stats row.

## 5. Tokens and cost (0.5 min)

Inspector → **Cost by step**: campaign total, edit cost, cache hit rate, cost per step. Mention COSTS.md for all three briefs.

## 6. Memory across chats (1.5 min)

1. In the campaign, type "The LinkedIn posts are too salesy, keep them short and plain, and we never use hashtags", then "We're done with this campaign".
2. **Remember these?** card: keep the preferences, and show that nothing campaign-specific (dates, FedRAMP, products) was proposed.
3. **New campaign**, then Brief 2. The questions card shows "Using 2 things I remember". Open **Memory** to show what was kept, and that it can be edited or forgotten.
4. When its LinkedIn posts are written: no hashtags, short.
