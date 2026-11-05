# Lloyd: features and how to test them

Every feature Lloyd has, how to try it, and what a pass looks like. For setup see [README.md](../README.md), for the reasoning behind the design see [DECISIONS.md](../DECISIONS.md), and for costs see [COSTS.md](../COSTS.md).

**What Lloyd is:** a local chat app that plans and writes marketing campaigns that follow a brand's rules. You give it a brief. It checks the brief against the brand's documents, asks only what it needs to, proposes a plan, writes the assets after you approve, checks every claim, and lets you edit by chatting. It makes five asset types: **LinkedIn post, X post or thread, email, blog post, landing page.**

---

## 0. Before you test (2 min)

```bash
npm install
npm run dev          # landing page: http://localhost:3000   app: http://localhost:3000/app
```

1. Open http://localhost:3000/app, press `Ctrl+,` and set your name.
2. Optional, for memory tests: Sidebar → **Memory** → delete everything, so you start clean.
3. Test briefs:
   - `wickhold-candidate-package/candidate/briefs/`: the three samples
   - `fixtures/mock-briefs/`: vague, trap and reference-link briefs (also as PDFs)
   - `fixtures/test-briefs/`: **five messy briefs** (Slack paste, email chain, breach newsjack, one-line `.txt`, stale names and stats). Its [README](../fixtures/test-briefs/README.md) is the answer key: every trap, what should happen, and the brand rule behind it.

Costs below are what each test spends on the OpenAI API.

---

## 1. Brand layer

Open it from Sidebar → **Brand**, or the Brand box → **What Lloyd knows about this brand**.

| Feature | How to test | Passes if |
|---|---|---|
| **Authority order**: which document wins | Brand → *Which document wins* | Tiers are quoted from the brand's own rules. `Brand_Guidelines_v3_FINAL.md` sits below the 2026 guidelines despite its name |
| **Change the order** | Move a document to another tier | The move is saved and labelled as your decision |
| **Settled conflicts** | Brand → *Conflicts* → open *FedRAMP authorization status* | Shows both sides with quotes, USE / DON'T USE, and the rule applied |
| **Names** (current and former) | Brand → *Names* | Former names map to current ones, e.g. Tallowatch → Evenburn |
| **Image rules** | Brand → *Images* | Excluded images are listed, each with its reason |
| **Kernel**: the ~2.5k-token summary in every prompt | Brand → *Kernel* | Readable summary of voice, never-say list, approved wording, usable customers |
| **Only relevant brand parts per asset** | Open any asset → **Prompt** tab | The asset context block holds a handful of retrieved facts with tier and source, not whole documents |
| **Image choice** | Open a landing page or blog post | Image is from the brand library and none of the excluded images is used |
| **Brand design in previews** | Open any landing page or email | Brand colours, fonts and logo, taken from the folder |

---

## 2. Campaign agent

