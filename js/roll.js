// Piano roll: a canvas editor for one track's notes.
// Click empty grid = add note. Drag note = move. Drag its right edge = resize.
// Right-click (or double-click) a note = delete.

import { clamp, isBlackKey, noteName, uid } from "./state.js";

const LOW = 36;   // C2
const HIGH = 96;  // C7
const ROW_H = 16;
const BEAT_W = 48;
const KEY_W = 56;
const RULER_H = 22;
const SNAP = 0.25; // sixteenth note
const EDGE_PX = 7;

export class PianoRoll {
  constructor(canvas, wrap, { getSong, getTrack, getPlayhead, onPreview, onChange }) {
    this.canvas = canvas;
    this.wrap = wrap;
    this.ctx = canvas.getContext("2d");
    this.getSong = getSong;
    this.getTrack = getTrack;
    this.getPlayhead = getPlayhead;
    this.onPreview = onPreview;
    this.onChange = onChange;

    this.lastLength = 1;
    this.drag = null;
    this.dpr = window.devicePixelRatio || 1;

    canvas.addEventListener("mousedown", (e) => this.down(e));
    window.addEventListener("mousemove", (e) => this.move(e));
    window.addEventListener("mouseup", () => this.up());
    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const hit = this.hitTest(e);
      if (hit) this.removeNote(hit.note);
    });
    canvas.addEventListener("dblclick", (e) => {
      const hit = this.hitTest(e);
      if (hit) this.removeNote(hit.note);
    });
    wrap.addEventListener("scroll", () => this.draw());
    window.addEventListener("resize", () => this.resize());

    // Start scrolled near the middle of the keyboard (around C4).
    this.resize();
    wrap.scrollTop = (HIGH - 72) * ROW_H - 60;
  }

  // ---- geometry ---------------------------------------------------------
  get beats() {
    return this.getSong().bars * 4;
  }
  get gridW() {
    return this.beats * BEAT_W;
  }
  get gridH() {
    return (HIGH - LOW + 1) * ROW_H;
  }

  resize() {
    const w = Math.max(KEY_W + this.gridW, this.wrap.clientWidth);
    const h = RULER_H + this.gridH;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.draw();
  }

  pitchToY(p) {
    return RULER_H + (HIGH - p) * ROW_H;
  }
  beatToX(b) {
    return KEY_W + b * BEAT_W;
  }

  pointer(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  hitTest(e) {
    const track = this.getTrack();
    if (!track) return null;
    const { x, y } = this.pointer(e);
    for (let i = track.notes.length - 1; i >= 0; i--) {
      const n = track.notes[i];
      const nx = this.beatToX(n.start);
      const nw = n.length * BEAT_W;
      const ny = this.pitchToY(n.pitch);
      if (x >= nx && x <= nx + nw && y >= ny && y <= ny + ROW_H) {
        return { note: n, edge: x >= nx + nw - EDGE_PX };
      }
    }
    return null;
  }

  // ---- mouse ------------------------------------------------------------
  down(e) {
    if (e.button !== 0) return;
    const track = this.getTrack();
    if (!track) return;
    const { x, y } = this.pointer(e);
    const left = this.wrap.scrollLeft;
    const top = this.wrap.scrollTop;
    if (x >= left && x < left + KEY_W) {
      // Clicking the keyboard auditions the note.
      const p = HIGH - Math.floor((y - RULER_H) / ROW_H);
      if (p >= LOW && p <= HIGH && y >= top + RULER_H) this.onPreview(track, p);
      return;
    }
    if (x < KEY_W || y < top + RULER_H) return;

    const hit = this.hitTest(e);
    if (hit) {
      this.onPreview(track, hit.note.pitch);
      this.drag = {
        note: hit.note,
        mode: hit.edge ? "resize" : "move",
        startX: x,
        startY: y,
        origStart: hit.note.start,
        origPitch: hit.note.pitch,
        origLength: hit.note.length,
      };
      return;
    }

    const pitch = HIGH - Math.floor((y - RULER_H) / ROW_H);
    const start = Math.floor((x - KEY_W) / BEAT_W / SNAP) * SNAP;
    if (pitch < LOW || pitch > HIGH || start < 0 || start >= this.beats) return;

    const note = {
      id: uid(),
      pitch,
      start,
      length: Math.min(this.lastLength, this.beats - start),
    };
    track.notes.push(note);
    this.onPreview(track, pitch);
    this.drag = {
      note,
      mode: "move",
      startX: x,
      startY: y,
      origStart: note.start,
      origPitch: note.pitch,
      origLength: note.length,
    };
    this.onChange();
    this.draw();
  }

  move(e) {
    const hoverHit = !this.drag ? this.hitTest(e) : null;
    if (!this.drag) {
      this.canvas.style.cursor = hoverHit ? (hoverHit.edge ? "ew-resize" : "grab") : "crosshair";
      return;
    }
    const { x, y } = this.pointer(e);
    const d = this.drag;
    const dBeats = Math.round((x - d.startX) / BEAT_W / SNAP) * SNAP;

    if (d.mode === "move") {
      d.note.start = clamp(d.origStart + dBeats, 0, this.beats - d.note.length);
      const dRows = Math.round((y - d.startY) / ROW_H);
      const newPitch = clamp(d.origPitch - dRows, LOW, HIGH);
      if (newPitch !== d.note.pitch) {
        d.note.pitch = newPitch;
        this.onPreview(this.getTrack(), newPitch);
      }
    } else {
      d.note.length = clamp(d.origLength + dBeats, SNAP, this.beats - d.note.start);
      this.lastLength = d.note.length;
    }
    this.onChange();
    this.draw();
  }

  up() {
    if (this.drag && this.drag.mode === "resize") this.lastLength = this.drag.note.length;
    this.drag = null;
  }

  removeNote(note) {
    const track = this.getTrack();
    track.notes = track.notes.filter((n) => n !== note);
    this.onChange();
    this.draw();
  }

  // ---- drawing ----------------------------------------------------------
  draw() {
    const ctx = this.ctx;
    const dpr = this.dpr;
    const W = this.canvas.width / dpr;
    const H = this.canvas.height / dpr;
    const track = this.getTrack();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#1b1d22";
    ctx.fillRect(0, 0, W, H);

    // Row backgrounds
    for (let p = LOW; p <= HIGH; p++) {
      const y = this.pitchToY(p);
      ctx.fillStyle = isBlackKey(p) ? "#20232a" : "#262a32";
      ctx.fillRect(KEY_W, y, this.gridW, ROW_H);
      ctx.fillStyle = p % 12 === 0 ? "#454b5a" : "#30343e";
      ctx.fillRect(KEY_W, y + ROW_H - 1, this.gridW, 1);
    }

    // Vertical grid: 16ths, beats, bars
    for (let i = 0; i <= this.beats * 4; i++) {
      const x = KEY_W + (i / 4) * BEAT_W;
      ctx.fillStyle = i % 16 === 0 ? "#5b6275" : i % 4 === 0 ? "#3d4350" : "#2e323c";
      ctx.fillRect(x, RULER_H, 1, this.gridH);
    }

    // Notes
    if (track) {
      for (const n of track.notes) {
        const x = this.beatToX(n.start);
        const y = this.pitchToY(n.pitch);
        const w = n.length * BEAT_W;
        ctx.fillStyle = "#ff8a1f";
        ctx.fillRect(x + 1, y + 1, w - 1, ROW_H - 2);
        ctx.fillStyle = "#ffd2a1";
        ctx.fillRect(x + 1, y + 1, w - 1, 2);
        ctx.fillStyle = "rgba(0,0,0,.35)";
        ctx.fillRect(x + w - 3, y + 1, 2, ROW_H - 2);
      }
    }

    // Playhead
    const ph = this.getPlayhead();
    if (ph != null) {
      const x = this.beatToX(ph);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, RULER_H, 1.5, this.gridH);
    }

    // Ruler (sticky to the top)
    const top = this.wrap.scrollTop;
    const left = this.wrap.scrollLeft;
    ctx.fillStyle = "#23262d";
    ctx.fillRect(0, top, W, RULER_H);
    ctx.fillStyle = "#8b91a0";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    for (let b = 0; b < this.beats; b += 4) {
      ctx.fillText(String(b / 4 + 1), this.beatToX(b) + 4, top + RULER_H / 2);
    }
    if (ph != null) {
      ctx.fillStyle = "#ff8a1f";
      const x = this.beatToX(ph);
      ctx.fillRect(x - 4, top + RULER_H - 6, 9, 6);
    }

    // Keyboard (sticky to the left)
    for (let p = LOW; p <= HIGH; p++) {
      const y = this.pitchToY(p);
      const black = isBlackKey(p);
      ctx.fillStyle = black ? "#111318" : "#e6e8ee";
      ctx.fillRect(left, y, KEY_W, ROW_H);
      ctx.fillStyle = "#555b6b";
      ctx.fillRect(left, y + ROW_H - 1, KEY_W, 1);
      if (p % 12 === 0) {
        ctx.fillStyle = "#222";
        ctx.fillText(noteName(p), left + 6, y + ROW_H / 2);
      }
    }
    ctx.fillStyle = "#23262d";
    ctx.fillRect(left, top, KEY_W, RULER_H);
  }
}
