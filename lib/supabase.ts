import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const BUCKET = process.env.NEXT_PUBLIC_BUCKET ?? "videos";
export const CHANNEL = process.env.NEXT_PUBLIC_CHANNEL ?? "photobooth";

export const isConfigured = Boolean(SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

/** Created lazily in the browser so the build doesn't need the env vars. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
  }
  return client;
}
