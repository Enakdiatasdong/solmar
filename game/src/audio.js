import { AUDIO } from './config.js';

// Every note is synthesized locally; the graph wakes only after a gesture.
export function createAudio() {
  let context = null;
  let master, music, effects, engineGain, sirenGain, engine, siren;
  let muted = false;
  let speed = 0;
  let wanted = 0;
  let beat = 0;
  let nextBeat = 0;
  let playing = false;
  const setting = (name, fallback) => Number.isFinite(AUDIO?.[name]) ? AUDIO[name] : fallback;
  function tone(frequency, start, duration, gain, type = 'sine', bus = effects) {
    if (!context || !bus) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), start + .012);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(envelope).connect(bus);
    oscillator.start(start);
    oscillator.stop(start + duration + .025);
  }
  function unlock() {
    if (!context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = muted ? 0 : setting('master', .38);
      const compressor = context.createDynamicsCompressor();
      master.connect(compressor).connect(context.destination);
      music = context.createGain();
      music.gain.value = setting('music', .13);
      music.connect(master);
      effects = context.createGain();
      effects.gain.value = setting('effects', .5);
      effects.connect(master);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 360;
      engine = context.createOscillator();
      engine.type = 'sawtooth';
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engine.connect(filter).connect(engineGain).connect(master);
      engine.start();
      siren = context.createOscillator();
      siren.type = 'triangle';
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      siren.connect(sirenGain).connect(master);
      siren.start();
      nextBeat = context.currentTime + .08;
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
  }
  function setMuted(value) {
    muted = Boolean(value);
    if (master) master.gain.setTargetAtTime(muted ? 0 : setting('master', .38), context.currentTime, .035);
  }
  function update(dt, state = {}) {
    speed = Number.isFinite(state.speed) ? Math.abs(state.speed) : speed;
    wanted = Number.isFinite(state.wanted) ? state.wanted : wanted;
    playing = state.playing !== false;
    if (!context || context.state !== 'running') return;
    const now = context.currentTime;
    const inCar = state.inCar ?? speed > .1;
    engine.frequency.setTargetAtTime(38 + Math.min(35, speed) * 3.8, now, .09);
    engineGain.gain.setTargetAtTime(playing && inCar ? setting('engine', .06) * (.4 + speed / 40) : 0, now, .1);
    siren.frequency.setTargetAtTime(650 + Math.sin(now * 7.2) * 210, now, .04);
    sirenGain.gain.setTargetAtTime(playing && wanted > 0 ? setting('siren', .035) : 0, now, .08);
    if (!playing) { nextBeat = now + .08; return; }
    if (nextBeat < now - .5) nextBeat = now + .04;
    const bass = [55, 55, 65.406, 49, 55, 73.416, 65.406, 49];
    const notes = [220, 261.626, 329.628, 392, 329.628, 261.626, 293.665, 246.942];
    while (nextBeat < now + .12) {
      const index = beat % notes.length;
      tone(notes[index], nextBeat, .19, .2, 'triangle', music);
      if (beat % 2 === 0) tone(bass[(beat / 2) % bass.length], nextBeat, .42, .36, 'triangle', music);
      beat++;
      nextBeat += 60 / 108 / 2;
    }
  }
  function gunshot() {
    if (!context) return;
    const now = context.currentTime;
    const length = Math.floor(context.sampleRate * .14);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = .45;
    noise.connect(gain).connect(effects);
    noise.start(now);
    tone(75, now, .12, .55, 'sawtooth');
  }
  return {
    unlock, setMuted, update, gunshot,
    get muted() { return muted; },
    chime() {
      if (!context) return;
      [659.255, 830.609, 987.767].forEach((note, i) => tone(note, context.currentTime + i * .065, .34, .25));
    },
    thud() {
      if (context) tone(62, context.currentTime, .17, .42, 'triangle');
    },
    setEngine(value) { speed = Math.abs(value || 0); },
    setSiren(value) { wanted = value || 0; },
  };
}
