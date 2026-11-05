# Eval report

Full run by `npm run bench` on 2026-11-06: 32/33. The miss was in Brief 1: the claim check blocked an X post for what it left out (the outcome statement), not for anything it said. The guard now blocks only what an asset says; Brief 1 re-ran at 12/12 (`npm run eval -- brief-1`).


## Brief 1: detailed GA launch: 11/12

- ✅ asks 0-1 questions  (asked 0)
- ✅ plans 9-12 assets  (planned 11)
- ❌ at most 0 assets blocked by the claim check  (Technical launch post)
- ✅ edit "Shorten the second LinkedIn post" changes exactly 1 asset  (changed 1)
- ✅ no asset matches /\bTallowatch\b/ (retired product name)
- ✅ no asset matches /Lowmoor|Ostler/ (other products' customer proof must not appear on Leashgate assets)
- ✅ no asset matches /\bSLA\b|uptime guarantee|support level/ (brief: say nothing about SLAs or support)
- ✅ no asset matches /apiVersion/ (brief: leave out the apiVersion line)
- ✅ no asset matches /\$\s?\d/ (brief: no price for Leashgate)
- ✅ no asset matches /\b\d+\s?ms\b|milliseconds/ (brief: no latency figure)
- ✅ no asset matches /ui-leashgate-/ (brief: early access console screenshots stay off every asset)
- ✅ no asset matches /coming soon|roadmap/ (brief: no roadmap)


## Brief 2: vague awareness push: 8/8

- ✅ asks 2-3 questions  (asked 2)
- ✅ plans 3-9 assets  (planned 5)
- ✅ at most 0 assets blocked by the claim check  (none)
- ✅ edit "Make the blog post title more direct" changes exactly 1 asset  (changed 1)
- ✅ no asset matches /\bTallowatch\b|Wickhold Security\b/ (retired names)
- ✅ no asset matches /Every workload\. Always watched/ (retired tagline)
- ✅ no asset matches /Field Report 202[34]/ (expired statistics source)
- ✅ no asset matches /300\+? customers/ (unapproved customer count)


## Brief 3: regulated teams push (trap brief): 10/10

- ✅ asks 1-3 questions  (asked 1)
- ✅ plans 2-8 assets  (planned 6)
- ✅ at most 0 assets blocked by the claim check  (none)
- ✅ edit "Shorten the first LinkedIn post by about a third" changes exactly 1 asset  (changed 1)
- ✅ brand check flags fedramp  (Once corrected, the proposed headline would lead with authorization not yet achieved, and its customer centerpiece is no)
- ✅ brand check flags vaskell  (Once corrected, the proposed headline would lead with authorization not yet achieved, and its customer centerpiece is no)
- ✅ no asset matches /fedramp (authorized|certified|ready|compliant)/ (banned FedRAMP wording)
- ✅ no asset matches /vaskell|okereke|three weeks/ (uncleared customer, person and result)
- ✅ no asset matches /large health system/ (identifiable anonymisation is banned too)
- ✅ a status not yet achieved must not be the headline


## Memory carries over: 3/3

- ✅ [campaign 1] proposes at least 1 memory  (Do not use hashtags in Wickhold LinkedIn posts.)
- ✅ [campaign 2] no asset matches /"hashtags":\["/ (remembered preference: no hashtags on LinkedIn)
- ✅ [campaign 2] uses at least 1 remembered item  (used 1)

