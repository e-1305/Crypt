// Page wiring only. Marker logic lives in js/web/output-hook.js (compiled from src/web/output-hook.ts).
// The only request this page makes is for its own story file.
import { startPlayer } from "./js/web/player.js";

const transcript = document.getElementById("transcript");
const form = document.getElementById("input-form");
const cmd = document.getElementById("cmd");
const eventLog = document.getElementById("event-log");
const eventEmpty = document.getElementById("event-empty");

function addLine(text, cls) {
  const div = document.createElement("div");
  div.className = cls ? "line " + cls : "line";
  div.textContent = text === "" ? "\u00a0" : text;
  transcript.appendChild(div);
  transcript.scrollTop = transcript.scrollHeight;
}

function addEvent(e) {
  const li = document.createElement("li");
  if (e.ok) {
    li.className = "ok";
    li.textContent = "Line " + e.lineNo + ": Detected: " + e.command + "  [[CRYPT " + (e.command === "SEAL CRYPT" ? "SEAL" : e.command) + "]]";
  } else {
    li.className = "rejected";
    li.textContent = "Line " + e.lineNo + ": " + e.reason;
  }
  eventLog.appendChild(li);
  eventEmpty.hidden = true;
}

function onResult(result) {
  for (const line of result.lines) {
    if (line === ">") continue; // the game's prompt, shown by the input row
    addLine(line, line.startsWith("> ") ? "echo" : "");
  }
  result.events.forEach(addEvent);
}

async function main() {
  const res = await fetch("game/spike.z5");
  if (!res.ok) throw new Error("game/spike.z5 not found (HTTP " + res.status + ")");
  const story = new Uint8Array(await res.arrayBuffer());
  const player = startPlayer(new window.ZVM(), story, {
    onResult,
    onExit: () => { cmd.disabled = true; addLine("The story has ended."); },
    onError: (m) => addLine("Interpreter stopped: " + m),
  });
  cmd.disabled = false;
  cmd.focus();
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = cmd.value;
    cmd.value = "";
    player.submit(text);
  });
}

main().catch((err) => addLine("Story file could not be loaded: " + err.message));
