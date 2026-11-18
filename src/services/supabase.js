import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const supabaseConfigurado = Boolean(url && anonKey)
export const modoAlmacenamiento = supabaseConfigurado ? 'institucional' : 'demostracion'
export const supabase = supabaseConfigurado ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null

export function exigirSupabase() {
  if (!supabase) throw new Error('Supabase no está configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.')
  return supabase
}
