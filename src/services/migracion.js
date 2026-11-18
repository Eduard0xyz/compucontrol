export const CLAVES_RESPALDO = ['equipos', 'infraestructura', 'mantenimientos', 'cambios', 'tickets', 'inspecciones', 'historial']

export function construirRespaldoLocal(storage = window.localStorage) {
  const leer = (clave, inicial) => { try { return JSON.parse(storage.getItem(clave) || JSON.stringify(inicial)) } catch { return inicial } }
  return { version: 1, aplicacion: 'CompuControl UDH', generado: new Date().toISOString(), equipos: leer('cc-equipos', []), infraestructura: leer('cc-infraestructura', { pabellones: [], pisos: [], ambientes: [], laboratorios: [] }), mantenimientos: leer('cc-mants', []), cambios: leer('cc-cambios', []), tickets: leer('cc-tickets', []), inspecciones: leer('cc-inspecciones', []), historial: leer('cc-historial', []) }
}

export function validarRespaldoMigracion(valor) {
  const errores = []
  if (!valor || typeof valor !== 'object') errores.push('El respaldo no es un objeto JSON.')
  if (!Array.isArray(valor?.equipos)) errores.push('Falta el arreglo de equipos.')
  if (!valor?.infraestructura || !Array.isArray(valor.infraestructura.pabellones) || !Array.isArray(valor.infraestructura.pisos) || !Array.isArray(valor.infraestructura.ambientes) || !Array.isArray(valor.infraestructura.laboratorios)) errores.push('La infraestructura está incompleta.')
  for (const clave of ['mantenimientos', 'cambios', 'tickets', 'historial']) if (!Array.isArray(valor?.[clave])) errores.push(`Falta el arreglo ${clave}.`)
  if (valor?.inspecciones !== undefined && !Array.isArray(valor.inspecciones)) errores.push('El arreglo inspecciones no es válido.')
  const equipos = valor?.equipos || []; const codigos = new Set(); equipos.forEach((e) => { if (!e.codigo) errores.push('Existe un equipo sin código permanente.'); else if (codigos.has(e.codigo)) errores.push(`Código duplicado: ${e.codigo}`); else codigos.add(e.codigo) })
  const ambientes = new Set((valor?.infraestructura?.ambientes || []).map((a) => a.id)); equipos.forEach((e) => { if (e.ambienteId && !ambientes.has(e.ambienteId)) errores.push(`Equipo ${e.codigo} referencia un ambiente inexistente.`) })
  const equiposSet = new Set(equipos.map((e) => e.codigo)); for (const m of valor?.mantenimientos || []) if (m.codigo && !equiposSet.has(m.codigo)) errores.push(`Mantenimiento ${m.id || ''} referencia ${m.codigo}.`); for (const t of valor?.tickets || []) if (t.equipo && !equiposSet.has(t.equipo)) errores.push(`Ticket ${t.codigo || ''} referencia ${t.equipo}.`); for (const inspeccion of valor?.inspecciones || []) for (const item of inspeccion.equipos || []) if (item.codigo && !equiposSet.has(item.codigo)) errores.push(`Inspección ${inspeccion.id || ''} referencia ${item.codigo}.`)
  return { valido: errores.length === 0, errores, cantidades: { equipos: equipos.length, pabellones: valor?.infraestructura?.pabellones?.length || 0, pisos: valor?.infraestructura?.pisos?.length || 0, ambientes: valor?.infraestructura?.ambientes?.length || 0, laboratorios: valor?.infraestructura?.laboratorios?.length || 0, mantenimientos: valor?.mantenimientos?.length || 0, tickets: valor?.tickets?.length || 0, inspecciones: valor?.inspecciones?.length || 0, historial: valor?.historial?.length || 0 } }
}
