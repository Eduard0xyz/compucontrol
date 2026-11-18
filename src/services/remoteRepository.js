import { exigirSupabase } from './supabase.js'

export async function leerInventarioRemoto() {
  const db = exigirSupabase()
  const { data, error } = await db.from('equipos').select('*, ambientes(numero,nombre,pabellon_id,piso_id), laboratorios(id,nombre)')
  if (error) throw error
  return data
}

export async function guardarMantenimientoRemoto(registro) {
  const db = exigirSupabase(); const { data, error } = await db.from('mantenimientos').insert(registro).select().single(); if (error) throw error; return data
}

export async function suscribirCambios(tabla, callback) {
  const db = exigirSupabase(); const canal = db.channel(`compucontrol-${tabla}`).on('postgres_changes', { event: '*', schema: 'public', table: tabla }, callback).subscribe(); return () => { db.removeChannel(canal) }
}
