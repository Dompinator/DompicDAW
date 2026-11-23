# DompicDAW

A browser DAW with a clip-based Arrangement timeline, per-track instruments, a piano roll, and Supabase song storage.

## Run it
Serve the folder with a local web server (ES modules do not work from file://):
python3 -m http.server 8000
Then open http://localhost:8000.

## Workflow
- The + button adds an instrument track.
- Arrangement shows one lane per track and a bar ruler. Click an empty bar in a lane to create a MIDI clip. Click a clip to edit it; double-click its name to rename it.
- Instrument contains the selected track's sound, a one-octave playable piano keyboard, and the clip piano roll.
- Select Grand Piano, Synth, Bass, or Drum Kit for each track.
- FL-style computer keyboard: lower octave Z S X D C V G B H N J M; upper octave Q 2 W 3 E R 5 T 6 Y 7 U. Select the base octave in Instrument.
- Space plays/pauses. Mute, solo and volume are per track.

## Supabase
Run supabase/schema.sql in the SQL editor, then put the Project URL and publishable/anon key in js/config.js. Never put a service_role or secret key in browser code.

## Song compatibility
Songs are stored as JSON in public.songs.data. Older songs with notes stored directly on tracks are migrated into a first MIDI clip when loaded.
