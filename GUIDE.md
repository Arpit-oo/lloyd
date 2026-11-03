# Lloyd: user guide

Everything about the project in one place: what it is, who it's for, what it can and can't do, and how to test it. For setup details see [README.md](README.md); for design reasoning see [DECISIONS.md](DECISIONS.md); for costs see [COSTS.md](COSTS.md).

---

## 1. What it is

Lloyd is a chat app for planning and writing marketing campaigns that **follow a brand's rules**.

You give it a campaign brief. It checks the brief against the brand's documents, asks only the questions it needs, proposes a plan, writes the assets, checks every claim, and lets you edit them by chatting.

It runs on your own computer (`npm run dev`, then http://localhost:3000). Campaigns, assets and memory are stored locally in SQLite. Model calls go to OpenAI, and web research goes to Firecrawl.

### The problem it solves

Brand folders are big and messy: 100k+ tokens of guidelines, legal rules, old decks and sales notes, and they contradict each other. An old sales deck might say "FedRAMP Authorized" while the legal doc says never claim that. A generic AI writer either ignores the rules or follows whichever document it happened to read.

Lloyd reads the whole folder once and builds a **brand layer**:

- **Authority order:** which document wins when two disagree (legal beats a sales deck).
- **Settled conflicts:** each contradiction, the winning rule, and the quote it comes from.
- **Names:** current and former product names, so retired names are never used.
- **Claim rules:** approved and forbidden claims, and which customers may or may not be named.
- **Image rules:** which images may be used, and where.
- **Design tokens:** brand colours, fonts and logos, used to render previews.
- **Brand kernel:** a short summary of the brand that goes into every writing prompt.

### Who it's for

- **Marketers** who need on-brand content quickly without breaking legal rules.
- **Small teams** reviewing a campaign together (one writes, one checks) in a shared chat.
- **Anyone checking an AI writer's behaviour:** every model call is logged with its exact prompt, cost and cache use.

---

## 2. What it does, step by step

| Step | What happens | What you see |
|---|---|---|
| 1. Brief | You paste a brief, attach a file (PDF, Word, Markdown, text), or pick a sample | Your message in the chat |
| 2. Brand check | Each request in the brief is checked against brand and legal rules | A **Brand check** card: what it won't do as written, the rule, the source quote, and what it will do instead |
| 3. Questions | It asks only questions whose answers change the plan, each with a default | A **Questions** card with options. "Use suggested answers" accepts all the defaults |
| 4. Plan | It proposes a set of assets with audience, angle, key points and call to action | A **Plan** card with a cost and time estimate. Remove items, ask for changes, or approve |
| 5. Write | Assets are written in parallel; text streams in live | Assets fill in on the right, rendered like the real thing |
| 6. Guard | Every asset is checked for forbidden claims, wrong names, unapproved customers and risky wording. Blocking problems get one automatic fix | A **Checks** tab on each asset: pass, notes or blocked |
| 7. Edit | You ask for changes in chat; only the asset you name changes | An **Edit** card. The asset gets a new version, and the **Changes** tab shows the difference |
| 8. Finish | You say you're done; it suggests things to remember | A **Remember these?** card. Keep or forget each one; new campaigns use what you kept |

Asset types: **LinkedIn post, X post or thread, email, blog post, landing page.**

Web research: when a plan item needs a fresh third-party fact, Lloyd searches the web (Firecrawl), checks what it finds, and lists the sources in the asset's **Sources** tab.

---

## 3. Can I edit assets with chat?

**Yes, by chatting.** There is no "type directly into the asset" editor. Every change goes through chat, so it is checked against the brand rules again and saved as a new version.

### What chat edits can change

| You say | What happens |
|---|---|
| "Shorten the email" | The email's text is rewritten |
| "Make the second LinkedIn post punchier" | Only that post changes ("second" means the second one of that type) |
| "Change the headline on the landing page to …" | Only that field changes |
| "Use electric purple" / "make the background dark navy" | Colours change for that asset: main colour, accent, background and text. If a colour isn't a brand colour, Lloyd still applies it and says so; the preview shows a yellow warning |
| "Use a serif headline font" / "body in DM Sans" | Fonts change: the brand's own fonts, or a set list of 12 Google Fonts. Non-brand fonts are flagged |
| "Roomier" / "tighter" | Spacing: compact, normal or roomy |
| "Sharper corners" / "pill buttons" | Corners: sharp, rounded or pill |
| "Make it dark" / "no tinted sections" | Section tone: light, alternate (every other section tinted) or dark |
| "Centre the hero" / "put the image behind the headline" | Hero layout (landing page): split, centered, or image background |
| "Make the last call to action a card" | Closing call to action: full-width band or card |
| "Make it feel more premium" | Taste words are translated, e.g. premium = roomy + serif headline + sharp corners |
| "Go back to brand design" | All design overrides are removed |
| "Undo that" | Goes back to the previous version |
| "Move the FAQ above the features" / "add a section on pricing" / "drop the proof section" | Sections (landing page, blog) or blocks (email) are added, removed or reordered |
| "Turn the features into numbered steps" / "make that a FAQ" | A section's kind changes, which changes its layout (grid, steps, FAQ, proof, limits, text, call to action, code) |
| "Add a blog post" / "drop the X thread" | The plan changes |

### What chat edits can't change

- **The page template itself:** for example, a landing page is always a nav bar, then the hero, then the sections, and you can't set exact pixel layouts. For a completely different design, use **Free-form design** (below). Why there's a template: assets are stored as structured content, not free-form HTML, which keeps them on-brand and checkable (see DECISIONS.md).
- **Images:** it can switch to another approved brand image, but it doesn't generate new ones.
- **Hand-typing into the preview:** not supported. Use chat, or copy the text out (Copy, or the `.md` download).

### Guard rail: Lloyd asks before going off-brand

Before any edit, Lloyd checks the request against the brand's voice and style rules and the campaign's own constraints (for example "no humor for security leaders"). It also flags requests that are unusual for a brand asset: slang, memes, animals or mascots that aren't the brand's, profanity, mocking competitors.

If the request conflicts, nothing changes yet. A **"Before I change this: it goes against the brand"** card names each rule, its source, and the assets it affects, with three buttons:

- **Yes, do it anyway**: applies the change fully and visibly. The exception is saved for this campaign, so the writer, editor and brand check all honour it. Legal rules, forbidden claims, product names and facts still apply.
- **Only where the brand allows**: applies the parts that fit, and says what it left out.
- **Cancel, leave it as is**.

Typing anything else drops the question and treats your message as new.

### Seeing what changed

- Each edit card has **View changes** links, which open that asset on the Changes tab (words added and removed).
- Asset tabs show an **updated** badge when an asset changed since you last looked at it.
- The **refresh** button (↻) at the top of the asset panel reloads all assets by hand. Assets also refresh by themselves when an edit finishes, or within a few seconds when a coworker edits.
- Social posts (LinkedIn, X) are drawn the way the platform shows them, so their "theme" is the writing: voice, persona, hook. Design settings apply to landing pages, blogs and emails.

### Free-form design (landing pages, blog posts, emails)

When the template isn't enough ("make it look like a premium hardware launch"), click **Free-form design** in the asset's toolbar.

1. A warning appears first: **"This may hurt your brand's image."** Free-form lets the AI write the page's own HTML and CSS, so brand colours, fonts, spacing and layout are not enforced. **Are you sure you want to continue?** Choose *No, keep the brand template* or *Yes, continue*. The server also refuses free-form requests that weren't confirmed.
2. Describe the look, or pick an example. The words on the page stay the same, and the AI may not add claims.
3. About a minute and $0.05–0.15 later, the page appears in a sandbox (no scripts can run), with a yellow "Free-form design" banner. The brand check runs again on the page as it is displayed.
4. Chat edits still work: when the copy changes, the page is redrawn in the same design.
5. **Back to template** removes it (earlier versions keep it). **.html** downloads the page.

### References: "make it like this"

Send Lloyd examples of what you want, and the assets follow them:

| You send | What Lloyd does |
|---|---|
| A **link** in your message ("make it look and read like https://linear.app") | Reads the page (text and a screenshot) and describes its layout, visual style and copy style |
| An **image** (a screenshot or design you like; paperclip, drag or paste) | Looks at it and describes the same things |
| A **document** (an example email or post you liked) | Reads it as a writing example: structure, tone, length |

- Writing follows the references' structure and tone. It never copies their claims, statistics or customer names, and brand rules still win.
- The design of the latest image or link reference becomes the starting design for new **landing pages, blog posts and emails** (colours, fonts, spacing, corners, tone, hero layout), flagged as off-brand where it differs. Say "go back to brand design" to drop it.
- For assets that already exist, ask: "make the landing page look like the reference".
- On a new campaign, attached documents are read as the brief. Images and links are always treated as references.

### Other ways to work with an asset

- The **version menu** switches between all saved versions; nothing is lost.
- The **Changes** tab shows words added and removed, plus colour swatches if colours changed.
- **Checks** shows the brand and legal check for that version. **Sources** shows the brand passages and web sources used. **Prompt** shows the exact prompt that wrote it.
- **Copy** and **.md** take the text out.

**Tip:** if you have more than one of a type, name the one you mean ("the healthcare email"). When it isn't clear which asset you mean, Lloyd asks rather than guessing.

---

## 4. Everything else in the app

| Feature | Where | Notes |
|---|---|---|
| Campaign list | Left sidebar | Search, grouped by date, rename or delete via ⋯ |
| Model choice | Menu in the message box | Best / Balanced / Fast, or a specific writing model. Saved per campaign |
| Attachments | Paperclip, drag, or paste | PDF, DOCX, Markdown, text (can be the brief itself), and PNG/JPG/WebP/GIF images as design references |
| References | Links or images in a message | See "References" above |
| Free-form design | Asset toolbar | AI-written HTML page, behind a brand warning; Back to template undoes it |
| Stop | Square button while working | Stops the run for real, including model calls already in progress |
| Reload safety | Reload during a run | The run keeps going on the server; progress comes back |
| Live steps | Under the last message while working | The current step plus a clock; "N steps done" opens the timeline with each step's duration |
| Share | **Share** in the campaign header | A link for coworkers on the same network, plus who is here now |
| Export | Share window | Markdown (download or copy) or JSON (everything) |
| Brand | Sidebar → Brand | Authority order (editable), conflicts with quotes, names, image rules, the kernel |
| Memory | Sidebar → Memory | View, add, edit, pin or forget what Lloyd remembers |
| Inspector | Sidebar → Inspector | Every model call: prompt block by block, cache breakpoints, tokens, cost |
| Themes | Type `/theme`, or the palette button | Light, dark, system, plus 8 animated character-art wallpapers |
| Settings | Sidebar → Settings, or `Ctrl+,` | Your name, show or hide Lloyd the bee, Enter-to-send, default models, shortcuts |
| Shortcuts | | `Ctrl+Shift+O` new campaign, `Ctrl+B` sidebar, `/` focus the message box, `Esc` close a panel |
| Asset panel width | Drag the handle on the asset panel's left edge | Arrow keys or Home/End when it's focused; double-click resets; saved in the browser; the chat keeps at least 420px |
| Phones | Window narrower than 768px | The sidebar becomes a drawer; assets open full screen |

### Shared chats (group work)

- One person clicks **Share** and copies the link (this computer's network address plus `?c=<campaign>`).
- Others open it on the same Wi-Fi or LAN. Everyone sees messages, live steps and assets as they're written. Messages show the sender's name, and avatars show who is here.
- **People take turns.** While Lloyd works on one person's message, nobody else can send until it finishes.
- **There are no accounts.** Anyone who can reach the computer can use the app and its OpenAI credit, so share only on a trusted network. Stop the app to end sharing.

---

## 5. Costs

- Indexing a brand: about **$1–3**, once per brand folder. It is cached by the folder's contents, and the sample brand ships pre-indexed.
- A full campaign of 4–6 assets: about **$0.25–0.45**.
- One chat edit: about **$0.02**.
- Cost shows in the header ("$0.36 so far") and under each reply. The Inspector breaks it down by step.
- Prompt caching: the brand layer is a cached prefix, so most input tokens are billed at the cached rate.
- Safety limit: no single run can spend more than `MAX_USD_PER_RUN` (default $5).

---

## 6. How to test it

### Setup (2 min)

```bash
npm install
npm run dev          # http://localhost:3000
```

1. Open http://localhost:3000. Open Settings (`Ctrl+,`) and set your name.
2. For group testing, open an **Incognito window** at the same address and give it a different name. That's your fake coworker.

### Test 1: a full campaign (5 min, ~$0.30)

1. **New campaign** → sample brief **"Regulated teams push"** → Enter.
2. Click **"N steps done"** while it works.
3. **Brand check:** it should refuse "FedRAMP Authorized" and the Vaskell Health customer story, and quote the source documents.
4. Answer the question, or click **Use suggested answers**.
5. **Plan:** remove one item (✕) → **Update plan** → **Approve and write**.
6. Watch the assets stream in. Open **Checks**, **Sources** and **Prompt**.

**It passes if** nothing forbidden appears in any asset, every asset renders, and the cost is under $0.50.

### Test 2: editing (3 min, ~$0.10)

1. "Shorten the email." Only the email gets a new version; check **Changes**.
2. "Use electric purple on the landing page." The buttons turn purple, with a yellow off-palette warning.
3. "Go back to brand colours." The original colours return.
4. "Say we are FedRAMP certified." Lloyd refuses or rewords it, and the Checks tab flags it.
5. "Undo that." The previous version comes back.
6. "Change the font to Comic Sans." Lloyd says it can't, and doesn't claim it did.

### Test 2b: design, free-form and references (8 min, ~$0.35)

1. On a landing page: "make it feel more premium: roomy spacing, serif headline, image behind the headline, last call to action as a card". The preview changes, and non-brand fonts or colours are flagged in the banner.
2. "Go back to brand design." Everything returns to the brand look.
3. **Free-form design** → read the warning → *No, keep the brand template* (nothing happens). Open it again → *Yes, continue* → "dark, cinematic, huge headline" → Generate. After about a minute a new page appears with the yellow banner. Try **Back to template** and **.html**.
4. New campaign: "One landing page for security engineers announcing <feature>. Make it look and read like this reference: https://linear.app". The steps show "Reading the reference link", and the landing page comes out in a dark Linear-like style.
5. Paste a screenshot of a design you like into the message box with "make the email look like this". It should pick up the screenshot's style.

### Test 2c: guard rail (3 min, ~$0.12)

1. On any campaign with posts: "make every post gen z slang and add monkeys". A warning card appears; nothing changes yet.
2. **Cancel** → "OK, I left the assets as they were."
3. Ask again → **Yes, do it anyway** → the posts are rewritten with obvious slang and monkey references, and the facts are kept. Click **View changes** on the edit card.
4. Ask for something normal ("shorten the email"). It goes straight through with no question.

### Test 3: memory (2 min)

1. Type "we're done" → **Keep** one or two suggestions.
2. Start a new campaign with another brief. The Questions card should say it used things you told it before, and it should ask less.
3. Open **Memory** to view, edit or forget them.

### Test 4: group chat (5 min)

1. Window A: open a campaign → **Share** → copy the link.
2. Window B (Incognito): paste the link. Avatars appear within about 3 seconds.
3. A sends an edit. B sees "Working on A's message · …" and the text streaming.
4. B tries to send during the run. It waits until the run finishes.
5. B sends after it finishes. A sees B's name on the message.
6. With a real coworker: they open the link on the same Wi-Fi. If it doesn't load, allow Node.js through Windows Firewall.

### Test 5: export (1 min)

Share → **Markdown document**, then open the `.md` file. It should contain the conversation, brand check, plan and every asset. Also try **Copy as Markdown** and **JSON data**.

### Test 6: robustness (5 min)

- Reload mid-run. The run carries on and the steps come back.
- Press **Stop** mid-run. It stops, and you can re-run.
- Attach your own PDF or DOCX brief.
- Send a vague brief ("do something for furniture"). It should ask sensible questions.
- Try themes (`/theme`), dark mode, and a phone-width window. All text should be readable.

### Automated checks

```bash
npm test             # unit tests (chunking, conflicts, loaders, diff, streaming JSON, design settings, reference links)
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm run eval         # agent behaviour on 3 briefs + memory (~$1.80, a few minutes)
npm run bench        # same as eval, then rewrites COSTS.md
npm run test:keys    # checks the OpenAI and Firecrawl keys work
```

`npm run eval` checks, for each brief: the right questions are asked, the traps are refused, banned content is absent, an edit touches exactly one asset, and memory carries over to the next campaign. The report goes to `evals/last-report.md`.

Mock briefs that test what the samples don't (`fixtures/mock-briefs/`): a vague brief, a brief full of traps (false certification, uncleared customer, competitor comparison, fake scarcity), and a brief built from a reference link. Run one with:

```bash
npm run brief -- fixtures/mock-briefs/mock-2-trap-webinar.md --edit "add monkey emojis to the LinkedIn posts" --edit "Yes, do it anyway"
```

Terminal-only run of a brief:

```bash
npm run brief -- path/to/brief.md --answers "use defaults" --edit "shorten the email" --finish --accept-memories
```

---

## 7. Known limitations

| Limitation | Effect |
|---|---|
| No accounts or permissions | Anyone on the network can open every campaign, send, and press Stop. Names are self-chosen labels |
| Same network only | Sharing over the internet needs a tunnel (not set up, and riskier) |
| About 2.5 s of sync delay | A coworker's messages arrive within a few seconds, not instantly |
| No message queue | A second person's message is blocked, not queued; they resend it |
| Step timeline is live only | After a run ends, its step timeline isn't kept |
| No direct text editing | All changes go through chat |
| One template per asset type | Chat changes text, colours, fonts (from a set list), spacing, corners, tone, hero layout and sections; anything beyond that needs Free-form design |
| Free-form design isn't brand-enforced | By design (you're warned). Chat edits redraw it, which costs about $0.05 each |
| References are read once | A link is read when you send it; later changes to that page aren't seen |
| No image generation | Only approved brand images are used |
| Export is text | No styled PDF or DOCX, and design changes aren't in the Markdown (free-form pages can be downloaded as .html) |
| Memory is shared per brand | Everyone's preferences mix together |
| Occasional LLM variance | For example, asking one question when two were expected. The eval passes 31–33 of 33 checks across runs |

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| Page won't load | Is `npm run dev` running? Is port 3000 already taken? |
| Styles look broken after an update | Stop the server, delete `.next`, run `npm run dev` again |
| Coworker can't open the link | Same Wi-Fi? Allow Node.js through the firewall. Use the address shown in the Share window |
| "Lloyd is still working on …'s message" | Someone else's run is in progress. Wait for it, or press Stop |
| "This run stopped before it finished" | Click **Run the brief again** |
| An edit didn't do what you asked | Read the edit card: it now says exactly what changed. Rephrase and name the asset |
| Errors about the API key | Run `npm run test:keys` and check `.env` |

---

## 9. Where things live

```
src/lib/brand/     brand layer: scan, chunk, authority order, facts, conflicts, names, kernel, images, retrieval
src/lib/agent/     the agent: router, brand check, questions, planner, writer, guard, editor, research, runs, presence
src/lib/llm/       the only path to the model: model tiers, caching, spend cap, logging, pricing
src/lib/memory/    memory store and end-of-campaign extraction
src/components/    chat, asset previews, panels (brand, memory, inspector, settings, share), themes
src/app/api/       routes: campaigns, messages (streaming), export, share, assets, brand, memories, uploads
evals/             expected behaviour per brief (test data only)
data/app.db        your campaigns, messages, assets, memory and call log
logs/calls.jsonl   every model call with its full request and response
```
