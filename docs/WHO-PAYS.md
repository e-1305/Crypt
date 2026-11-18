# Who uses CRYPT, and who pays

No market size is claimed. Every number below comes from [the census](census/RESULTS.md) (20 popular open-source projects, scan 2026-11-17, lockfile only, no reachability, not a random sample). Sentences marked **Opinion** are the authors' judgment, not measured.

For the market, pricing hypothesis, defensibility and traction, see [BUSINESS.md](BUSINESS.md).

## Who uses it

- Vulnerability management and VOC (vulnerability operations) teams, who rank findings and chase owners.
- AppSec teams, who need fixes to arrive as reviewable pull requests.
- Open-source maintainers, who can run the same scan on their own lockfile.

The primary user in the product is a dev team doing a 15-minute weekly raid (`.kiro/steering/product.md`).

## Who pays

**Opinion:** the security organization that owns remediation SLAs is the buyer, because it is accountable for time-to-fix and has to chase owners and sort noise by hand. CRYPT is free and open source today (MIT, see [LICENSE](../LICENSE)). No pricing exists and no customer has paid.

## The wedge

| Problem | Census number |
|---|---|
| Ownership: limbs (dependencies) with no CODEOWNERS owner | 84.7% (9,528 of 11,244). 16 of 20 repositories have no CODEOWNERS file. |
| Noise: findings the filter exorcised | 95.2% (236 of 248). 3 spawned as monsters. |

The filter follows `.kiro/steering/sla-policy.md`: only Possessed limbs (CISA KEV) and Rotting limbs with EPSS of 0.1 or more spawn. Source: [census results](census/RESULTS.md), including its limitations.

## What is hard to copy

**Opinion**, with the code that backs each point:

- Human-in-the-loop trust model, enforced in code and CI: agents hold a PR-only token, no code path merges, and a human merge is required before a limb heals. See [Safety guarantees](../README.md#safety-guarantees) and `.kiro/steering/failsafe.md`.
- Deterministic ranking: the same inputs give the same order (OSV, CISA KEV, FIRST EPSS), with no model in the loop.
- The playable report: the vulnerability report is a Z-machine story file anyone can open and play.

## Proof it works end to end

- [crypt-demo PR #1](https://github.com/e-1305/crypt-demo/pull/1): lodash 4.17.15 to 4.18.1, opened by CRYPT, CI green, merged by a human.
- [crypt-demo PR #2](https://github.com/e-1305/crypt-demo/pull/2): the sabotage case, CI red, rejected and closed unmerged.
