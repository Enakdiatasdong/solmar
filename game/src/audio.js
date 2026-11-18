// SOLMAR sound uses only WebAudio oscillators and noise generated in memory.
// The context is unlocked by a user gesture; muting works before it exists.
import { AUDIO } from './config.js';

const NOTE = { A1: 55, C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98, A3: 220, C4: 261.63, E4: 329.63, G4: 392, A4: 440, C5: 523.25 };
const BASSLINE = [NOTE.A1, NOTE.A1, NOTE.C2, NOTE.D2, NOTE.A1, NOTE.G2, NOTE.F2, NOTE.E2];
const ARPEGGIO = [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.A4, NOTE.G4, NOTE.E4, NOTE.C4];
const BEAT = 0.34;
const LOOK_AHEAD = 0.25;
const MIN_GAIN = 0.0001;
const MAX_VOICES = 48;

export function createAudio() {
  let context = null;
  let graph = null;
  let muted = false;
  let started = false;
  let musicPlaying = false;
  let step = 0;
  let nextNoteTime = 0;
  const voices = new Set();

  function ensure() {
    if (context?.state === 'closed') {
      for (const voice of [...voices]) release(voice);
      context = null;
      graph = null;
      started = false;
    }
    if (context) return context;
    const host = globalThis.window ?? globalThis;
    const AudioContextClass = host.AudioContext ?? host.webkitAudioContext;
    if (!AudioContextClass) return null;

    let candidate = null;
    const nodes = [];
    const sources = [];
    const own = (node) => {
      nodes.push(node);
      return node;
    };
    try {
      candidate = new AudioContextClass();
      const master = own(candidate.createGain());
      master.gain.value = muted ? 0 : AUDIO.master;
      master.connect(candidate.destination);
      const music = own(candidate.createGain());
      music.gain.value = musicPlaying ? AUDIO.music : 0;
      music.connect(master);

      const engine = own(candidate.createGain());
      engine.gain.value = 0;
      engine.connect(master);
      const engineFilter = own(candidate.createBiquadFilter());
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      const mix = own(candidate.createGain());
      mix.gain.value = 0.5;
      engineFilter.connect(mix);
      mix.connect(engine);
      const engineA = own(candidate.createOscillator());
      engineA.type = 'sawtooth';
      engineA.frequency.value = 38;
      engineA.connect(engineFilter);
      sources.push(engineA);
      const engineB = own(candidate.createOscillator());
      engineB.type = 'square';
      engineB.frequency.value = 19;
      engineB.connect(engineFilter);
      sources.push(engineB);

      const siren = own(candidate.createGain());
      siren.gain.value = 0;
      siren.connect(master);
      const sirenOsc = own(candidate.createOscillator());
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 620;
      sirenOsc.connect(siren);
      sources.push(sirenOsc);

      const noise = candidate.createBuffer(1, Math.ceil(candidate.sampleRate * 1.5), candidate.sampleRate);
      const data = noise.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
      const skid = own(candidate.createGain());
      skid.gain.value = 0;
      skid.connect(master);
      const skidFilter = own(candidate.createBiquadFilter());
      skidFilter.type = 'bandpass';
      skidFilter.frequency.value = 1700;
      skidFilter.Q.value = 0.8;
      skidFilter.connect(skid);
      const skidSource = own(candidate.createBufferSource());
      skidSource.buffer = noise;
      skidSource.loop = true;
      skidSource.connect(skidFilter);
      sources.push(skidSource);

      const jetpack = own(candidate.createGain());
      jetpack.gain.value = 0;
      jetpack.connect(master);
      const jetpackFilter = own(candidate.createBiquadFilter());
      jetpackFilter.type = 'lowpass';
      jetpackFilter.frequency.value = 620;
      jetpackFilter.connect(jetpack);
      const jetpackNoise = own(candidate.createBufferSource());
      jetpackNoise.buffer = noise;
      jetpackNoise.loop = true;
      jetpackNoise.connect(jetpackFilter);
      sources.push(jetpackNoise);
      const jetpackOsc = own(candidate.createOscillator());
      jetpackOsc.type = 'triangle';
      jetpackOsc.frequency.value = 55;
      jetpackOsc.connect(jetpackFilter);
      sources.push(jetpackOsc);

      for (const source of sources) source.start();
      graph = {
        master, music, engine, engineA, engineB, engineFilter, siren, sirenOsc, skid, noise,
        jetpack, jetpackOsc, jetpackFilter,
      };
      context = candidate;
      nextNoteTime = context.currentTime + 0.05;
    } catch {
      // A partially built graph must never leave stale nodes available to callers.
      for (const source of sources) {
        try { source.stop(); } catch { /* The source may not have started. */ }
      }
      for (const node of nodes) node.disconnect();
      if (candidate && candidate.state !== 'closed') candidate.close().catch(() => {});
      return null;
    }
    return context;
  }

  function unlock() {
    const ctx = ensure();
    if (!ctx) return;
    started = true;
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume().catch(() => {});
  }

  function smooth(param, value, seconds) {
    const now = context.currentTime;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, seconds);
  }

  function release(voice) {
    if (!voices.delete(voice)) return;
    voice.source.onended = null;
    for (const node of voice.nodes) node.disconnect();
  }

  function stopVoices(musicOnly = false) {
    for (const voice of [...voices]) {
      if (musicOnly && !voice.music) continue;
      try { voice.source.stop(); } catch { /* An ended source is already silent. */ }
      release(voice);
    }
  }

  function trackVoice(source, nodes, music) {
    if (voices.size >= MAX_VOICES) {
      const oldest = voices.values().next().value;
      try { oldest.source.stop(); } catch { /* Already ended. */ }
      release(oldest);
    }
    const voice = { source, nodes, music };
    voices.add(voice);
    source.onended = () => release(voice);
  }

  function running() {
    return Boolean(context?.state === 'running' && graph && !muted);
  }

  function setMuted(value) {
    const nextMuted = Boolean(value);
    if (muted === nextMuted) return muted;
    muted = nextMuted;
    if (context && context.state !== 'closed') {
      smooth(graph.master.gain, muted ? 0 : AUDIO.master, 0.03);
      if (muted) stopVoices();
      nextNoteTime = context.currentTime + 0.05;
    }
    return muted;
  }

  function toggleMute() {
    return setMuted(!muted);
  }

  /** Speed ratio is 0..1; skid noise is audible only in an active vehicle. */
  function updateEngine(speedRatio, sliding, active) {
    if (!context || context.state === 'closed') return;
    const speed = Number.isFinite(speedRatio) ? Math.max(0, Math.min(1, speedRatio)) : 0;
    smooth(graph.engine.gain, active ? AUDIO.engine * (0.7 + speed * 0.8) : 0, 0.08);
    smooth(graph.engineA.frequency, 38 + speed * 120, 0.1);
    smooth(graph.engineB.frequency, 19 + speed * 60, 0.1);
    smooth(graph.engineFilter.frequency, 320 + speed * 900, 0.12);
    smooth(graph.skid.gain, active && sliding ? Math.min(0.12, 0.03 + speed * 0.12) : 0, 0.06);
  }

  function updateSiren(wanted) {
    if (!context || context.state === 'closed') return;
    const level = Number.isFinite(wanted) ? Math.max(0, Math.min(5, wanted)) : 0;
    smooth(graph.siren.gain, level > 0 ? AUDIO.siren * (0.5 + level * 0.1) : 0, 0.2);
    const phase = context.currentTime * (1 + level * 0.1);
    smooth(graph.sirenOsc.frequency, 560 + Math.sin(phase * 4.2) * 190, 0.06);
  }

  function updateJetpack(intensity) {
    if (!context || context.state === 'closed') return;
    const level = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0;
    smooth(graph.jetpack.gain, level * 0.14, 0.05);
    smooth(graph.jetpackOsc.frequency, 55 + level * 95, 0.08);
    smooth(graph.jetpackFilter.frequency, 620 + level * 1500, 0.08);
  }

  function gunshot() {
    if (!running()) return;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = graph.noise;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.65, now);
    gain.gain.exponentialRampToValueAtTime(MIN_GAIN, now + 0.14);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(graph.master);
    trackVoice(source, [source, filter, gain], false);
    source.start(now);
    source.stop(now + 0.14);
  }

  function playNote(frequency, time, duration, type, volume, music = false, endFrequency = null) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, time);
    if (endFrequency !== null) osc.frequency.exponentialRampToValueAtTime(endFrequency, time + duration);
    gain.gain.setValueAtTime(MIN_GAIN, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(MIN_GAIN, time + duration);
    osc.connect(gain);
    gain.connect(music ? graph.music : graph.master);
    trackVoice(osc, [osc, gain], music);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  function chime() {
    if (!running()) return;
    const now = context.currentTime;
    [NOTE.E4, NOTE.A4, NOTE.C5].forEach((frequency, index) => {
      playNote(frequency, now + index * 0.08, 0.55, 'sine', 0.16);
    });
  }

  function thud() {
    if (!running()) return;
    playNote(120, context.currentTime, 0.18, 'sine', 0.2, false, 45);
  }

  function musicTick() {
    if (!running() || !musicPlaying) return;
    const now = context.currentTime;
    // Skip missed beats after mute, suspended tabs or delayed frames instead of replaying them.
    if (nextNoteTime < now) nextNoteTime = now + 0.02;
    while (nextNoteTime < now + LOOK_AHEAD) {
      playNote(BASSLINE[step % BASSLINE.length], nextNoteTime, BEAT * 0.9, 'triangle', 0.08, true);
      playNote(ARPEGGIO[(step * 3) % ARPEGGIO.length], nextNoteTime + BEAT * 0.5, BEAT * 0.4, 'sine', 0.035, true);
      if (step % 8 === 0) playNote(NOTE.A4, nextNoteTime, 0.5, 'sine', 0.02, true);
      nextNoteTime += BEAT;
      step = (step + 1) % BASSLINE.length;
    }
  }

  function update(dt) {
    musicTick();
  }

  function stopMusic() {
    musicPlaying = false;
    stopVoices(true);
    if (context && context.state !== 'closed') smooth(graph.music.gain, 0, 0.05);
  }

  function startMusic() {
    if (musicPlaying) return;
    musicPlaying = true;
    step = 0;
    if (context && context.state !== 'closed') {
      nextNoteTime = context.currentTime + 0.05;
      smooth(graph.music.gain, AUDIO.music, 0.1);
    }
  }

  return {
    unlock,
    update,
    updateEngine,
    updateSiren,
    updateJetpack,
    gunshot,
    chime,
    thud,
    musicTick,
    stopMusic,
    startMusic,
    toggleMute,
    setMuted,
    get muted() { return muted; },
    get ready() { return Boolean(context && context.state !== 'closed'); },
    get started() { return Boolean(started && context?.state === 'running'); },
    ensure,
  };
}
