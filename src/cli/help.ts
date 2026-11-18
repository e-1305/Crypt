// Help and version text.
import { EXIT_TABLE } from "./exit.js";
import { GITHUB_BASE as GITHUB } from "./url.js";

export const VERSION = "0.1.0";

export const versionText = (): string => `crypt ${VERSION}\n`;

export function helpText(): string {
  const codes = EXIT_TABLE.map(([code, meaning]) => `  ${String(code).padEnd(4)}${meaning}`).join("\n");
  return `crypt ${VERSION}. Your dependency tree is a creature. Wake it, find the rotting limbs, graft the fixes.

Usage: crypt <command> [options]

Commands:
  raid <target>       The whole ritual: exhume, raise, show the plate, play. Start here.
  exhume <target>     Dig up the dependencies and write out/creature.json.
  raise [creature]    Stitch out/creature.json into the story file out/creature.z8.
  play                Play out/creature.z8. Graft commands write dry-run payloads to out/prs/.
  graft <LIMB>        Request one fix for a limb (dry-run unless --live).
  inquisit <LIMB>     Check the CI of a limb's pull request. Green means a human may land it.
  reraise             After a human landed pull requests: mark those limbs healed and recompile.
  seal                Stop every agent action. Writes .crypt-seal.
  unseal              Lift the seal.

<target> is a local directory or a GitHub URL of the form ${GITHUB}/<owner>/<repo>.
A URL is shallow-cloned into a temporary directory that is removed afterwards.
Nothing from the target is run, and no dependencies are installed.

Options:
  --offline           raid, exhume: make no network call (OSV answers come from the cache)
  --feeds <dir>       raid, exhume: directory with kev.json and epss.csv
  --from <format>     exhume: <target> is a scanner file: sarif, dependabot, trivy, grype or snyk (no OSV call)
  --cache <dir>       raid, exhume: directory for cached OSV answers
  --out <path>        exhume: creature file (default out/creature.json); raise: output directory
  --story <file>      play: story file (default out/creature.z8)
  --target <dir>      play, graft: checkout that the fix is written against (default .)
  --advisories <dir>  play, graft: advisory records for an offline run
  --live              raid, graft, inquisit, reraise: talk to GitHub for real. Needs GITHUB_TOKEN.
                      raid --live opens a pull request through the GitHub API; a human lands it.
  --timeout <seconds> raid, inquisit, reraise: how long to wait for the 'test' check (10 to 3600, default 600)
  --repo <owner/name> graft, inquisit, reraise: repository that receives pull requests (default: the last raid target)
  --sabotage          graft: DEMO ONLY. Adds a failing test to the pull request so CI goes red.
                      Needs --live and --i-know-this-is-a-demo.
  --i-know-this-is-a-demo  graft: confirms --sabotage is deliberate
  --dry-run           inquisit, reraise: touch nothing remote (the default without GITHUB_TOKEN)
  -h, --help          show this text
  -V, --version       show the version

Exit codes:
${codes}

Environment:
  CRYPT_TOOLCHAIN_DIR  where the Inform 6 and dfrotz toolchain is built (default ~/.cache/crypt/toolchain)
  GITHUB_TOKEN         needed only for --live (fine-grained, limited to the target repository)
  CRYPT_DEBUG=1        print stack traces

Try it: crypt raid fixtures/vulnerable-npm --offline
`;
}
