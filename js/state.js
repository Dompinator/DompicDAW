// Song model + tiny helpers. Everything the DAW saves is plain JSON from here.
// Positions and lengths are measured in beats (1 beat = a quarter note).

export const SCHEMA_VERSION = 1;

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function newTrack(index) {
  return {
    id: uid(),
    name: `Piano ${index}`,
    instrument: "piano",
    volume: 0.8,
    mute: false,
    solo: false,
    notes: [], // { id, pitch (MIDI number), start (beats), length (beats) }
  };
}

export function newSong() {
  return {
    version: SCHEMA_VERSION,
    title: "Untitled song",
    bpm: 120,
    bars: 4,
    tracks: [],
  };
}

// Make sure a song loaded from storage has everything the app expects.
export function normalizeSong(raw) {
  const song = newSong();
  if (!raw || typeof raw !== "object") return song;

  song.title = typeof raw.title === "string" ? raw.title : song.title;
  song.bpm = clamp(Number(raw.bpm) || 120, 40, 240);
  song.bars = clamp(Math.round(Number(raw.bars) || 4), 1, 64);

  const tracks = Array.isArray(raw.tracks) ? raw.tracks : [];
  song.tracks = tracks.map((t, i) => ({
    id: t.id || uid(),
    name: typeof t.name === "string" ? t.name : `Track ${i + 1}`,
    instrument: t.instrument || "piano",
    volume: clamp(Number(t.volume ?? 0.8), 0, 1),
    mute: !!t.mute,
    solo: !!t.solo,
    notes: (Array.isArray(t.notes) ? t.notes : []).map((n) => ({
      id: n.id || uid(),
      pitch: clamp(Math.round(Number(n.pitch) || 60), 0, 127),
      start: Math.max(0, Number(n.start) || 0),
      length: Math.max(0.0625, Number(n.length) || 0.25),
    })),
  }));
  return song;
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export function noteName(midi) {
  return NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}
export function isBlackKey(midi) {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}
export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
