const TRACK_SECONDS = 24;
const TRACK_EPSILON = 1e-9;

export const STATIONS = [
  {
    id: 'solmar-fm', name: 'Solmar FM', tagline: 'Coastline sounds for the long way home.',
    tracks: ['Sunset Over Pier 9', 'Salt on the Dashboard', 'Gold Hour Tollbooth'],
    bass: [55, 55, 65.41, 73.42, 55, 98, 87.31, 82.41],
    arp: [220, 261.63, 329.63, 392, 440, 392, 329.63, 261.63],
    beat: 0.34, bassType: 'triangle', arpType: 'sine', bassVol: 0.08, arpVol: 0.035,
  },
  {
    id: 'afterglass', name: 'Afterglass', tagline: 'Slow minor keys for empty streets.',
    tracks: ['Rain in the Underpass', 'Last Light at the Lock', 'Window Fog Atlas'],
    bass: [41.2, 41.2, 49, 55, 41.2, 61.74, 55, 49],
    arp: [164.81, 196, 246.94, 293.66, 329.63, 293.66, 246.94, 196],
    beat: 0.53, bassType: 'sine', arpType: 'triangle', bassVol: 0.083, arpVol: 0.03,
  },
  {
    id: 'neon-switchyard', name: 'Neon Switchyard', tagline: 'Fast synths past the freight lights.',
    tracks: ['Tail Lights at 2:17', 'Chrome Signal Relay', 'Overclock the Overpass'],
    bass: [65.41, 130.81, 65.41, 98, 77.78, 155.56, 58.27, 98],
    arp: [261.63, 392, 311.13, 466.16, 523.25, 466.16, 311.13, 392],
    beat: 0.21, bassType: 'sawtooth', arpType: 'square', bassVol: 0.048, arpVol: 0.019,
  },
  {
    id: 'mar-azafran', name: 'Mar Azafrán', tagline: 'Bright harbor rhythms and offbeat keys.',
    tracks: ['Patio de Sal y Cobre', 'Brisa del Muelle Nueve', 'Zapatos sobre Azulejos'],
    bass: [73.42, 110, 73.42, 146.83, 110, 73.42, 123.47, 110],
    arp: [293.66, 369.99, 440, 493.88, 587.33, 440, 369.99, 493.88],
    beat: 0.4, bassType: 'square', arpType: 'sine', bassVol: 0.046, arpVol: 0.043,
  },
];

export function normalizeStationIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < STATIONS.length ? index : 0;
}

export function createRadio({ audio, hud, state: sharedState = null, stations = STATIONS, externalClock = false } = {}) {
  const state = sharedState ? {
    get index() { return sharedState.radioStationIndex ?? 0; },
    set index(value) { sharedState.radioStationIndex = value; },
    get trackIndex() { return sharedState.radioTrackIndex ?? 0; },
    set trackIndex(value) { sharedState.radioTrackIndex = value; },
    get trackTime() { return sharedState.radioTrackElapsed ?? 0; },
    set trackTime(value) { sharedState.radioTrackElapsed = value; },
  } : { index: 0, trackIndex: 0, trackTime: 0 };

  function stationAt(index) {
    return stations[index] ?? stations[0] ?? STATIONS[0];
  }

  function current() {
    return stationAt(state.index);
  }

  function refreshHud() {
    const station = current();
    const track = station.tracks?.[state.trackIndex];
    hud?.setRadio?.(station, typeof track === 'string' ? { title: track, artist: '' } : track);
  }

  function setStation(index) {
    const maximum = stations.length;
    state.index = Number.isInteger(index) && index >= 0 && index < maximum ? index : 0;
    state.trackIndex = 0;
    state.trackTime = 0;
    audio?.setStation?.(current());
    refreshHud();
  }

  function cycle() {
    setStation((state.index + 1) % stations.length);
    hud.toast(`Tuned to ${current().name}`, 'info', 2.5);
  }

  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (externalClock) {
      refreshHud();
      return;
    }
    state.trackTime += dt;
    // Fixed simulation steps can land just below the track boundary due to rounding.
    const elapsedTracks = Math.floor((state.trackTime + TRACK_EPSILON) / TRACK_SECONDS);
    if (elapsedTracks === 0) return;
    state.trackTime = Math.max(0, state.trackTime - elapsedTracks * TRACK_SECONDS);
    state.trackIndex = (state.trackIndex + elapsedTracks) % current().tracks.length;
    refreshHud();
  }

  function reset() {
    setStation(0);
  }

  function serialize() {
    return state.index;
  }

  function restore(index) {
    setStation(index);
  }

  reset();
  return { state, cycle, current, update, reset, setStation, serialize, restore, refreshHud };
}
