// Wires the interpreter, the Glk shim and the output hook. Story text goes to hook.feed,
// typed lines go to hook.input and then to the story. Nothing else reaches the hook.
import { createOutputHook, type HookResult } from "./output-hook.js";
import { createGlk, type ZvmLike } from "./glk-shim.js";

export interface Player {
  submit(text: string): boolean;
}

export interface PlayerHost {
  onResult(result: HookResult): void;
  onExit(): void;
  onError(message: string): void;
}

export function startPlayer(vm: ZvmLike, story: Uint8Array, host: PlayerHost): Player {
  const hook = createOutputHook();
  const shim = createGlk({
    putText: (t) => host.onResult(hook.feed(t)),
    onExit: () => { host.onResult(hook.flush()); host.onExit(); },
    onError: host.onError,
  });
  shim.attach(vm);
  vm.prepare(story, { Glk: shim.glk });
  vm.start();
  return {
    submit(text) {
      const clean = text.replace(/[\r\n]/g, "");
      host.onResult(hook.input(clean));
      return shim.submitLine(clean);
    },
  };
}
