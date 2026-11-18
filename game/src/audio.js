import { AUDIO } from './config.js';

// The whole soundtrack is oscillators and envelopes, created after a gesture.
export function createAudio() {
  let context = null;
  let master = null;
  let engine = null;
  let engineGain = null;
  let sirenVoice = null;
  let sirenGain = null;
  let muted = false;
  let clock = 0;
  let nextNote = 0;
  let beat = 0;
  const voices = new Set();

  function initialize() {
    if (context) return true;
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return false;
    try {
      context = new Context();
      master = context.createGain();
      master.gain.value = muted ? 0 : AUDIO.master;
      master.connect(context.destination);
      engine = context.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 45;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engine.connect(filter).connect(engineGain).connect(master);
      engine.start();
      sirenVoice = context.createOscillator();
      sirenVoice.type = 'triangle';
      sirenVoice.frequency.value = 620;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenVoice.connect(sirenGain).connect(master);
      sirenVoice.start();
      nextNote = context.currentTime + 0.1;
      return true;
    } catch {
      context = null;
      return false;
    }
  }
  function unlock() {
    if (!initialize()) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
  }
  function tone(frequency, length, type = 'sine', gain = AUDIO.effects, when = 0, endFrequency = frequency) {
    if (!context || context.state !== 'running') return;
    const start = context.currentTime + Math.max(0, when);
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(12, endFrequency), start + length);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + length);
    oscillator.connect(envelope).connect(master);
    voices.add(oscillator);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); voices.delete(oscillator); };
    oscillator.start(start);
    oscillator.stop(start + length + 0.02);
  }
  function drum(when) {
    tone(130, 0.13, 'sine', AUDIO.music * 1.4, when, 38);
    if (beat % 2) tone(1600, 0.035, 'square', AUDIO.music * 0.08, when, 800);
  }
  function update(dt, playerState = {}, wanted = 0) {
    clock += dt;
    if (!context) return;
    const player = playerState.state || playerState;
    const car = player.car;
    const speed = Math.abs(car?.speed || 0);
    engine.frequency.setTargetAtTime(36 + speed * 3.6, context.currentTime, 0.12);
    engineGain.gain.setTargetAtTime(car ? AUDIO.engine * (0.28 + Math.min(1, speed / 28) * 0.7) : 0, context.currentTime, 0.15);
    sirenVoice.frequency.setTargetAtTime(640 + Math.sin(clock * 5.2) * 240, context.currentTime, 0.03);
    sirenGain.gain.setTargetAtTime(wanted > 0 ? AUDIO.siren * (0.55 + wanted * 0.09) : 0, context.currentTime, 0.12);
    if (context.state !== 'running') return;
    const beatLength = 60 / AUDIO.bpm / 2;
    if (nextNote < context.currentTime - 0.3) nextNote = context.currentTime;
    while (nextNote < context.currentTime + 0.14) {
      const bass = [55, 55, 65.406, 73.416, 49, 49, 65.406, 61.735];
      const melody = [220, 329.628, 440, 391.995, 261.626, 329.628, 293.665, 246.942];
      const offset = nextNote - context.currentTime;
      if (beat % 2 === 0) tone(bass[Math.floor(beat / 2) % bass.length], beatLength * 1.5, 'triangle', AUDIO.music * 0.6, offset);
      tone(melody[beat % melody.length], beatLength * 0.65, 'sine', AUDIO.music * 0.25, offset);
      if (beat % 2 === 0) drum(offset);
      beat++;
      nextNote += beatLength;
    }
  }
  function setMuted(value) {
    muted = Boolean(value);
    if (context && master) master.gain.setTargetAtTime(muted ? 0 : AUDIO.master, context.currentTime, 0.03);
    return muted;
  }
  function toggleMute() { return setMuted(!muted); }
  function gunshot() {
    tone(190, 0.1, 'sawtooth', AUDIO.effects, 0, 32);
    tone(1800, 0.035, 'square', AUDIO.effects * 0.25, 0, 160);
  }
  function chime() {
    tone(523.251, 0.22, 'sine', AUDIO.effects * 0.6);
    tone(659.255, 0.26, 'sine', AUDIO.effects * 0.5, 0.075);
    tone(783.991, 0.35, 'sine', AUDIO.effects * 0.45, 0.15);
  }
  function thud() { tone(95, 0.12, 'triangle', AUDIO.effects * 0.8, 0, 30); }
  function siren() {
    tone(620, 0.25, 'triangle', AUDIO.siren, 0, 950);
    tone(950, 0.35, 'triangle', AUDIO.siren, 0.23, 620);
  }
  function dispose() {
    if (!context) return;
    for (const oscillator of voices) { try { oscillator.stop(); } catch {} }
    voices.clear();
    try { engine.stop(); sirenVoice.stop(); } catch {}
    context.close().catch(() => {});
    context = null;
  }
  return { start: unlock, unlock, update, gunshot, chime, thud, siren, setMuted, toggleMute, get muted() { return muted; }, dispose };
}
