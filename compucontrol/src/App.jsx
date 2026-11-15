import { useEffect, useMemo, useState } from 'react'
import { AREAS, ESTADOS, TIPOS_EQUIPO, TIPOS_MANT, TECNICOS, EQUIPOS, MANTENIMIENTOS, CAMBIOS, USUARIOS, CLAVE_DEMO } from './data.js'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fecha = (iso) => { const [a, m, d] = iso.split('-'); return `${d} ${MESES[+m - 1]} ${a}` }
const hoy = () => new Date().toISOString().slice(0, 10)
const COLOR_ESTADO = { Operativo: 'g', 'En mantenimiento': 'y', Repotenciado: 'i', 'Dado de baja': 'r' }

// Guarda los datos en el navegador para que no se pierdan al recargar
function useGuardado(clave, inicial) {
  const [valor, setValor] = useState(() => {
    try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) : inicial } catch { return inicial }
  })
  useEffect(() => { try { localStorage.setItem(clave, JSON.stringify(valor)) } catch { /* sin almacenamiento */ } }, [clave, valor])
  return [valor, setValor]
}

// Descarga una tabla como CSV (se abre en Excel)
function exportarCSV(nombre, filas) {
  const csv = filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
  const a = document.createElement('a'); a.href = url; a.download = nombre + '.csv'; a.click(); URL.revokeObjectURL(url)
}

export default function App() {
  const [sesion, setSesion] = useGuardado('cc-sesion', null)
  if (!sesion) return <Login entrar={setSesion} />
  return <Sistema sesion={sesion} salir={() => setSesion(null)} />
}

