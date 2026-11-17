// Minimal Glk for ifvms ZVM (v5 stories). Browser and Node safe: no DOM, fs or network.
// All story text leaves through putText. Typed lines enter only through submitLine.
// Unsupported calls (save, restore, colour, char input) answer with safe no-ops.

class RefBox {
  value: unknown = 0;
  get_value() { return this.value; }
  set_value(v: unknown) { this.value = v; }
}

class RefStruct {
  fields: unknown[] = [];
  push_field(v: unknown) { this.fields.push(v); }
  get_field(i: number) { return this.fields[i]; }
  set_field(i: number, v: unknown) { this.fields[i] = v; }
}

interface GlkWindow { kind: "main" | "grid"; str: GlkStream }
interface GlkStream { win: GlkWindow | null }

export interface ZvmLike {
  prepare(story: Uint8Array, options: { Glk: unknown }): void;
  start(): void;
  resume(arg?: unknown): void;
}

export interface GlkHost {
  putText(text: string): void; // main window text, in print order
  onExit(): void;
  onError(message: string): void;
}

export interface GlkShim {
  glk: Record<string, unknown>;
  attach(vm: ZvmLike): void;
  submitLine(text: string): boolean; // false when the story is not waiting for a line
}

export function createGlk(host: GlkHost): GlkShim {
  let vm: ZvmLike | null = null;
  let current: GlkWindow | null = null;
  let selectEvent: RefStruct | null = null;
  let lineReq: { win: GlkWindow; buffer: number[] } | null = null;
  let charReq: GlkWindow | null = null;
  let resumeFileref = false;
  const wins: GlkWindow[] = [];

  function write(str: GlkStream | GlkWindow | null, text: string) {
    const win = str && "kind" in str ? str : str ? str.win : current;
    if (win && win.kind === "main") host.putText(text);
  }

  const glk: Record<string, unknown> = {
    RefBox,
    RefStruct,
    glk_gestalt: () => 0,
    glk_window_open(_split: unknown, _method: number, _size: number, wintype: number) {
      const str: GlkStream = { win: null };
      const win: GlkWindow = { kind: wintype === 3 ? "main" : "grid", str };
      str.win = win;
      wins.push(win);
      return win;
    },
    glk_set_window(win: GlkWindow | null) { current = win; },
    glk_window_get_stream: (win: GlkWindow) => win.str,
    glk_window_get_parent: () => null,
    glk_window_set_arrangement: () => {},
    glk_window_move_cursor: () => {},
    glk_window_clear: () => {},
    glk_window_close: () => {},
    glk_window_get_size(_win: unknown, w: RefBox | 0, h: RefBox | 0) {
      if (w) w.set_value(80);
      if (h) h.set_value(24);
    },
    glk_stylehint_set: () => {},
    glk_stylehint_clear: () => {},
    glk_set_style: () => {},
    glk_put_jstring(text: string) { write(current, text); },
    glk_put_jstring_stream(str: GlkStream, text: string) { write(str, text); },
    glk_put_char_stream_uni(str: GlkStream, code: number) { write(str, String.fromCodePoint(code)); },
    glk_stream_close: () => {},
    glk_request_line_event_uni(win: GlkWindow, buffer: number[]) { lineReq = { win, buffer }; },
    glk_request_char_event_uni(win: GlkWindow) { charReq = win; },
    glk_fileref_create_by_prompt() { resumeFileref = true; },
    glk_select(ev: RefStruct) { selectEvent = ev; },
    glk_exit() { host.onExit(); },
    fatal_error(e: unknown) { host.onError(e instanceof Error ? e.message : String(e)); },
    update() {
      // Save and restore are not offered: answer the pending prompt with "no file".
      if (resumeFileref && vm) {
        resumeFileref = false;
        vm.resume(null);
      }
    },
  };

  function deliver(fields: unknown[]) {
    const ev = selectEvent;
    selectEvent = null;
    if (!ev || !vm) return;
    ev.fields = fields;
    vm.resume();
  }

  return {
    glk,
    attach(v) { vm = v; },
    submitLine(text) {
      const clean = text.replace(/[\r\n]/g, "");
      if (lineReq && selectEvent) {
        const { win, buffer } = lineReq;
        lineReq = null;
        const codes = Array.from(clean).map((c) => c.codePointAt(0) ?? 0).slice(0, buffer.length);
        codes.forEach((c, i) => { buffer[i] = c; });
        deliver([3, win, codes.length, 0]);
        return true;
      }
      if (charReq && selectEvent) {
        const win = charReq;
        charReq = null;
        deliver([2, win, clean.codePointAt(0) ?? 13]);
        return true;
      }
      return false;
    },
  };
}
