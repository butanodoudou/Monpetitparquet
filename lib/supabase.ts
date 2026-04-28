import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Browser client (anon, used for Realtime subscriptions)
export const supabase = createClient(url, anonKey);

// Server client (service role, bypasses RLS – only for API routes)
export function db() {
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
