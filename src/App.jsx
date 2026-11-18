import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { AREAS, ESTADOS, TIPOS_EQUIPO, TIPOS_MANT, ESTADOS_MANT, ESTADOS_TICKET, PRIORIDADES_TICKET, TECNICOS, EQUIPOS, MANTENIMIENTOS, CAMBIOS, INCIDENCIAS, USUARIOS, CLAVE_DEMO, PABELLONES, PISOS, AMBIENTES, LABORATORIOS } from './data.js'
import { modoAlmacenamiento, supabaseConfigurado } from './services/supabase.js'
import { validarRespaldoMigracion } from './services/migracion.js'
import { iniciarSesionRemota, cerrarSesionRemota } from './services/auth.js'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fecha = (iso) => { const [a, m, d] = iso.split('-'); return `${d} ${MESES[+m - 1]} ${a}` }
const hoy = () => new Date().toISOString().slice(0, 10)
const COLOR_ESTADO = { Operativo: 'g', 'En mantenimiento': 'y', Repotenciado: 'i', 'Dado de baja': 'r' }

// Guarda los datos en el navegador para que no se pierdan al recargar
function useGuardado(clave, inicial) {
  const [valor, setValor] = useState(() => {
    try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) : inicial } catch { return inicial }
  })
  useEffect(() => { const id = window.setTimeout(() => { try { localStorage.setItem(clave, JSON.stringify(valor)) } catch { /* sin almacenamiento */ } }, 120); return () => window.clearTimeout(id) }, [clave, valor])
  return [valor, setValor]
}

// Migra el inventario demo sin borrar equipos creados anteriormente.
function ubicarEquipoLegacy(equipo, indice) {
  if (equipo.ambienteId) return equipo
  const laboratorio = equipo.area === 'Laboratorio de Cómputo 1' ? LABORATORIOS[0] : equipo.area === 'Laboratorio de Cómputo 2' ? LABORATORIOS[1] : null
  const ambiente = laboratorio ? AMBIENTES.find((a) => a.id === laboratorio.ambienteId) : AMBIENTES.filter((a) => a.tipo !== 'Laboratorio')[indice % 150]
  if (!ambiente) return equipo
  return { ...equipo, pabellonId: ambiente.pabellonId, pisoId: ambiente.pisoId, ambienteId: ambiente.id, laboratorioId: laboratorio?.id || null, posicion: laboratorio ? null : null, condicion: laboratorio ? 'Reserva' : 'Instalado' }
}

// Normaliza puestos sin borrar equipos ni cambiar sus identificadores permanentes.
// El primer equipo que conserva un puesto mantiene su valor; los duplicados ocupan
// espacios libres y los excedentes quedan como reserva, sin puesto asignado.
function normalizarPuestos(equipos) {
  const porLaboratorio = new Map(LABORATORIOS.map((laboratorio) => [laboratorio.id, []]))
  const base = equipos.map((equipo) => {
    const laboratorio = LABORATORIOS.find((item) => item.id === equipo.laboratorioId || item.ambienteId === equipo.ambienteId)
    const actualizado = laboratorio ? { ...equipo, laboratorioId: laboratorio.id } : equipo
    if (laboratorio) porLaboratorio.get(laboratorio.id).push(actualizado)
    return actualizado
  })
  const ajustes = new Map()
  porLaboratorio.forEach((lista, laboratorioId) => {
    const laboratorio = LABORATORIOS.find((item) => item.id === laboratorioId)
    const ocupados = new Set()
    const pendientes = []
    lista.forEach((equipo) => {
      const puesto = Number(equipo.posicion)
      if (Number.isInteger(puesto) && puesto > 0 && puesto <= laboratorio.capacidad && !ocupados.has(puesto)) ocupados.add(puesto)
      else pendientes.push(equipo)
    })
    const libres = Array.from({ length: laboratorio.capacidad }, (_, indice) => indice + 1).filter((puesto) => !ocupados.has(puesto))
    pendientes.forEach((equipo, indice) => {
      const puesto = libres[indice]
      ajustes.set(equipo.codigo, { posicion: puesto || null, condicion: puesto ? 'Instalado' : 'Reserva' })
    })
  })
  return base.map((equipo) => {
    const ajuste = ajustes.get(equipo.codigo)
    if (ajuste) return { ...equipo, ...ajuste }
    if (equipo.laboratorioId && !equipo.condicion) return { ...equipo, condicion: equipo.posicion ? 'Instalado' : 'Reserva' }
    return equipo
  })
}

function siguientePuesto(equipos, laboratorioId, excluidos = []) {
  const laboratorio = LABORATORIOS.find((item) => item.id === laboratorioId)
  if (!laboratorio) return null
  const ignorar = new Set(excluidos)
  const usados = new Set(equipos.filter((equipo) => equipo.laboratorioId === laboratorioId && !ignorar.has(equipo.codigo)).map((equipo) => Number(equipo.posicion)).filter(Boolean))
  return Array.from({ length: laboratorio.capacidad }, (_, indice) => indice + 1).find((puesto) => !usados.has(puesto)) || null
}

function useEquiposGuardados() {
  const [equipos, setEquipos] = useState(() => {
    try {
      const guardados = localStorage.getItem('cc-equipos')
      if (!guardados) { const iniciales = normalizarPuestos(EQUIPOS.map(ubicarEquipoLegacy)); localStorage.setItem('cc-migracion-puestos-v1', '1'); return iniciales }
      const existentes = JSON.parse(guardados).map(ubicarEquipoLegacy)
      if (localStorage.getItem('cc-restauracion-completa') === '1') return existentes
      const codigos = new Set(existentes.map((e) => e.codigo))
      const combinados = [...existentes, ...EQUIPOS.filter((e) => !codigos.has(e.codigo)).map(ubicarEquipoLegacy)]
      if (localStorage.getItem('cc-migracion-puestos-v1') !== '1') { const migrados = normalizarPuestos(combinados); localStorage.setItem('cc-migracion-puestos-v1', '1'); return migrados }
      return combinados
    } catch { return normalizarPuestos(EQUIPOS.map(ubicarEquipoLegacy)) }
  })
  useEffect(() => { const id = window.setTimeout(() => { try { localStorage.setItem('cc-equipos', JSON.stringify(equipos)) } catch { /* sin almacenamiento */ } }, 120); return () => window.clearTimeout(id) }, [equipos])
  return [equipos, setEquipos]
}

function useInfraestructuraGuardada() {
  const inicial = { pabellones: PABELLONES, pisos: PISOS, ambientes: AMBIENTES, laboratorios: LABORATORIOS }
  const [infraestructura, setInfraestructura] = useState(() => {
    try {
      const guardada = localStorage.getItem('cc-infraestructura')
      if (!guardada) return inicial
      const valor = JSON.parse(guardada)
      return {
        pabellones: Array.isArray(valor.pabellones) ? valor.pabellones : PABELLONES,
        pisos: Array.isArray(valor.pisos) ? valor.pisos : PISOS,
        ambientes: Array.isArray(valor.ambientes) ? valor.ambientes : AMBIENTES,
        laboratorios: Array.isArray(valor.laboratorios) ? valor.laboratorios : LABORATORIOS,
      }
    } catch { return inicial }
  })
  useEffect(() => { const id = window.setTimeout(() => { try { localStorage.setItem('cc-infraestructura', JSON.stringify(infraestructura)) } catch { /* sin almacenamiento */ } }, 120); return () => window.clearTimeout(id) }, [infraestructura])
  return [infraestructura, setInfraestructura]
}

// Descarga una tabla como CSV (se abre en Excel)
function exportarCSV(nombre, filas) {
  const csv = filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
  const a = document.createElement('a'); a.href = url; a.download = nombre + '.csv'; a.click(); URL.revokeObjectURL(url)
}

let xlsxModule
let pdfModule

async function exportarXLSX(nombre, encabezados, filas, titulo = 'CompuControl UDH') {
  xlsxModule ||= import('xlsx-js-style')
  const { default: XLSX } = await xlsxModule
  const hoja = XLSX.utils.aoa_to_sheet([[titulo], [`Generado: ${new Date().toLocaleString('es-PE')}`], [], encabezados, ...filas])
  hoja['!cols'] = encabezados.map((h) => ({ wch: Math.min(Math.max(String(h).length + 4, 14), 32) }))
  const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, hoja, 'Reporte')
  XLSX.writeFile(libro, `${nombre}.xlsx`)
}

