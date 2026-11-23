# DompicDAW

A browser DAW: one track per instrument, a piano roll for each, and songs saved to Supabase.

No build step and no dependencies to install. It's plain HTML + ES modules.

## Run it

Browsers block ES modules from `file://`, so serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(Or deploy the folder as-is to GitHub Pages / Netlify / Vercel.)

## Using it

- **+** (top of the track list) adds a piano track.
- Click a track to edit it in the piano roll.
- Click the grid to add a note, drag to move, drag the right edge to resize, right-click or double-click to delete.
- Click the piano keys on the left, or press **A W S E D F T G Y H U J K**, to play the selected track.
- **Space** plays/pauses. Mute (M), Solo (S), and volume are per track.

## Connect Supabase

1. Create a project at supabase.com.
2. SQL Editor → paste `supabase/schema.sql` → Run.
3. Project Settings → API: copy the **Project URL** and the **anon / publishable** key into `js/config.js`.
4. Reload. **Save** writes the song as JSON; **Open…** lists and loads saved songs.

Songs are stored in `public.songs` with the whole song in one `jsonb` column (`data`):

```json
{
  "version": 1, "title": "My song", "bpm": 120, "bars": 4,
  "tracks": [
    { "id": "...", "name": "Piano 1", "instrument": "piano",
      "volume": 0.8, "mute": false, "solo": false,
      "notes": [ { "id": "...", "pitch": 60, "start": 0, "length": 1 } ] }
  ]
}
```

`start` and `length` are in beats; `pitch` is a MIDI note number (60 = middle C).

> **Security:** the starter policies let anyone with your anon key read and write songs.
> That's fine for solo development. Add Supabase Auth and per-user policies before sharing the site.
> Never put the `service_role` key in front-end code.

## Layout

```
index.html        page
css/style.css     styling
js/main.js        UI wiring, track list, save/open
js/audio.js       piano synth + look-ahead scheduler (Web Audio)
js/roll.js        piano roll canvas editor
js/state.js       song model + helpers
js/storage.js     Supabase save/load
js/config.js      your Supabase URL + anon key
supabase/schema.sql
```

## Next up

More instruments (drums, synth, bass) will slot in via the track's `instrument` field.
