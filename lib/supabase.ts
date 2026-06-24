import { createClient as supabaseCreateClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// Cliente público (para uso en frontend)
export const supabase = supabaseUrl && supabaseAnonKey
  ? supabaseCreateClient(supabaseUrl, supabaseAnonKey)
  : null;

// Cliente de backend con permisos totales (solo usar en API routes)
export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? supabaseCreateClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }
  return supabaseCreateClient(supabaseUrl, supabaseAnonKey);
}

// Para usar en API routes del backend
export function createAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }
  return supabaseCreateClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
