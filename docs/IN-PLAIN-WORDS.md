# Lloyd in plain words

## What it is

Lloyd is a chat app that writes marketing for a brand.

You tell it what you're launching. It asks a question or two if it really needs to, suggests which posts, emails and pages to make, and writes them once you say yes. Everything it writes follows the brand's own rules: its tone, its banned words, its legal limits and its real facts.

The hard part it solves is that a brand's documents are huge (far too big to give an AI all at once), and they often disagree with each other. An old sales deck says one thing; the legal guide says another. Lloyd reads the whole folder once, works out which document wins when they disagree, and then hands the AI only the parts it needs for each piece of writing.

## What it makes

Only these five, as the brief asks:

- LinkedIn posts
- X posts
- Blog posts
- Landing pages
- Emails

Each one appears on the right, looking like the real thing: a LinkedIn post looks like LinkedIn, an email looks like an email.

## How to start it

1. Open a terminal in the project folder.
2. Run `npm install` (first time only).
3. Run `npm run dev`.
4. Open http://localhost:3000 for the landing page, or http://localhost:3000/app for the app.

The API keys go in `.env` (see `.env.example`). Docker also works: `docker compose up`.

## How to use it

### Make a campaign

1. Type or paste a brief in the box, or attach one. PDF, Word, PowerPoint and Markdown all work. There are sample briefs under the box if you want to try one.
2. Optionally click the chips under the box (LinkedIn post, Email…) to say exactly which assets you want.
3. Lloyd checks the brief against the brand's rules and tells you if something is a problem. For example: "you can't call it FedRAMP Authorized".
4. If it needs to know something, it asks. Answer, or type "use your defaults".
5. It shows a plan: which assets, for whom, and what each one says. Change anything in plain words, like "drop the email" or "make the blog post about pricing".
6. Say **approve**. It writes everything, and you watch each step tick off as it goes.

### Change an asset

Just say it in the chat:

- "shorten the second LinkedIn post"
- "make the landing page purple"
- "make the email more casual"
- "make it look like stripe.com"

Only that asset changes. The others stay exactly as they were. Click **View changes** to see what changed, or say "undo".

If you ask for something that goes against the brand (like "make it Gen Z with monkey emojis"), Lloyd asks first: do it anyway, do only the safe part, or leave it.

### Show it examples

Paste a link or drop a screenshot and say "make it like this". Lloyd looks at it and borrows the style.

### Memory

When a campaign is done, Lloyd suggests what to remember for next time. For example, "Arpit likes short posts" or "always mention the free trial". It forgets campaign-only details like dates and launch numbers.

You can see, edit, pin or delete memories in **Sidebar → Memory**. Start a new chat and it uses them automatically.

### See what it costs and what it sent

- The top of each chat shows what the campaign has cost so far.
- **Sidebar → Inspector** shows every prompt sent to the AI, block by block, with tokens, cache hits and cost.

### Switch brand

- Click the **Brand** box at the top of the sidebar, then pick another brand.
- To add a brand, click **Add a new brand…** and drop its folder in. It's indexed once, which takes a few minutes and about $1–3.
- **Ctrl+K** searches all campaigns and brands at once.

Each brand keeps its own campaigns and memory.

### Work with a coworker

Click **Share**, then send the link to someone on the same Wi-Fi. You both see the same chat live and take turns sending messages.

### Export

**Share → Export** gives you Markdown or JSON of the whole campaign.

## Brief checklist: what was asked, what's there

| The brief asked for | Done? | Where |
|---|---|---|
| Brand layer: only the right parts of the brand in each prompt | Yes | Brand is indexed once; each asset gets only the relevant sections. See Sidebar → Brand → Kernel |
| Pick suitable images | Yes | Images are checked for usage rules; the writer picks one per asset from allowed candidates |
| Handle documents that disagree | Yes | Authority order (legal beats old sales decks) plus settled conflicts with quotes. See Sidebar → Brand |
| Ask questions only when needed | Yes | A clear brief gets no questions; a vague one gets 1–3 |
| Plan only social posts, blogs, landing pages, emails | Yes | Those five types only |
| Adjust the plan before writing | Yes | Plan card; change it in chat; nothing is written until you approve |
| Web research where it helps | Yes | Firecrawl search, with sources checked before a statistic is used |
| Chat on the left, asset on the right | Yes | Asset panel, resizable |
| Assets look real | Yes | LinkedIn, X, email, blog and landing page renderers |
| Edit in chat without regenerating the rest | Yes | Only the named asset changes; versions and undo |
| Memory across chats, visible and editable | Yes | Sidebar → Memory |
| Tokens and cost per step; prompt caching | Yes | Inspector; `COSTS.md` (cost per brief, cache hit rate, cost of an edit) |
| See the exact prompt at any step | Yes | Inspector, plus `logs/calls.jsonl` |
| OpenAI models only, chosen per task | Yes | README "Models" and `DECISIONS.md` |
| Runs with one command | Yes | `npm run dev` (or `docker compose up`) |
| No brand details hardcoded | Yes | Everything comes from the brand folder; any brand folder works |
| README, DECISIONS (1–3 pages), COSTS | Yes | Repo root: `README.md`, `DECISIONS.md`, `COSTS.md` |
| Screen recording | **Your turn** | Script in `docs/RECORDING.md` |

Extras beyond the brief: shared group chats, export, the brand-rule guard rail on edits, free-form page design, references from links and images, brand switching, Ctrl+K, themes.
