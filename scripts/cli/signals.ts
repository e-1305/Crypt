// Interrupt handling: run registered cleanups on SIGINT or SIGTERM, then exit 130.
import { EXIT } from "../../src/cli/exit.js";

const handlers = new Set<() => void>();
let installed = false;
let interrupted = false;

function handle(): void {
  if (interrupted) return; // a second signal must not cut the cleanup short
  interrupted = true;
  for (const fn of [...handlers]) {
    try {
      fn();
    } catch {
      // keep cleaning up the rest
    }
  }
  process.exit(EXIT.INTERRUPTED);
}

/** Registers a synchronous cleanup. Returns a function that removes it. */
export function onInterrupt(fn: () => void): () => void {
  if (!installed) {
    installed = true;
    process.on("SIGINT", handle);
    process.on("SIGTERM", handle);
  }
  handlers.add(fn);
  return () => {
    handlers.delete(fn);
  };
}
