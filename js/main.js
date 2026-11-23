import { Engine } from "./audio.js";
import { PianoRoll } from "./roll.js";
import { clamp, newSong, newTrack, normalizeSong } from "./state.js";
import * as storage from "./storage.js";

// ---- app state ------------------------------------------------------------
let song = newSong();
let songId = null;       // Supabase row id of the song that's open (null = unsaved)
let selectedTrackId = null;

const $ = (id) => document.getElementById(id);
const engine = new Engine(() => song);

const selectedTrack = () => song.tracks.find((t) => t.id === selectedTrackId) || null;

const roll = new PianoRoll($("roll"), $("roll-wrap"), {
  getSong: () => song,
  getTrack: selectedTrack,
  getPlayhead: () => (engine.playing || engine.pausedBeat > 0 ? engine.currentBeat() : null),
  onPreview: (track, pitch) => engine.preview(track, pitch),
  onChange: () => {},
});

// ---- status line ----------------------------------------------------------
let statusTimer = null;
function status(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.classList.toggle("error", isError);
  clearTimeout(statusTimer);
  if (!isError) statusTimer = setTimeout(() => (el.textContent = ""), 4000);
}

// ---- track list -----------------------------------------------------------
function renderTracks() {
  const host = $("tracks");
  host.innerHTML = "";

  for (const t of song.tracks) {
    const row = document.createElement("div");
    row.className = "track" + (t.id === selectedTrackId ? " selected" : "");

    const name = document.createElement("input");
    name.className = "track-name";
    name.value = t.name;
    name.addEventListener("click", (e) => e.stopPropagation());
    name.addEventListener("input", () => {
      t.name = name.value;
      updateEditorHead();
    });

    const btns = document.createElement("div");
    btns.className = "track-btns";
    btns.append(
      toggleButton("M", "Mute", t.mute, (on) => { t.mute = on; engine.syncMixer(); }),
      toggleButton("S", "Solo", t.solo, (on) => { t.solo = on; engine.syncMixer(); }),
      plainButton("×", "Delete track", () => deleteTrack(t))
    );

    const sub = document.createElement("div");
    sub.className = "track-sub";
    const label = document.createElement("span");
    label.textContent = "🎹 Piano";
    const vol = document.createElement("input");
    vol.type = "range";
    vol.min = "0";
    vol.max = "1";
    vol.step = "0.01";
    vol.value = String(t.volume);
    vol.title = "Volume";
    vol.addEventListener("click", (e) => e.stopPropagation());
    vol.addEventListener("input", () => {
      t.volume = Number(vol.value);
      engine.syncMixer();
    });
    sub.append(label, vol);

    row.append(name, btns, sub);
    row.addEventListener("click", () => selectTrack(t.id));
    host.append(row);
  }
}

function toggleButton(text, title, initial, onToggle) {
  const b = document.createElement("button");
  b.textContent = text;
  b.title = title;
  b.classList.toggle("on", initial);
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    const on = !b.classList.contains("on");
    b.classList.toggle("on", on);
    onToggle(on);
  });
  return b;
}

