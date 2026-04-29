import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;

let _supabase: SupabaseClient | null = null;

// Browser client (anon, used for Realtime subscriptions) – lazy to avoid build-time errors
export function getSupabase() {
  if (!_supabase) _supabase = createClient(url(), anonKey());
  return _supabase;
}

// Server client (service role, bypasses RLS – only for API routes)
export function db() {
  return createClient(url(), serviceKey(), {
    auth: { persistSession: false },
  });
}
