# Screen recording script (about 10 minutes)

Covers every item the brief asks for, in the order an evaluator thinks about them. Each step lists what to click, what to type (exact text, in `code`), and the one sentence to say.

## Before you record (5 min)

- Restart the server for a clean, fast run: stop it, then `npm run dev`. Close Docker Desktop and other heavy apps; the machine has run out of memory during long sessions.
- Browser at about 1600×950, zoom 100%, one tab. Hide bookmarks. Turn on Do Not Disturb.
- Theme: **Magi** (Settings → Appearance). Your name set in Settings, so messages show "Arpit".
- Brand: **Wickhold** (Brand box at the top of the sidebar).
- **Memory empty**: Sidebar → Memory → delete everything. (Section 6 needs a clean start.)
- Have `wickhold-candidate-package/candidate/briefs/` open in Explorer for dragging.
- Do one dry run off camera. Expect about $1 in API costs for a full take.

Talk slowly. Pause a second after each click so the viewer sees the result. If a model call takes a while, narrate the live checklist instead of waiting in silence.

## 0. Opening (30 s)

1. Open http://localhost:3000/lloyd. Scroll once, slowly, to the cost cards.
   > "This is Lloyd, a brand-aware campaign agent. The brand folder is over 100k tokens and contradicts itself, so the point is getting the right parts into each prompt."
2. Click **Start a campaign**.

## 1. The brand layer (2 min)

1. Click the **Brand** box → **What Lloyd knows about this brand**.
2. **Which document wins**: the authority order, quoted from the brand's own rules. Point at `Brand_Guidelines_v3_FINAL.md` in the last tier.
   > "A file called FINAL doesn't win because of its name. The brand says how authority works, and Lloyd follows that."
3. **Conflicts**: open *FedRAMP authorization status* (sales deck vs. the legal sheet, with USE / DON'T USE and quotes). Then *Approved customer count*.
4. **Names**: Tallowatch → Evenburn.
5. **Images**: two excluded images, each with its reason.
6. **Kernel**:
   > "Only this ~2.5k-token summary is in every prompt. Everything else is looked up per asset."

## 2. One brief end to end (4 min)

1. **New campaign**. Drag in `brief-3-regulated-teams-push.md`.
2. Point at the **live checklist**: each step ticks off and the model's words stream in.
3. **Brand check card**: "FedRAMP Authorized" refused, with the quote; the customer name refused.
   > "It catches what legal would catch, before anything is written."
4. **Questions**: one question with a default.
   > "It only asks what changes the plan."
   Answer with an option, or type `use your defaults`.
5. **Plan**: read the reasoning for one asset. Adjust it: type `add an X post for platform engineers` (or drop an asset with ✕). Show the updated plan.
   > "Nothing is written until I approve."
6. Click **Approve and write**. Assets appear on the right as they're written.
7. Click through the **landing page**, **email** and **LinkedIn** previews.
   > "Each one looks like the real thing."
8. Open one asset's **Checks** tab: claims checked against brand facts. If a version picker shows v2, say the automatic fix made it.

## 3. An edit in chat (1 min)

1. Type `Shorten the first LinkedIn post by about a third`.
2. Show:
   - the edit card names the one asset that changed
   - **View changes** (before and after)
   - the other assets are untouched (click one)
   - the turn cost under the card, about 1–2¢
3. Optional, 20 s: type `make it Gen Z with monkey emojis`. Lloyd asks first because it goes against the brand. Click **Cancel, leave it as is**.
   > "Guard rail: it won't quietly break the brand."

## 4. The exact prompt for one asset (1.5 min)

1. On the LinkedIn post, open the **Prompt** tab, or open **Inspector** in the sidebar.
2. Walk the blocks in order:
   - agent rules + brand kernel (cache breakpoint)
   - campaign (cache breakpoint)
   - playbook (cache breakpoint)
   - asset context: retrieved facts with tier and source, persona, past examples marked "style only", and image candidates after filters
3. Point at the cached-tokens figure.
   > "Stable blocks go first, so they're cached across every asset."

## 5. Tokens and cost (30 s)

Inspector → **Cost by step**: campaign total, edit cost, cache hit rate, cost per step.

> "A full campaign is about 15 to 60 cents. All three briefs are in COSTS.md."

## 6. Memory across chats (1.5 min)

1. In the same campaign, type `The LinkedIn posts are too salesy. Keep them short and plain, and we never use hashtags.`
2. Then type `We're done with this campaign`.
3. **Remember these?** card: keep the preferences. Point out that nothing campaign-specific (dates, FedRAMP, product names) was proposed.
   > "It keeps how you like to work, and forgets one-off facts."
4. Press `Ctrl+K` → **New campaign**. Drag in `brief-2-vague-awareness-push.md`.
5. The questions card says it's using what it remembers. Open **Memory** to show what was kept, and that it can be edited, pinned or deleted.
6. When its LinkedIn posts are written: short, no hashtags.

## 7. Close (20 s)

> "Any brand folder works: add one from the Brand box. It runs locally with one command. Decisions and costs are in DECISIONS.md and COSTS.md."

## If something goes wrong on camera

- **A step is slow**: keep talking over the checklist; that's the feature.
- **An error notice**: say what it means, press the retry button, and move on. Cut it later if needed.
- **The server died**: stop, delete `.next`, `npm run dev`, and pick up from the last section. Every run is saved.