function Sistema({ sesion, salir }) {
  const puede = USUARIOS.find((u) => u.correo === sesion.correo)?.permisos || {}
  const [equipos, setEquipos] = useGuardado('cc-equipos', EQUIPOS)
  const [mants, setMants] = useGuardado('cc-mants', MANTENIMIENTOS)
  const [cambios, setCambios] = useGuardado('cc-cambios', CAMBIOS)
  const [vista, setVista] = useState('inventario')
  const [actual, setActual] = useState(null) // código del equipo abierto
  const [modal, setModal] = useState(null) // { tipo, codigo }
  const [aviso, setAviso] = useState('')

  const avisar = (t) => { setAviso(t); setTimeout(() => setAviso(''), 2600) }
  const ir = (v) => { setVista(v); setActual(null) }
  const abrir = (codigo) => { setActual(codigo); setVista('inventario') }

  function guardarEquipo(e) {
    setEquipos([...equipos, e]); setModal(null); avisar(`Equipo ${e.codigo} registrado`)
  }
  function guardarMant(m) {
    setMants([{ ...m, id: Date.now() }, ...mants])
    if (m.estado !== 'Completado') setEquipos(equipos.map((e) => (e.codigo === m.codigo ? { ...e, estado: 'En mantenimiento' } : e)))
    setModal(null); avisar(`Mantenimiento de ${m.codigo} registrado`)
  }
  function guardarCambio(c) {
    setCambios([{ ...c, id: Date.now() }, ...cambios])
    setEquipos(equipos.map((e) => (e.codigo === c.codigo ? { ...e, estado: 'Repotenciado' } : e)))
    setModal(null); avisar(`Cambio de hardware en ${c.codigo} registrado`)
  }
  function cambiarEstado(codigo, estado) {
    setEquipos(equipos.map((e) => (e.codigo === codigo ? { ...e, estado } : e))); avisar(`${codigo}: ${estado}`)
  }
  function completar(id) {
    setMants(mants.map((m) => (m.id === id ? { ...m, estado: 'Completado' } : m))); avisar('Orden marcada como completada')
  }
  function restablecer() {
    setEquipos(EQUIPOS); setMants(MANTENIMIENTOS); setCambios(CAMBIOS); ir('inventario'); avisar('Datos de ejemplo restablecidos')
  }

  const equipo = equipos.find((e) => e.codigo === actual)
  const tabs = [['inventario', 'Inventario'], ['mantenimientos', 'Mantenimientos'], ['repotenciacion', 'Repotenciación'], ['reportes', 'Reportes']]

  return (
    <div className="app">
      <header className="barra">
        <div className="marca"><span className="d">CompuControl</span><small>Soporte TI, Universidad de Huánuco</small></div>
        <nav className="tabs">
          {tabs.map(([id, t]) => <button key={id} className={'tab' + (vista === id ? ' on' : '')} onClick={() => ir(id)}>{t}</button>)}
        </nav>
        <div className="usuario"><span><b>{sesion.nombre}</b><small>{sesion.perfil}</small></span><button className="btn-salir" onClick={salir}>Cerrar sesión</button></div>
      </header>

      <main className="contenido">
        {vista === 'inventario' && !equipo && <Inventario equipos={equipos} abrir={abrir} nuevo={puede.equipo ? () => setModal({ tipo: 'equipo' }) : null} />}
        {vista === 'inventario' && equipo && (
          <Ficha e={equipo} mants={mants.filter((m) => m.codigo === equipo.codigo)} cambios={cambios.filter((c) => c.codigo === equipo.codigo)}
            volver={() => setActual(null)} cambiarEstado={puede.estado ? cambiarEstado : null}
            nuevoMant={puede.mant ? () => setModal({ tipo: 'mant', codigo: equipo.codigo }) : null} nuevoCambio={puede.cambio ? () => setModal({ tipo: 'cambio', codigo: equipo.codigo }) : null} />
        )}
        {vista === 'mantenimientos' && <Mantenimientos mants={mants} equipos={equipos} abrir={abrir} completar={puede.mant ? completar : null} nuevo={puede.mant ? () => setModal({ tipo: 'mant' }) : null} />}
        {vista === 'repotenciacion' && <Repotenciacion cambios={cambios} equipos={equipos} abrir={abrir} nuevo={puede.cambio ? () => setModal({ tipo: 'cambio' }) : null} />}
        {vista === 'reportes' && <Reportes equipos={equipos} abrir={abrir} />}
      </main>

      <footer className="pie">
        <span>Los cambios se guardan en este navegador.</span>
        {puede.equipo && <button className="enlace" onClick={restablecer}>Restablecer datos de ejemplo</button>}
      </footer>

      {modal?.tipo === 'equipo' && <FormEquipo equipos={equipos} cerrar={() => setModal(null)} guardar={guardarEquipo} />}
      {modal?.tipo === 'mant' && <FormMant equipos={equipos} codigo={modal.codigo} cerrar={() => setModal(null)} guardar={guardarMant} />}
      {modal?.tipo === 'cambio' && <FormCambio equipos={equipos} codigo={modal.codigo} cerrar={() => setModal(null)} guardar={guardarCambio} />}
      {aviso && <div className="aviso" role="status">{aviso}</div>}
    </div>
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

function Inventario({ equipos, abrir, nuevo }) {
  const [q, setQ] = useState(''); const [area, setArea] = useState('Todas'); const [estado, setEstado] = useState('Todos')
  const lista = equipos.filter((e) =>
    (area === 'Todas' || e.area === area) && (estado === 'Todos' || e.estado === estado) &&
    (e.codigo + ' ' + e.modelo + ' ' + e.serie).toLowerCase().includes(q.toLowerCase()))
  const cuenta = (f) => equipos.filter(f).length
  return (
    <>
      <Titulo titulo="Inventario" sub={`${equipos.length} equipos registrados en ${AREAS.length} áreas. Cada etiqueta es un bien patrimonial.`}>
        <button className="btn" onClick={() => exportarCSV('inventario', [['Código', 'Tipo', 'Modelo', 'Área', 'Procesador', 'RAM', 'Disco', 'Estado'], ...equipos.map((e) => [e.codigo, e.tipo, e.modelo, e.area, e.procesador, e.ram + ' GB', e.disco, e.estado])])}>Exportar a Excel</button>
        {nuevo && <button className="btn p" onClick={nuevo}>Registrar equipo</button>}
      </Titulo>
      <div className="inv">
        <aside className="filtros">
          <label className="sr" htmlFor="buscar">Buscar</label>
          <input id="buscar" className="campo" placeholder="Buscar código, modelo o serie" value={q} onChange={(ev) => setQ(ev.target.value)} />
          <h2 className="d">Áreas</h2>
          {['Todas', ...AREAS.map((a) => a.nombre)].map((a) => (
            <button key={a} className={'filtro' + (area === a ? ' on' : '')} onClick={() => setArea(a)}>
              <span>{a}</span><span className="d n">{a === 'Todas' ? equipos.length : cuenta((e) => e.area === a)}</span>
            </button>
          ))}
          <h2 className="d">Estado</h2>
          {['Todos', ...ESTADOS].map((s) => (
            <button key={s} className={'filtro' + (estado === s ? ' on' : '')} onClick={() => setEstado(s)}>
              <span className="fila">{s !== 'Todos' && <Punto estado={s} />}{s}</span><span className="d n">{s === 'Todos' ? equipos.length : cuenta((e) => e.estado === s)}</span>
            </button>
          ))}
        </aside>
        <section className="etiquetas">
          {lista.map((e) => <Etiqueta key={e.codigo} e={e} onClick={() => abrir(e.codigo)} />)}
          {lista.length === 0 && <p className="vacio">Ningún equipo coincide con los filtros. Cambia el área, el estado o la búsqueda.</p>}
        </section>
      </div>
    </>
  )
}

function Ficha({ e, mants, cambios, volver, cambiarEstado, nuevoMant, nuevoCambio }) {
  const resp = AREAS.find((a) => a.nombre === e.area)?.responsable
  const historial = [
    ...mants.map((m) => ({ fecha: m.fecha, tipo: m.tipo, texto: m.descripcion, quien: 'Técnico: ' + m.tecnico })),
    ...cambios.map((c) => ({ fecha: c.fecha, tipo: 'Repotenciación', texto: `${c.componente}: ${c.anterior} a ${c.nuevo}`, quien: c.motivo })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha))
  return (
    <>
      <button className="enlace volver" onClick={volver}>← Volver al inventario</button>
      <Titulo titulo={e.codigo} sub={`${e.modelo} en ${e.area}, a cargo de ${resp}.`}>
        <button className="btn" onClick={() => window.print()}>Imprimir ficha</button>
        {nuevoCambio && <button className="btn" onClick={nuevoCambio}>Registrar cambio de hardware</button>}
        {nuevoMant && <button className="btn p" onClick={nuevoMant}>Registrar mantenimiento</button>}
      </Titulo>
      <div className="ficha">
        <div className="col">
          <Etiqueta e={e} />
          <div className="panel">
            <h2 className="d">Datos generales</h2>
            <Dato k="Tipo" v={e.tipo} /><Dato k="N.º de serie" v={e.serie} /><Dato k="Adquirido" v={fecha(e.adquisicion)} /><Dato k="Responsable" v={resp} />
            {cambiarEstado ? (
              <label className="dato"><span className="mute">Estado</span>
                <select className="campo" value={e.estado} onChange={(ev) => cambiarEstado(e.codigo, ev.target.value)}>{ESTADOS.map((s) => <option key={s}>{s}</option>)}</select>
              </label>
            ) : <Dato k="Estado" v={e.estado} />}
          </div>
        </div>
        <div className="col ancho">
          <div className="panel">
            <h2 className="d">Características técnicas</h2>
            <div className="specs">
              {[['Procesador', e.procesador], ['Memoria RAM', e.ram + ' GB'], ['Almacenamiento', e.disco], ['Video', e.video], ['Sistema operativo', e.so], ['Dirección IP', e.ip]].map(([k, v]) => <Dato key={k} k={k} v={v} />)}
            </div>
          </div>
          <div className="panel">
            <h2 className="d">Cambios de hardware</h2>
            {cambios.length === 0 && <p className="mute">Este equipo conserva su hardware original.</p>}
            {cambios.map((c) => (
              <div key={c.id} className="cambio"><b>{c.componente}</b><s className="mute">{c.anterior}</s><span className="nuevo">{c.nuevo}</span><span className="mute">{fecha(c.fecha)}</span></div>
            ))}
          </div>
        </div>
        <div className="panel historial">
          <h2 className="d">Historial</h2>
          {historial.length === 0 && <p className="mute">Sin mantenimientos registrados.</p>}
          <ol className="linea">
            {historial.map((h, i) => (
              <li key={i}><i className={'marca-t ' + (h.tipo === 'Correctivo' ? 'y' : 'i')} aria-hidden="true" />
                <b>{fecha(h.fecha)}, {h.tipo.toLowerCase()}</b><span>{h.texto}</span><small className="mute">{h.quien}</small></li>
            ))}
          </ol>
        </div>
      </div>
    </>
  )
}

function Dato({ k, v }) { return <div className="dato"><span className="mute">{k}</span><b>{v}</b></div> }

function Mantenimientos({ mants, equipos, abrir, completar, nuevo }) {
  const [tec, setTec] = useState('Todos')
  const ayuda = { Preventivo: 'Limpieza y revisión programada', Correctivo: 'Reparación de una falla reportada', Predictivo: 'Revisión de indicadores antes de una falla' }
  const lista = mants.filter((m) => tec === 'Todos' || m.tecnico === tec)
  return (
    <>
      <Titulo titulo="Mantenimientos" sub={`${mants.length} órdenes de servicio, agrupadas por tipo de mantenimiento.`}>
        <label className="sr" htmlFor="tec">Técnico</label>
        <select id="tec" className="campo corto" value={tec} onChange={(ev) => setTec(ev.target.value)}><option>Todos</option>{TECNICOS.map((t) => <option key={t}>{t}</option>)}</select>
        <button className="btn" onClick={() => exportarCSV('mantenimientos', [['Fecha', 'Equipo', 'Área', 'Tipo', 'Trabajo', 'Técnico', 'Estado'], ...mants.map((m) => [m.fecha, m.codigo, equipos.find((e) => e.codigo === m.codigo)?.area, m.tipo, m.descripcion, m.tecnico, m.estado])])}>Exportar a Excel</button>
        {nuevo && <button className="btn p" onClick={nuevo}>Nueva orden de servicio</button>}
      </Titulo>
      <div className="carriles">
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
      </div>
    </>
  )
}

function Repotenciacion({ cambios, equipos, abrir, nuevo }) {
  const ram = cambios.filter((c) => c.componente === 'Memoria RAM').length
  const ssd = cambios.filter((c) => c.anterior.includes('HDD') && c.nuevo.includes('SSD')).length
  const nEquipos = new Set(cambios.map((c) => c.codigo)).size
  const area = (cod) => equipos.find((e) => e.codigo === cod)?.area
  return (
    <>
      <Titulo titulo="Repotenciación" sub="Cambios de hardware: lo que se retiró y lo que se instaló en cada equipo.">
        <button className="btn" onClick={() => exportarCSV('repotenciacion', [['Fecha', 'Equipo', 'Área', 'Componente', 'Retirado', 'Instalado', 'Motivo'], ...cambios.map((c) => [c.fecha, c.codigo, area(c.codigo), c.componente, c.anterior, c.nuevo, c.motivo])])}>Exportar a Excel</button>
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
        <button className="btn" onClick={() => exportarCSV('equipos-por-area', [['Área', 'Responsable', ...ESTADOS, 'Total'], ...filas.map((f) => [f.nombre, f.responsable, ...f.por, f.total])])}>Exportar a Excel</button>
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
        <button className="btn" onClick={() => exportarCSV('caracteristicas', [['Código', 'Modelo', 'Procesador', 'RAM', 'Disco', 'Video', 'Sistema', 'IP', 'Área'], ...lista.map((e) => [e.codigo, e.modelo, e.procesador, e.ram + ' GB', e.disco, e.video, e.so, e.ip, e.area])])}>Exportar a Excel</button>
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
  const [f, setF] = useState({ codigo: codigo || equipos[0].codigo, tipo: 'Preventivo', fecha: hoy(), tecnico: TECNICOS[0], estado: 'En proceso', descripcion: '' })
  const s = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  return (
    <Modal titulo="Registrar mantenimiento" cerrar={cerrar} onSubmit={() => guardar(f)} accion="Guardar mantenimiento">
      <Campo label="Equipo" ancho><select className="campo" value={f.codigo} onChange={s('codigo')}>{equipos.map((e) => <option key={e.codigo} value={e.codigo}>{e.codigo} · {e.modelo}</option>)}</select></Campo>
      <Campo label="Tipo de mantenimiento"><select className="campo" value={f.tipo} onChange={s('tipo')}>{TIPOS_MANT.map((t) => <option key={t}>{t}</option>)}</select></Campo>
      <Campo label="Fecha"><input className="campo" type="date" value={f.fecha} onChange={s('fecha')} /></Campo>
      <Campo label="Técnico"><select className="campo" value={f.tecnico} onChange={s('tecnico')}>{TECNICOS.map((t) => <option key={t}>{t}</option>)}</select></Campo>
      <Campo label="Estado"><select className="campo" value={f.estado} onChange={s('estado')}><option>Programado</option><option>En proceso</option><option>Completado</option></select></Campo>
      <Campo label="Trabajo realizado" ancho><textarea className="campo" rows="3" required value={f.descripcion} onChange={s('descripcion')} placeholder="Ej. Limpieza interna y cambio de pasta térmica" /></Campo>
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

// ---------- Inicio de sesión (simulado) ----------
function Login({ entrar }) {
  const [correo, setCorreo] = useState(USUARIOS[0].correo)
  const [clave, setClave] = useState(CLAVE_DEMO)
  const [ver, setVer] = useState(false)
  const [error, setError] = useState('')
  function enviar(ev) {
    ev.preventDefault()
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
          <button className="btn p">Iniciar sesión</button>
          <div className="demo">
            <label className="lbl">Acceso de demostración
              <select className="campo" value={correo} onChange={(ev) => { setCorreo(ev.target.value); setClave(CLAVE_DEMO); setError('') }}>
                {USUARIOS.map((u) => <option key={u.correo} value={u.correo}>{u.nombre}, {u.perfil.toLowerCase()}</option>)}
              </select>
            </label>
            <small className="mute">Contraseña de demostración: {CLAVE_DEMO}. El administrador puede todo, el técnico registra mantenimientos y cambios, y consulta solo ve inventario y reportes.</small>
          </div>
        </form>
      </div>
    </div>
  )
}
