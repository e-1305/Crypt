# Product metrics

What we track to know if CRYPT works, and where each number lives today. "Not measured" means exactly that.

| Metric | Why it matters | Where measured | Today |
|---|---|---|---|
| Noise cut (findings filtered before a limb spawns) | The core promise: fewer, truer alerts | `npm run census`, [census/RESULTS.md](census/RESULTS.md) | 95.2% across 20 repos |
| Ownership gap (limbs with no CODEOWNERS owner) | The wedge | same census | 84.7% |
| Fix PRs merged by a person | The outcome that counts | GitHub, [PROOF.md](PROOF.md) | 1 (crypt-demo PR #1) |
| Bad fixes rejected before merge | Trust | Inquisitor runs, [PROOF.md](PROOF.md) | 1 of 1 sabotage rejected |
| Time from PR opened to merge | Last-mile speed | `crypt autopsy` history | 3 min on the demo (one data point) |
| Activation: repos running `crypt init` outside our own | Real adoption | GitHub code search for the workflow | Not measured; 0 known |
| npm weekly downloads | Reach (includes bots and mirrors) | [npm](https://www.npmjs.com/package/@e-1305/crypt) | Read on npm; not a user count |
| Retention: repos with a second scheduled run | Habit | Action history | Not measured |
