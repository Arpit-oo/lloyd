# Messy test briefs

Five briefs written to be harder than the three samples: pasted Slack threads, forwarded email chains, stakeholders who disagree, typos, stale numbers, retired names, and requests the brand's legal docs forbid. Every trap below is grounded in a real rule in the Wickhold brand folder, so a correct answer exists for each.

Use them in the app (drag the file into a new campaign) or from the terminal:

```bash
npm run brief -- fixtures/test-briefs/t3-breach-hook-rushed.md --answers "use defaults"
```

LLM output varies a little between runs. "Should" below is what a correct run does; if Lloyd misses one, that is a real finding.

## t1-eu-push-slack-dump.md — EU push, pasted from Slack

Tests: reading a noisy chat paste, self-contradicting asks, regional rules, statistic expiry.

| Trap in the brief | Should happen | Rule (source) |
|---|---|---|
| "Wickhold is GDPR compliant" | Refused; uses "Wickhold supports customers' GDPR obligations." | `legal/regional-rules-eu-uk.md` |
| "agentless" / "lightweight" | "Agentless" refused (it's an eBPF agent); "lightweight" only next to the CPU figure with "in Wickhold lab benchmarks, 2026" | `legal/approved-claims-2026.md` §7 |
| 41% stat, but launch is **May 12, 2027** | Flagged: the Containment Report is only usable through April 14, 2027 | approved claims §5 |
| 2024 Field Report "historically 60%…" | Refused: past the 12-month limit, and "historically" is named as not allowed | approved claims §5 |
| "Wickhold vs Tesserline" LinkedIn post | Refused: no competitor names on social; comparisons only in comparison blogs | `competitive/positioning.md` §6 |
| "140+ customers, nearly 150" | Only "more than 140 customers" | approved claims §1 |
| "40 MQLs from DACH" | Never appears in copy | internal goal |
| "one email … actually two", "skip X … actually do one" | Plan settles it (or asks once); doesn't produce both readings | — |
| "Frankfurt region live (i think?)" | Not stated as fact; asked about or left out | unverifiable |

## t2-leashgate-forward-chain.md — forwarded email chain, three stakeholders disagree

Tests: good questions (the audience genuinely conflicts), founder pressure, early-access rules.

| Trap | Should happen | Rule |
|---|---|---|
| "prevents prompt injection" (founder, "legal said on a call") | Refused; uses "limits what a compromised agent can do". A call is not a record | approved claims §3, intro |
| "AI-powered" | Refused unless product confirms in writing | approved claims §7 |
| "secures your AI agents" | Refused; describe tool-call policy and agent identity | approved claims §7 |
| "generally available in Q1 2027" | Refused: Leashgate is early access; no roadmap, no dates | approved claims §2 |
| CISOs vs platform engineers | **Asks** who it's for (this changes every asset), with a default | — |
| "Pick the assets" | Plan proposes a small set with a reason for each | — |

## t3-breach-hook-rushed.md — newsjacking a breach

Tests: the hardest refusal. The brief's whole angle is banned, so Lloyd should ask what to lead with instead of quietly writing a watered-down version.

| Trap | Should happen | Rule |
|---|---|---|
| Naming "Harrowgate Regional Bank", tying content to it | Refused: never name a victim; nothing within 30 days of an incident | approved claims §6 |
| Dark humour, 💀 | Refused: no humour about breaches | approved claims §6 |
| Subject "After Harrowgate, can your team afford another six hours?" | Refused; it is almost word for word the doc's own "Not approved" example | approved claims §6 |
| "over in 38 seconds", "stops the attack" | Lab figure needs "in Wickhold lab benchmarks, 2026" and "known-bad process"; "stops the attack" refused, name the action | approved claims §2, §7 |
| Lowmoor as "95% faster" | Refused: no converting the Lowmoor result into a percentage | approved claims §2 |
| Lowmoor and Ostler in one sentence | Refused: never combine the two results | approved claims §2 |
| "guaranteed" | Removed | approved claims §3 |
| "Trusted by credit unions" | Refused: one customer is not a plural | approved claims §7 |
| "Ship today, approvals later" | Customer names still go to Legal; noted | approved claims §9 |
| Centerpiece removed | **Asks** what to lead with instead | agent behaviour |

## t4-kubecon-vague.txt — one line, plain text, typos

Tests: a `.txt` brief, a vague request, channels outside the brief's scope.

| Trap | Should happen |
|---|---|
| No theme, no audience detail, no dates | Asks 1–3 questions, each with a default |
| "short video", "paid linkedin ads" | Explains those aren't asset types it makes; plans only posts, blogs, landing pages and emails |
| "kubecon" booth follow-up | Uses the events playbook's after-the-show guidance, no pitchy opener |

## t5-old-names-and-stale-stats.md — old names, old guidelines, stale stats

Tests: authority order (a file called FINAL doesn't win), retired names, statistic expiry.

| Trap | Should happen | Rule |
|---|---|---|
| "Brand_Guidelines_v3_FINAL is the latest" | 2026 guidelines win; v3 FINAL is superseded | authority order (Brand panel) |
| Keep "Tallowatch", sign as "Wickhold Security" | Uses Evenburn and Wickhold | `archive/blog/2026-03-02_tallowatch-is-now-evenburn.md`, rename post |
| Blue + shield logo | Current brand colours and logo | logo and colour addendum 2026 |
| "automatic remediation" | Refused: Evenburn gives a fix order, people fix | approved claims §7 |
| "AI-powered", "the leading" | Refused | approved claims §3, §7 |
| "140+ customers", Vaskell Health | "more than 140 customers"; Vaskell refused (not cleared) | approved claims §1, customer policy |
| Field Report 2024 "72%" | Refused: expired | approved claims §5 |
| 41% stat in a **May 20, 2027** email | Flagged as expired by then | approved claims §5 |
| "SOC 2 certified and audit-ready" | "holds SOC 2 Type II"; "audit-ready" refused | approved claims §3, §7 |
| Six deliverables | Plan can keep them all (it's specific) and asks nothing it doesn't need | — |
