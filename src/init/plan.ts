// Pure planning for `crypt init`: which files the onboarding pull request adds. No network, deterministic.
// Blameless: the CODEOWNERS draft holds team placeholders only, never a person, and nothing is read from git history.

export const WORKFLOW_PATH = ".github/workflows/crypt.yml";
export const CODEOWNERS_PATHS = ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"] as const;
export const CODEOWNERS_DRAFT_PATH = ".github/CODEOWNERS";
export const INIT_BRANCH = "crypt/init";
export const PLACEHOLDER_TEAM = "@your-org/your-team";

const MANIFESTS = new Set([
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "requirements.txt",
  "poetry.lock",
  "Pipfile.lock",
  "pyproject.toml",
  "go.mod",
  "Cargo.lock",
  "Gemfile.lock",
  "pom.xml",
  "composer.lock",
]);
const SKIP = /(^|\/)(node_modules|vendor|dist|build|\.git|test\/fixtures|tests\/fixtures|fixtures)(\/|$)/;

export interface InitFile {
  path: string;
  content: string;
}

export interface InitPlan {
  files: InitFile[];
  manifests: string[];
  hasCodeowners: boolean;
}

/** Manifest paths from a repository tree listing, sorted, at most 50, skipping vendored and fixture folders. */
export function manifestPaths(tree: readonly string[]): string[] {
  const out = tree.filter((p) => !SKIP.test(p) && MANIFESTS.has(p.split("/").pop() ?? ""));
  return [...new Set(out)].sort().slice(0, 50);
}

export function workflowYaml(): string {
  return [
    "# Added by `crypt init`. CRYPT ranks vulnerable dependencies (CISA KEV first, then EPSS),",
    "# names the owning team from CODEOWNERS and writes a report. Report mode never writes to the repository.",
    "name: crypt",
    "on:",
    "  pull_request:",
    "  push:",
    "    branches: [main]",
    "  schedule:",
    "    - cron: \"17 6 * * 1\"",
    "  workflow_dispatch:",
    "permissions:",
    "  contents: read",
    "jobs:",
    "  crypt:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - uses: e-1305/Crypt@main",
    "        with:",
    "          mode: report",
    "",
  ].join("\n");
}

export function codeownersDraft(manifests: readonly string[]): string {
  const lines = [
    "# Draft added by `crypt init`. Replace the placeholder team with the team that owns each part.",
    "# CRYPT uses this file to name who heals a vulnerable dependency. It never names a person on its own.",
    "# Syntax: see GitHub documentation, About code owners.",
    "",
  ];
  const paths = manifests.length > 0 ? manifests : ["package.json"];
  for (const m of paths) lines.push(`/${m} ${PLACEHOLDER_TEAM}`);
  lines.push("");
  return lines.join("\n");
}

/** The files the onboarding PR adds. Refuses (throws) when the workflow is already there: nothing to do twice. */
export function planInit(tree: readonly string[]): InitPlan {
  if (tree.includes(WORKFLOW_PATH)) throw new Error(`${WORKFLOW_PATH} already exists. CRYPT is already set up here.`);
  const hasCodeowners = CODEOWNERS_PATHS.some((p) => tree.includes(p));
  const manifests = manifestPaths(tree);
  const files: InitFile[] = [{ path: WORKFLOW_PATH, content: workflowYaml() }];
  if (!hasCodeowners) files.push({ path: CODEOWNERS_DRAFT_PATH, content: codeownersDraft(manifests) });
  return { files, manifests, hasCodeowners };
}

export function prBody(plan: InitPlan): string {
  const lines = [
    "This pull request was opened by `crypt init`. It adds:",
    "",
    `- \`${WORKFLOW_PATH}\`: CRYPT in report mode on pull requests, on pushes to main and every Monday. Read-only (contents: read).`,
  ];
  if (!plan.hasCodeowners) {
    lines.push(`- \`${CODEOWNERS_DRAFT_PATH}\`: a draft with the placeholder \`${PLACEHOLDER_TEAM}\` for ${plan.manifests.length || 1} manifest path(s). Replace it with your real teams before this lands.`);
  } else {
    lines.push("- No CODEOWNERS change: this repository already has one.");
  }
  lines.push("", "CRYPT has no way to land this change. A person reviews it and lands it.");
  return lines.join("\n");
}
