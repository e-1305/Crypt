// Sound (Epic B4). Everything is synthesised here at runtime: no audio files, no third-party samples.
// Off on load. The AudioContext is created only inside the click handler of the toggle button.
// Reduced motion and high-contrast mode never start audio on their own; an explicit click on the
// toggle may still enable it, because the click is the user's own choice.
import { beatIntervalMs } from "../js/theatre/audio-plan.js";

export function initSound() {
  const btn = document.getElementById("sound-toggle");
  if (!btn) return { setPossessed() {}, graft() {} };
  let ctx = null, master = null, on = false, possessed = 0, hum = null, beatTimer = 0, noise = null;

  function render() {
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "Sound: on" : "Sound: off";
  }

  function noiseBuffer() {
    if (noise) return noise;
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }
  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function startHum() {
    const g = ctx.createGain();
    g.gain.value = 0.05;
    g.connect(master);
    const a = ctx.createOscillator(); a.type = "sawtooth"; a.frequency.value = 15734; // CRT line whine
    const af = ctx.createGain(); af.gain.value = 0.02;
    const b = ctx.createOscillator(); b.type = "sine"; b.frequency.value = 60; // mains hum
    a.connect(af).connect(g); b.connect(g);
    a.start(); b.start();
    hum = { stop() { a.stop(); b.stop(); g.disconnect(); } };
  }

  function thump(t, freq, peak) {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.15);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 160;
    const g = ctx.createGain(); env(g, t, peak, 0.01, 0.16);
    o.connect(lp).connect(g).connect(master);
    o.start(t); o.stop(t + 0.3);
  }
  function beat() {
    if (!on) return;
    const t = ctx.currentTime;
    thump(t, 70, 0.5);
    thump(t + 0.17, 55, 0.3);
    beatTimer = setTimeout(beat, beatIntervalMs(possessed));
  }

  function thunder() {
    if (!on) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer();
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(70, t + 2.2);
    const g = ctx.createGain(); env(g, t, 0.9, 0.04, 2.2);
    s.connect(lp).connect(g).connect(master);
    s.start(t); s.stop(t + 2.5);
  }

  function graft() {
    if (!on) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const s = ctx.createBufferSource(); s.buffer = noiseBuffer();
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3500;
      const g = ctx.createGain(); env(g, t + i * 0.09, 0.4, 0.002, 0.03);
      s.connect(hp).connect(g).connect(master);
      s.start(t + i * 0.09, Math.random(), 0.06);
    }
  }

  function enable() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
    }
    ctx.resume?.();
    on = true;
    startHum();
    beat();
    return true;
  }
  function disable() {
    on = false;
    clearTimeout(beatTimer);
    hum?.stop(); hum = null;
    ctx?.suspend?.();
  }

  btn.addEventListener("click", () => {
    try { if (on) disable(); else if (!enable()) on = false; } catch { disable(); }
    render();
  });
  document.addEventListener("crypt:fx", (e) => {
    try { if (e.detail && e.detail.kind === "heal") thunder(); } catch { /* the page keeps running when sound fails */ }
  });
  render();
  return {
    setPossessed(n) { possessed = n; },
    graft() { try { graft(); } catch { /* ignore */ } },
  };
}
