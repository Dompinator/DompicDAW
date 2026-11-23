// Audio engine: a simple piano synth + a look-ahead scheduler (Web Audio API).

import { midiToFreq } from "./state.js";

const LOOKAHEAD_MS = 25;      // how often the scheduler wakes up
const SCHEDULE_AHEAD_S = 0.12; // how far ahead it schedules notes

export class Engine {
  constructor(getSong) {
    this.getSong = getSong;
    this.ctx = null;
    this.master = null;
    this.trackGains = new Map(); // trackId -> GainNode

    this.playing = false;
    this.startTime = 0;     // ctx time that corresponds to startBeat
    this.startBeat = 0;
    this.pausedBeat = 0;
    this.scheduledUpTo = 0; // absolute beat up to which notes are scheduled
    this.timer = null;
    this.onStop = null;
  }

  ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const limiter = this.ctx.createDynamicsCompressor();
    this.master.connect(limiter).connect(this.ctx.destination);
  }

  trackGain(track) {
    let g = this.trackGains.get(track.id);
    if (!g) {
      g = this.ctx.createGain();
      g.connect(this.master);
      this.trackGains.set(track.id, g);
    }
    return g;
  }

  // Pick up volume / mute / solo changes.
  syncMixer() {
    if (!this.ctx) return;
    const song = this.getSong();
    const anySolo = song.tracks.some((t) => t.solo);
    for (const t of song.tracks) {
      const audible = !t.mute && (!anySolo || t.solo);
      this.trackGain(t).gain.setTargetAtTime(audible ? t.volume : 0, this.ctx.currentTime, 0.01);
    }
  }

  // ---- Piano voice ------------------------------------------------------
  // A few decaying harmonics through a low-pass filter. Not a sampled grand
  // piano, but it sounds clearly like a keyboard and needs no assets.
  playNote(track, pitch, when, durationS) {
    this.ensureContext();
    this.syncMixer();

    const ctx = this.ctx;
    const out = this.trackGain(track);
    const f = midiToFreq(pitch);
    const vel = 0.5;

    const voice = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(8000, f * 8), when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(600, f * 2), when + 0.6);
    filter.connect(voice);
    voice.connect(out);

    // Harmonic recipe: [multiple, gain, decay seconds]
    const partials = [
      [1, 1.0, 1.8],
      [2, 0.5, 1.2],
      [3, 0.25, 0.8],
      [4, 0.12, 0.5],
      [5, 0.06, 0.35],
    ];
    const release = 0.18;
    const end = when + Math.max(0.05, durationS);

    for (const [mult, gain, decay] of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(gain * vel * 0.35, when + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, when + decay + 0.2);
      osc.connect(g).connect(filter);
      osc.start(when);
      osc.stop(end + release + 0.05);
    }

    // Overall note envelope: hold for the note length, then release.
    voice.gain.setValueAtTime(1, when);
    voice.gain.setValueAtTime(1, end);
    voice.gain.exponentialRampToValueAtTime(0.0001, end + release);
  }

  // Live preview (clicking in the roll / typing on the keyboard).
  preview(track, pitch, seconds = 0.5) {
    this.ensureContext();
    this.playNote(track, pitch, this.ctx.currentTime + 0.005, seconds);
  }

  // ---- Transport --------------------------------------------------------
  get secondsPerBeat() {
    return 60 / this.getSong().bpm;
  }
  get loopBeats() {
    return this.getSong().bars * 4;
  }

  currentBeat() {
    if (!this.playing) return this.pausedBeat;
    const abs = this.startBeat + (this.ctx.currentTime - this.startTime) / this.secondsPerBeat;
    return abs % this.loopBeats;
  }

  play() {
    if (this.playing) return;
    this.ensureContext();
    this.syncMixer();
    this.playing = true;
    this.startBeat = this.pausedBeat;
    this.startTime = this.ctx.currentTime + 0.05;
    this.scheduledUpTo = this.startBeat;
    this.timer = setInterval(() => this.tick(), LOOKAHEAD_MS);
    this.tick();
  }

  pause() {
    if (!this.playing) return;
    this.pausedBeat = this.currentBeat();
    this.halt();
  }

  stop() {
    this.pausedBeat = 0;
    this.halt();
  }

  halt() {
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    // Cut anything already scheduled by dropping the gains briefly.
    if (this.ctx) {
      for (const g of this.trackGains.values()) g.disconnect();
      this.trackGains.clear();
    }
    if (this.onStop) this.onStop();
  }

  // The tempo can change mid-play: re-anchor so the position doesn't jump.
  retime() {
    if (!this.playing) return;
    const here = this.startBeat + (this.ctx.currentTime - this.startTime) / this.secondsPerBeat;
    this.startBeat = here;
    this.startTime = this.ctx.currentTime;
  }

  tick() {
    if (!this.playing) return;
    const spb = this.secondsPerBeat;
    const loop = this.loopBeats;
    const nowAbs = this.startBeat + (this.ctx.currentTime - this.startTime) / spb;
    const windowEnd = nowAbs + SCHEDULE_AHEAD_S / spb;

    let from = Math.max(this.scheduledUpTo, nowAbs);
    if (from >= windowEnd) return;

    const song = this.getSong();
    const firstLoop = Math.floor(from / loop);
    const lastLoop = Math.floor(windowEnd / loop);

    for (let k = firstLoop; k <= lastLoop; k++) {
      for (const track of song.tracks) {
        for (const n of track.notes) {
          const abs = k * loop + n.start;
          if (abs >= from && abs < windowEnd && n.start < loop) {
            const when = this.startTime + (abs - this.startBeat) * spb;
            const len = Math.min(n.length, loop - n.start) * spb;
            this.playNote(track, n.pitch, when, len);
          }
        }
      }
    }
    this.scheduledUpTo = windowEnd;
  }
}
