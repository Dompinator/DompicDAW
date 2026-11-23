import { Engine } from "./audio.js";
import { PianoRoll } from "./roll.js";
import { clamp, newSong, newTrack, newClip, normalizeSong, INSTRUMENTS, noteName } from "./state.js";
import * as storage from "./storage.js";

let song = newSong(), songId = null, trackId = null, clipId = null;
const $ = id => document.getElementById(id);
const engine = new Engine(() => song);
const track = () => song.tracks.find(t => t.id === trackId) || null;
const clip = () => track()?.clips.find(c => c.id === clipId) || null;

const roll = new PianoRoll($("roll"), $("roll-wrap"), {
  getSong: () => song,
  getTrack: track,
  getClip: clip,
  getPlayhead: () => engine.playing || engine.pausedBeat > 0 ? engine.currentBeat() : null,
  onPreview: (t, p) => engine.preview(t, p),
  onChange: () => {}
});

let timer;
function status(s, err = false) {
  $("status").textContent = s;
  $("status").classList.toggle("error", err);
  clearTimeout(timer);
  if (!err) timer = setTimeout(() => $("status").textContent = "", 4000);
}

function view(v) {
  document.querySelectorAll(".view-tab").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  document.querySelectorAll(".view-pane").forEach(p => {
    const on = p.id === v + "-view";
    p.classList.toggle("active", on);
    p.style.display = on ? "flex" : "none";
  });
  if (v === "midi") {
    setTimeout(() => { roll.resize(); roll.draw(); }, 30);
  }
}
document.querySelectorAll(".view-tab").forEach(b => b.onclick = () => view(b.dataset.view));

function header() {
  $("instrument-track-name").textContent = track() ? track().name + " · " + INSTRUMENTS[track().instrument] : "Select a track";
  $("instrument-select").value = track()?.instrument || "piano";
  $("editor-head").textContent = track() && clip()
    ? track().name + " — " + clip().name + " · Click to add notes, drag to move, right-click to delete."
    : "Choose a track and clip in Arrangement.";
}

function tracks() {
  const host = $("tracks");
  host.innerHTML = "";
  for (const t of song.tracks) {
    const row = document.createElement("div");
    row.className = "track" + (t.id === trackId ? " selected" : "");
    const n = document.createElement("input");
    n.className = "track-name";
    n.value = t.name;
    n.onclick = e => e.stopPropagation();
    n.oninput = () => { t.name = n.value; header(); arrangement(); };
    const btns = document.createElement("div");
    btns.className = "track-btns";
    for (const [txt, title, fn, on] of [
      ["M", "Mute", () => { t.mute = !t.mute; engine.syncMixer(); }, t.mute],
      ["S", "Solo", () => { t.solo = !t.solo; engine.syncMixer(); }, t.solo],
      ["×", "Delete", () => removeTrack(t), false]
    ]) {
      const b = document.createElement("button");
      b.textContent = txt;
      b.title = title;
      b.classList.toggle("on", on);
      b.onclick = e => { e.stopPropagation(); fn(); tracks(); };
      btns.append(b);
    }
    const sub = document.createElement("div");
    sub.className = "track-sub";
    const l = document.createElement("span");
    l.textContent = INSTRUMENTS[t.instrument];
    const vol = document.createElement("input");
    vol.type = "range";
    vol.min = 0; vol.max = 1; vol.step = ".01";
    vol.value = t.volume;
    vol.oninput = () => { t.volume = +vol.value; engine.syncMixer(); };
    sub.append(l, vol);
    row.append(n, btns, sub);
    row.onclick = () => selectTrack(t.id);
    host.append(row);
  }
}

function selectTrack(id) {
  trackId = id;
  clipId = track()?.clips[0]?.id || null;
  tracks();
  header();
  arrangement();
  roll.resize();
}

function selectClip(t, c) {
  trackId = t;
  clipId = c;
  tracks();
  header();
  view("midi");
  roll.resize();
}

function removeTrack(t) {
  if (t.clips.some(c => c.notes.length) && !confirm("Delete " + t.name + " and its clips?")) return;
  song.tracks = song.tracks.filter(x => x !== t);
  engine.trackGains.delete(t.id);
  if (trackId === t.id) {
    trackId = song.tracks.at(-1)?.id || null;
    clipId = track()?.clips[0]?.id || null;
  }
  header();
  arrangement();
  roll.draw();
}

