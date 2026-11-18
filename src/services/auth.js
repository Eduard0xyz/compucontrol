import { exigirSupabase } from './supabase.js'

export async function iniciarSesionRemota(correo, clave) {
  const cliente = exigirSupabase()
  const { data, error } = await cliente.auth.signInWithPassword({ email: correo, password: clave })
  if (error) throw error
  const { data: perfil, error: errorPerfil } = await cliente.from('profiles').select('nombre, rol').eq('id', data.user.id).single()
  if (errorPerfil) { await cliente.auth.signOut(); throw errorPerfil }
  return { correo: data.user.email, nombre: perfil.nombre, perfil: perfil.rol, userId: data.user.id }
}

export async function cerrarSesionRemota() {
  const cliente = exigirSupabase(); await cliente.auth.signOut()
}
