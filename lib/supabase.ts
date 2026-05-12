import { createClient as supabaseCreateClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = supabaseUrl && supabaseKey ? supabaseCreateClient(supabaseUrl, supabaseKey) : null;

function validateEnv() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }
}

export function createClient() {
  validateEnv();
  return supabaseCreateClient(supabaseUrl, supabaseKey);
}
