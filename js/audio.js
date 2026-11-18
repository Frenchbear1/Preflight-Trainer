// Small Web Audio helpers: stall horn, switch clicks, breaker pops, engine sound.
let ctx = null;
function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
addEventListener('pointerdown', () => ac(), { once: true });

export function tone(freq, vol = 0.1) {
  const c = ac(); if (!c) return { stop() {} };
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'square'; o.frequency.value = freq; g.gain.value = 0; g.gain.setTargetAtTime(vol, c.currentTime, 0.02);
  o.connect(g).connect(c.destination); o.start();
  return { stop() { g.gain.setTargetAtTime(0, c.currentTime, 0.03); o.stop(c.currentTime + 0.2); } };
}

export function click(kind = 'toggle') {
  const c = ac(); if (!c) return;
  const len = kind === 'breaker' ? 0.05 : kind === 'knob' ? 0.015 : 0.03;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, kind === 'breaker' ? 6 : 10);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'bandpass'; f.frequency.value = kind === 'breaker' ? 1400 : 3200; f.Q.value = 0.8; g.gain.value = kind === 'breaker' ? 0.9 : 0.6;
  s.buffer = buf; s.connect(f).connect(g).connect(c.destination); s.start();
}

// Engine: low rumble whose pitch follows RPM
let eng = null;
export function engineSound(rpm, cranking) {
  const c = ctx; if (!c) return;
  if (!eng && (rpm > 50 || cranking)) {
    const o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g).connect(c.destination); o1.start(); o2.start();
    eng = { o1, o2, g, f };
  }
  if (!eng) return;
  const fire = (rpm / 60) * 2; // four cylinders: two firing pulses per revolution
  eng.o1.frequency.setTargetAtTime(Math.max(8, fire), c.currentTime, 0.1);
  eng.o2.frequency.setTargetAtTime(Math.max(6, fire / 2), c.currentTime, 0.1);
  eng.f.frequency.setTargetAtTime(250 + rpm * 0.35, c.currentTime, 0.2);
  eng.g.gain.setTargetAtTime(rpm > 30 ? Math.min(0.16, 0.03 + rpm / 16000) : 0, c.currentTime, 0.15);
}