async function exportarPDF(nombre, titulo, encabezados, filas) {
  pdfModule ||= import('jspdf')
  const { jsPDF } = await pdfModule
  const doc = new jsPDF({ orientation: encabezados.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  const margen = 32; const ancho = doc.internal.pageSize.getWidth() - margen * 2; const alto = doc.internal.pageSize.getHeight()
  const columnas = encabezados.length; const anchoCol = ancho / columnas; let y = 42
  const texto = (valor) => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const encabezado = () => { doc.setFillColor(25, 45, 112); doc.rect(margen, y - 16, ancho, 22, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(8); encabezados.forEach((h, i) => doc.text(texto(h).slice(0, 22), margen + i * anchoCol + 4, y - 2)); doc.setTextColor(35, 40, 50); y += 20 }
  doc.setTextColor(25, 45, 112); doc.setFontSize(18); doc.text(texto(titulo), margen, y); y += 14; doc.setFontSize(8); doc.setTextColor(100, 110, 125); doc.text(`Generado: ${new Date().toLocaleString('es-PE')}`, margen, y); y += 18; encabezado()
  filas.forEach((fila, index) => { if (y > alto - 28) { doc.addPage(); y = 32; encabezado() } if (index % 2 === 0) { doc.setFillColor(246, 248, 252); doc.rect(margen, y - 11, ancho, 16, 'F') } doc.setFontSize(7); fila.forEach((celda, i) => doc.text(texto(celda).slice(0, 28), margen + i * anchoCol + 4, y)); y += 16 })
  doc.save(`${nombre}.pdf`)
}

function urlEquipo(codigo) { return `${window.location.origin}${window.location.pathname}#equipo=${encodeURIComponent(codigo)}` }

export default function App() {
  const [sesion, setSesion] = useGuardado('cc-sesion', null)
  if (!sesion) return <Login entrar={setSesion} />
  return <Sistema sesion={sesion} salir={async () => { if (supabaseConfigurado) await cerrarSesionRemota(); setSesion(null) }} />
}

function Sistema({ sesion, salir }) {
  const puede = USUARIOS.find((u) => u.correo === sesion.correo)?.permisos || {}
  const [equipos, setEquipos] = useEquiposGuardados()
  const [infraestructura, setInfraestructura] = useInfraestructuraGuardada()
  const [mants, setMants] = useGuardado('cc-mants', MANTENIMIENTOS)
  const [cambios, setCambios] = useGuardado('cc-cambios', CAMBIOS)
  const [tickets, setTickets] = useGuardado('cc-tickets', INCIDENCIAS)
  const [historial, setHistorial] = useGuardado('cc-historial', [])
  const [inspecciones, setInspecciones] = useGuardado('cc-inspecciones', [])
  const [vista, setVista] = useState('dashboard')
  const [actual, setActual] = useState(null) // código del equipo abierto
  const [modal, setModal] = useState(null) // { tipo, codigo }
  const [aviso, setAviso] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  useEffect(() => { const codigo = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('equipo'); if (codigo && equipos.some((e) => e.codigo === codigo)) { setActual(codigo); setVista('inventario') } }, [equipos])

  const avisar = (t) => { setAviso(t); setTimeout(() => setAviso(''), 2600) }
  const ir = (v) => { setVista(v); setActual(null) }
  const abrir = (codigo) => { setActual(codigo); setVista('inventario') }
  function auditar(accion, entidad, detalle) { setHistorial((actual) => [{ id: Date.now() + Math.random(), codigo: '', fecha: hoy(), accion, usuario: sesion.nombre, detalle: `${entidad}: ${detalle}` }, ...actual]) }

  function guardarEquipo(e) {
    setEquipos([...equipos, e]); auditar('Equipo creado', 'inventario', e.codigo); setModal(null); avisar(`Equipo ${e.codigo} registrado`)
  }
  function cambiarLote({ codigos, estado, responsable }) {
    const seleccion = new Set(codigos); setEquipos((actual) => actual.map((e) => seleccion.has(e.codigo) ? { ...e, ...(estado ? { estado } : {}), ...(responsable !== undefined ? { responsable } : {}) } : e))
    setHistorial((actual) => [{ id: Date.now() + Math.random(), codigo: '', fecha: hoy(), accion: 'Operación masiva', usuario: sesion.nombre, detalle: `${codigos.length} equipos actualizados${estado ? ` · estado: ${estado}` : ''}${responsable ? ` · responsable: ${responsable}` : ''}` }, ...actual])
    setModal(null); avisar(`${codigos.length} equipos actualizados`)
  }
  function trasladarLote({ codigos, ambienteId }) {
    const ambiente = infraestructura.ambientes.find((a) => a.id === ambienteId); if (!ambiente) return
    const laboratorio = infraestructura.laboratorios.find((l) => l.ambienteId === ambienteId); const seleccion = new Set(codigos)
    const puestos = new Map(); let disponibles = equipos.filter((e) => !seleccion.has(e.codigo))
    codigos.forEach((codigo) => { const puesto = laboratorio ? siguientePuesto(disponibles, laboratorio.id) : null; puestos.set(codigo, puesto); if (laboratorio) disponibles = [...disponibles, { codigo, laboratorioId: laboratorio.id, posicion: puesto }] })
    setEquipos((actual) => actual.map((e) => seleccion.has(e.codigo) ? { ...e, ambienteId, pisoId: ambiente.pisoId, pabellonId: ambiente.pabellonId, laboratorioId: laboratorio?.id || null, area: laboratorio?.nombre || ambiente.nombre, posicion: puestos.get(e.codigo) || null, condicion: laboratorio && puestos.get(e.codigo) ? 'Instalado' : laboratorio ? 'Reserva' : 'Instalado' } : e))
    setHistorial((actual) => [...codigos.map((codigo) => ({ id: Date.now() + Math.random(), codigo, fecha: hoy(), accion: 'Traslado masivo', usuario: sesion.nombre, detalle: `Nuevo ambiente: ${ambiente.nombre}` })), { id: Date.now() + Math.random(), codigo: '', fecha: hoy(), accion: 'Operación masiva', usuario: sesion.nombre, detalle: `${codigos.length} equipos trasladados a ${ambiente.nombre}` }, ...actual])
    setModal(null); avisar(`${codigos.length} equipos trasladados`)
  }
  function guardarMant(m) {
    const registro = { ...m, id: Date.now(), estado: m.estado || 'Programado', fechaProgramada: m.fechaProgramada || m.fecha }
    setMants([registro, ...mants])
    if (m.estado !== 'Completado') setEquipos(equipos.map((e) => (e.codigo === m.codigo ? { ...e, estado: 'En mantenimiento' } : e)))
    registrarEvento(m.codigo, 'Mantenimiento programado', `${m.tipo} · ${m.descripcion}`)
    setModal(null); avisar(`Mantenimiento de ${m.codigo} registrado`)
  }
  function guardarMasivo({ codigos, tipo, fechaProgramada, tecnico, observaciones }) {
    const clave = (codigo) => `${codigo}|${tipo}|${fechaProgramada}`
    const existentes = new Set(mants.filter((m) => !['Completado', 'Cancelado'].includes(m.estado)).map((m) => clave(m.codigo)))
    const nuevos = codigos.filter((codigo) => !existentes.has(clave(codigo))).map((codigo, i) => ({ id: Date.now() + i, codigo, tipo, fecha: fechaProgramada, fechaProgramada, fechaEjecucion: '', tecnico, estado: 'Programado', descripcion: observaciones || `Mantenimiento ${tipo.toLowerCase()} programado por laboratorio`, observaciones: observaciones || '', costo: '' }))
    if (!nuevos.length) return avisar('No se agregaron registros: ya existen mantenimientos equivalentes')
    setMants([...nuevos, ...mants])
    const seleccion = new Set(codigos)
    setEquipos(equipos.map((e) => seleccion.has(e.codigo) ? { ...e, estado: 'En mantenimiento' } : e))
    setHistorial((actual) => [...nuevos.map((m) => ({ id: Date.now() + Math.random(), codigo: m.codigo, fecha: hoy(), accion: 'Mantenimiento masivo programado', usuario: sesion.nombre, detalle: `${m.tipo} · ${m.fechaProgramada}` })), { id: Date.now() + Math.random(), codigo: '', fecha: hoy(), accion: 'Operación masiva', usuario: sesion.nombre, detalle: `${nuevos.length} equipos afectados` }, ...actual])
    setModal(null); avisar(`${nuevos.length} mantenimientos programados`)
  }
  function guardarCambio(c) {
    setCambios([{ ...c, id: Date.now() }, ...cambios])
    setEquipos(equipos.map((e) => (e.codigo === c.codigo ? { ...e, estado: 'Repotenciado' } : e)))
    registrarEvento(c.codigo, 'Repotenciación', `${c.componente}: ${c.anterior} → ${c.nuevo}`)
    setModal(null); avisar(`Cambio de hardware en ${c.codigo} registrado`)
  }
  function cambiarEstado(codigo, estado) {
    setEquipos(equipos.map((e) => (e.codigo === codigo ? { ...e, estado } : e))); avisar(`${codigo}: ${estado}`)
    registrarEvento(codigo, 'Cambio de estado', `Nuevo estado: ${estado}`)
  }
  function completar(id) {
    const orden = mants.find((m) => m.id === id)
    setMants(mants.map((m) => (m.id === id ? { ...m, estado: 'Completado', fechaEjecucion: hoy() } : m))); avisar('Orden marcada como completada')
    if (orden) registrarEvento(orden.codigo, 'Mantenimiento completado', orden.descripcion)
  }
  function registrarEvento(codigo, accion, detalle) { setHistorial((actual) => [{ id: Date.now() + Math.random(), codigo, fecha: hoy(), accion, usuario: sesion.nombre, detalle }, ...actual]) }
  function guardarTicket(ticket) { const abiertos = tickets.filter((item) => item.equipo === ticket.equipo && !['Resuelto', 'Cerrado'].includes(item.estado)); if (abiertos.length && !window.confirm(`Ya existen ${abiertos.length} tickets abiertos para ${ticket.equipo}. ¿Registrar otra incidencia?`)) return; setTickets([{ ...ticket, id: Date.now(), codigo: `INC-${String(tickets.length + 1).padStart(4, '0')}` }, ...tickets]); registrarEvento(ticket.equipo, 'Incidencia registrada', `${ticket.prioridad} · ${ticket.tipo}`); setModal(null); avisar(`Incidencia registrada para ${ticket.equipo}`) }
  function actualizarTicket(ticket) { setTickets(tickets.map((item) => item.id === ticket.id ? ticket : item)); registrarEvento(ticket.equipo, `Incidencia ${ticket.estado.toLowerCase()}`, ticket.descripcion); }
  function editarEquipo(codigo, cambiosEquipo) { setEquipos(equipos.map((e) => e.codigo === codigo ? { ...e, ...cambiosEquipo } : e)); registrarEvento(codigo, 'Información técnica actualizada', 'Se modificaron datos de la ficha técnica'); avisar(`${codigo} actualizado`) }
  function restablecer() {
    localStorage.removeItem('cc-restauracion-completa'); localStorage.removeItem('cc-migracion-puestos-v1'); setEquipos(normalizarPuestos(EQUIPOS.map(ubicarEquipoLegacy))); setMants(MANTENIMIENTOS); setCambios(CAMBIOS); ir('inventario'); avisar('Datos de ejemplo restablecidos')
  }
  function restaurarRespaldo(respaldo) {
    localStorage.setItem('cc-restauracion-completa', '1'); setEquipos(respaldo.equipos); setInfraestructura(respaldo.infraestructura); setMants(respaldo.mantenimientos); setCambios(respaldo.cambios); setTickets(respaldo.tickets); setInspecciones(respaldo.inspecciones || []); setHistorial(respaldo.historial || []); avisar('Respaldo restaurado correctamente')
  }

  function guardarInspeccion(inspeccion) {
    const registro = { ...inspeccion, id: Date.now(), fecha: inspeccion.fecha || hoy(), usuario: sesion.nombre }
    setInspecciones((actuales) => [registro, ...actuales]);
    const incidencias = registro.equipos.filter((item) => item.problema)
    const nuevosTickets = incidencias.filter((item) => !tickets.some((ticket) => ticket.equipo === item.codigo && !['Resuelto', 'Cerrado'].includes(ticket.estado))).map((item, indice) => ({ id: Date.now() + indice + 1, codigo: `INC-${String(tickets.length + indice + 1).padStart(4, '0')}`, equipo: item.codigo, tipo: 'Hallazgo de inspección', descripcion: item.observaciones || 'Problema detectado durante inspección manual.', prioridad: 'Media', fecha: registro.fecha, reportadoPor: registro.tecnico, tecnico: registro.tecnico, estado: 'Pendiente', diagnostico: '', solucion: '', observaciones: `Laboratorio: ${registro.laboratorioNombre}` }))
    if (nuevosTickets.length) setTickets((actuales) => [...nuevosTickets, ...actuales])
    incidencias.forEach((item) => registrarEvento(item.codigo, 'Inspección manual', item.observaciones || 'Problema detectado durante inspección'))
    nuevosTickets.forEach((ticket) => registrarEvento(ticket.equipo, 'Ticket generado desde inspección', ticket.descripcion))
    auditar('Inspección de laboratorio registrada', 'inspecciones', `${registro.laboratorioNombre}: ${registro.equipos.length} equipos revisados`)
    setModal(null); avisar(`Inspección guardada: ${registro.equipos.length} revisados${nuevosTickets.length ? ` · ${nuevosTickets.length} tickets creados` : ''}`)
  }

  const equipo = equipos.find((e) => e.codigo === actual)
  const alertas = construirAlertas(equipos, mants, tickets, infraestructura)
  const tabs = [['dashboard', 'Inicio'], ['infraestructura', 'Explorar'], ...(puede.equipo ? [['administracion', 'Administrar']] : []), ['inventario', 'Inventario'], ['mantenimientos', 'Mantenimientos'], ['tickets', 'Incidencias'], ['inspecciones', 'Inspecciones'], ['repotenciacion', 'Repotenciación'], ['reportes', 'Reportes'], ['alertas', 'Alertas'], ...(puede.equipo ? [['copias', 'Copias']] : [])]
  const gruposNav = [
    { titulo: 'General', items: [['dashboard', 'Inicio', '⌂'], ['infraestructura', 'Infraestructura', '⌗'], ['inventario', 'Inventario', '▦']] },
    { titulo: 'Soporte técnico', items: [['mantenimientos', 'Mantenimientos', '◷'], ['tickets', 'Incidencias', '!'], ['inspecciones', 'Inspecciones', '✓'], ['repotenciacion', 'Repotenciaciones', '↗']] },
    { titulo: 'Gestión', items: [['reportes', 'Reportes', '▤'], ['alertas', 'Alertas', '◉'], ...(puede.equipo ? [['administracion', 'Administración', '⚙'], ['copias', 'Copias de seguridad', '□']] : [])] },
  ]

  return (
    <div className="app">
      <div className={'app-shell' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
        <aside className="sidebar">
          <div className="sidebar-brand"><span className="brand-emblem">UDH</span><span className="sidebar-brand-copy"><b className="d">CompuControl</b><small>Gestión TI universitaria</small></span></div>
          <div className="sidebar-mode"><span className="mode-dot" /> <span className="nav-label">{modoAlmacenamiento === 'institucional' ? 'Modo institucional' : 'Modo demostrativo'}</span></div>
          <nav className="sidebar-nav" aria-label="Navegación principal">
            {gruposNav.map((grupo) => <div className="nav-group" key={grupo.titulo}><span className="nav-group-title">{grupo.titulo}</span>{grupo.items.map(([id, label, icon]) => <button key={id} title={label} aria-current={vista === id ? 'page' : undefined} className={'nav-item' + (vista === id ? ' active' : '')} onClick={() => ir(id)}><span className="nav-icon">{icon}</span><span className="nav-label">{label}</span>{id === 'alertas' && alertas.length > 0 && <b className="nav-badge">{alertas.length > 99 ? '99+' : alertas.length}</b>}</button>)}</div>)}
          </nav>
          <div className="sidebar-footer"><div className="sidebar-user"><span className="user-avatar">{sesion.nombre?.charAt(0) || 'U'}</span><span className="sidebar-user-copy"><b>{sesion.nombre}</b><small>{sesion.perfil}</small></span></div><button className="sidebar-logout" onClick={salir} title="Cerrar sesión">↪<span className="nav-label">Salir</span></button></div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="topbar-leading"><button className="sidebar-toggle" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}>☰</button><div className="breadcrumb"><span>CompuControl UDH</span><b>/</b><strong>{tabs.find(([id]) => id === vista)?.[1] || 'Inicio'}</strong></div></div>
            <GlobalSearch busqueda={busqueda} setBusqueda={setBusqueda} equipos={equipos} infraestructura={infraestructura} tickets={tickets} abrir={abrir} ir={ir} />
            <div className="topbar-context"><span className="context-chip">{modoAlmacenamiento === 'institucional' ? 'Institucional' : 'Demo local'}</span><span className="topbar-user">{sesion.nombre}</span></div>
          </header>

          <main className="contenido">
        {vista === 'dashboard' && <Dashboard equipos={equipos} mants={mants} tickets={tickets} ir={ir} abrir={abrir} />}
        {vista === 'infraestructura' && <Infraestructura equipos={equipos} setEquipos={setEquipos} infraestructura={infraestructura} setInfraestructura={setInfraestructura} mants={mants} tickets={tickets} abrir={abrir} />}
        {vista === 'administracion' && <Infraestructura equipos={equipos} setEquipos={setEquipos} infraestructura={infraestructura} setInfraestructura={setInfraestructura} mants={mants} tickets={tickets} abrir={abrir} auditar={auditar} administrar />}
        {vista === 'inventario' && !equipo && <Inventario equipos={equipos} infraestructura={infraestructura} abrir={abrir} nuevo={puede.equipo ? () => setModal({ tipo: 'equipo' }) : null} masivo={puede.equipo ? (codigos) => setModal({ tipo: 'bulk', codigos }) : null} traslado={puede.equipo ? (codigos) => setModal({ tipo: 'traslado', codigos }) : null} qrLote={puede.equipo ? () => setModal({ tipo: 'qr' }) : null} />}
        {vista === 'inventario' && equipo && (
          <Ficha e={equipo} infraestructura={infraestructura} mants={mants.filter((m) => m.codigo === equipo.codigo)} tickets={tickets.filter((t) => t.equipo === equipo.codigo)} cambios={cambios.filter((c) => c.codigo === equipo.codigo)} historial={historial.filter((h) => h.codigo === equipo.codigo)}
            volver={() => setActual(null)} cambiarEstado={puede.estado ? cambiarEstado : null}
            nuevoMant={puede.mant ? () => setModal({ tipo: 'mant', codigo: equipo.codigo }) : null} nuevoCambio={puede.cambio ? () => setModal({ tipo: 'cambio', codigo: equipo.codigo }) : null} nuevoTicket={puede.mant ? () => setModal({ tipo: 'ticket', codigo: equipo.codigo }) : null} editar={puede.equipo ? (c) => editarEquipo(equipo.codigo, c) : null} />
        )}
        {vista === 'mantenimientos' && <Mantenimientos mants={mants} equipos={equipos} infraestructura={infraestructura} abrir={abrir} completar={puede.mant ? completar : null} nuevo={puede.mant ? () => setModal({ tipo: 'mant' }) : null} masivo={puede.mant ? () => setModal({ tipo: 'masivo' }) : null} />}
        {vista === 'tickets' && <Tickets tickets={tickets} equipos={equipos} infraestructura={infraestructura} actualizar={puede.mant ? actualizarTicket : null} nuevo={puede.mant ? () => setModal({ tipo: 'ticket' }) : null} abrir={abrir} />}
        {vista === 'inspecciones' && <Inspecciones inspecciones={inspecciones} nuevo={puede.mant ? () => setModal({ tipo: 'inspeccion' }) : null} />}
        {vista === 'repotenciacion' && <Repotenciacion cambios={cambios} equipos={equipos} abrir={abrir} nuevo={puede.cambio ? () => setModal({ tipo: 'cambio' }) : null} />}
        {vista === 'reportes' && <Reportes equipos={equipos} abrir={abrir} />}
        {vista === 'alertas' && <CentroAlertas alertas={alertas} abrir={abrir} ir={ir} />}
        {vista === 'copias' && puede.equipo && <CopiasSeguridad datos={{ equipos, infraestructura, mantenimientos: mants, cambios, tickets, inspecciones, historial }} restaurar={restaurarRespaldo} />}
          </main>

          <footer className="pie">
            <span>{supabaseConfigurado ? 'Supabase configurado · sincronización central pendiente de activación.' : 'Los cambios se guardan en este navegador.'}</span>
            {puede.equipo && <button className="enlace" onClick={restablecer}>Restablecer datos de ejemplo</button>}
          </footer>
        </div>
      </div>

      {modal?.tipo === 'equipo' && <FormEquipo equipos={equipos} cerrar={() => setModal(null)} guardar={guardarEquipo} />}
      {modal?.tipo === 'mant' && <FormMant equipos={equipos} codigo={modal.codigo} cerrar={() => setModal(null)} guardar={guardarMant} />}
      {modal?.tipo === 'masivo' && <MantenimientoMasivo equipos={equipos} infraestructura={infraestructura} cerrar={() => setModal(null)} guardar={guardarMasivo} />}
      {modal?.tipo === 'cambio' && <FormCambio equipos={equipos} codigo={modal.codigo} cerrar={() => setModal(null)} guardar={guardarCambio} />}
      {modal?.tipo === 'ticket' && <FormTicket equipos={equipos} codigo={modal.codigo} cerrar={() => setModal(null)} guardar={guardarTicket} />}
      {modal?.tipo === 'bulk' && <OperacionMasiva equipos={equipos} codigos={modal.codigos} cerrar={() => setModal(null)} guardar={cambiarLote} />}
      {modal?.tipo === 'traslado' && <TrasladoMasivo equipos={equipos} infraestructura={infraestructura} codigos={modal.codigos} cerrar={() => setModal(null)} guardar={trasladarLote} />}
      {modal?.tipo === 'qr' && <EtiquetasQR equipos={equipos} infraestructura={infraestructura} cerrar={() => setModal(null)} />}
      {modal?.tipo === 'inspeccion' && <FormInspeccion equipos={equipos} infraestructura={infraestructura} cerrar={() => setModal(null)} guardar={guardarInspeccion} />}
      {aviso && <div className="aviso" role="status">{aviso}</div>}
    </div>
  )
}

function construirAlertas(equipos, mants, tickets, infraestructura) {
  const limite = new Date(); limite.setDate(limite.getDate() + 7)
  const hasta = limite.toISOString().slice(0, 10)
  const alertas = []
  equipos.filter((e) => e.estado === 'En mantenimiento').slice(0, 40).forEach((e) => alertas.push({ id: `equipo-${e.codigo}`, tipo: 'Equipo averiado', prioridad: 'Alta', titulo: e.codigo, detalle: 'Equipo marcado En mantenimiento.', codigo: e.codigo }))
  mants.filter((m) => !['Completado', 'Cancelado'].includes(m.estado)).forEach((m) => {
    const fechaMant = m.fechaProgramada || m.fecha
    if (fechaMant < hoy()) alertas.push({ id: `mant-vencido-${m.id}`, tipo: 'Mantenimiento vencido', prioridad: 'Alta', titulo: m.codigo, detalle: `Programado para ${fecha(fechaMant)}.`, codigo: m.codigo })
    else if (fechaMant <= hasta) alertas.push({ id: `mant-proximo-${m.id}`, tipo: 'Mantenimiento próximo', prioridad: 'Media', titulo: m.codigo, detalle: `Programado para ${fecha(fechaMant)}.`, codigo: m.codigo })
  })
  tickets.filter((t) => t.prioridad === 'Crítica' && !['Resuelto', 'Cerrado'].includes(t.estado)).forEach((t) => alertas.push({ id: `ticket-${t.id}`, tipo: 'Ticket crítico', prioridad: 'Crítica', titulo: t.codigo, detalle: `${t.equipo} · ${t.descripcion}`, codigo: t.equipo }))
  const porLaboratorio = new Map()
  equipos.filter((e) => e.laboratorioId && e.estado !== 'Operativo').forEach((e) => porLaboratorio.set(e.laboratorioId, (porLaboratorio.get(e.laboratorioId) || 0) + 1))
  porLaboratorio.forEach((cantidad, laboratorioId) => { if (cantidad >= 3) { const lab = infraestructura.laboratorios.find((item) => item.id === laboratorioId); alertas.push({ id: `lab-${laboratorioId}`, tipo: 'Laboratorio con incidencias', prioridad: 'Alta', titulo: lab?.nombre || laboratorioId, detalle: `${cantidad} equipos requieren atención.`, vista: 'infraestructura' }) } })
  const unicas = new Map(alertas.map((alerta) => [alerta.id, alerta]))
  return [...unicas.values()].sort((a, b) => (a.prioridad === 'Crítica' ? -1 : b.prioridad === 'Crítica' ? 1 : a.tipo.localeCompare(b.tipo)))
}

function GlobalSearch({ busqueda, setBusqueda, equipos, infraestructura, tickets, abrir, ir }) {
  const termino = busqueda.trim().toLowerCase()
  const resultados = useMemo(() => {
    if (termino.length < 2) return { equipos: [], ubicaciones: [], tickets: [] }
    const coincide = (texto) => String(texto || '').toLowerCase().includes(termino)
    return {
      equipos: equipos.filter((e) => coincide(e.codigo) || coincide(e.serie) || coincide(e.modelo)).slice(0, 6),
      ubicaciones: [...infraestructura.laboratorios.map((l) => ({ ...l, categoria: 'Laboratorio' })), ...infraestructura.ambientes.map((a) => ({ ...a, categoria: 'Ambiente' })), ...infraestructura.pabellones.map((p) => ({ ...p, categoria: 'Pabellón' }))].filter((item) => coincide(item.nombre) || coincide(item.codigo)).slice(0, 6),
      tickets: tickets.filter((t) => coincide(t.codigo) || coincide(t.equipo) || coincide(t.descripcion)).slice(0, 6),
    }
  }, [termino, equipos, infraestructura, tickets])
  const total = resultados.equipos.length + resultados.ubicaciones.length + resultados.tickets.length
  return <div className="busqueda-global">
    <span aria-hidden="true">⌕</span><input aria-label="Búsqueda global" placeholder="Buscar equipo, laboratorio o ticket" value={busqueda} onChange={(ev) => setBusqueda(ev.target.value)} />
    {termino.length >= 2 && <div className="busqueda-resultados">
      {!total && <p className="mute">Sin coincidencias para “{busqueda}”.</p>}
      {resultados.equipos.length > 0 && <ResultadoBusqueda titulo="Equipos" items={resultados.equipos} etiqueta={(e) => `${e.codigo} · ${e.modelo}`} detalle={(e) => e.serie || e.area} abrir={(e) => { abrir(e.codigo); setBusqueda('') }} />}
      {resultados.ubicaciones.length > 0 && <ResultadoBusqueda titulo="Ubicaciones" items={resultados.ubicaciones} etiqueta={(e) => e.nombre} detalle={(e) => e.categoria} abrir={() => { ir('infraestructura'); setBusqueda('') }} />}
      {resultados.tickets.length > 0 && <ResultadoBusqueda titulo="Tickets" items={resultados.tickets} etiqueta={(e) => `${e.codigo} · ${e.equipo}`} detalle={(e) => e.estado} abrir={(e) => { abrir(e.equipo); setBusqueda('') }} />}
    </div>}
  </div>
}

function ResultadoBusqueda({ titulo, items, etiqueta, detalle, abrir }) {
  return <section><small className="eyebrow">{titulo}</small>{items.map((item) => <button key={item.id || item.codigo} onClick={() => abrir(item)}><b>{etiqueta(item)}</b><span>{detalle(item)}</span></button>)}</section>
}

function CentroAlertas({ alertas, abrir, ir }) {
  return <><Titulo titulo="Centro de alertas" sub={`${alertas.length} alertas calculadas a partir del inventario, mantenimientos y tickets actuales.`} /><section className="panel alertas-panel"><div className="alertas-resumen"><b>{alertas.filter((a) => a.prioridad === 'Crítica').length}</b><span>críticas</span><b>{alertas.filter((a) => a.prioridad === 'Alta').length}</b><span>prioridad alta</span><b>{alertas.filter((a) => a.prioridad === 'Media').length}</b><span>próximas</span></div>{alertas.length ? <div className="alertas-lista">{alertas.map((a) => <button key={a.id} className={`alerta-item prioridad-${a.prioridad.toLowerCase()}`} onClick={() => a.codigo ? abrir(a.codigo) : ir(a.vista || 'infraestructura')}><span className="alerta-punto" /><span><b>{a.tipo}</b><strong>{a.titulo}</strong><small>{a.detalle}</small></span><em>Ver</em></button>)}</div> : <div className="empty-state">No hay alertas activas con los datos actuales.</div>}</section></>
}

function Inspecciones({ inspecciones, nuevo }) {
  const ultimas = inspecciones.slice(0, 8)
  return <><Titulo titulo="Inspecciones técnicas" sub="Revisiones manuales por laboratorio. No representan monitoreo automático.">{nuevo && <button className="btn p" onClick={nuevo}>+ Nueva inspección</button>}</Titulo><section className="panel"><div className="section-heading"><div><span className="eyebrow">TRAZABILIDAD DE CAMPO</span><h2 className="d">Resumen de inspecciones</h2></div><span className="section-count">{inspecciones.length} registros</span></div>{ultimas.length ? <div className="record-list">{ultimas.map((i) => <article className="record-row" key={i.id}><div><b>{i.laboratorioNombre}</b><span>{i.fecha} · {i.usuario || i.tecnico}</span></div><em>{i.equipos.length} revisados · {i.equipos.filter((e) => e.problema).length} con pendientes</em></article>)}</div> : <div className="empty-state">Todavía no hay inspecciones registradas.</div>}<p className="nota">Los equipos revisados se mantienen vinculados a su ubicación actual. Para abrir una ficha, busca su código en la barra superior.</p></section></>
}

function FormInspeccion({ equipos, infraestructura, cerrar, guardar }) {
  const [laboratorioId, setLaboratorioId] = useState(infraestructura.laboratorios[0]?.id || '')
  const laboratorio = infraestructura.laboratorios.find((l) => l.id === laboratorioId)
  const disponibles = equipos.filter((e) => e.laboratorioId === laboratorioId)
  const [fechaInspeccion, setFechaInspeccion] = useState(hoy())
  const [tecnico, setTecnico] = useState(TECNICOS[0])
  const [revisiones, setRevisiones] = useState({})
  const actualizar = (codigo, campo, valor) => setRevisiones((actuales) => ({ ...actuales, [codigo]: { ...actuales[codigo], [campo]: valor } }))
  const enviar = () => guardar({ laboratorioId, laboratorioNombre: laboratorio?.nombre || 'Laboratorio sin nombre', fecha: fechaInspeccion, tecnico, equipos: disponibles.map((e) => ({ codigo: e.codigo, estadoFisico: revisiones[e.codigo]?.estadoFisico || 'Bueno', encendido: revisiones[e.codigo]?.encendido || 'Sí', monitor: revisiones[e.codigo]?.monitor || 'Conforme', teclado: revisiones[e.codigo]?.teclado || 'Conforme', mouse: revisiones[e.codigo]?.mouse || 'Conforme', conectividad: revisiones[e.codigo]?.conectividad || 'Conforme', problema: Boolean(revisiones[e.codigo]?.problema), observaciones: revisiones[e.codigo]?.observaciones || '' })) })
  return <Modal titulo="Nueva inspección de laboratorio" cerrar={cerrar} onSubmit={enviar} accion={`Guardar ${disponibles.length} revisiones`}><p className="nota">Inspección manual: registra únicamente lo que el técnico haya comprobado físicamente.</p><Campo label="Laboratorio" ancho><select className="campo" value={laboratorioId} onChange={(e) => { setLaboratorioId(e.target.value); setRevisiones({}) }}>{infraestructura.laboratorios.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></Campo><Campo label="Fecha"><input className="campo" type="date" value={fechaInspeccion} onChange={(e) => setFechaInspeccion(e.target.value)} /></Campo><Campo label="Técnico"><select className="campo" value={tecnico} onChange={(e) => setTecnico(e.target.value)}>{TECNICOS.map((t) => <option key={t}>{t}</option>)}</select></Campo><div className="inspeccion-equipos">{disponibles.map((e) => <fieldset key={e.codigo}><legend>{e.codigo} · puesto {e.posicion || '—'}</legend><label>Estado físico<select className="campo" value={revisiones[e.codigo]?.estadoFisico || 'Bueno'} onChange={(ev) => actualizar(e.codigo, 'estadoFisico', ev.target.value)}><option>Bueno</option><option>Regular</option><option>Deficiente</option></select></label><label>Encendido<select className="campo" value={revisiones[e.codigo]?.encendido || 'Sí'} onChange={(ev) => actualizar(e.codigo, 'encendido', ev.target.value)}><option>Sí</option><option>No</option><option>No comprobado</option></select></label><label>Monitor<select className="campo" value={revisiones[e.codigo]?.monitor || 'Conforme'} onChange={(ev) => actualizar(e.codigo, 'monitor', ev.target.value)}><option>Conforme</option><option>Con daños</option><option>No comprobado</option></select></label><label>Teclado<select className="campo" value={revisiones[e.codigo]?.teclado || 'Conforme'} onChange={(ev) => actualizar(e.codigo, 'teclado', ev.target.value)}><option>Conforme</option><option>Con daños</option><option>No comprobado</option></select></label><label>Mouse<select className="campo" value={revisiones[e.codigo]?.mouse || 'Conforme'} onChange={(ev) => actualizar(e.codigo, 'mouse', ev.target.value)}><option>Conforme</option><option>Con daños</option><option>No comprobado</option></select></label><label>Conectividad<select className="campo" value={revisiones[e.codigo]?.conectividad || 'Conforme'} onChange={(ev) => actualizar(e.codigo, 'conectividad', ev.target.value)}><option>Conforme</option><option>Intermitente</option><option>Sin conexión</option></select></label><label className="check-line"><input type="checkbox" checked={Boolean(revisiones[e.codigo]?.problema)} onChange={(ev) => actualizar(e.codigo, 'problema', ev.target.checked)} /> Requiere atención</label><input className="campo" placeholder="Observaciones" value={revisiones[e.codigo]?.observaciones || ''} onChange={(ev) => actualizar(e.codigo, 'observaciones', ev.target.value)} /></fieldset>)}{!disponibles.length && <div className="empty-state">El laboratorio no tiene equipos vinculados.</div>}</div></Modal>
}

function Dashboard({ equipos, mants, tickets, ir, abrir }) {
  const operativos = equipos.filter((e) => e.estado === 'Operativo').length
  const mantenimiento = equipos.filter((e) => e.estado === 'En mantenimiento').length
  const laboratoriosConEquipos = new Set(equipos.filter((e) => e.laboratorioId).map((e) => e.laboratorioId)).size
  const ticketsAbiertos = tickets.filter((t) => !['Resuelto', 'Cerrado'].includes(t.estado)).length
  const mantenimientosPendientes = mants.filter((m) => !['Completado', 'Cancelado'].includes(m.estado)).length
  const mantenimientosVencidos = mants.filter((m) => (m.fechaProgramada || m.fecha) < hoy() && !['Completado', 'Cancelado'].includes(m.estado)).length
  const laboratoriosAtencion = LABORATORIOS.map((lab) => ({ lab, equipos: equipos.filter((e) => e.laboratorioId === lab.id), tickets: tickets.filter((t) => equipos.some((e) => e.codigo === t.equipo && e.laboratorioId === lab.id)), vencidos: mants.filter((m) => equipos.some((e) => e.codigo === m.codigo && e.laboratorioId === lab.id) && (m.fechaProgramada || m.fecha) < hoy() && !['Completado', 'Cancelado'].includes(m.estado)) })).filter(({ equipos: lista, tickets: ts, vencidos }) => lista.some((e) => e.estado !== 'Operativo') || ts.some((t) => !['Resuelto', 'Cerrado'].includes(t.estado)) || vencidos.length).slice(0, 5)
  const recientes = equipos.filter((e) => e.estado !== 'Operativo').slice(0, 5)
  const todasRecomendaciones = generarRecomendaciones(equipos, mants, tickets)
  const [mostrarTodas, setMostrarTodas] = useState(false)
  const recomendaciones = (mostrarTodas ? todasRecomendaciones : todasRecomendaciones.slice(0, 3))
  const estados = ESTADOS.map((estado) => ({ estado, total: equipos.filter((e) => e.estado === estado).length }))
  const pabellones = PABELLONES.map((pabellon) => ({ ...pabellon, total: equipos.filter((e) => e.pabellonId === pabellon.id).length })).filter((pabellon) => pabellon.total > 0)
  const maxPabellon = Math.max(...pabellones.map((pabellon) => pabellon.total), 1)
  const ticketsUrgentes = tickets.filter((ticket) => ticket.prioridad === 'Crítica' && !['Resuelto', 'Cerrado'].includes(ticket.estado)).slice(0, 4)
  const proximos = mants.filter((m) => !['Completado', 'Cancelado'].includes(m.estado)).sort((a, b) => String(a.fechaProgramada || a.fecha).localeCompare(String(b.fechaProgramada || b.fecha))).slice(0, 4)
  return (
    <>
      <div className="hero-udh">
        <div>
          <span className="eyebrow">COMPUCONTROL UDH · ENTORNO SIMULADO</span>
          <h1 className="d">Centro de control institucional</h1>
          <p>Explora la infraestructura universitaria, ubica equipos y toma decisiones de soporte desde una sola vista.</p>
        </div>
        <div className="hero-mark"><span className="d">UDH</span><small>Gestión informática</small></div>
      </div>
      <div className="metric-grid">
        <button className="metric-card accent" onClick={() => ir('infraestructura')}><span className="metric-label">Pabellones</span><b className="d">{PABELLONES.length}</b><small>30 pisos · 180 ambientes</small></button>
        <button className="metric-card" onClick={() => ir('infraestructura')}><span className="metric-label">Laboratorios</span><b className="d">{LABORATORIOS.length}</b><small>{laboratoriosConEquipos} con inventario vinculado</small></button>
        <button className="metric-card" onClick={() => ir('inventario')}><span className="metric-label">Equipos registrados</span><b className="d">{equipos.length}</b><small>{operativos} operativos</small></button>
        <button className="metric-card warning" onClick={() => ir('mantenimientos')}><span className="metric-label">Equipos averiados</span><b className="d">{mantenimiento}</b><small>En mantenimiento</small></button>
        <button className="metric-card" onClick={() => ir('tickets')}><span className="metric-label">Tickets abiertos</span><b className="d">{ticketsAbiertos}</b><small>Incidencias por atender</small></button>
        <button className="metric-card" onClick={() => ir('mantenimientos')}><span className="metric-label">Mantenimientos pendientes</span><b className="d">{mantenimientosPendientes}</b><small>{mantenimientosVencidos} vencidos</small></button>
      </div>
      <div className="dashboard-visual-grid">
        <section className="panel chart-panel"><div className="section-heading"><div><span className="eyebrow">LECTURA DEL INVENTARIO</span><h2 className="d">Estado operativo</h2></div><span className="chart-total">{equipos.length} equipos</span></div><div className="state-bars">{estados.map(({ estado, total }) => <div className="state-row" key={estado}><div><span className={'status-dot ' + COLOR_ESTADO[estado]} /><b>{estado}</b><strong>{total}</strong></div><span className="state-track"><i className={'state-fill ' + COLOR_ESTADO[estado]} style={{ width: `${equipos.length ? Math.max((total / equipos.length) * 100, total ? 2 : 0) : 0}%` }} /></span></div>)}</div></section>
        <section className="panel chart-panel"><div className="section-heading"><div><span className="eyebrow">COBERTURA POR SEDE</span><h2 className="d">Equipos por pabellón</h2></div><button className="enlace" onClick={() => ir('infraestructura')}>Explorar</button></div><div className="pavilion-list">{pabellones.map((pabellon) => <button className="pavilion-row" key={pabellon.id} onClick={() => ir('infraestructura')}><span><b>{pabellon.nombre}</b><small>{pabellon.total} equipos vinculados</small></span><span className="pavilion-track"><i style={{ width: `${(pabellon.total / maxPabellon) * 100}%` }} /></span><strong>{pabellon.total}</strong></button>)}</div></section>
      </div>
      <div className="dashboard-work-grid">
        <section className="panel"><div className="section-heading"><div><span className="eyebrow">SOPORTE PRIORITARIO</span><h2 className="d">Tickets urgentes</h2></div><button className="enlace" onClick={() => ir('tickets')}>Ver todos</button></div><div className="compact-list">{ticketsUrgentes.map((ticket) => <button key={ticket.id} onClick={() => abrir(ticket.equipo)}><span className="priority-mark critical">!</span><span><b>{ticket.codigo}</b><small>{ticket.equipo} · {ticket.descripcion}</small></span><em>{ticket.estado}</em></button>)}{!ticketsUrgentes.length && <p className="mute">No hay tickets críticos abiertos.</p>}</div></section>
        <section className="panel"><div className="section-heading"><div><span className="eyebrow">AGENDA DE SOPORTE</span><h2 className="d">Próximos mantenimientos</h2></div><button className="enlace" onClick={() => ir('mantenimientos')}>Calendario</button></div><div className="compact-list">{proximos.map((mantenimiento) => <button key={mantenimiento.id} onClick={() => abrir(mantenimiento.codigo)}><span className="date-mark">{String(mantenimiento.fechaProgramada || mantenimiento.fecha).slice(8, 10) || '—'}</span><span><b>{mantenimiento.codigo}</b><small>{mantenimiento.tipo} · {mantenimiento.tecnico || 'Sin técnico'}</small></span><em>{mantenimiento.estado}</em></button>)}{!proximos.length && <p className="mute">No hay actividades programadas.</p>}</div></section>
      </div>
      <div className="dashboard-grid">
        <section className="panel panel-dark">
          <div className="section-heading"><div><span className="eyebrow">NAVEGACIÓN OPERATIVA</span><h2 className="d">Explorar la UDH</h2></div><span className="section-icon">⌘</span></div>
          <div className="quick-actions">
            <button onClick={() => ir('infraestructura')}><span>01</span><b>Ver pabellones y laboratorios</b><small>Recorre la estructura simulada</small></button>
            <button onClick={() => ir('inventario')}><span>02</span><b>Consultar inventario masivo</b><small>Busca por código, modelo o serie</small></button>
            <button onClick={() => ir('reportes')}><span>03</span><b>Revisar reportes institucionales</b><small>Estado y características técnicas</small></button>
          </div>
        </section>
        <section className="panel">
          <div className="section-heading"><div><span className="eyebrow">SEGUIMIENTO</span><h2 className="d">Equipos que requieren atención</h2></div></div>
          <div className="attention-list">
            {recientes.map((e) => <button key={e.codigo} onClick={() => abrir(e.codigo)}><span className={'status-dot ' + COLOR_ESTADO[e.estado]} /><span><b>{e.codigo}</b><small>{e.area}</small></span><em>{e.estado}</em></button>)}
            {recientes.length === 0 && <p className="mute">No hay equipos pendientes.</p>}
          </div>
        </section>
      </div>
      <section className="attention-labs panel"><div className="section-heading"><div><span className="eyebrow">PRIORIZACIÓN DE SOPORTE</span><h2 className="d">Laboratorios que requieren atención</h2></div><button className="enlace" onClick={() => ir('tickets')}>Ver incidencias</button></div><div className="lab-attention-grid">{laboratoriosAtencion.map(({ lab, equipos: lista, tickets: ts, vencidos }) => <button key={lab.id} onClick={() => ir('infraestructura')}><span className="d">{lab.nombre}</span><small>{lista.filter((e) => e.estado !== 'Operativo').length} equipos con alertas · {ts.filter((t) => !['Resuelto', 'Cerrado'].includes(t.estado)).length} tickets abiertos</small><em>{vencidos.length ? `${vencidos.length} mantenimientos vencidos` : 'Atención operativa requerida'}</em></button>)}{!laboratoriosAtencion.length && <p className="mute">No hay laboratorios con alertas.</p>}</div></section>
      <section className="recommendations panel"><div className="section-heading"><div><span className="eyebrow">REGLAS DE SOPORTE · SIN MONITOREO AUTOMÁTICO</span><h2 className="d">Recomendaciones técnicas</h2></div>{todasRecomendaciones.length > 3 && <button className="enlace" onClick={() => setMostrarTodas((value) => !value)}>{mostrarTodas ? 'Mostrar menos' : `Ver todas (${todasRecomendaciones.length})`}</button>}</div><div className="recommendation-list">{recomendaciones.map((r, i) => <button key={i} onClick={() => r.codigo && abrir(r.codigo)}><span className={'recommendation-level ' + r.nivel.toLowerCase()}>{r.nivel}</span><span><b>{r.problema}</b><small>{r.motivo}</small></span><em>{r.recomendacion}</em></button>)}{!recomendaciones.length && <p className="mute">No hay recomendaciones activas.</p>}</div></section>
    </>
  )
}

function generarRecomendaciones(equipos, mants, tickets) {
  const resultado = []
  equipos.forEach((e) => {
    const vencido = mants.some((m) => m.codigo === e.codigo && (m.fechaProgramada || m.fecha) < hoy() && !['Completado', 'Cancelado'].includes(m.estado))
    const incidencias = tickets.filter((t) => t.equipo === e.codigo).length
    if (e.estado === 'En mantenimiento') resultado.push({ nivel: 'Alta', problema: `${e.codigo} requiere atención`, motivo: 'El estado operativo está marcado como En mantenimiento.', recomendacion: 'Revisar el último ticket y registrar el diagnóstico.', codigo: e.codigo })
    else if (vencido) resultado.push({ nivel: 'Media', problema: `${e.codigo} tiene mantenimiento vencido`, motivo: 'Existe una fecha programada anterior a hoy sin completar.', recomendacion: 'Programar una nueva revisión.', codigo: e.codigo })
    else if (incidencias >= 2) resultado.push({ nivel: 'Alta', problema: `${e.codigo} presenta incidencias recurrentes`, motivo: `${incidencias} tickets asociados en el prototipo.`, recomendacion: 'Evaluar diagnóstico profundo o repotenciación.', codigo: e.codigo })
    else if (e.ram < 8) resultado.push({ nivel: 'Media', problema: `${e.codigo} tiene poca memoria RAM`, motivo: `La ficha registra ${e.ram} GB de RAM.`, recomendacion: 'Evaluar ampliación según el uso del laboratorio.', codigo: e.codigo })
    else if (e.disco.includes('HDD')) resultado.push({ nivel: 'Baja', problema: `${e.codigo} usa disco HDD`, motivo: 'La ficha técnica registra almacenamiento mecánico.', recomendacion: 'Evaluar migración a SSD.', codigo: e.codigo })
  })
  return resultado
}

function Infraestructura({ equipos, setEquipos, infraestructura, setInfraestructura, mants = [], tickets = [], abrir, auditar, administrar = false }) {
  const [pabellonId, setPabellonId] = useState(infraestructura.pabellones[0]?.id)
  const [pisoNumero, setPisoNumero] = useState(1)
  const [ambienteId, setAmbienteId] = useState(null)
  const [equipoMapa, setEquipoMapa] = useState(null)
  const [equipoParaAsignar, setEquipoParaAsignar] = useState('')
  const [editor, setEditor] = useState(null)
  const { pabellones, pisos, ambientes, laboratorios } = infraestructura
  const equiposDe = (id) => equipos.filter((e) => e.ambienteId === id)
  const tieneEquipos = (id) => equipos.some((e) => e.pabellonId === id || e.pisoId === id || e.ambienteId === id)
  const pabellonesVisibles = administrar ? pabellones : pabellones.filter((p) => tieneEquipos(p.id))
  const pabellon = pabellones.find((p) => p.id === pabellonId) || pabellonesVisibles[0]
  const piso = pisos.find((p) => p.pabellonId === pabellon?.id && p.numero === pisoNumero)
  const pisosDelPabellon = pisos.filter((p) => p.pabellonId === pabellon?.id)
  const pisosVisibles = administrar ? pisosDelPabellon : pisosDelPabellon.filter((p) => tieneEquipos(p.id))
  const ambientesDelPiso = ambientes.filter((a) => a.pabellonId === pabellon?.id && a.pisoId === piso?.id)
  const ambientesVisibles = administrar ? ambientesDelPiso : ambientesDelPiso.filter((a) => equiposDe(a.id).length > 0)
  const equiposDisponibles = equipos.filter((e) => e.ambienteId !== ambienteId)
  const actualizarInfra = (cambios) => { setInfraestructura((actual) => ({ ...actual, ...cambios })); if (auditar) auditar('Infraestructura actualizada', 'infraestructura', Object.keys(cambios).join(', ')) }

  function agregarPabellon() {
    setEditor({ tipo: 'pabellon', nombre: '' })
  }
  function editarPabellon() {
    if (!pabellon) return
    setEditor({ tipo: 'editar-pabellon', nombre: pabellon.nombre, id: pabellon.id })
  }
  function eliminarPabellon() {
    if (!pabellon || tieneEquipos(pabellon.id)) return window.alert('No se puede eliminar: el pabellón todavía tiene equipos asociados.')
    if (!window.confirm(`¿Eliminar ${pabellon.nombre}?`)) return
    actualizarInfra({ pabellones: pabellones.filter((p) => p.id !== pabellon.id), pisos: pisos.filter((p) => p.pabellonId !== pabellon.id), ambientes: ambientes.filter((a) => a.pabellonId !== pabellon.id), laboratorios: laboratorios.filter((l) => l.pabellonId !== pabellon.id) })
    setPabellonId(pabellonesVisibles.find((p) => p.id !== pabellon.id)?.id)
  }
  function agregarPiso() {
    if (!pabellon) return
    setEditor({ tipo: 'piso', numero: pisosDelPabellon.length + 1 })
  }
  function eliminarPiso() {
    if (!piso || tieneEquipos(piso.id)) return window.alert('No se puede eliminar: el piso tiene equipos asociados.')
    if (!window.confirm(`¿Eliminar el piso ${piso.numero}?`)) return
    actualizarInfra({ pisos: pisos.filter((p) => p.id !== piso.id), ambientes: ambientes.filter((a) => a.pisoId !== piso.id), laboratorios: laboratorios.filter((l) => l.pisoId !== piso.id) })
    setPisoNumero(pisosVisibles.find((p) => p.id !== piso.id)?.numero || 1)
  }
  function agregarAmbiente() {
    if (!piso) return
    setEditor({ tipo: 'ambiente', numero: `${piso.numero}07`, nombre: '', ambienteTipo: 'Laboratorio' })
  }
  function editarAmbiente(ambiente) {
    setEditor({ tipo: 'editar-ambiente', nombre: ambiente.nombre, id: ambiente.id })
  }
  function eliminarAmbiente(ambiente) {
    if (equiposDe(ambiente.id).length) return window.alert('Desvincula primero los equipos de este ambiente.')
    if (!window.confirm(`¿Eliminar ${ambiente.nombre}?`)) return
    actualizarInfra({ ambientes: ambientes.filter((a) => a.id !== ambiente.id), laboratorios: laboratorios.filter((l) => l.ambienteId !== ambiente.id) })
    setAmbienteId(null)
  }
  function asignarEquipo(ambiente) {
    if (!equipoParaAsignar) return
    const laboratorio = laboratorios.find((l) => l.ambienteId === ambiente.id)
    const puesto = laboratorio ? siguientePuesto(equipos, laboratorio.id, [equipoParaAsignar]) : null
    setEquipos(equipos.map((e) => e.codigo === equipoParaAsignar ? { ...e, ambienteId: ambiente.id, pabellonId: ambiente.pabellonId, pisoId: ambiente.pisoId, laboratorioId: laboratorio?.id || null, area: ambiente.nombre, posicion: puesto, condicion: laboratorio && puesto ? 'Instalado' : laboratorio ? 'Reserva' : 'Instalado' } : e))
    if (auditar) auditar('Equipo asignado o trasladado', 'inventario', `${equipoParaAsignar} → ${ambiente.nombre}`)
    setEquipoParaAsignar('')
  }
  function desvincularEquipo(codigo) { setEquipos(equipos.map((e) => e.codigo === codigo ? { ...e, ambienteId: null, pisoId: null, pabellonId: null, laboratorioId: null } : e)); if (auditar) auditar('Equipo desvinculado', 'inventario', codigo) }
  function agregarLote(ambiente) {
    setEditor({ tipo: 'lote', cantidad: 10, ambienteId: ambiente.id })
  }
  function guardarEditor() {
    if (!editor) return
    if (editor.tipo === 'pabellon' && editor.nombre.trim()) {
      const id = `P-${Date.now()}`
      actualizarInfra({ pabellones: [...pabellones, { id, codigo: `PB-${String(pabellones.length + 1).padStart(2, '0')}`, nombre: editor.nombre.trim(), descripcion: 'Ambiente configurable', pisos: 0 }] })
      setPabellonId(id)
    }
    if (editor.tipo === 'editar-pabellon' && editor.nombre.trim()) actualizarInfra({ pabellones: pabellones.map((p) => p.id === editor.id ? { ...p, nombre: editor.nombre.trim() } : p) })
    if (editor.tipo === 'piso') {
      const numero = Number(editor.numero)
      if (!numero || pisosDelPabellon.some((p) => p.numero === numero)) return
      const id = `${pabellon.id}-N${numero}-${Date.now()}`
      actualizarInfra({ pisos: [...pisos, { id, pabellonId: pabellon.id, numero, etiqueta: `${pabellon.codigo} · Piso ${numero}` }] })
      setPisoNumero(numero)
    }
    if (editor.tipo === 'ambiente' && editor.numero.trim() && editor.nombre.trim()) {
      const id = `${piso.id}-A-${Date.now()}`
      actualizarInfra({ ambientes: [...ambientes, { id, pabellonId: pabellon.id, pisoId: piso.id, numero: editor.numero.trim(), nombre: editor.nombre.trim(), tipo: editor.ambienteTipo }] })
    }
    if (editor.tipo === 'editar-ambiente' && editor.nombre.trim()) actualizarInfra({ ambientes: ambientes.map((a) => a.id === editor.id ? { ...a, nombre: editor.nombre.trim() } : a) })
    if (editor.tipo === 'lote') {
      const cantidad = Number(editor.cantidad)
      const ambiente = ambientes.find((a) => a.id === editor.ambienteId)
      if (!ambiente || !cantidad || cantidad < 1 || cantidad > 200) return
      const laboratorio = laboratorios.find((l) => l.ambienteId === ambiente.id)
      const puestosDisponibles = laboratorio ? Array.from({ length: laboratorio.capacidad }, (_, indice) => indice + 1).filter((puesto) => !equiposDe(ambiente.id).some((e) => Number(e.posicion) === puesto)) : []
      const nuevos = Array.from({ length: cantidad }, (_, i) => { const puesto = puestosDisponibles[i] || null; return { codigo: `UDH-LOT-${Date.now()}-${i + 1}`, tipo: 'Escritorio', modelo: 'HP ProDesk 400 G7', area: ambiente.nombre, pabellonId: ambiente.pabellonId, pisoId: ambiente.pisoId, ambienteId: ambiente.id, laboratorioId: laboratorio?.id || null, posicion: puesto, condicion: laboratorio && puesto ? 'Instalado' : laboratorio ? 'Reserva' : 'Instalado', procesador: 'Intel Core i5-10400', ram: 8, disco: '256 GB SSD', video: 'Intel UHD 630', so: 'Windows 11 Pro', ip: '', serie: `LOT${Date.now()}${i + 1}`, adquisicion: hoy(), estado: 'Operativo' } })
      setEquipos([...equipos, ...nuevos])
      if (auditar) auditar('Operación masiva', 'inventario', `${nuevos.length} equipos creados en ${ambiente.nombre}`)
    }
    setEditor(null)
  }

  return (
    <>
      <Titulo titulo={administrar ? 'Administrar infraestructura' : 'Explorar infraestructura'} sub={administrar ? 'Gestiona la estructura completa, incluso ambientes sin equipos. Los cambios se guardan en este navegador.' : 'Solo se muestran pabellones, pisos y ambientes que tienen equipos informáticos vinculados.'}>
        {administrar && <button className="btn p" onClick={agregarPabellon}>Nuevo pabellón</button>}
      </Titulo>
      <div className="infra-layout">
        <aside className="infra-nav panel">
          <span className="eyebrow">UNIVERSIDAD · {administrar ? 'ADMINISTRACIÓN' : 'OPERACIÓN'}</span><h2 className="d">Pabellones</h2>
          {pabellonesVisibles.map((p) => <button key={p.id} className={'infra-pabellon ' + (p.id === pabellon?.id ? 'on' : '')} onClick={() => { setPabellonId(p.id); setPisoNumero(pisos.find((item) => item.pabellonId === p.id && (administrar || tieneEquipos(item.id)))?.numero || 1) }}><span className="d">{p.codigo}</span><span>{p.nombre}<small>{p.abreviatura || ''}</small></span></button>)}
          {!pabellonesVisibles.length && <p className="mute">No hay pabellones con equipos.</p>}
          {administrar && pabellon && <div className="admin-actions"><button className="enlace" onClick={editarPabellon}>Editar pabellón</button><button className="enlace peligro" onClick={eliminarPabellon}>Eliminar pabellón</button></div>}
        </aside>
        <section className="infra-main">
          {pabellon ? <><div className="infra-header"><div><span className="eyebrow">{pabellon.codigo} · ESTRUCTURA SIMULADA</span><h2 className="d">{pabellon.nombre}</h2></div><span className="pill">{pisosDelPabellon.length} pisos · {ambientes.filter((a) => a.pabellonId === pabellon.id).length} ambientes</span></div>
            <div className="floor-tabs">{pisosVisibles.map((p) => <button key={p.id} className={p.numero === pisoNumero ? 'on' : ''} onClick={() => setPisoNumero(p.numero)}>Piso {p.numero}<small>{ambientes.filter((a) => a.pisoId === p.id).length} ambientes</small></button>)}{administrar && <button className="floor-add" onClick={agregarPiso}>+ Piso</button>}</div>
            {administrar && piso && <div className="admin-toolbar"><span>Administrando piso {piso.numero}</span><button className="enlace" onClick={agregarAmbiente}>+ Ambiente</button><button className="enlace peligro" onClick={eliminarPiso}>Eliminar piso</button></div>}
            <div className="ambient-grid">
              {ambientesVisibles.map((ambiente) => {
                const lista = equiposDe(ambiente.id)
                const laboratorio = laboratorios.find((l) => l.ambienteId === ambiente.id)
                const alertas = lista.filter((e) => e.estado !== 'Operativo').length
                const operativos = lista.filter((e) => e.estado === 'Operativo').length
                const mantenimiento = lista.filter((e) => e.estado === 'En mantenimiento').length
                const repotenciados = lista.filter((e) => e.estado === 'Repotenciado').length
                const incidencias = tickets.filter((t) => lista.some((e) => e.codigo === t.equipo) && !['Resuelto', 'Cerrado'].includes(t.estado)).length
                const pendientes = mants.filter((m) => lista.some((e) => e.codigo === m.codigo) && !['Completado', 'Cancelado'].includes(m.estado)).length
                return <article key={ambiente.id} className={'ambient-card ' + (laboratorio ? 'lab' : '') + (ambienteId === ambiente.id ? ' selected' : '')} onClick={() => { setAmbienteId(ambiente.id); setEquipoMapa(null) }}>
                  <div className="ambient-top"><span className="ambient-type">{ambiente.tipo}</span><span className="ambient-number d">{ambiente.numero}</span></div><h3>{laboratorio?.nombre || ambiente.nombre}</h3>
                  <div className="ambient-stats"><b className="d">{lista.length}</b><span>equipos vinculados</span></div>
                  <div className="ambient-health"><span className="health-good">{operativos} operativos</span><span className="health-maint">{mantenimiento} mantenimiento</span>{repotenciados > 0 && <span className="health-history">{repotenciados} repotenciados</span>}</div>
                  {lista.length > 0 && <div className="mini-map">{lista.map((e) => <button key={e.codigo} title={`${e.codigo} · ${e.estado}`} className={COLOR_ESTADO[e.estado]} onClick={(ev) => { ev.stopPropagation(); abrir(e.codigo) }} />)}</div>}
                  <small className="ambient-note">{alertas ? `${alertas} requieren atención` : lista.length ? 'Todos los equipos operativos' : 'Sin equipos registrados'}{incidencias > 0 ? ` · ${incidencias} tickets abiertos` : ''}{pendientes > 0 ? ` · ${pendientes} mantenimientos pendientes` : ''}</small>
                  {administrar && <div className="ambient-admin"><button className="enlace" onClick={(ev) => { ev.stopPropagation(); editarAmbiente(ambiente) }}>Editar</button><button className="enlace peligro" onClick={(ev) => { ev.stopPropagation(); eliminarAmbiente(ambiente) }}>Eliminar</button><button className="enlace" onClick={(ev) => { ev.stopPropagation(); agregarLote(ambiente) }}>+ Lote</button></div>}
                </article>
              })}
              {!ambientesVisibles.length && <div className="empty-state">{administrar ? 'Este piso todavía no tiene ambientes.' : 'Este piso no tiene ambientes con equipos registrados.'}</div>}
            </div>
            {ambienteId && ambientes.some((a) => a.id === ambienteId && a.pisoId === piso?.id) && (() => {
              const seleccionado = ambientes.find((a) => a.id === ambienteId)
              const lista = equiposDe(ambienteId)
              const laboratorio = laboratorios.find((l) => l.ambienteId === ambienteId)
              const abiertos = tickets.filter((t) => lista.some((e) => e.codigo === t.equipo) && !['Resuelto', 'Cerrado'].includes(t.estado)).length
              const pendientes = mants.filter((m) => lista.some((e) => e.codigo === m.codigo) && !['Completado', 'Cancelado'].includes(m.estado)).length
              const instalados = lista.filter((e) => e.posicion)
              const reservas = lista.filter((e) => !e.posicion || e.condicion === 'Reserva')
              const equipoSeleccionado = lista.find((e) => e.codigo === equipoMapa)
              return <section className="ambient-detail panel"><div className="ambient-detail-heading"><div><span className="eyebrow">{seleccionado.tipo} · {pabellon.codigo} · Piso {pisoNumero}</span><h2 className="d">{laboratorio?.nombre || seleccionado.nombre}</h2><p>{seleccionado.numero} · {pabellon.nombre} · {lista.length} equipos registrados{laboratorio?.capacidad ? ` · capacidad ${laboratorio.capacidad}` : ''}</p></div><button className="enlace" onClick={() => setAmbienteId(null)}>Cerrar detalle</button></div>{laboratorio && lista.length > laboratorio.capacidad && <div className="capacity-warning"><b>Capacidad superada</b><span>{lista.length} equipos vinculados para {laboratorio.capacidad} puestos registrados. Los excedentes se muestran como reserva o sin puesto; no se trasladó ni eliminó ningún registro.</span></div>}<div className="ambient-detail-stats"><span><b>{instalados.length}</b>Instalados con puesto</span><span><b>{reservas.length}</b>Reserva / sin puesto</span><span><b>{abiertos}</b>Tickets abiertos</span><span><b>{pendientes}</b>Mantenimientos pendientes</span></div><div className="map-legend"><span><i className="legend-swatch installed" /> Instalado</span><span><i className="legend-swatch reserve" /> Reserva / sin puesto</span><span><i className="legend-swatch front" /> Vista referencial, no plano oficial</span></div><div className="lab-map"><div className="lab-front">Pizarra / proyector · frente del laboratorio</div><div className="lab-seats">{lista.length ? lista.map((e) => <button key={e.codigo} className={'map-seat ' + COLOR_ESTADO[e.estado] + (!e.posicion ? ' reserve-seat' : '') + (equipoMapa === e.codigo ? ' selected' : '')} onClick={() => setEquipoMapa(e.codigo)}><strong>{e.posicion || '—'}</strong><small>{e.codigo}</small></button>) : <div className="empty-state">Este ambiente no tiene equipos vinculados.</div>}</div><div className="lab-aisle">Pasillo central · distribución referencial</div></div>{equipoSeleccionado && <div className="map-quick-view"><div><span className="eyebrow">PUESTO SELECCIONADO</span><h3>{equipoSeleccionado.codigo} · {equipoSeleccionado.posicion ? `Puesto ${equipoSeleccionado.posicion}` : 'Sin puesto asignado'}</h3><p>{equipoSeleccionado.marca || ''} {equipoSeleccionado.modelo} · {equipoSeleccionado.estado}{equipoSeleccionado.condicion === 'Reserva' ? ' · Reserva' : ''}</p></div><button className="btn p" onClick={() => abrir(equipoSeleccionado.codigo)}>Abrir ficha técnica</button></div>}<div className="ambient-detail-actions">{lista.slice(0, 5).map((e) => <button className="enlace" key={e.codigo} onClick={() => abrir(e.codigo)}>{e.codigo} · Ver ficha</button>)}{lista.length > 5 && <span className="nota">+{lista.length - 5} equipos disponibles en el mapa</span>}</div></section>
            })()}
            {administrar && ambienteId && <section className="assignment-panel panel"><div className="section-heading"><div><span className="eyebrow">GESTIÓN DE ASIGNACIÓN</span><h2 className="d">{ambientes.find((a) => a.id === ambienteId)?.nombre}</h2></div></div><div className="assignment-form"><select className="campo" value={equipoParaAsignar} onChange={(ev) => setEquipoParaAsignar(ev.target.value)}><option value="">Seleccionar equipo para asignar o trasladar</option>{equiposDisponibles.map((e) => <option key={e.codigo} value={e.codigo}>{e.codigo} · {e.modelo}{e.ambienteId ? ' · trasladar' : ''}</option>)}</select><button className="btn p" onClick={() => asignarEquipo(ambientes.find((a) => a.id === ambienteId))}>Asignar / trasladar</button></div><div className="assigned-list">{equiposDe(ambienteId).map((e) => <div key={e.codigo}><button className="enlace d codigo" onClick={() => abrir(e.codigo)}>{e.codigo}</button><span>{e.modelo} · {e.estado}</span><button className="enlace peligro" onClick={() => desvincularEquipo(e.codigo)}>Desvincular</button></div>)}</div></section>}
          </> : <div className="empty-state">No hay infraestructura disponible.</div>}
        </section>
      </div>
      {editor && <Modal titulo={editor.tipo === 'lote' ? 'Agregar computadoras en lote' : editor.tipo.includes('pabellon') ? 'Pabellón' : editor.tipo.includes('piso') ? 'Piso' : 'Ambiente'} cerrar={() => setEditor(null)} onSubmit={guardarEditor} accion={editor.tipo === 'lote' ? 'Agregar equipos' : 'Guardar'}>
        {(editor.tipo === 'pabellon' || editor.tipo === 'editar-pabellon') && <Campo label="Nombre del pabellón"><input className="campo" autoFocus required value={editor.nombre} onChange={(ev) => setEditor({ ...editor, nombre: ev.target.value })} /></Campo>}
        {editor.tipo === 'piso' && <Campo label="Número del piso"><input className="campo" type="number" min="1" value={editor.numero} onChange={(ev) => setEditor({ ...editor, numero: ev.target.value })} /></Campo>}
        {(editor.tipo === 'ambiente' || editor.tipo === 'editar-ambiente') && <><Campo label="Nombre del ambiente"><input className="campo" autoFocus required value={editor.nombre} onChange={(ev) => setEditor({ ...editor, nombre: ev.target.value })} /></Campo>{editor.tipo === 'ambiente' && <><Campo label="Número"><input className="campo" required value={editor.numero} onChange={(ev) => setEditor({ ...editor, numero: ev.target.value })} /></Campo><Campo label="Tipo"><select className="campo" value={editor.ambienteTipo} onChange={(ev) => setEditor({ ...editor, ambienteTipo: ev.target.value })}><option>Laboratorio</option><option>Aula</option><option>Oficina</option></select></Campo></>}</>}
        {editor.tipo === 'lote' && <Campo label="Cantidad de computadoras"><input className="campo" type="number" min="1" max="200" required value={editor.cantidad} onChange={(ev) => setEditor({ ...editor, cantidad: ev.target.value })} /></Campo>}
      </Modal>}
    </>
  )
}

function Titulo({ titulo, sub, children }) {
  return (
    <div className="titulo">
      <div><h1 className="d">{titulo}</h1><p>{sub}</p></div>
      <div className="acciones">{children}</div>
    </div>
  )
}

function Punto({ estado }) { return <i className={'punto ' + COLOR_ESTADO[estado]} aria-hidden="true" /> }

function Barras({ texto }) {
  // Código de barras dibujado a partir del texto (decorativo)
  const barras = []; let x = 0
  for (let i = 0; x < 216; i++) {
    const c = texto.charCodeAt(i % texto.length) + i * 7; const w = 1 + (c % 3)
    if (i % 2 === 0) barras.push(<rect key={i} x={x} width={w} height="26" />)
    x += w + ((c >> 2) % 2) + 1
  }
  return <svg className="barras" viewBox="0 0 221 26" aria-hidden="true">{barras}</svg>
}

function Etiqueta({ e, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className="etiqueta" onClick={onClick}>
      <span className="et-cab"><span>Universidad de Huánuco</span><span>Bien patrimonial</span></span>
      <span className="et-cuerpo">
        <span className="et-codigo d">{e.codigo}</span>
        <b>{e.modelo}</b>
        <span className="mute">{e.area}</span>
        <Barras texto={e.codigo + e.modelo} />
        <small className="mute">{e.procesador.replace('Intel Core ', '').replace('Intel ', '')} · {e.ram} GB · {e.disco}</small>
      </span>
      <span className="et-pie"><Punto estado={e.estado} />{e.estado}</span>
    </Tag>
  )
}

function Inventario({ equipos, infraestructura, abrir, nuevo, masivo, traslado, qrLote }) {
  const [q, setQ] = useState(''); const [area, setArea] = useState('Todas'); const [estado, setEstado] = useState('Todos')
  const [pabellon, setPabellon] = useState('Todos'); const [piso, setPiso] = useState('Todos'); const [laboratorio, setLaboratorio] = useState('Todos')
  const [seleccionados, setSeleccionados] = useState([]); const [pagina, setPagina] = useState(1); const [vista, setVista] = useState('tabla'); const [orden, setOrden] = useState({ campo: 'codigo', direccion: 'asc' }); const porPagina = 50
  const ubicacion = (e) => { const pab = infraestructura.pabellones.find((p) => p.id === e.pabellonId); const pisoItem = infraestructura.pisos.find((p) => p.id === e.pisoId); const ambiente = infraestructura.ambientes.find((a) => a.id === e.ambienteId); const lab = infraestructura.laboratorios.find((l) => l.id === e.laboratorioId); return { pabellon: pab?.nombre || 'Sin pabellón', piso: pisoItem?.numero ? `Piso ${pisoItem.numero}` : 'Sin piso', ambiente: lab?.nombre || ambiente?.nombre || e.area || 'Sin ambiente' } }
  const lista = equipos.filter((e) => { const lugar = ubicacion(e); return (area === 'Todas' || e.area === area) && (estado === 'Todos' || e.estado === estado) && (pabellon === 'Todos' || lugar.pabellon === pabellon) && (piso === 'Todos' || lugar.piso === `Piso ${piso}`) && (laboratorio === 'Todos' || lugar.ambiente === laboratorio) && (e.codigo + ' ' + e.marca + ' ' + e.modelo + ' ' + e.serie + ' ' + lugar.ambiente).toLowerCase().includes(q.toLowerCase()) })
  const ordenada = [...lista].sort((a, b) => { const campoA = orden.campo === 'ubicacion' ? ubicacion(a).ambiente : a[orden.campo]; const campoB = orden.campo === 'ubicacion' ? ubicacion(b).ambiente : b[orden.campo]; const comparacion = String(campoA ?? '').localeCompare(String(campoB ?? ''), 'es', { numeric: true, sensitivity: 'base' }); return orden.direccion === 'asc' ? comparacion : -comparacion })
  const paginas = Math.max(1, Math.ceil(ordenada.length / porPagina)); const listaVisible = ordenada.slice((pagina - 1) * porPagina, pagina * porPagina); const seleccionadosPagina = listaVisible.filter((e) => seleccionados.includes(e.codigo)).length
  const cambiarFiltro = (setter) => (ev) => { setter(ev.target.value); setPagina(1) }; const cuenta = (f) => equipos.filter(f).length
  const ordenar = (campo) => setOrden((actual) => actual.campo === campo ? { campo, direccion: actual.direccion === 'asc' ? 'desc' : 'asc' } : { campo, direccion: 'asc' })
  const alternar = (codigo) => setSeleccionados((actual) => actual.includes(codigo) ? actual.filter((c) => c !== codigo) : [...actual, codigo])
  const seleccionarPagina = () => setSeleccionados((actual) => seleccionadosPagina === listaVisible.length ? actual.filter((codigo) => !listaVisible.some((e) => e.codigo === codigo)) : [...new Set([...actual, ...listaVisible.map((e) => e.codigo)])])
  const filas = (origen) => origen.map((e) => { const lugar = ubicacion(e); return [e.codigo, e.tipo, `${e.marca || ''} ${e.modelo || ''}`.trim(), lugar.pabellon, lugar.piso, lugar.ambiente, e.procesador, `${e.ram || 0} GB`, e.estado] })
  const exportarFiltrados = () => exportarXLSX('inventario-filtrado', ['Código', 'Tipo', 'Marca y modelo', 'Pabellón', 'Piso', 'Ambiente', 'Procesador', 'RAM', 'Estado'], filas(ordenada))
  return <>
    <Titulo titulo="Inventario de equipos" sub={`${equipos.length} equipos registrados · ${lista.length} visibles con los filtros actuales.`}>
      <div className="view-switcher" role="group" aria-label="Vista de inventario">{[['tabla', 'Tabla'], ['tarjetas', 'Tarjetas'], ['etiquetas', 'Etiquetas']].map(([id, label]) => <button key={id} className={vista === id ? 'active' : ''} onClick={() => setVista(id)}>{label}</button>)}</div>
      <button className="btn" onClick={exportarFiltrados}>Excel filtrado</button><button className="btn" onClick={() => exportarCSV('inventario', [['Código', 'Tipo', 'Marca y modelo', 'Pabellón', 'Piso', 'Ambiente', 'Procesador', 'RAM', 'Estado'], ...filas(ordenada)])}>CSV</button><button className="btn" onClick={() => exportarPDF('inventario', 'Inventario general', ['Código', 'Tipo', 'Modelo', 'Pabellón', 'Piso', 'Ambiente', 'RAM', 'Estado'], filas(ordenada).map((fila) => [fila[0], fila[1], fila[2], fila[3], fila[4], fila[5], fila[7], fila[8]]))}>PDF</button>{qrLote && <button className="btn" onClick={qrLote}>Etiquetas QR</button>}{nuevo && <button className="btn p" onClick={nuevo}>Registrar equipo</button>}
    </Titulo>
    {seleccionados.length > 0 && <div className="bulk-toolbar"><b>{seleccionados.length} seleccionados</b><span className="bulk-summary">Las operaciones afectarán únicamente estos equipos.</span><button className="btn p" onClick={() => masivo?.(seleccionados)}>Actualizar en lote</button><button className="btn" onClick={() => traslado?.(seleccionados)}>Trasladar selección</button><button className="btn" onClick={() => exportarXLSX('inventario-seleccionado', ['Código', 'Tipo', 'Modelo', 'Ambiente', 'RAM', 'Estado'], filas(equipos.filter((e) => seleccionados.includes(e.codigo))).map((fila) => [fila[0], fila[1], fila[2], fila[5], fila[7], fila[8]]))}>Exportar selección</button><button className="btn" onClick={() => setSeleccionados([])}>Limpiar</button></div>}
    <div className="inventory-toolbar panel"><div className="inventory-search"><label className="sr" htmlFor="buscar">Buscar</label><span>⌕</span><input id="buscar" className="campo" placeholder="Buscar por código, serie, marca, modelo o ambiente" value={q} onChange={(ev) => { setQ(ev.target.value); setPagina(1) }} /></div><label className="lbl">Pabellón<select className="campo" value={pabellon} onChange={cambiarFiltro(setPabellon)}><option>Todos</option>{infraestructura.pabellones.map((p) => <option key={p.id}>{p.nombre}</option>)}</select></label><label className="lbl">Piso<select className="campo" value={piso} onChange={cambiarFiltro(setPiso)}><option>Todos</option>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label><label className="lbl">Laboratorio<select className="campo" value={laboratorio} onChange={cambiarFiltro(setLaboratorio)}><option>Todos</option>{infraestructura.laboratorios.map((l) => <option key={l.id}>{l.nombre}</option>)}</select></label><label className="lbl">Estado<select className="campo" value={estado} onChange={cambiarFiltro(setEstado)}><option>Todos</option>{ESTADOS.map((s) => <option key={s}>{s}</option>)}</select></label></div>
    <div className="inventory-layout"><aside className="filtros inventory-summary"><span className="eyebrow">RESUMEN DE INVENTARIO</span><h2 className="d">{lista.length} visibles</h2><p className="nota">Filtros combinados activos. Los equipos no se duplican al cambiar de vista.</p><h3>Áreas</h3>{['Todas', ...AREAS.map((a) => a.nombre)].map((a) => <button key={a} className={'filtro' + (area === a ? ' on' : '')} onClick={() => { setArea(a); setPagina(1) }}><span>{a}</span><span className="d n">{a === 'Todas' ? equipos.length : cuenta((e) => e.area === a)}</span></button>)}<h3>Estado actual</h3>{['Todos', ...ESTADOS].map((s) => <button key={s} className={'filtro' + (estado === s ? ' on' : '')} onClick={() => { setEstado(s); setPagina(1) }}><span className="fila">{s !== 'Todos' && <Punto estado={s} />}{s}</span><span className="d n">{s === 'Todos' ? equipos.length : cuenta((e) => e.estado === s)}</span></button>)}</aside><section className="inventory-content">{vista === 'tabla' && <div className="inventory-table-wrap panel"><table className="inventory-table"><thead><tr><th><input type="checkbox" checked={listaVisible.length > 0 && seleccionadosPagina === listaVisible.length} onChange={seleccionarPagina} aria-label="Seleccionar equipos visibles" /></th>{[['codigo', 'Código'], ['modelo', 'Equipo'], ['ubicacion', 'Ubicación'], ['procesador', 'Procesador'], ['ram', 'RAM'], ['estado', 'Estado']].map(([campo, label]) => <th key={campo}><button className="sort-button" onClick={() => ordenar(campo)}>{label}<span>{orden.campo === campo ? (orden.direccion === 'asc' ? '↑' : '↓') : '↕'}</span></button></th>)}<th>Acciones</th></tr></thead><tbody>{listaVisible.map((e) => { const lugar = ubicacion(e); return <tr key={e.codigo}><td><input type="checkbox" checked={seleccionados.includes(e.codigo)} onChange={() => alternar(e.codigo)} aria-label={`Seleccionar ${e.codigo}`} /></td><td><button className="link-code" onClick={() => abrir(e.codigo)}>{e.codigo}</button><small>{e.serie || 'Sin serie'}</small></td><td><b>{e.marca || '—'} {e.modelo || ''}</b><small>{e.tipo}</small></td><td><b>{lugar.pabellon}</b><small>{lugar.piso} · {lugar.ambiente}</small></td><td>{e.procesador || '—'}</td><td>{e.ram ? `${e.ram} GB` : '—'}</td><td><span className={'table-status ' + COLOR_ESTADO[e.estado]}><Punto estado={e.estado} />{e.estado}</span>{e.estado === 'Repotenciado' && <small className="status-context">Antecedente de hardware</small>}</td><td><button className="enlace" onClick={() => abrir(e.codigo)}>Ficha</button></td></tr> })}</tbody></table>{!lista.length && <div className="empty-state">Ningún equipo coincide con los filtros actuales.</div>}</div>}{vista === 'tarjetas' && <div className="inventory-card-grid">{listaVisible.map((e) => { const lugar = ubicacion(e); return <article className="equipment-card panel" key={e.codigo}><div className="equipment-card-head"><input type="checkbox" checked={seleccionados.includes(e.codigo)} onChange={() => alternar(e.codigo)} aria-label={`Seleccionar ${e.codigo}`} /><button className="link-code" onClick={() => abrir(e.codigo)}>{e.codigo}</button><span className={'table-status ' + COLOR_ESTADO[e.estado]}><Punto estado={e.estado} />{e.estado}</span></div><h3>{e.marca || ''} {e.modelo || 'Equipo sin modelo'}</h3><p>{lugar.pabellon} · {lugar.piso} · {lugar.ambiente}</p><div className="equipment-specs"><span><b>CPU</b>{e.procesador || '—'}</span><span><b>RAM</b>{e.ram || 0} GB</span><span><b>Disco</b>{e.disco || '—'}</span></div><button className="btn small-btn" onClick={() => abrir(e.codigo)}>Abrir ficha técnica</button></article> })}{!lista.length && <div className="empty-state">Ningún equipo coincide con los filtros actuales.</div>}</div>}{vista === 'etiquetas' && <div className="labels-grid">{listaVisible.map((e) => <div className="inventario-item" key={e.codigo}><label className="select-equipo"><input type="checkbox" checked={seleccionados.includes(e.codigo)} onChange={() => alternar(e.codigo)} aria-label={`Seleccionar ${e.codigo}`} /><span /></label><Etiqueta e={e} onClick={() => abrir(e.codigo)} /></div>)}{!lista.length && <div className="empty-state">Ningún equipo coincide con los filtros actuales.</div>}</div>}{lista.length > 0 && <div className="pagination ancho"><span>Mostrando {(pagina - 1) * porPagina + 1}–{Math.min(pagina * porPagina, lista.length)} de {lista.length}</span><button className="btn" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</button><b>Página {pagina} de {paginas}</b><button className="btn" disabled={pagina === paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</button></div>}</section></div>
  </>
}

function Ficha({ e, infraestructura, mants, tickets, cambios, historial, volver, cambiarEstado, nuevoMant, nuevoCambio, nuevoTicket, editar }) {
  const [pestana, setPestana] = useState('general')
  const [editando, setEditando] = useState(false)
  const resp = e.responsable || AREAS.find((a) => a.nombre === e.area)?.responsable || 'Por asignar'
  const pabellon = infraestructura.pabellones.find((p) => p.id === e.pabellonId)?.nombre || 'No asignado'
  const piso = infraestructura.pisos.find((p) => p.id === e.pisoId)?.numero || '—'
  const ambiente = infraestructura.ambientes.find((a) => a.id === e.ambienteId)?.nombre || e.area || 'No asignado'
  const ultimoMant = [...mants].sort((a, b) => (b.fechaEjecucion || b.fecha || '').localeCompare(a.fechaEjecucion || a.fecha || ''))[0]
  const eventos = [...historial, ...mants.map((m) => ({ id: `m-${m.id}`, fecha: m.fechaEjecucion || m.fecha, accion: `Mantenimiento ${m.tipo.toLowerCase()}`, usuario: m.tecnico, detalle: m.descripcion })), ...cambios.map((c) => ({ id: `c-${c.id}`, fecha: c.fecha, accion: 'Repotenciación', usuario: c.motivo, detalle: `${c.componente}: ${c.anterior} → ${c.nuevo}` })), ...tickets.map((t) => ({ id: `t-${t.id}`, fecha: t.fecha, accion: `Incidencia ${t.estado.toLowerCase()}`, usuario: t.tecnico || t.reportadoPor, detalle: t.descripcion }))].sort((a, b) => b.fecha.localeCompare(a.fecha))
  const proximoMant = mants.find((m) => !['Completado', 'Cancelado'].includes(m.estado) && (m.fechaProgramada || m.fecha))
  const estadoContexto = e.estado === 'Repotenciado' ? 'Repotenciación registrada como antecedente; revisar estado operativo actual.' : e.estado
  return (
    <>
      <button className="enlace volver" onClick={volver}>← Volver al inventario</button>
      <div className="detail-tabs">{[['general', 'Información general'], ['hardware', 'Hardware'], ['mants', 'Mantenimientos'], ['tickets', 'Incidencias'], ['cambios', 'Repotenciaciones'], ['historial', 'Historial']].map(([id, label]) => <button key={id} className={pestana === id ? 'on' : ''} onClick={() => setPestana(id)}>{label}</button>)}</div>
      <section className="ficha-hero panel"><div className="ficha-identity"><span className="ficha-device-icon">▦</span><div><span className="eyebrow">FICHA TÉCNICA · INVENTARIO UDH</span><h1 className="d">{e.codigo}</h1><p>{e.marca || ''} {e.modelo} · {e.tipo} · {ambiente}{e.posicion ? ` · puesto ${e.posicion}` : ' · sin puesto asignado'}</p></div></div><div className="ficha-hero-state"><span className={'table-status ' + COLOR_ESTADO[e.estado]}><Punto estado={e.estado} />{e.estado}</span>{e.condicion && <small>{e.condicion}</small>}</div><div className="ficha-actions"><button className="btn" onClick={() => window.print()}>Imprimir ficha</button>{editar && <button className="btn" onClick={() => setEditando(true)}>Editar ficha</button>}{nuevoCambio && <button className="btn" onClick={nuevoCambio}>Repotenciación</button>}{nuevoMant && <button className="btn p" onClick={nuevoMant}>Mantenimiento</button>}{nuevoTicket && <button className="btn danger-btn" onClick={nuevoTicket}>Reportar incidencia</button>}</div></section>
      <div className="ficha-kpis"><div className="panel"><span>Procesador</span><b>{e.procesador || '—'}</b></div><div className="panel"><span>Memoria</span><b>{e.ram || 0} GB RAM</b></div><div className="panel"><span>Almacenamiento</span><b>{e.disco || '—'}</b></div><div className="panel"><span>Soporte</span><b>{mants.length} mantenimientos · {tickets.length} tickets</b></div></div>
      <div className="ficha-workspace"><aside className="ficha-rail"><div className="panel"><span className="eyebrow">IDENTIFICACIÓN</span><Dato k="Código patrimonial" v={e.codigo} /><Dato k="N.º de serie" v={e.serie || 'No registrado'} /><Dato k="Adquirido" v={e.adquisicion ? fecha(e.adquisicion) : 'No registrado'} /><Dato k="Garantía" v={e.garantiaHasta ? fecha(e.garantiaHasta) : 'No registrada'} /></div><QRLabel e={e} infraestructura={infraestructura} /></aside><div className="ficha-content-wide">
        {pestana === 'general' && <div className="ficha-section-grid"><div className="panel"><span className="eyebrow">UBICACIÓN FÍSICA</span><h2 className="d">Dónde está el equipo</h2><div className="specs"><Dato k="Pabellón" v={pabellon} /><Dato k="Piso" v={piso} /><Dato k="Ambiente" v={ambiente} /><Dato k="Puesto" v={e.posicion || 'Sin asignar'} /><Dato k="Responsable" v={resp} /><Dato k="Condición" v={e.condicion || (e.posicion ? 'Instalado' : 'Reserva')} /></div></div><div className="panel"><span className="eyebrow">ESTADO Y CONTINUIDAD</span><h2 className="d">Situación operativa</h2><div className="specs"><Dato k="Estado operativo" v={e.estado} /><Dato k="Último mantenimiento" v={ultimoMant ? fecha(ultimoMant.fechaEjecucion || ultimoMant.fecha) : 'Sin registro'} /><Dato k="Próximo mantenimiento" v={proximoMant ? fecha(proximoMant.fechaProgramada || proximoMant.fecha) : 'No programado'} /><Dato k="Incidencias asociadas" v={tickets.length} /></div><p className="nota">{estadoContexto}</p>{cambiarEstado && <label className="dato"><span className="mute">Cambiar estado operativo</span><select className="campo" value={e.estado} onChange={(ev) => cambiarEstado(e.codigo, ev.target.value)}>{ESTADOS.map((s) => <option key={s}>{s}</option>)}</select></label>}</div></div>}
        {pestana === 'hardware' && <div className="panel ficha-hardware"><span className="eyebrow">CONFIGURACIÓN REGISTRADA</span><h2 className="d">Características técnicas</h2><div className="specs">{[['Procesador', e.procesador], ['Memoria RAM', e.ram ? `${e.ram} GB` : 'No registrada'], ['Almacenamiento', e.disco], ['Tarjeta gráfica', e.video || 'Integrada'], ['Sistema operativo', e.so], ['Dirección IP', e.ip || 'No registrada'], ['Marca / modelo', `${e.marca || '—'} ${e.modelo || ''}`], ['Tipo de equipo', e.tipo]].map(([k, v]) => <Dato key={k} k={k} v={v || 'No registrado'} />)}</div>{cambios.length > 0 && <div className="hardware-history"><h3>Antecedentes de repotenciación</h3>{cambios.slice(0, 4).map((c) => <div className="cambio" key={c.id}><b>{c.componente}</b><s className="mute">{c.anterior}</s><span className="nuevo">{c.nuevo}</span><span className="mute">{c.fecha && fecha(c.fecha)}</span></div>)}</div>}</div>}
        {pestana === 'mants' && <div className="panel"><div className="section-heading"><div><span className="eyebrow">ORDENES DE SERVICIO</span><h2 className="d">Mantenimientos</h2></div>{nuevoMant && <button className="enlace" onClick={nuevoMant}>+ Registrar</button>}</div>{mants.length ? mants.map((m) => <div className="record-row" key={m.id}><b>{m.tipo}</b><span>{m.descripcion}</span><em>{m.estado} · {fecha(m.fechaProgramada || m.fecha)}</em></div>) : <p className="mute">Sin mantenimientos registrados.</p>}</div>}
        {pestana === 'tickets' && <div className="panel"><div className="section-heading"><div><span className="eyebrow">SOPORTE TÉCNICO</span><h2 className="d">Incidencias del equipo</h2></div>{nuevoTicket && <button className="enlace" onClick={nuevoTicket}>+ Reportar</button>}</div>{tickets.length ? tickets.map((t) => <div className="record-row" key={t.id}><b>{t.codigo} · {t.prioridad}</b><span>{t.descripcion}</span><em>{t.estado}</em></div>) : <p className="mute">Sin incidencias registradas.</p>}</div>}
        {pestana === 'cambios' && <div className="panel"><span className="eyebrow">HISTORIAL DE HARDWARE</span><h2 className="d">Repotenciaciones</h2>{cambios.length ? cambios.map((c) => <div key={c.id} className="cambio"><b>{c.componente}</b><s className="mute">{c.anterior}</s><span className="nuevo">{c.nuevo}</span><span className="mute">{c.fecha && fecha(c.fecha)}</span></div>) : <p className="mute">Este equipo conserva su hardware original.</p>}</div>}
        {pestana === 'historial' && <div className="panel historial"><span className="eyebrow">AUDITORÍA DEL EQUIPO</span><h2 className="d">Historial de trazabilidad</h2>{eventos.length ? <ol className="linea">{eventos.map((h) => <li key={h.id}><i className="marca-t i" aria-hidden="true" /><b>{fecha(h.fecha)} · {h.accion}</b><span>{h.detalle}</span><small className="mute">{h.usuario || 'Sistema'}</small></li>)}</ol> : <p className="mute">Sin eventos registrados.</p>}</div>}
      </div></div>
      {editando && <FormEditarEquipo equipo={e} cerrar={() => setEditando(false)} guardar={(c) => { editar(c); setEditando(false) }} />}
    </>
  )
}

function Dato({ k, v }) { return <div className="dato"><span className="mute">{k}</span><b>{v}</b></div> }

function QRLabel({ e, infraestructura }) {
  const [src, setSrc] = useState('')
  useEffect(() => { let activo = true; QRCode.toDataURL(urlEquipo(e.codigo), { width: 180, margin: 1, errorCorrectionLevel: 'M' }).then((imagen) => activo && setSrc(imagen)).catch(() => {}); return () => { activo = false } }, [e.codigo])
  const laboratorio = infraestructura.laboratorios.find((l) => l.id === e.laboratorioId)?.nombre || 'Equipo institucional'
  return <div className="qr-label"><div className="qr-preview">{src ? <img src={src} alt={`Código QR de ${e.codigo}`} /> : <span>Generando QR…</span>}</div><div><b>COMPUCONTROL UDH</b><strong>{e.codigo}</strong><span>{laboratorio} · puesto {e.posicion || '—'}</span><small>QR local · no contiene credenciales</small></div></div>
}

function Mantenimientos({ mants, equipos, infraestructura, abrir, completar, nuevo, masivo }) {
  const [tec, setTec] = useState('Todos')
  const [vista, setVista] = useState('lista')
  const ayuda = { Preventivo: 'Limpieza y revisión programada', Correctivo: 'Reparación de una falla reportada', Predictivo: 'Revisión de indicadores antes de una falla', Diagnóstico: 'Evaluación técnica de un equipo' }
  const lista = mants.filter((m) => tec === 'Todos' || m.tecnico === tec)
  return (
    <>
      <Titulo titulo="Mantenimientos" sub={`${mants.length} órdenes de servicio, agrupadas por tipo de mantenimiento.`}>
        <label className="sr" htmlFor="tec">Técnico</label>
        <select id="tec" className="campo corto" value={tec} onChange={(ev) => setTec(ev.target.value)}><option>Todos</option>{TECNICOS.map((t) => <option key={t}>{t}</option>)}</select>
        <button className={'btn ' + (vista === 'calendario' ? 'p' : '')} onClick={() => setVista(vista === 'lista' ? 'calendario' : 'lista')}>{vista === 'lista' ? 'Ver calendario' : 'Ver lista'}</button>
        <button className="btn" onClick={() => exportarXLSX('mantenimientos', ['Fecha programada', 'Equipo', 'Área', 'Tipo', 'Trabajo', 'Técnico', 'Estado'], lista.map((m) => [m.fechaProgramada || m.fecha, m.codigo, equipos.find((e) => e.codigo === m.codigo)?.area, m.tipo, m.descripcion, m.tecnico, m.estado]))}>Excel XLSX</button>
        <button className="btn" onClick={() => exportarPDF('mantenimientos', 'Mantenimientos', ['Fecha', 'Equipo', 'Área', 'Tipo', 'Técnico', 'Estado'], lista.map((m) => [m.fechaProgramada || m.fecha, m.codigo, equipos.find((e) => e.codigo === m.codigo)?.area, m.tipo, m.tecnico, m.estado]))}>PDF</button>
        {nuevo && <button className="btn p" onClick={nuevo}>Nueva orden de servicio</button>}
        {masivo && <button className="btn p" onClick={masivo}>Programar por laboratorio</button>}
      </Titulo>
      {vista === 'calendario' ? <CalendarioMantenimientos mants={mants} equipos={equipos} infraestructura={infraestructura} abrir={abrir} /> : <div className="carriles">
        {TIPOS_MANT.map((t) => {
          const ordenes = lista.filter((m) => m.tipo === t).sort((a, b) => b.fecha.localeCompare(a.fecha))
          return (
            <section key={t} className="carril">
              <div className="carril-cab"><div><h2 className="d">{t}</h2><span className="mute">{ayuda[t]}</span></div><span className="d grande">{ordenes.length}</span></div>
              {ordenes.map((m) => (
                <article key={m.id} className="orden">
                  <div className="fila sep"><button className="enlace d codigo" onClick={() => abrir(m.codigo)}>{m.codigo}</button><span className="d mute">{fecha(m.fecha)}</span></div>
                  <p>{m.descripcion}</p>
                  <div className="fila sep">
                    <span className="fila"><i className={'cuadro ' + (m.estado === 'Completado' ? 'g' : m.estado === 'En proceso' ? 'y' : 'b')} aria-hidden="true" /><small className="mute">{m.estado} · {m.tecnico}</small></span>
                    {completar && m.estado !== 'Completado' && <button className="enlace" onClick={() => completar(m.id)}>Marcar completado</button>}
                  </div>
                </article>
              ))}
            </section>
          )
        })}
      </div>}
    </>
  )
}

function CalendarioMantenimientos({ mants, equipos: _equipos, infraestructura: _infraestructura, abrir }) {
  const [mes, setMes] = useState(new Date().getMonth())
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [vista, setVista] = useState('mes')
  const [tecnico, setTecnico] = useState('Todos')
  const [estado, setEstado] = useState('Todos')
  const lista = mants.filter((m) => (tecnico === 'Todos' || m.tecnico === tecnico) && (estado === 'Todos' || m.estado === estado))
  const inicio = new Date(anio, mes, 1).getDay()
  const dias = new Date(anio, mes + 1, 0).getDate()
  const mover = (delta) => { const d = new Date(anio, mes + delta, 1); setMes(d.getMonth()); setAnio(d.getFullYear()) }
  const porDia = (dia) => lista.filter((m) => { const d = new Date((m.fechaProgramada || m.fecha) + 'T00:00:00'); return d.getFullYear() === anio && d.getMonth() === mes && d.getDate() === dia })
  const semana = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d })
  const eventos = (dia) => lista.filter((m) => (m.fechaProgramada || m.fecha) === dia.toISOString().slice(0, 10))
  return <section className="calendar-shell"><div className="calendar-toolbar"><div><button className="btn" onClick={() => mover(-1)}>←</button><button className="btn" onClick={() => setMes(new Date().getMonth())}>Hoy</button><button className="btn" onClick={() => mover(1)}>→</button><h2 className="d">{vista === 'mes' ? new Date(anio, mes).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' }) : 'Próximos 7 días'}</h2></div><div className="acciones"><button className={'btn ' + (vista === 'mes' ? 'p' : '')} onClick={() => setVista('mes')}>Mes</button><button className={'btn ' + (vista === 'semana' ? 'p' : '')} onClick={() => setVista('semana')}>Semana</button><select className="campo corto" value={tecnico} onChange={(ev) => setTecnico(ev.target.value)}><option>Todos</option>{TECNICOS.map((t) => <option key={t}>{t}</option>)}</select><select className="campo corto" value={estado} onChange={(ev) => setEstado(ev.target.value)}><option>Todos</option>{ESTADOS_MANT.map((s) => <option key={s}>{s}</option>)}</select></div></div>{vista === 'mes' ? <div className="calendar-grid">{['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d) => <b key={d}>{d}</b>)}{Array.from({ length: inicio }, (_, i) => <span className="calendar-empty" key={'e' + i} />)}{Array.from({ length: dias }, (_, i) => { const dia = i + 1; const actividades = porDia(dia); return <div className="calendar-day" key={dia}><strong>{dia}</strong>{actividades.map((m) => <button key={m.id} className={'calendar-event ' + (m.estado === 'Completado' ? 'done' : (m.fechaProgramada || m.fecha) < hoy() ? 'late' : '')} onClick={() => abrir(m.codigo)} title={m.descripcion}>{m.codigo}<small>{m.tipo} · {m.tecnico}</small></button>)}</div> })}</div> : <div className="calendar-week">{semana.map((dia) => <div className="calendar-week-day" key={dia.toISOString()}><strong>{dia.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'short' })}</strong>{eventos(dia).map((m) => <button key={m.id} className={'calendar-event ' + (m.estado === 'Completado' ? 'done' : (m.fechaProgramada || m.fecha) < hoy() ? 'late' : '')} onClick={() => abrir(m.codigo)}>{m.codigo}<small>{m.tipo} · {m.tecnico}</small></button>)}{!eventos(dia).length && <span className="calendar-no-event">Sin actividades</span>}</div>)}</div>}</section>
}

