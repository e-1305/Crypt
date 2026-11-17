// Exit codes and the typed errors that map to them. Documented in --help and the README.
export const EXIT = {
  OK: 0,
  FAILURE: 1,
  USAGE: 2,
  TOOLCHAIN: 3,
  TARGET: 4,
  INTERRUPTED: 130,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export const EXIT_CODES: readonly ExitCode[] = Object.values(EXIT);

export const EXIT_TABLE: readonly (readonly [ExitCode, string])[] = [
  [EXIT.OK, "ok"],
  [EXIT.FAILURE, "runtime failure"],
  [EXIT.USAGE, "usage error"],
  [EXIT.TOOLCHAIN, "toolchain missing or failed to build"],
  [EXIT.TARGET, "target unreadable (clone failed, no manifest)"],
  [EXIT.INTERRUPTED, "interrupted"],
];

/** An error with a one-line, actionable message and the exit code it maps to. An empty message prints nothing. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly code: ExitCode = EXIT.FAILURE,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UsageError extends CliError {
  constructor(message: string) {
    super(message, EXIT.USAGE);
  }
}

export class ToolchainError extends CliError {
  constructor(message: string) {
    super(message, EXIT.TOOLCHAIN);
  }
}

export class TargetError extends CliError {
  constructor(message: string) {
    super(message, EXIT.TARGET);
  }
}

export function exitCodeFor(e: unknown): ExitCode {
  return e instanceof CliError ? e.code : EXIT.FAILURE;
}
