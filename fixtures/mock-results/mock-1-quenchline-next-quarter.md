# Quenchline Next Quarter

Exported 2026-11-03 22:26 UTC · state: review · model cost so far: $0.149

## Conversation

**You:**

> # Quick one
> 
> Hey, can we do something for Quenchline next quarter? Mostly social I think, maybe an email.
> Want people to actually get what it does. Not sure who exactly, security people probably.
> Make it pop.
> 

**Lloyd:**

- **OK:** Mostly social posts; platforms unspecified.. Social posts are not excluded. The EU/UK rules apply by audience, not by a closed list of asset types. Apply LinkedIn-specific requirements only to posts intended for LinkedIn. (brand/legal/regional-rules-eu-uk.md) Instead: Proceed with social posts. Select platforms before applying channel-specific requirements; apply the EU/UK rules to any posts aimed at those readers.

**Lloyd:**

1. Who should understand Quenchline better after this campaign? Options: DevSecOps and security practitioners (default) / CISOs and security leaders / Platform engineers and SREs. Default: DevSecOps and security practitioners (default).
2. Where should the campaign run? Options: LinkedIn posts only (default) / LinkedIn posts plus an email / LinkedIn and X posts / Another platform or mix—specify. Default: LinkedIn posts only (default).
3. What should interested readers do next? Options: Explore the Quenchline product page (default) / Request a demo / Understand it in-feed; no click required / Visit another destination—specify. Default: Explore the Quenchline product page (default).

Assumed:
- This is an educational campaign for an existing product, not a launch or new-feature announcement.
- Lead with customer-controlled Kubernetes runtime containment: Quenchline uses an eBPF agent, acts in contain mode, and records what it would have done in observe mode.
- Interpret “make it pop” as bold visuals and concrete explanations, not fear-based messaging or broader security promises.
- Exact publication dates and any email sender or byline can be set during scheduling.

**You:**

> Go with your defaults.

**Lloyd:**

A three-post LinkedIn series makes Quenchline concrete for DevSecOps and security practitioners: what it does, what the customer controls, and what its containment benchmark actually measures. Make it pop with bold action-led diagrams and plain language, with every post pointing to the Quenchline product page.

- **Containment, made concrete** (linkedin post): Explain Quenchline through the concrete containment actions it can take—not a vague security promise.
- **Two modes. A clear boundary.** (linkedin post): Make the difference between observe mode and contain mode easy to understand.
- **38 seconds—with the scope attached** (linkedin post): Use a specific, qualified benchmark to make containment tangible without turning a lab result into a customer promise.

**You:**

> Looks good. Write it.

**Lloyd:**

Wrote 3 assets. Brand check: 0 pass, 3 with notes, 0 blocked.

**You:**

> make the first LinkedIn post shorter and punchier

**Lloyd:**

- Edited **Containment, made concrete** (v2): Shortened the post and sharpened the opening while retaining the containment actions and customer control.

## Assets

### Containment, made concrete

*linkedin post · version 2 · brand check: pass*

Wickhold Quenchline can isolate a pod’s network, freeze a process or drain a node. Your policy. Only in contain mode.

Runtime detection and containment for Kubernetes, using an eBPF agent. You decide which actions run automatically.

Explore Quenchline:
https://wickhold.example/products/quenchline

### Two modes. A clear boundary.

*linkedin post · version 1 · brand check: warn (2 notes)*

Wickhold Quenchline takes containment actions only in contain mode. In observe mode, it records what it would have done—without taking the action.

That’s the boundary between a decision record and a change to your Kubernetes environment.

Your policy controls which actions Quenchline can take in contain mode:
• Isolate a pod’s network
• Freeze a process
• Drain a node

Read the decision records in observe mode before enabling contain mode. Mode is set per policy, so switching one policy doesn’t mean switching them all.

Explore how Quenchline works on the product page.

### 38 seconds—with the scope attached

*linkedin post · version 1 · brand check: warn (1 note)*

Wickhold Quenchline contains a known-bad process in a median of 38 seconds in Wickhold lab benchmarks, 2026.

That measures detection to action on a lab node—not the length of an incident, not a customer average, and not a result for every threat.

For your Kubernetes environment, the controls matter too: Quenchline takes containment actions only in contain mode, under the policy you set. In observe mode, it records what it would have done without taking those actions.

Explore Quenchline’s runtime detection and containment on the product page.