function plainButton(text, title, onClick) {
  const b = document.createElement("button");
  b.textContent = text;
  b.title = title;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

function selectTrack(id) {
  selectedTrackId = id;
  renderTracks();
  updateEditorHead();
  roll.draw();
}

function updateEditorHead() {
  const t = selectedTrack();
  $("editor-head").textContent = t
    ? `${t.name} — click the grid to add notes, drag to move, drag the right edge to resize, right-click to delete. Computer keys A–K play notes.`
    : "Select a track, or press “+” to add a piano.";
}

function addTrack() {
  const t = newTrack(song.tracks.length + 1);
  song.tracks.push(t);
  engine.ensureContext();
  selectTrack(t.id);
}

function deleteTrack(t) {
  if (t.notes.length && !confirm(`Delete "${t.name}" and its ${t.notes.length} notes?`)) return;
  song.tracks = song.tracks.filter((x) => x.id !== t.id);
  engine.trackGains.delete(t.id);
  if (selectedTrackId === t.id) selectedTrackId = song.tracks.at(-1)?.id ?? null;
  renderTracks();
  updateEditorHead();
  roll.draw();
}

// ---- transport ------------------------------------------------------------
function togglePlay() {
  if (engine.playing) engine.pause();
  else engine.play();
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

function frame() {
  if (engine.playing) {
    const beat = engine.currentBeat();
    $("position").textContent = `${Math.floor(beat / 4) + 1}.${Math.floor(beat % 4) + 1}`;
    roll.draw();
  }
  requestAnimationFrame(frame);
}

$("btn-play").addEventListener("click", togglePlay);
$("btn-stop").addEventListener("click", stop);
$("btn-add-track").addEventListener("click", addTrack);

$("bpm").addEventListener("change", () => {
  song.bpm = clamp(Number($("bpm").value) || 120, 40, 240);
  $("bpm").value = song.bpm;
  engine.retime();
});
$("bars").addEventListener("change", () => {
  song.bars = clamp(Math.round(Number($("bars").value) || 4), 1, 64);
  $("bars").value = song.bars;
  roll.resize();
});
$("song-title").addEventListener("input", () => (song.title = $("song-title").value));

// ---- computer keyboard as a piano ----------------------------------------
const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12 };
window.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea, dialog")) return;
  if (e.code === "Space") {
    e.preventDefault();
    togglePlay();
    return;
  }
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const offset = KEYMAP[e.key.toLowerCase()];
  const t = selectedTrack();
  if (offset !== undefined && t) engine.preview(t, 60 + offset, 0.6);
});

// ---- save / open ----------------------------------------------------------
async function save() {
  try {
    status("Saving…");
    song.title = $("song-title").value.trim() || "Untitled song";
    songId = await storage.saveSong(songId, song);
    status(`Saved “${song.title}”`);
  } catch (err) {
    console.error(err);
    status(err.message || "Save failed", true);
  }
}

async function openDialog() {
  const list = $("song-list");
  list.innerHTML = "<li>Loading…</li>";
  $("dlg-open").showModal();
  try {
    const rows = await storage.listSongs();
    list.innerHTML = "";
    if (!rows.length) list.innerHTML = "<li>No saved songs yet.</li>";
    for (const r of rows) {
      const li = document.createElement("li");
      const info = document.createElement("div");
      info.innerHTML = `<div></div><div class="meta"></div>`;
      info.children[0].textContent = r.title;
      info.children[1].textContent = new Date(r.updated_at).toLocaleString();

      const actions = document.createElement("div");
      const load = document.createElement("button");
      load.textContent = "Open";
      load.addEventListener("click", () => openSong(r.id));
      const del = document.createElement("button");
      del.textContent = "Delete";
      del.addEventListener("click", async () => {
        if (!confirm(`Delete “${r.title}” from Supabase?`)) return;
        try {
          await storage.deleteSong(r.id);
          if (songId === r.id) songId = null;
          li.remove();
        } catch (err) {
          status(err.message || "Delete failed", true);
        }
      });
      actions.append(load, " ", del);
      li.append(info, actions);
      list.append(li);
    }
  } catch (err) {
    console.error(err);
    list.innerHTML = "";
    const li = document.createElement("li");
    li.textContent = err.message || "Couldn't load songs";
    list.append(li);
  }
}

async function openSong(id) {
  try {
    const row = await storage.loadSong(id);
    stop();
    song = normalizeSong(row.data);
    songId = row.id;
    selectedTrackId = song.tracks[0]?.id ?? null;
    engine.trackGains.clear();
    $("song-title").value = song.title;
    $("bpm").value = song.bpm;
    $("bars").value = song.bars;
    renderTracks();
    updateEditorHead();
    roll.resize();
    $("dlg-open").close();
    status(`Opened “${song.title}”`);
  } catch (err) {
    console.error(err);
    status(err.message || "Open failed", true);
  }
}

$("btn-save").addEventListener("click", save);
$("btn-open").addEventListener("click", openDialog);

// ---- go -------------------------------------------------------------------
renderTracks();
updateEditorHead();
if (!storage.isConfigured()) status("Supabase not connected yet (see README)");
requestAnimationFrame(frame);