function addTrack() {
  const t = newTrack(song.tracks.length + 1);
  song.tracks.push(t);
  engine.ensureContext();
  selectTrack(t.id);
}

function arrangement() {
  const root = $("arrangement");
  root.innerHTML = "";
  const ruler = document.createElement("div");
  ruler.className = "arr-ruler";
  const lab = document.createElement("div");
  lab.className = "arr-ruler-label";
  lab.textContent = "TRACK / BAR";
  const bars = document.createElement("div");
  bars.className = "arr-bars";
  for (let i = 0; i < song.bars; i++) {
    const x = document.createElement("div");
    x.className = "arr-bar";
    x.textContent = "BAR " + (i + 1);
    bars.append(x);
  }
  ruler.append(lab, bars);
  root.append(ruler);

  for (const t of song.tracks) {
    const lane = document.createElement("div");
    lane.className = "arr-lane";
    const name = document.createElement("div");
    name.className = "arr-track-label";
    name.textContent = t.name + " · " + INSTRUMENTS[t.instrument];
    name.onclick = () => selectTrack(t.id);
    const grid = document.createElement("div");
    grid.className = "arr-lane-grid";
    grid.style.width = (song.bars * 120) + "px";
    grid.style.gridTemplateColumns = "repeat(" + song.bars + ",120px)";
    for (let i = 0; i < song.bars; i++) {
      const cell = document.createElement("div");
      cell.style.gridColumn = (i + 1);
      cell.style.minHeight = "66px";
      grid.append(cell);
    }
    for (const c of t.clips) {
      const el = document.createElement("div");
      el.className = "midi-clip" + (c.id === clipId ? " selected" : "");
      el.style.left = (c.start * 30) + "px";
      el.style.width = Math.max(22, c.length * 30 - 3) + "px";
      const title = document.createElement("strong");
      title.textContent = c.name;
      const notes = document.createElement("div");
      notes.className = "clip-notes";
      c.notes.slice(0, 40).forEach(n => {
        const m = document.createElement("i");
        m.style.height = (5 + n.pitch % 12) + "px";
        notes.append(m);
      });
      el.append(title, notes);
      el.onclick = e => { e.stopPropagation(); selectClip(t.id, c.id); };
      el.ondblclick = e => {
        e.stopPropagation();
        const s = prompt("Clip name", c.name);
        if (s?.trim()) { c.name = s.trim(); arrangement(); header(); }
      };
      grid.append(el);
    }
    grid.onclick = e => {
      if (e.target.closest(".midi-clip")) return;
      const bar = Math.floor((e.clientX - grid.getBoundingClientRect().left) / 120);
      if (bar < song.bars) {
        const c = newClip(bar * 4, Math.min(4, song.bars * 4 - bar * 4));
        t.clips.push(c);
        selectClip(t.id, c.id);
        arrangement();
      }
    };
    lane.append(name, grid);
    root.append(lane);
  }
}

$("btn-add-track").onclick = addTrack;
$("instrument-select").onchange = () => {
  if (!track()) return;
  track().instrument = $("instrument-select").value;
  tracks();
  header();
  arrangement();
};
$("bpm").onchange = () => {
  song.bpm = clamp(+$("bpm").value || 120, 40, 240);
  $("bpm").value = song.bpm;
  engine.retime();
};
$("bars").onchange = () => {
  song.bars = clamp(Math.round(+$("bars").value || 4), 1, 64);
  $("bars").value = song.bars;
  for (const t of song.tracks) for (const c of t.clips) c.length = Math.min(c.length, Math.max(.25, song.bars * 4 - c.start));
  arrangement();
  roll.resize();
};
$("song-title").oninput = () => song.title = $("song-title").value;

function pitch(k) {
  const lo = ["z", "s", "x", "d", "c", "v", "g", "b", "h", "n", "j", "m"];
  const hi = ["q", "2", "w", "3", "e", "r", "5", "t", "6", "y", "7", "u"];
  const o = +$("keyboard-octave").value;
  let i = lo.indexOf(k);
  if (i >= 0) return 12 * (o + 1) + i;
  i = hi.indexOf(k);
  return i >= 0 ? 12 * (o + 2) + i : null;
}