| Feature | How to test | Passes if |
|---|---|---|
| **Brand check** before planning | Drag in `brief-3-regulated-teams-push.md` | A *Brand check* card refuses "FedRAMP Authorized" and the Vaskell Health story, quoting the legal docs, and says what it will say instead |
| **Asks only when needed** | Sample brief 1 (detailed) vs brief 2 (vague) | Brief 1: no clarifying questions (only the brand-check one if something was flagged). Brief 2: 1–3 questions, each with a default |
| **Asks when the angle is gone** | `fixtures/test-briefs/t3-breach-hook-rushed.md` | Refuses the breach hook and asks what to lead with instead |
| **Asks when stakeholders disagree** | `t2-leashgate-forward-chain.md` | Asks who the audience is (CISOs or platform engineers) |
| **One send button** | On any *Questions* card | With nothing picked it reads *Use suggested answers*; pick or type some and it reads *Send answers (n suggested)*: blanks use the suggestion |
| **Change your mind / own answer** | Click a picked option again; or type in *Or type your own answer* | The option un-picks; your typed answer is sent for that question |
| **Push back on the brand check** | `mock-2-trap-webinar.md` | Besides the *Brand check* card, the Questions card asks *Do you still need any of them?* Default keeps the alternatives; pick e.g. "SOC 2" and the plan keeps it in approved wording and says how in *Why this mix* |
| **Chat isn't a brief** | New campaign: `hi sup`, then `before that, how are you` | Friendly replies, no questions card; a vague real request (`awareness push for Quenchline`) still starts planning |
| **Multi-select questions** | Sample brief 2 or `mock-1-vague-quenchline.md` | A question like "Which channels?" says *Pick one or more* and lets you select several options |
| **Plan with reasons** | Any brief | Each asset has audience, angle, key points, call to action and a reason, plus a cost and time estimate |
| **Only the five asset types** | `t4-kubecon-vague.txt` asks for a video and paid ads | Plan contains only posts, blogs, landing pages and emails, and says why |
| **Adjust the plan** | ✕ an item, or type `add an X post for platform engineers` | The plan updates. Nothing is written until **Approve and write** |
| **Guard rail on plan changes** | In plan review: `add an X post with some emojis and a reference to Napoleon` | A "goes against the brand" card quotes the content style guide ("No emoji in brand posts or email") and waits for *Yes / Only where allowed / Cancel* |
| **Asset chips** | On the start screen, click e.g. *Email* before sending a brief | The first plan contains only emails |
| **Parallel writing with live text** | Approve a plan | Assets appear on the right as they're written; the live checklist streams the model's words |
| **Web research** | A brief that needs a fresh third-party statistic | Asset's **Sources** tab lists web sources; nothing unsourced is used |
| **Claim check and auto-fix** | After writing, open an asset → **Checks** | Pass, notes or blocked, with quotes. If blocked, a v2 made by the automatic fix |
| **Stop** | Press the square button mid-run | The run stops, including model calls in progress; you can run it again |
| **Reload safety** | Reload the page mid-run | The run carries on and the progress comes back |
| **Attachments as the brief** | Attach a PDF, Word, PowerPoint, Markdown or `.txt` file | Read as the brief (try `fixtures/mock-briefs/*.pdf`) |
| **Reference links and images** | `One landing page for security engineers. Make it look and read like https://linear.app` | Steps show "Reading the reference link"; the page takes on that style, with no copied claims |
| **Copy a site's look in review** | On a written landing page: `make it look like stripe.com` | Asks first (off-brand colours and fonts); *Yes, do it anyway* applies the site's real fonts and colours, measured from its CSS, plus its spacing and hero layout |
| **Small talk** | Type `hi` or `Hi, what can you do?` in a new campaign | Instant reply explaining what Lloyd does; no model call |
| **Chat after the campaign** | When the assets are written, send `thanks`, `how's your day` or `what makes a good tweet hook?` | A real answer to what you said, not "How can I help with your campaign?" |
| **Plain punctuation** | Any written asset, edit or Lloyd chat reply | No em dashes anywhere; posts read like a person wrote them, never a note about missing facts |
| **Brief after small talk** | Say `hi` first, then attach a brief with `here` | The attachment is read as the brief (it never says it can't see it) |
| **Several briefs at once** | Attach the three files in `fixtures/mock-briefs/` with `here are the briefs` | Lloyd lists them and asks which one this campaign is for; `use mock-1` or `the first one` starts it, `one campaign` combines them |
| **Brief replaced before writing** | While questions or the plan are showing, attach a different brief: `use this brief instead` | Starts over from the new brief: new brand check, questions and plan |
| **Ask about an attachment** | New campaign: attach a brief and type `what does this say?` | Lloyd summarises the document instead of starting a campaign, and offers to plan. Type `go` and the same document is used as the brief |

---

## 3. Viewing and editing

| Feature | How to test | Passes if |
|---|---|---|
| **Chat left, asset right** | Any finished campaign | Asset panel on the right; drag its left edge to resize (double-click resets) |
| **Real-looking previews** | Click through LinkedIn, X, email, blog and landing page tabs | Each looks like the platform: LinkedIn card, X post, email client, blog article, web page |
| **Edit one asset in chat** | `Shorten the first LinkedIn post by about a third` | The edit card names the one asset changed; the others keep their version number |
| **Changes view** | **View changes** on the edit card | Words added and removed |
| **Versions and undo** | Version menu on the asset; type `undo that` | Every version is kept; undo goes back one |
| **Ambiguous edits** | With two emails, type `shorten the email` | Lloyd asks which one rather than guessing |
| **Refuses forbidden edits** | `Say we are FedRAMP certified` | Refused or reworded; Checks flags it |
| **Guard rail for off-brand edits** | `make every post gen z slang and add monkeys` | A "goes against the brand" card names the rules; nothing changes until you pick *Yes, do it anyway*, *Only where the brand allows* or *Cancel, leave it as is* |
| **Design edits** | On a landing page: `make it feel more premium`, then `go back to brand design` | Spacing, fonts and colours change; the brand look comes back |
| **Off-brand design asks first** | `change the email buttons and colours, use a sky blue theme` | A confirm card says sky blue isn't in the palette and names the closest brand colour; nothing changes until you choose. Brand colours go straight through |
| **Section edits** | `Move the FAQ above the features`, `turn the features into numbered steps` | Sections reorder or change layout |
| **Free-form design** | Asset toolbar → **Free-form design** | Brand warning first; *Yes, continue* → AI-written page in a sandbox with a yellow banner; **Back to template** undoes it |
| **Free-form like a site** | Free-form design → `make it look like stripe.com` (type freely, Space included) | The page uses that site's fonts and colours and its layout style |
| **Updated badge, closing tabs** | Edit an asset, then ✕ a tab | Tabs show *updated*; closed tabs go under *Closed (n)* |
| **Copy and download** | Asset toolbar → Copy, `.md` | Text comes out clean |

The full list of things chat can change is in [§9](#9-reference-what-chat-edits-can-change).

---

## 4. Memory

| Feature | How to test | Passes if |
|---|---|---|
| **Proposes what to keep** | In a campaign: `The LinkedIn posts are too salesy. Keep them short and plain, and we never use hashtags.` then `We're done with this campaign` | A *Remember these?* card proposes the preferences, each with a quote. Nothing campaign-specific (dates, FedRAMP, product names) is proposed |
| **Nothing kept without you** | Click *Forget* on one, *Keep* on another | Only the kept one appears in Memory |
| **Carries over** | `Ctrl+K` → **New campaign** → another brief | The Questions card says it's using what it remembers; LinkedIn posts come out short with no hashtags |
| **See and change memory** | Sidebar → **Memory** | Add, edit, pin and delete all work |
| **"Remember this" at any time** | Mid-campaign (or in a new one): `remember that I like a sky-blue theme and small catchy buttons` | A *Saved to memory* card lists what was saved, with Forget; it appears in Memory at once and applies to every later campaign of this brand |
| **Remembered design applies** | After the step above, start a new campaign with emails or a landing page | They start in the remembered colours (flagged off-brand if they are) |
| **Brief overrides are never remembered** | Run sample brief 1 (makes Leashgate GA "for these assets"), finish it | "Leashgate is GA" is not proposed as a memory |

---

## 5. Cost and prompts

| Feature | How to test | Passes if |
|---|---|---|
| **Cost per turn** | Look under each reply and in the campaign header | "$0.36 so far"-style running total; each turn shows its cost |
| **Cost by step** | Sidebar → **Inspector** → *Cost by step* | Campaign total, edit cost, cache hit rate, cost per step |
| **Exact prompt for any call** | Inspector → pick a call (or an asset's **Prompt** tab) | Every block in order with cache breakpoints, tokens, cached tokens and cost |
| **Prompt caching** | Inspector, on a `write:*` call | Large cached-token figure: the stable blocks are read from cache |
| **Raw log** | Open `logs/calls.jsonl` | Every request and response with usage |
| **Spend cap** | Set `MAX_USD_PER_RUN=0.01` in `.env`, restart, send a brief | The run stops with a clear spend-cap message |

---

## 6. Brands and navigation

| Feature | How to test | Passes if |
|---|---|---|
| **Switch brand** | Click the **Brand** box at the top of the sidebar → pick a brand | Page reloads into that brand's own campaigns and memory |
| **Brand names are unique** | **Add a new brand…** → type the name of a brand you already have (any case, e.g. `wickhold`) | Red note under the name, the Add button stays off; the server refuses it too |
| **Add a brand from the browser** | Brand box → **Add a new brand…** → name it → drop `fixtures/mini-brand` → **Add brand and switch to it** | Indexing runs once (a few minutes, ~$1–3), then the brand is live. No Wickhold rules leak into it |
| **Use a folder on disk** | Brand → **Switch brand** → "Or use a folder already on this machine" | Paste a path; nothing is copied |
| **Quick switcher** | `Ctrl+K` | One search box over campaigns and brands; arrow keys and Enter |
| **Campaign list** | Left sidebar | Search, grouped by date, rename or delete via ⋯ |
| **Model choice** | Menu in the message box (*Balanced*) | Best / Balanced / Fast or a specific model, saved per campaign |
| **Themes** | `/theme` or Settings → Appearance | Lloyd, Lloyd Dark, Classic Paper and Night, System, animated wallpapers. All readable |
| **Shortcuts** | `Ctrl+Shift+O` new campaign, `Ctrl+B` sidebar, `/` focus input, `Esc` close a panel | Each works |
| **Phones** | Narrow the window below 768px | Sidebar becomes a drawer; assets open full screen |
| **Layer stack** | Landing page → **Built in layers**; point at each layer or its text | That slab lifts and lights up with its text; left alone, it steps through the five layers by itself |
| **Watching bee** | Move the pointer around the landing page | The bee above the headline follows it with its eyes and blinks now and then |
| **Cursor** | Anywhere in the site and the app | Dark arrow with a magenta edge; over buttons and links it turns magenta; text fields still show the text cursor; the panel resize handle still shows the resize cursor |
| **Landing page** | http://localhost:3000, also on a phone width | Renders the same in any app theme; phone menu opens and closes; **Start a campaign** opens the app at `/app`. Old links still work: `/lloyd` goes to `/`, and `/?c=<id>` goes to `/app?c=<id>` |

---

## 7. Sharing and export

| Feature | How to test | Passes if |
|---|---|---|
| **Shared chat** | **Share** → copy link → open in an Incognito window with another name | Avatars appear within ~3 s; messages show who sent them; live steps stream to both |
| **Who sent what** | Open the link in Incognito **without** setting a name and send "hi" | Both windows label every message: "Guest" for the Incognito one, "Bella (you)" for your own. Your messages never look like the guest's |
| **One run at a time** | Window B sends while A's run is going | B is told to wait; it works once A's run finishes |
| **Export** | Share window → Markdown, Copy as Markdown, JSON | The `.md` holds the conversation, brand check, plan and every asset |

---

## 8. Test runs with the extra briefs

Each takes 3–6 minutes and $0.15–0.40. The answer key with every trap is in [fixtures/test-briefs/README.md](../fixtures/test-briefs/README.md).

| Brief | What makes it messy | Watch for |
|---|---|---|
| `t1-eu-push-slack-dump.md` | Pasted Slack thread, people change their minds | "GDPR compliant" and "agentless" refused; the 41% stat flagged as expired by the May 2027 launch; no Tesserline on social; one clear plan, not both readings |
| `t2-leashgate-forward-chain.md` | Forwarded chain, founder pressure, audiences disagree | "prevents prompt injection", "AI-powered", the Q1 GA date refused; asks who it's for |
| `t3-breach-hook-rushed.md` | Newsjacking a breach, rushed | Victim never named, no humour, no 30-day hook; Lowmoor never turned into a percentage; asks what to lead with |
| `t4-kubecon-vague.txt` | One line, typos, plain text | Asks 1–3 questions; refuses video and paid ads politely |
| `t5-old-names-and-stale-stats.md` | Retired names, old guidelines, expired stats | Evenburn not Tallowatch, Wickhold not Wickhold Security, 2026 guidelines win over "v3 FINAL", Vaskell refused, Field Report 2024 refused |
| `t6-quenchline-contain-mode-detailed.md` | Detailed like the samples, but its key messages break the rules; asks for TikTok and a press release | Lab qualifiers, no Lowmoor multiple, results never combined, 41% flagged as expired, TikTok and press release left out as out of scope |
| `t7-budget-season-vague.md` | Four sentences, no assets or dates | 2–3 questions with defaults; a small mix; no savings claims |
| `t8-healthcare-sales-ask.md` | Lowercase sales ask, almost every claim banned | "peers", "SOC 2 certified", "audit-ready", "helps prevent", "automatic remediation", "GDPR compliant", invented quote and ROI all refused; the copy never explains the rules |
| `t9-one-email-only.md` | One asset, "no questions" | Zero questions, a one-email plan, real product detail from the docs |

Then, on any of them, try the edits in §3 and finish with memory (§4).

From the terminal, with no browser:

```bash
npm run brief -- fixtures/test-briefs/t1-eu-push-slack-dump.md --answers "use defaults" --edit "shorten the email" --finish --accept-memories
```

### Automated checks

```bash
npm test             # unit tests (chunking, conflicts, loaders, diff, streaming JSON, design settings, small talk, punctuation, internal-target check)
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm run eval         # agent behaviour on 3 briefs + memory (~$1.80, a few minutes); report in evals/last-report.md
npm run bench        # same as eval, then rewrites COSTS.md
npm run test:keys    # checks the OpenAI and Firecrawl keys work
```

`npm run eval` checks for each brief that the right questions are asked, the traps are refused, banned content is absent, an edit touches exactly one asset, and memory carries over.

---

## 9. Reference: what chat edits can change

| You say | What happens |
|---|---|
| "Shorten the email" | The email's text is rewritten |
| "Make the second LinkedIn post punchier" | Only that post changes ("second" = the second of that type) |
| "Change the headline on the landing page to …" | Only that field changes |
| "Use electric purple" / "dark navy background" | Colours change for that asset; non-brand colours are applied and flagged |
| "Use a serif headline font" / "body in DM Sans" | Brand fonts or a set list of 12 Google Fonts; non-brand fonts flagged |
| "Roomier" / "tighter" | Spacing: compact, normal or roomy |
| "Sharper corners" / "pill buttons" | Corners: sharp, rounded or pill |
| "Make it dark" / "no tinted sections" | Section tone: light, alternate or dark |
| "Centre the hero" / "image behind the headline" | Hero layout: split, centered or image background |
| "Make the last call to action a card" | Closing call to action: band or card |
| "Make it feel more premium" | Taste words become settings (premium = roomy + serif headline + sharp corners) |
| "Go back to brand design" | All design overrides removed |
| "Undo that" | Previous version |
| "Move the FAQ above the features" / "add a pricing section" | Sections or email blocks added, removed or reordered |
| "Turn the features into numbered steps" | A section's kind changes (grid, steps, FAQ, proof, limits, text, call to action, code) |
| "Add a blog post" / "drop the X thread" | The plan changes |

**Can't change:** the page template itself (use Free-form design), image generation (only approved brand images), or typing directly into the preview (use chat, or copy the text out). Social posts are drawn the way the platform shows them, so design settings apply only to landing pages, blogs and emails.

**Guard rail details:** before any edit, Lloyd checks the request against the brand's voice rules and the campaign's constraints, and flags things unusual for a brand (slang, memes, mascots that aren't the brand's, profanity, mocking competitors). *Yes, do it anyway* stores the exception on the campaign, so the writer, editor and checks all honour it. Legal rules, forbidden claims, product names and facts never bend. Typing anything else drops the question.

**References:** links are read once (text, a screenshot, and the fonts and colours its CSS uses); images are described by vision; documents are read as writing examples. On a new campaign, attached documents are the brief, and images and links are always references.

### Adding brands

Each brand has its own campaigns, memory and image library. A brand folder holds guidelines, voice and legal docs and product sheets (Markdown, text, PDF, Word, PowerPoint or HTML), with optional `images/` and `briefs/` folders. Folders added in the browser are copied to `data/brand-folders/<name>/`. `BRAND_DIR` in `.env` is the default until you switch; the choice is saved in `data/brands.json`. Switching is refused while Lloyd is working. In Docker, a folder given by path must be mounted (`BRAND_FOLDER`).

### Shared chats

The Share link is this computer's network address plus `?c=<campaign>`. People take turns: while Lloyd works on one message, nobody else can send. **There are no accounts**, so anyone who can reach the computer can use the app and its OpenAI credit; share only on a trusted network. If a coworker can't connect, allow Node.js through the firewall.

---

## 10. Costs

- Full campaign: **26¢–61¢** (5–11 assets). One chat edit: **about 2–4¢**. Cache hit rate: **34–44%** of input tokens.
- Indexing a brand: about **$1–3**, once per folder (the sample brand ships pre-indexed).
- Free-form design: $0.05–0.15 per page.
- Safety limit: no run can spend more than `MAX_USD_PER_RUN` (default $5).

Per-brief numbers are in [COSTS.md](../COSTS.md).

---

## 11. Known limitations

| Limitation | Effect |
|---|---|
| No accounts or permissions | Anyone on the network can open every campaign, send and press Stop |
| Same network only | Sharing over the internet needs a tunnel (not set up) |
| ~2.5 s sync delay | A coworker's messages arrive within a few seconds |
| No message queue | A second person's message is blocked, not queued |
| Step timeline is live only | After a run ends, its timeline isn't kept |
| No direct text editing | All changes go through chat |
| One template per asset type | Anything beyond the chat design settings needs Free-form design |
| Free-form design isn't brand-enforced | By design, with a warning; redraws cost ~5¢ each |
| No image generation | Only approved brand images |
| Export is text | No styled PDF or DOCX; free-form pages download as `.html` |
| Memory is shared per brand | Everyone's preferences mix |
| LLM variance | e.g. one question where two were expected; the eval passes 31–33 of 33 checks across runs |

---

## 12. Troubleshooting

| Problem | Fix |
|---|---|
| Page won't load | Is `npm run dev` running? Is port 3000 taken? |
| Styles broken after an update | Stop the server, delete `.next`, run `npm run dev` |
| "The server hit an error and your message wasn't sent" | Server unhealthy (e.g. low memory): stop it, delete `.next`, restart |
| "Can't reach the Lloyd server" | Start it: `npm run dev` |
| "Lloyd is still working on …'s message" | Someone else's run is going. Wait, or press Stop |
| "This run stopped before it finished" | Click **Run the brief again** |
| An edit didn't do what you asked | Read the edit card, then rephrase and name the asset |
| API key errors | `npm run test:keys`, then check `.env` |

---

## 13. Where things live

```
src/lib/brand/     brand layer: scan, chunk, authority order, facts, conflicts, names, kernel, images, retrieval
src/lib/agent/     the agent: router, brand check, questions, planner, writer, guard, editor, research, runs
src/lib/llm/       the only path to the model: model tiers, caching, spend cap, logging, pricing
src/lib/memory/    memory store and end-of-campaign extraction
src/components/    chat, asset previews, panels (brand, memory, inspector, settings, share), themes
src/app/api/       routes: campaigns, messages (streaming), export, share, assets, brand, memories, uploads
src/app/page.tsx   the landing page (/); the app is src/app/app/page.tsx (/app); landing components in src/components/landing/
fixtures/          mock briefs, messy test briefs with answer key, a second brand
evals/             expected behaviour per brief
data/              campaigns, messages, assets, memory and call log (SQLite)
logs/calls.jsonl   every model call with its full request and response
```
