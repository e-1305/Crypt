// Pure argument parser. parseCli never throws anything but UsageError.
import { UsageError } from "./exit.js";
import { GITHUB_BASE, looksRemote, parseGithubUrl } from "./url.js";

export const COMMANDS = ["exhume", "raise", "play", "graft", "inquisit", "reraise", "seal", "unseal", "raid"] as const;
export type CommandName = (typeof COMMANDS)[number];
export type Command = CommandName | "help" | "version";

export type Flags = Record<string, string | true>;

export interface Parsed {
  command: Command;
  args: string[];
  flags: Flags;
}

interface Spec {
  /** Names of positional arguments: [required..., optional...]. */
  positional: { name: string; required: boolean }[];
  /** Flag name (no dashes) to "bool" or "value". */
  flags: Record<string, "bool" | "value">;
}

const TARGET = [{ name: "target", required: true }];
const LIMB = [{ name: "LIMB", required: true }];

export const SPECS: Record<CommandName, Spec> = {
  exhume: { positional: TARGET, flags: { out: "value", feeds: "value", cache: "value", offline: "bool" } },
  raise: { positional: [{ name: "creature.json", required: false }], flags: { out: "value" } },
  play: { positional: [], flags: { story: "value", target: "value", advisories: "value" } },
  graft: {
    positional: LIMB,
    flags: { live: "bool", repo: "value", target: "value", advisories: "value", sabotage: "bool", "i-know-this-is-a-demo": "bool" },
  },
  inquisit: { positional: LIMB, flags: { "dry-run": "bool", repo: "value", live: "bool", timeout: "value" } },
  reraise: { positional: [], flags: { "dry-run": "bool", repo: "value", live: "bool", timeout: "value" } },
  seal: { positional: [], flags: {} },
  unseal: { positional: [], flags: {} },
  raid: { positional: TARGET, flags: { offline: "bool", feeds: "value", cache: "value", live: "bool", timeout: "value" } },
};

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const LIMB_ID = /^[A-Z]{1,32}$/;

export const TIMEOUT_MIN = 10;
export const TIMEOUT_MAX = 3600;
export const TIMEOUT_DEFAULT = 600;

const HINT = "Run 'crypt --help' for usage.";

export function parseCli(argv: readonly string[], env: Record<string, string | undefined> = {}): Parsed {
  const first = argv[0];
  if (first === undefined) throw new UsageError(`no command given. ${HINT}`);
  if (argv.some((a) => a === "--help" || a === "-h") || first === "help") return { command: "help", args: [], flags: {} };
  if (argv.some((a) => a === "--version" || a === "-V") || first === "version") return { command: "version", args: [], flags: {} };

  if (!(COMMANDS as readonly string[]).includes(first)) {
    throw new UsageError(`unknown command '${first.slice(0, 40)}'. ${HINT}`);
  }
  const command = first as CommandName;
  const spec = SPECS[command];
  const args: string[] = [];
  const flags: Flags = {};

  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--") && a.length > 2) {
      const eq = a.indexOf("=");
      const name = eq === -1 ? a.slice(2) : a.slice(2, eq);
      const kind = Object.hasOwn(spec.flags, name) ? spec.flags[name] : undefined;
      if (!kind) throw new UsageError(`unknown flag '--${name.slice(0, 40)}' for '${command}'. ${HINT}`);
      if (kind === "bool") {
        if (eq !== -1) throw new UsageError(`flag '--${name}' takes no value`);
        flags[name] = true;
      } else {
        const v = eq === -1 ? argv[++i] : a.slice(eq + 1);
        if (v === undefined || v === "") throw new UsageError(`flag '--${name}' needs a value`);
        flags[name] = v;
      }
    } else if (a.startsWith("-") && a !== "-") {
      throw new UsageError(`unknown flag '${a.slice(0, 40)}' for '${command}'. ${HINT}`);
    } else {
      args.push(a);
    }
  }

  const required = spec.positional.filter((p) => p.required).length;
  if (args.length < required) {
    throw new UsageError(`'${command}' needs a ${spec.positional[args.length]!.name}. ${HINT}`);
  }
  if (args.length > spec.positional.length) {
    throw new UsageError(`unexpected argument '${args[spec.positional.length]!.slice(0, 40)}' for '${command}'. ${HINT}`);
  }

  if (command === "exhume" || command === "raid") {
    const t = args[0]!;
    if (looksRemote(t) && !parseGithubUrl(t)) {
      throw new UsageError(`'${t.slice(0, 60)}' is not a GitHub repository URL. Use ${GITHUB_BASE}/<owner>/<repo> or a local path.`);
    }
  }
  if (command === "graft" || command === "inquisit") {
    const limb = args[0]!.toUpperCase();
    if (!LIMB_ID.test(limb)) throw new UsageError(`'${args[0]!.slice(0, 40)}' is not a limb ID. Limb IDs are capital letters, for example JQUERY.`);
    args[0] = limb;
  }
  if (typeof flags.repo === "string" && !REPO.test(flags.repo)) {
    throw new UsageError(`--repo must look like owner/name, got '${flags.repo.slice(0, 60)}'`);
  }
  if (flags.timeout !== undefined) {
    const t = String(flags.timeout);
    if (!/^\d+$/.test(t) || Number(t) < TIMEOUT_MIN || Number(t) > TIMEOUT_MAX) {
      throw new UsageError(`--timeout must be a whole number of seconds from ${TIMEOUT_MIN} to ${TIMEOUT_MAX}, got '${t.slice(0, 20)}'`);
    }
  }
  const needsToken = (what: string) => {
    if (!env.GITHUB_TOKEN) throw new UsageError(`${what} needs GITHUB_TOKEN in the environment. Create a fine-grained token limited to the target repository, then export GITHUB_TOKEN.`);
  };
  if (command === "graft") {
    const sabotage = flags.sabotage === true;
    const demo = flags["i-know-this-is-a-demo"] === true;
    if (sabotage && !(flags.live === true && demo)) {
      throw new UsageError("--sabotage is a demo flag. Run it as: crypt graft <LIMB> --live --sabotage --i-know-this-is-a-demo");
    }
    if (demo && !sabotage) throw new UsageError("--i-know-this-is-a-demo only goes with --sabotage. Remove it, or add --sabotage and --live.");
    if (flags.live === true) needsToken("--live");
  }
  if ((command === "inquisit" || command === "reraise") && flags.live === true) needsToken("--live");
  if (command === "raid" && flags.live === true) {
    if (flags.offline === true) throw new UsageError("--live cannot be combined with --offline. Remove --offline to talk to GitHub.");
    if (!parseGithubUrl(args[0]!)) throw new UsageError(`--live needs a GitHub URL target: ${GITHUB_BASE}/<owner>/<repo>`);
    needsToken("--live");
  }
  if (command === "raid" && flags.timeout !== undefined && flags.live !== true) throw new UsageError("--timeout only applies with --live.");
  return { command, args, flags };
}