function MantenimientoMasivo({ equipos, infraestructura, cerrar, guardar }) {
  const laboratorios = infraestructura.laboratorios
  const [laboratorioId, setLaboratorioId] = useState(laboratorios[0]?.id || '')
  const [seleccionados, setSeleccionados] = useState([])
  const [tipo, setTipo] = useState('Preventivo')
  const [tecnico, setTecnico] = useState(TECNICOS[0])
  const [fechaProgramada, setFechaProgramada] = useState(hoy())
  const [observaciones, setObservaciones] = useState('')
  const equiposLab = equipos.filter((e) => e.laboratorioId === laboratorioId)
  const todos = equiposLab.length > 0 && seleccionados.length === equiposLab.length
  const cambiarLab = (id) => { setLaboratorioId(id); setSeleccionados([]) }
  const alternar = (codigo) => setSeleccionados((actual) => actual.includes(codigo) ? actual.filter((c) => c !== codigo) : [...actual, codigo])
  return <Modal titulo="Programar mantenimiento por laboratorio" cerrar={cerrar} onSubmit={() => guardar({ codigos: seleccionados, tipo, tecnico, fechaProgramada, observaciones })} accion={`Programar ${seleccionados.length} equipos`}>
    <Campo label="Laboratorio" ancho><select className="campo" value={laboratorioId} onChange={(ev) => cambiarLab(ev.target.value)}>{laboratorios.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></Campo>
    <div className="mass-summary ancho"><b className="d">{seleccionados.length}</b><span>equipos seleccionados de {equiposLab.length}</span><button type="button" className="enlace" onClick={() => setSeleccionados(todos ? [] : equiposLab.map((e) => e.codigo))}>{todos ? 'Deseleccionar todos' : 'Seleccionar todos'}</button></div>
    <div className="mass-equipment-list ancho">{equiposLab.map((e) => <label key={e.codigo} className="mass-equipment"><input type="checkbox" checked={seleccionados.includes(e.codigo)} onChange={() => alternar(e.codigo)} /><span><b>{e.codigo}</b><small>{e.modelo} · puesto {e.posicion || '—'}</small></span><em className={COLOR_ESTADO[e.estado]}>{e.estado}</em></label>)}</div>
    <Campo label="Tipo"><select className="campo" value={tipo} onChange={(ev) => setTipo(ev.target.value)}>{TIPOS_MANT.map((t) => <option key={t}>{t}</option>)}</select></Campo><Campo label="Técnico"><select className="campo" value={tecnico} onChange={(ev) => setTecnico(ev.target.value)}>{TECNICOS.map((t) => <option key={t}>{t}</option>)}</select></Campo><Campo label="Fecha programada"><input className="campo" type="date" value={fechaProgramada} onChange={(ev) => setFechaProgramada(ev.target.value)} /></Campo><Campo label="Observaciones" ancho><textarea className="campo" rows="2" value={observaciones} onChange={(ev) => setObservaciones(ev.target.value)} /></Campo>
  </Modal>
}

function Tickets({ tickets, equipos, infraestructura, actualizar, nuevo, abrir }) {
  const [filtro, setFiltro] = useState('Todos')
  const [prioridad, setPrioridad] = useState('Todas')
  const [tecnico, setTecnico] = useState('Todos'); const [pabellon, setPabellon] = useState('Todos'); const [piso, setPiso] = useState('Todos'); const [laboratorio, setLaboratorio] = useState('Todos'); const [busqueda, setBusqueda] = useState('')
  const ubicacion = (e) => ({ pabellon: infraestructura.pabellones.find((p) => p.id === e?.pabellonId)?.nombre, piso: infraestructura.pisos.find((p) => p.id === e?.pisoId)?.numero, laboratorio: infraestructura.laboratorios.find((l) => l.id === e?.laboratorioId)?.nombre })
  const lista = tickets.filter((t) => { const e = equipos.find((item) => item.codigo === t.equipo); const u = ubicacion(e); return (filtro === 'Todos' || t.estado === filtro) && (prioridad === 'Todas' || t.prioridad === prioridad) && (tecnico === 'Todos' || t.tecnico === tecnico) && (pabellon === 'Todos' || u.pabellon === pabellon) && (piso === 'Todos' || String(u.piso) === piso) && (laboratorio === 'Todos' || u.laboratorio === laboratorio) && (t.codigo + ' ' + t.equipo + ' ' + t.descripcion).toLowerCase().includes(busqueda.toLowerCase()) })
  const cambiarEstado = (ticket, estado) => actualizar?.({ ...ticket, estado })
  const duplicados = (equipo) => tickets.filter((t) => t.equipo === equipo && !['Resuelto', 'Cerrado'].includes(t.estado)).length
  return <>
    <Titulo titulo="Incidencias y tickets" sub={`${tickets.length} incidencias registradas. Control de soporte técnico por equipo y ubicación.`}>
      <select className="campo corto" value={filtro} onChange={(ev) => setFiltro(ev.target.value)}><option>Todos</option>{ESTADOS_TICKET.map((s) => <option key={s}>{s}</option>)}</select>
      <select className="campo corto" value={prioridad} onChange={(ev) => setPrioridad(ev.target.value)}><option>Todas</option>{PRIORIDADES_TICKET.map((p) => <option key={p}>{p}</option>)}</select>
      <button className="btn" onClick={() => exportarXLSX('tickets', ['Ticket', 'Equipo', 'Tipo', 'Prioridad', 'Fecha', 'Técnico', 'Estado'], lista.map((t) => [t.codigo, t.equipo, t.tipo, t.prioridad, t.fecha, t.tecnico, t.estado]))}>Excel XLSX</button>
      <button className="btn" onClick={() => exportarPDF('tickets', 'Tickets de soporte', ['Ticket', 'Equipo', 'Tipo', 'Prioridad', 'Fecha', 'Estado'], lista.map((t) => [t.codigo, t.equipo, t.tipo, t.prioridad, t.fecha, t.estado]))}>PDF</button>
      {nuevo && <button className="btn p" onClick={nuevo}>Nueva incidencia</button>}
    </Titulo>
    <div className="ticket-filters"><input className="campo" placeholder="Buscar equipo, ticket o descripción" value={busqueda} onChange={(ev) => setBusqueda(ev.target.value)} /><select className="campo" value={pabellon} onChange={(ev) => setPabellon(ev.target.value)}><option>Todos</option>{infraestructura.pabellones.map((p) => <option key={p.id}>{p.nombre}</option>)}</select><select className="campo" value={piso} onChange={(ev) => setPiso(ev.target.value)}><option>Todos</option>{[1, 2, 3, 4, 5].map((p) => <option key={p}>{p}</option>)}</select><select className="campo" value={laboratorio} onChange={(ev) => setLaboratorio(ev.target.value)}><option>Todos</option>{infraestructura.laboratorios.map((l) => <option key={l.id}>{l.nombre}</option>)}</select><select className="campo" value={tecnico} onChange={(ev) => setTecnico(ev.target.value)}><option>Todos</option>{TECNICOS.map((t) => <option key={t}>{t}</option>)}</select></div>
    <div className="ticket-grid">{lista.map((t) => { const e = equipos.find((item) => item.codigo === t.equipo); return <article className={'ticket-card priority-' + t.prioridad.toLowerCase()} key={t.id}><div className="ticket-head"><span className="ticket-code">{t.codigo}</span><span className="ticket-priority">{t.prioridad}</span></div><button className="enlace d codigo" onClick={() => abrir(t.equipo)}>{t.equipo}</button><small className="mute">{e?.area || 'Ubicación no asignada'} · {t.fecha}</small>{duplicados(t.equipo) > 1 && <small className="duplicate-warning">Hay {duplicados(t.equipo)} tickets abiertos para este equipo</small>}<h3>{t.tipo}</h3><p>{t.descripcion}</p><div className="ticket-foot"><select className="campo" value={t.estado} disabled={!actualizar} onChange={(ev) => cambiarEstado(t, ev.target.value)}>{ESTADOS_TICKET.map((s) => <option key={s}>{s}</option>)}</select><span>{t.tecnico || 'Sin técnico'}</span></div></article> })}{!lista.length && <div className="empty-state">No hay incidencias con estos filtros.</div>}</div>
  </>
}

function Repotenciacion({ cambios, equipos, abrir, nuevo }) {
  const ram = cambios.filter((c) => c.componente === 'Memoria RAM').length
  const ssd = cambios.filter((c) => c.anterior.includes('HDD') && c.nuevo.includes('SSD')).length
  const nEquipos = new Set(cambios.map((c) => c.codigo)).size
  const area = (cod) => equipos.find((e) => e.codigo === cod)?.area
  return (
    <>
      <Titulo titulo="Repotenciación" sub="Cambios de hardware: lo que se retiró y lo que se instaló en cada equipo.">
        <button className="btn" onClick={() => exportarXLSX('repotenciacion', ['Fecha', 'Equipo', 'Área', 'Componente', 'Retirado', 'Instalado', 'Motivo'], cambios.map((c) => [c.fecha, c.codigo, area(c.codigo), c.componente, c.anterior, c.nuevo, c.motivo]))}>Excel XLSX</button>
        <button className="btn" onClick={() => exportarPDF('repotenciacion', 'Repotenciaciones', ['Fecha', 'Equipo', 'Área', 'Componente', 'Retirado', 'Instalado'], cambios.map((c) => [c.fecha, c.codigo, area(c.codigo), c.componente, c.anterior, c.nuevo]))}>PDF</button>
        {nuevo && <button className="btn p" onClick={nuevo}>Registrar cambio</button>}
      </Titulo>
      <div className="stats">
        <div><b className="d">{nEquipos}</b><span>equipos repotenciados</span></div>
        <div><b className="d">{cambios.length}</b><span>cambios de hardware</span></div>
        <div><b className="d">{ram}</b><span>ampliaciones de RAM</span></div>
        <div><b className="d">{ssd}</b><span>discos HDD cambiados a SSD</span></div>
      </div>
      <div className="tabla-caja">
        <table>
          <thead><tr><th>Fecha</th><th>Equipo</th><th>Área</th><th>Componente</th><th>Retirado</th><th>Instalado</th><th>Motivo</th></tr></thead>
          <tbody>
            {[...cambios].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((c) => (
              <tr key={c.id}><td className="mute">{fecha(c.fecha)}</td><td><button className="enlace d codigo" onClick={() => abrir(c.codigo)}>{c.codigo}</button></td><td>{area(c.codigo)}</td>
                <td><b>{c.componente}</b></td><td><s className="mute">{c.anterior}</s></td><td><span className="nuevo">{c.nuevo}</span></td><td>{c.motivo}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Reportes({ equipos, abrir }) {
  const [rep, setRep] = useState('area')
  return (
    <>
      <div className="subtabs">
        <button className={rep === 'area' ? 'on' : ''} onClick={() => setRep('area')}>Equipos por área</button>
        <button className={rep === 'carac' ? 'on' : ''} onClick={() => setRep('carac')}>Características por computadora</button>
      </div>
      {rep === 'area' ? <PorArea equipos={equipos} /> : <Caracteristicas equipos={equipos} abrir={abrir} />}
    </>
  )
}

function PorArea({ equipos }) {
  const filas = useMemo(() => AREAS.map((a) => {
    const de = equipos.filter((e) => e.area === a.nombre)
    return { ...a, total: de.length, por: ESTADOS.map((s) => de.filter((e) => e.estado === s).length) }
  }), [equipos])
  const max = Math.max(...filas.map((f) => f.total), 1)
  const totales = ESTADOS.map((_, i) => filas.reduce((s, f) => s + f.por[i], 0))
  return (
    <>
      <Titulo titulo="Equipos por área" sub={`Cuántos equipos tiene cada área y en qué estado están. Corte al ${fecha(hoy())}.`}>
        <button className="btn" onClick={() => exportarXLSX('equipos-por-area', ['Área', 'Responsable', ...ESTADOS, 'Total'], filas.map((f) => [f.nombre, f.responsable, ...f.por, f.total]))}>Excel XLSX</button>
        <button className="btn" onClick={() => exportarPDF('equipos-por-area', 'Equipos por área', ['Área', 'Responsable', ...ESTADOS, 'Total'], filas.map((f) => [f.nombre, f.responsable, ...f.por, f.total]))}>PDF</button>
        <button className="btn p" onClick={() => window.print()}>Imprimir reporte</button>
      </Titulo>
      <div className="leyenda">{ESTADOS.map((s) => <span key={s} className="fila"><Punto estado={s} />{s}</span>)}</div>
      <div className="tabla-caja">
        <table className="area">
          <thead><tr><th>Área</th><th>Responsable</th><th className="bar-col">Distribución por estado</th><th className="num">Op.</th><th className="num">Mant.</th><th className="num">Rep.</th><th className="num">Baja</th><th className="num">Total</th></tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.nombre}><td><b>{f.nombre}</b></td><td className="mute">{f.responsable}</td>
                <td><div className="barra-est" role="img" aria-label={ESTADOS.map((s, i) => `${s}: ${f.por[i]}`).join(', ')}>
                  {f.por.map((n, i) => n > 0 && <span key={i} className={COLOR_ESTADO[ESTADOS[i]]} style={{ width: `${(n / max) * 100}%` }} />)}
                </div></td>
                {f.por.map((n, i) => <td key={i} className={'num d' + (n ? '' : ' cero')}>{n}</td>)}
                <td className="num d total">{f.total}</td></tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan="3" className="d">Total general</td>{totales.map((t, i) => <td key={i} className="num d">{t}</td>)}<td className="num d total">{equipos.length}</td></tr></tfoot>
        </table>
      </div>
    </>
  )
}

function Caracteristicas({ equipos, abrir }) {
  const [q, setQ] = useState(''); const [area, setArea] = useState('Todas'); const [tipo, setTipo] = useState('Todos'); const [marcar, setMarcar] = useState(true)
  const debil = (e) => e.ram < 8 || e.disco.includes('HDD')
  const lista = equipos.filter((e) => (area === 'Todas' || e.area === area) && (tipo === 'Todos' || e.tipo === tipo) && (e.codigo + e.modelo).toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <Titulo titulo="Características por computadora" sub="Hardware y software de cada equipo, para auditorías y para planificar repotenciaciones.">
        <button className="btn" onClick={() => exportarXLSX('caracteristicas', ['Código', 'Modelo', 'Procesador', 'RAM', 'Disco', 'Video', 'Sistema', 'IP', 'Área'], lista.map((e) => [e.codigo, e.modelo, e.procesador, e.ram + ' GB', e.disco, e.video, e.so, e.ip, e.area]))}>Excel XLSX</button>
        <button className="btn" onClick={() => exportarPDF('caracteristicas', 'Características por computadora', ['Código', 'Modelo', 'Procesador', 'RAM', 'Disco', 'Sistema', 'Área'], lista.map((e) => [e.codigo, e.modelo, e.procesador, e.ram + ' GB', e.disco, e.so, e.area]))}>PDF</button>
        <button className="btn p" onClick={() => window.print()}>Imprimir reporte</button>
      </Titulo>
      <div className="fila filtros-linea">
        <label className="lbl">Buscar<input className="campo" placeholder="Código o modelo" value={q} onChange={(ev) => setQ(ev.target.value)} /></label>
        <label className="lbl">Área<select className="campo" value={area} onChange={(ev) => setArea(ev.target.value)}><option>Todas</option>{AREAS.map((a) => <option key={a.nombre}>{a.nombre}</option>)}</select></label>
        <label className="lbl">Tipo<select className="campo" value={tipo} onChange={(ev) => setTipo(ev.target.value)}><option>Todos</option>{TIPOS_EQUIPO.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={marcar} onChange={(ev) => setMarcar(ev.target.checked)} />Resaltar candidatos a repotenciación</label>
      </div>
      <div className="tabla-caja">
        <table>
          <thead><tr><th>Código</th><th>Equipo</th><th>Procesador</th><th>RAM</th><th>Disco</th><th>Video</th><th>Sistema</th><th>IP</th><th>Área</th></tr></thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.codigo} className={marcar && debil(e) ? 'debil' : ''}>
                <td><button className="enlace d codigo" onClick={() => abrir(e.codigo)}>{e.codigo}</button></td><td>{e.modelo}</td><td>{e.procesador.replace('Intel ', '')}</td>
                <td className={e.ram < 8 ? 'k' : ''}>{e.ram} GB</td><td className={e.disco.includes('HDD') ? 'k' : ''}>{e.disco}</td><td>{e.video}</td><td>{e.so}</td><td>{e.ip}</td><td>{e.area}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {marcar && <p className="nota fila"><i className="cuadro debil" aria-hidden="true" />Resaltados: equipos con disco HDD o menos de 8 GB de RAM. Mostrando {lista.length} de {equipos.length} equipos.</p>}
    </>
  )
}

function OperacionMasiva({ equipos, codigos, cerrar, guardar }) {
  const [estado, setEstado] = useState('')
  const [responsable, setResponsable] = useState('')
  const seleccion = equipos.filter((e) => codigos.includes(e.codigo))
  return <Modal titulo="Actualizar equipos seleccionados" cerrar={cerrar} onSubmit={() => guardar({ codigos, estado, responsable })} accion={`Aplicar a ${seleccion.length} equipos`}>
    <div className="mass-summary ancho"><b className="d">{seleccion.length}</b><span>equipos serán afectados. No se modificarán los demás.</span></div>
    <Campo label="Nuevo estado"><select className="campo" value={estado} onChange={(ev) => setEstado(ev.target.value)}><option value="">Conservar estado</option>{ESTADOS.map((s) => <option key={s}>{s}</option>)}</select></Campo>
    <Campo label="Responsable"><input className="campo" value={responsable} onChange={(ev) => setResponsable(ev.target.value)} placeholder="Conservar responsable" /></Campo>
    <div className="ancho bulk-preview">{seleccion.slice(0, 12).map((e) => <span key={e.codigo}>{e.codigo}</span>)}{seleccion.length > 12 && <span>+{seleccion.length - 12} equipos</span>}</div>
  </Modal>
}

function TrasladoMasivo({ equipos, infraestructura, codigos, cerrar, guardar }) {
  const [ambienteId, setAmbienteId] = useState('')
  const seleccion = equipos.filter((e) => codigos.includes(e.codigo))
  const ambientes = infraestructura.ambientes
  return <Modal titulo="Trasladar equipos seleccionados" cerrar={cerrar} onSubmit={() => ambienteId && window.confirm(`Se trasladarán ${seleccion.length} equipos. ¿Confirmar?`) && guardar({ codigos, ambienteId })} accion={`Trasladar ${seleccion.length} equipos`}>
    <div className="mass-summary ancho"><b className="d">{seleccion.length}</b><span>equipos serán afectados. Se conservará su historial.</span></div>
    <Campo label="Nuevo ambiente" ancho><select className="campo" required value={ambienteId} onChange={(ev) => setAmbienteId(ev.target.value)}><option value="">Seleccionar ambiente destino</option>{ambientes.map((a) => <option key={a.id} value={a.id}>{a.numero} · {a.nombre}</option>)}</select></Campo>
    <div className="ancho bulk-preview">{seleccion.slice(0, 12).map((e) => <span key={e.codigo}>{e.codigo}</span>)}{seleccion.length > 12 && <span>+{seleccion.length - 12} equipos</span>}</div>
  </Modal>
}

function EtiquetasQR({ equipos, infraestructura, cerrar }) {
  const [laboratorioId, setLaboratorioId] = useState(infraestructura.laboratorios[0]?.id || 'Todos')
  const [seleccionados, setSeleccionados] = useState([])
  const [imagenes, setImagenes] = useState({})
  const lista = equipos.filter((e) => laboratorioId === 'Todos' || e.laboratorioId === laboratorioId)
  const todos = lista.length > 0 && lista.every((e) => seleccionados.includes(e.codigo))
  useEffect(() => { let activo = true; Promise.all(seleccionados.map(async (codigo) => [codigo, await QRCode.toDataURL(urlEquipo(codigo), { width: 180, margin: 1 })])).then((pares) => { if (activo) setImagenes(Object.fromEntries(pares)) }).catch(() => {}); return () => { activo = false } }, [seleccionados])
  function imprimir() {
    const ventana = window.open('', '_blank'); if (!ventana) return
    const etiquetas = seleccionados.map((codigo) => { const e = equipos.find((item) => item.codigo === codigo); const lab = infraestructura.laboratorios.find((l) => l.id === e?.laboratorioId)?.nombre || 'Equipo institucional'; const pab = infraestructura.pabellones.find((p) => p.id === e?.pabellonId)?.nombre || 'No asignado'; return `<article><img src="${imagenes[codigo] || ''}"><div><b>COMPUCONTROL UDH</b><strong>${e.codigo}</strong><span>${pab}</span><span>${lab} · puesto ${e.posicion || '—'}</span><small>QR informativo · acceso local</small></div></article>` }).join('')
    ventana.document.write(`<title>Etiquetas QR · CompuControl UDH</title><style>@page{size:A4;margin:12mm}body{font-family:Arial;color:#172864}.hoja{display:grid;grid-template-columns:repeat(2,1fr);gap:10mm}article{border:1px dashed #172864;padding:5mm;display:flex;align-items:center;gap:5mm;min-height:38mm;break-inside:avoid}img{width:30mm;height:30mm}article div{display:flex;flex-direction:column;gap:2mm}b{font-size:9pt}strong{font-size:18pt}span{font-size:9pt}small{font-size:7pt;color:#667}</style><main class="hoja">${etiquetas}</main>`); ventana.document.close(); ventana.focus(); ventana.print()
  }
  return <Modal titulo="Etiquetas QR por lote" cerrar={cerrar} onSubmit={imprimir} accion={`Vista previa e imprimir (${seleccionados.length})`}>
    <Campo label="Laboratorio" ancho><select className="campo" value={laboratorioId} onChange={(ev) => { setLaboratorioId(ev.target.value); setSeleccionados([]) }}><option value="Todos">Todos los laboratorios</option>{infraestructura.laboratorios.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></Campo>
    <div className="mass-summary ancho"><b className="d">{seleccionados.length}</b><span>etiquetas seleccionadas de {lista.length}</span><button type="button" className="enlace" onClick={() => setSeleccionados(todos ? [] : lista.map((e) => e.codigo))}>{todos ? 'Deseleccionar todos' : 'Seleccionar todos'}</button></div>
    <div className="mass-equipment-list ancho">{lista.map((e) => <label className="mass-equipment" key={e.codigo}><input type="checkbox" checked={seleccionados.includes(e.codigo)} onChange={() => setSeleccionados((actual) => actual.includes(e.codigo) ? actual.filter((c) => c !== e.codigo) : [...actual, e.codigo])} /><span><b>{e.codigo}</b><small>{e.area} · puesto {e.posicion || '—'}</small></span>{imagenes[e.codigo] && <img className="qr-mini" src={imagenes[e.codigo]} alt="Vista previa QR" />}</label>)}</div>
    <p className="nota ancho">Los códigos se generan localmente y contienen únicamente la URL de identificación de la ficha. En localhost solo funcionan desde este equipo.</p>
  </Modal>
}

function CopiasSeguridad({ datos, restaurar }) {
  const [vista, setVista] = useState(null); const [error, setError] = useState('')
  const respaldo = { version: 1, aplicacion: 'CompuControl UDH', generado: new Date().toISOString(), ...datos }
  function descargar() { const blob = new Blob([JSON.stringify(respaldo, null, 2)], { type: 'application/json;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `compucontrol-udh-respaldo-${hoy()}.json`; a.click(); URL.revokeObjectURL(a.href) }
  function cargar(ev) { const archivo = ev.target.files?.[0]; if (!archivo) return; const lector = new FileReader(); lector.onload = () => { try { const valor = JSON.parse(lector.result); const resultado = validarRespaldoMigracion(valor); if (!resultado.valido) return setError(resultado.errores.slice(0, 3).join(' ')); setError(''); setVista(valor) } catch { setError('No se pudo leer el JSON seleccionado.') } }; lector.readAsText(archivo); ev.target.value = '' }
  function restaurarAhora() { if (!vista || !window.confirm(`Se reemplazarán ${vista.equipos.length} equipos y sus relaciones actuales. ¿Continuar?`)) return; restaurar(vista); setVista(null) }
  return <><Titulo titulo="Copias de seguridad" sub="Respaldo manual local del prototipo. No es una copia automática en la nube."><button className="btn" onClick={descargar}>Descargar respaldo JSON</button><label className="btn p">Seleccionar respaldo<input className="sr" type="file" accept="application/json,.json" onChange={cargar} /></label></Titulo><section className="backup-layout"><div className="panel"><span className="eyebrow">CONTENIDO DEL RESPALDO ACTUAL</span><h2 className="d">Datos protegidos</h2><div className="backup-stats"><b>{datos.equipos.length}</b><span>equipos</span><b>{datos.infraestructura.ambientes.length}</b><span>ambientes</span><b>{datos.mantenimientos.length}</b><span>mantenimientos</span><b>{datos.tickets.length}</b><span>tickets</span><b>{datos.inspecciones.length}</b><span>inspecciones</span></div><p className="nota">Antes de restaurar otro archivo puedes descargar el estado actual. La restauración reemplaza el conjunto completo para evitar relaciones parciales.</p></div>{vista && <div className="panel backup-preview"><span className="eyebrow">VISTA PREVIA VALIDADA</span><h2 className="d">{vista.aplicacion || 'Respaldo compatible'}</h2><p>{vista.equipos.length} equipos · {vista.mantenimientos.length} mantenimientos · {vista.tickets.length} tickets · {(vista.inspecciones || []).length} inspecciones</p><button className="btn danger-btn" onClick={restaurarAhora}>Confirmar restauración</button></div>}{error && <p className="error ancho">{error}</p>}</section></>
}

// ---------- Formularios ----------
function Modal({ titulo, cerrar, onSubmit, children, accion }) {
  useEffect(() => { const k = (ev) => ev.key === 'Escape' && cerrar(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [cerrar])
  return (
    <div className="velo" onClick={cerrar}>
      <form className="modal" role="dialog" aria-modal="true" aria-label={titulo} onClick={(ev) => ev.stopPropagation()} onSubmit={(ev) => { ev.preventDefault(); onSubmit() }}>
        <h2 className="d">{titulo}</h2>
        <div className="form">{children}</div>
        <div className="acciones fin"><button type="button" className="btn" onClick={cerrar}>Cancelar</button><button className="btn p">{accion}</button></div>
      </form>
    </div>
  )
}
function Campo({ label, children, ancho }) { return <label className={'lbl' + (ancho ? ' ancho' : '')}>{label}{children}</label> }

function FormEquipo({ equipos, cerrar, guardar }) {
  const sig = 'PC-' + String(equipos.length + 200).padStart(4, '0')
  const [f, setF] = useState({ codigo: sig, tipo: 'Escritorio', modelo: '', area: AREAS[0].nombre, procesador: '', ram: 8, disco: '', video: '', so: 'Windows 11 Pro', ip: '', serie: '', adquisicion: hoy(), estado: 'Operativo' })
  const [error, setError] = useState('')
  const s = (k) => (ev) => setF({ ...f, [k]: k === 'ram' ? +ev.target.value : ev.target.value })
  function enviar() {
    if (equipos.some((e) => e.codigo === f.codigo)) return setError(`El código ${f.codigo} ya existe. Usa otro código patrimonial.`)
    if (!f.modelo || !f.procesador || !f.disco) return setError('Completa modelo, procesador y disco.')
    guardar(f)
  }
  return (
    <Modal titulo="Registrar equipo" cerrar={cerrar} onSubmit={enviar} accion="Registrar equipo">
      <Campo label="Código patrimonial"><input className="campo" value={f.codigo} onChange={s('codigo')} required /></Campo>
      <Campo label="Tipo"><select className="campo" value={f.tipo} onChange={s('tipo')}>{TIPOS_EQUIPO.map((t) => <option key={t}>{t}</option>)}</select></Campo>
      <Campo label="Marca y modelo" ancho><input className="campo" value={f.modelo} onChange={s('modelo')} placeholder="Ej. HP ProDesk 400 G7" /></Campo>
      <Campo label="Área"><select className="campo" value={f.area} onChange={s('area')}>{AREAS.map((a) => <option key={a.nombre}>{a.nombre}</option>)}</select></Campo>
      <Campo label="N.º de serie"><input className="campo" value={f.serie} onChange={s('serie')} /></Campo>
      <Campo label="Procesador"><input className="campo" value={f.procesador} onChange={s('procesador')} placeholder="Ej. Intel Core i5-10400" /></Campo>
      <Campo label="RAM (GB)"><input className="campo" type="number" min="1" value={f.ram} onChange={s('ram')} /></Campo>
      <Campo label="Disco"><input className="campo" value={f.disco} onChange={s('disco')} placeholder="Ej. 512 GB SSD" /></Campo>
      <Campo label="Video"><input className="campo" value={f.video} onChange={s('video')} /></Campo>
      <Campo label="Sistema operativo"><input className="campo" value={f.so} onChange={s('so')} /></Campo>
      <Campo label="Dirección IP"><input className="campo" value={f.ip} onChange={s('ip')} /></Campo>
      <Campo label="Fecha de adquisición"><input className="campo" type="date" value={f.adquisicion} onChange={s('adquisicion')} /></Campo>
      {error && <p className="error ancho">{error}</p>}
    </Modal>
  )
}

function FormMant({ equipos, codigo, cerrar, guardar }) {
  const [f, setF] = useState({ codigo: codigo || equipos[0].codigo, tipo: 'Preventivo', fecha: hoy(), fechaProgramada: hoy(), fechaEjecucion: '', tecnico: TECNICOS[0], estado: 'Programado', costo: '', descripcion: '', observaciones: '' })
  const s = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  return (
    <Modal titulo="Registrar mantenimiento" cerrar={cerrar} onSubmit={() => guardar(f)} accion="Guardar mantenimiento">
      <Campo label="Equipo" ancho><select className="campo" value={f.codigo} onChange={s('codigo')}>{equipos.map((e) => <option key={e.codigo} value={e.codigo}>{e.codigo} · {e.modelo}</option>)}</select></Campo>
      <Campo label="Tipo de mantenimiento"><select className="campo" value={f.tipo} onChange={s('tipo')}>{TIPOS_MANT.map((t) => <option key={t}>{t}</option>)}</select></Campo>
      <Campo label="Fecha programada"><input className="campo" type="date" value={f.fechaProgramada} onChange={s('fechaProgramada')} /></Campo>
      <Campo label="Fecha de ejecución"><input className="campo" type="date" value={f.fechaEjecucion} onChange={s('fechaEjecucion')} /></Campo>
      <Campo label="Técnico"><select className="campo" value={f.tecnico} onChange={s('tecnico')}>{TECNICOS.map((t) => <option key={t}>{t}</option>)}</select></Campo>
      <Campo label="Estado"><select className="campo" value={f.estado} onChange={s('estado')}>{ESTADOS_MANT.map((estado) => <option key={estado}>{estado}</option>)}</select></Campo>
      <Campo label="Costo"><input className="campo" type="number" min="0" step="0.01" value={f.costo} onChange={s('costo')} /></Campo>
      <Campo label="Actividad / diagnóstico" ancho><textarea className="campo" rows="3" required value={f.descripcion} onChange={s('descripcion')} placeholder="Ej. Limpieza interna y cambio de pasta térmica" /></Campo>
      <Campo label="Observaciones" ancho><textarea className="campo" rows="2" value={f.observaciones} onChange={s('observaciones')} /></Campo>
    </Modal>
  )
}

function FormCambio({ equipos, codigo, cerrar, guardar }) {
  const [f, setF] = useState({ codigo: codigo || equipos[0].codigo, fecha: hoy(), componente: 'Memoria RAM', anterior: '', nuevo: '', motivo: '' })
  const s = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  return (
    <Modal titulo="Registrar cambio de hardware" cerrar={cerrar} onSubmit={() => guardar(f)} accion="Guardar cambio">
      <Campo label="Equipo" ancho><select className="campo" value={f.codigo} onChange={s('codigo')}>{equipos.map((e) => <option key={e.codigo} value={e.codigo}>{e.codigo} · {e.modelo}</option>)}</select></Campo>
      <Campo label="Componente"><select className="campo" value={f.componente} onChange={s('componente')}>{['Memoria RAM', 'Almacenamiento', 'Procesador', 'Fuente de poder', 'Tarjeta de video', 'Placa madre', 'Otro'].map((c) => <option key={c}>{c}</option>)}</select></Campo>
      <Campo label="Fecha"><input className="campo" type="date" value={f.fecha} onChange={s('fecha')} /></Campo>
      <Campo label="Componente retirado"><input className="campo" required value={f.anterior} onChange={s('anterior')} placeholder="Ej. 8 GB DDR4" /></Campo>
      <Campo label="Componente instalado"><input className="campo" required value={f.nuevo} onChange={s('nuevo')} placeholder="Ej. 16 GB DDR4" /></Campo>
      <Campo label="Motivo" ancho><input className="campo" required value={f.motivo} onChange={s('motivo')} placeholder="Ej. Equipo lento en prácticas" /></Campo>
    </Modal>
  )
}

function FormEditarEquipo({ equipo, cerrar, guardar }) {
  const [f, setF] = useState({ modelo: equipo.modelo, procesador: equipo.procesador, ram: equipo.ram, disco: equipo.disco, video: equipo.video, so: equipo.so, ip: equipo.ip, serie: equipo.serie, garantiaHasta: equipo.garantiaHasta || '' })
  const s = (k) => (ev) => setF({ ...f, [k]: k === 'ram' ? Number(ev.target.value) : ev.target.value })
  return <Modal titulo={`Editar ficha · ${equipo.codigo}`} cerrar={cerrar} onSubmit={() => guardar(f)} accion="Guardar cambios"><Campo label="Marca y modelo" ancho><input className="campo" required value={f.modelo} onChange={s('modelo')} /></Campo><Campo label="N.º de serie"><input className="campo" required value={f.serie} onChange={s('serie')} /></Campo><Campo label="Procesador"><input className="campo" required value={f.procesador} onChange={s('procesador')} /></Campo><Campo label="RAM (GB)"><input className="campo" type="number" min="1" required value={f.ram} onChange={s('ram')} /></Campo><Campo label="Almacenamiento"><input className="campo" required value={f.disco} onChange={s('disco')} /></Campo><Campo label="Video"><input className="campo" value={f.video} onChange={s('video')} /></Campo><Campo label="Sistema operativo"><input className="campo" value={f.so} onChange={s('so')} /></Campo><Campo label="Dirección IP"><input className="campo" value={f.ip} onChange={s('ip')} /></Campo><Campo label="Garantía hasta"><input className="campo" type="date" value={f.garantiaHasta} onChange={s('garantiaHasta')} /></Campo></Modal>
}

function FormTicket({ equipos, codigo, cerrar, guardar }) {
  const [f, setF] = useState({ equipo: codigo || equipos[0]?.codigo || '', tipo: 'Hardware', descripcion: '', prioridad: 'Media', fecha: hoy(), reportadoPor: '', tecnico: TECNICOS[0], estado: 'Pendiente', diagnostico: '', solucion: '', observaciones: '' })
  const s = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  return <Modal titulo="Registrar incidencia" cerrar={cerrar} onSubmit={() => guardar(f)} accion="Crear ticket"><Campo label="Equipo" ancho><select className="campo" value={f.equipo} onChange={s('equipo')}>{equipos.map((e) => <option key={e.codigo}>{e.codigo} · {e.modelo}</option>)}</select></Campo><Campo label="Tipo de falla"><input className="campo" required value={f.tipo} onChange={s('tipo')} placeholder="Hardware, red, software..." /></Campo><Campo label="Prioridad"><select className="campo" value={f.prioridad} onChange={s('prioridad')}>{PRIORIDADES_TICKET.map((p) => <option key={p}>{p}</option>)}</select></Campo><Campo label="Fecha"><input className="campo" type="date" value={f.fecha} onChange={s('fecha')} /></Campo><Campo label="Técnico asignado"><select className="campo" value={f.tecnico} onChange={s('tecnico')}><option value="">Sin asignar</option>{TECNICOS.map((t) => <option key={t}>{t}</option>)}</select></Campo><Campo label="Usuario que reporta"><input className="campo" value={f.reportadoPor} onChange={s('reportadoPor')} /></Campo><Campo label="Descripción" ancho><textarea className="campo" rows="3" required value={f.descripcion} onChange={s('descripcion')} /></Campo><Campo label="Diagnóstico" ancho><textarea className="campo" rows="2" value={f.diagnostico} onChange={s('diagnostico')} /></Campo><Campo label="Observaciones" ancho><textarea className="campo" rows="2" value={f.observaciones} onChange={s('observaciones')} /></Campo></Modal>
}

// ---------- Inicio de sesión (demostrativo o institucional) ----------
function Login({ entrar }) {
  const [correo, setCorreo] = useState(USUARIOS[0].correo)
  const [clave, setClave] = useState(CLAVE_DEMO)
  const [ver, setVer] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  async function enviar(ev) {
    ev.preventDefault()
    if (supabaseConfigurado) { setCargando(true); try { entrar(await iniciarSesionRemota(correo.trim().toLowerCase(), clave)) } catch (err) { setError(err.message || 'No se pudo iniciar sesión en Supabase.') } finally { setCargando(false) } return }
    const u = USUARIOS.find((x) => x.correo === correo.trim().toLowerCase())
    if (!u) return setError('Ese usuario no existe. Elige un perfil de demostración.')
    if (clave !== CLAVE_DEMO) return setError('Contraseña incorrecta. La de demostración es ' + CLAVE_DEMO + '.')
    entrar({ correo: u.correo, nombre: u.nombre, perfil: u.perfil })
  }
  return (
    <div className="login">
      <div className="login-caja">
        <section className="login-marca">
          <div className="etiqueta login-et" aria-hidden="true">
            <span className="et-cab"><span>Universidad de Huánuco</span><span>Bien patrimonial</span></span>
            <span className="et-cuerpo"><span className="et-codigo d">CompuControl</span><b>Gestión de equipos y sistemas de cómputo</b><Barras texto="COMPUCONTROLUDH" /></span>
            <span className="et-pie"><i className="punto g" />Soporte TI</span>
          </div>
          <p>Inventario, mantenimientos, repotenciaciones y reportes de los equipos de cómputo de la universidad.</p>
        </section>
        <form className="login-form" onSubmit={enviar}>
          <h1 className="d">Iniciar sesión</h1>
          <label className="lbl">Usuario o correo<input className="campo" value={correo} onChange={(ev) => { setCorreo(ev.target.value); setError('') }} autoComplete="username" /></label>
          <label className="lbl">Contraseña
            <span className="fila"><input className="campo" type={ver ? 'text' : 'password'} value={clave} onChange={(ev) => { setClave(ev.target.value); setError('') }} autoComplete="current-password" />
              <button type="button" className="btn" onClick={() => setVer(!ver)}>{ver ? 'Ocultar' : 'Ver'}</button></span>
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn p" disabled={cargando}>{cargando ? 'Validando…' : 'Iniciar sesión'}</button>
          {!supabaseConfigurado ? <div className="demo">
            <label className="lbl">Acceso de demostración
              <select className="campo" value={correo} onChange={(ev) => { setCorreo(ev.target.value); setClave(CLAVE_DEMO); setError('') }}>
                {USUARIOS.map((u) => <option key={u.correo} value={u.correo}>{u.nombre}, {u.perfil.toLowerCase()}</option>)}
              </select>
            </label>
            <small className="mute">Contraseña de demostración: {CLAVE_DEMO}. El administrador puede todo, el técnico registra mantenimientos y cambios, y consulta solo ve inventario y reportes.</small>
          </div> : <p className="nota">Modo institucional: inicia sesión con una cuenta creada en Supabase Auth.</p>}
        </form>
      </div>
    </div>
  )
}
