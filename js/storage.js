// Save / load songs in Supabase (table: public.songs, see supabase/schema.sql).

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

let client = null;

export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function db() {
  if (!isConfigured()) {
    throw new Error("Supabase isn't configured yet. Fill in js/config.js.");
  }
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

// Insert a new song, or update it if it already has an id. Returns the row id.
export async function saveSong(id, song) {
  const row = { title: song.title, data: song, updated_at: new Date().toISOString() };

  if (id) {
    const { error } = await db().from("songs").update(row).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await db().from("songs").insert(row).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function listSongs() {
  const { data, error } = await db()
    .from("songs")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

export async function loadSong(id) {
  const { data, error } = await db().from("songs").select("id,data").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function deleteSong(id) {
  const { error } = await db().from("songs").delete().eq("id", id);
  if (error) throw error;
}