function piano() {
  const host = $("piano-keys");
  host.innerHTML = "";
  const octave = +$("keyboard-octave").value;
  const base = 12 * (octave + 1); // C of selected octave (e.g. 4 -> 60 = C4)
  const white = [0, 2, 4, 5, 7, 9, 11];
  const black = [1, 3, 6, 8, 10];
  function key(i, isBlack) {
    const pitch = base + i;
    const b = document.createElement("button");
    b.className = "piano-key" + (isBlack ? " black" : "");
    b.textContent = noteName(pitch);
    b.title = noteName(pitch) + " (MIDI " + pitch + ")";
    if (isBlack) {
      const whitesBefore = white.filter(n => n < i).length;
      b.style.left = ((whitesBefore + 0.68) / 7 * 100) + "%";
    }
    b.onpointerdown = e => {
      e.preventDefault();
      const t = track();
      if (t) {
        engine.preview(t, pitch, 0.65);
      } else {
        // fallback preview if no track selected
        engine.ensureContext();
        engine.preview({id:"preview", instrument:"piano", volume:0.8, mute:false, solo:false}, pitch, 0.65);
      }
      b.classList.add("active");
    };
    b.onpointerup = b.onpointerleave = () => b.classList.remove("active");
    host.append(b);
  }
  white.forEach(i => key(i, false));
  black.forEach(i => key(i, true));
}
$("keyboard-octave").onchange = piano;
piano();

window.addEventListener("keydown", e => {
  if (e.target.closest("input,textarea,select,dialog")) return;
  if (e.code === "Space") { e.preventDefault(); play(); return; }
  if (e.key === "1") { view("arrangement"); return; }
  if (e.key === "2") { view("midi"); return; }
  if (e.key === "3") { view("instrument"); return; }
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const p = pitch(e.key.toLowerCase());
  if (track() && p !== null) { e.preventDefault(); engine.preview(track(), p, .65); }
});

function play() {
  if (engine.playing) engine.pause(); else engine.play();
  $("btn-play").classList.toggle("playing", engine.playing);
  $("btn-play").textContent = engine.playing ? "❚❚" : "▶";
}
function stop() {
  engine.stop();
  $("btn-play").classList.remove("playing");
  $("btn-play").textContent = "▶";
  $("position").textContent = "1.1";
  roll.draw();
}
$("btn-play").onclick = play;
$("btn-stop").onclick = stop;

function frame() {
  if (engine.playing) {
    const b = engine.currentBeat();
    $("position").textContent = (Math.floor(b / 4) + 1) + "." + (Math.floor(b % 4) + 1);
    roll.draw();
  }
  requestAnimationFrame(frame);
}

async function save() {
  try {
    status("Saving…");
    song.title = $("song-title").value.trim() || "Untitled song";
    songId = await storage.saveSong(songId, song);
    status("Saved " + song.title);
  } catch (e) { status(e.message || "Save failed", true); }
}
async function openList() {
  const list = $("song-list");
  list.innerHTML = "<li>Loading…</li>";
  $("dlg-open").showModal();
  try {
    const rows = await storage.listSongs();
    list.innerHTML = "";
    if (!rows.length) list.innerHTML = "<li>No saved songs yet.</li>";
    for (const r of rows) {
      const li = document.createElement("li"), info = document.createElement("span"), open = document.createElement("button"), del = document.createElement("button");
      info.textContent = r.title + " · " + new Date(r.updated_at).toLocaleString();
      open.textContent = "Open";
      open.onclick = () => load(r.id);
      del.textContent = "Delete";
      del.onclick = async () => {
        if (confirm("Delete " + r.title + "?")) {
          await storage.deleteSong(r.id);
          li.remove();
          if (songId === r.id) songId = null;
        }
      };
      li.append(info, open, del);
      list.append(li);
    }
  } catch (e) { list.textContent = e.message; }
}
async function load(id) {
  try {
    const r = await storage.loadSong(id);
    stop();
    song = normalizeSong(r.data);
    songId = r.id;
    trackId = song.tracks[0]?.id || null;
    clipId = track()?.clips[0]?.id || null;
    engine.trackGains.clear();
    $("song-title").value = song.title;
    $("bpm").value = song.bpm;
    $("bars").value = song.bars;
    tracks();
    header();
    arrangement();
    roll.resize();
    $("dlg-open").close();
    status("Opened " + song.title);
  } catch (e) { status(e.message || "Open failed", true); }
}

$("btn-save").onclick = save;
$("btn-open").onclick = openList;
tracks();
header();
arrangement();
if (!storage.isConfigured()) status("Supabase not connected yet (see README)");
requestAnimationFrame(frame);

// Ensure MIDI roll is ready
setTimeout(() => { if (document.getElementById("midi-view").classList.contains("active")) roll.resize(); }, 100);
