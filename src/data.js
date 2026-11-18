// Datos de ejemplo del sistema (se guardan en el navegador al hacer cambios)

export const AREAS = [
  { nombre: 'Laboratorio de Cómputo 1', responsable: 'Ing. M. Paredes' },
  { nombre: 'Laboratorio de Cómputo 2', responsable: 'Prof. A. Salinas' },
  { nombre: 'Administración', responsable: 'Lic. C. Torres' },
  { nombre: 'Biblioteca', responsable: 'Lic. R. Huamán' },
  { nombre: 'Secretaría', responsable: 'Sra. P. León' },
  { nombre: 'Sala de docentes', responsable: 'Dr. J. Mendoza' },
  { nombre: 'Soporte TI', responsable: 'Ing. R. Quispe' },
  { nombre: 'Dirección', responsable: 'Mg. E. Castillo' },
]

export const ESTADOS = ['Operativo', 'En mantenimiento', 'Repotenciado', 'Dado de baja']
export const TIPOS_EQUIPO = ['Escritorio', 'Laptop', 'Servidor']
export const TIPOS_MANT = ['Preventivo', 'Correctivo', 'Predictivo', 'Diagnóstico']
export const ESTADOS_MANT = ['Pendiente', 'Programado', 'En proceso', 'Completado', 'Cancelado']
export const PRIORIDADES_TICKET = ['Baja', 'Media', 'Alta', 'Crítica']
export const ESTADOS_TICKET = ['Pendiente', 'Asignado', 'En proceso', 'Resuelto', 'Cerrado']
export const TECNICOS = ['R. Quispe', 'L. Vargas', 'M. Rojas']

// Infraestructura UDH simulada. No representa la infraestructura oficial.
const NOMBRES_PABELLON = ['Pabellón Central', 'Pabellón Ciencias', 'Pabellón Ingeniería', 'Pabellón Administrativo', 'Pabellón Innovación', 'Pabellón Servicios']

export const PABELLONES = NOMBRES_PABELLON.map((nombre, i) => ({
  id: `P${i + 1}`,
  nombre,
  codigo: `PB-${String(i + 1).padStart(2, '0')}`,
  descripcion: 'Registro de demostración configurable para CompuControl UDH',
  pisos: 5,
}))

export const PISOS = PABELLONES.flatMap((pabellon) => Array.from({ length: 5 }, (_, i) => ({
  id: `${pabellon.id}-N${i + 1}`,
  pabellonId: pabellon.id,
  numero: i + 1,
  etiqueta: `${pabellon.codigo} · Piso ${i + 1}`,
})))

export const AMBIENTES = PISOS.flatMap((piso) => Array.from({ length: 6 }, (_, i) => {
  const numero = piso.numero * 100 + i + 1
  const tipo = i < 1 ? 'Laboratorio' : i < 4 ? 'Aula' : 'Oficina'
  return {
    id: `${piso.id}-A${i + 1}`,
    pabellonId: piso.pabellonId,
    pisoId: piso.id,
    numero: String(numero),
    nombre: `${tipo} ${numero}`,
    tipo,
  }
}))

export const LABORATORIOS = AMBIENTES
  .filter((ambiente) => ambiente.tipo === 'Laboratorio')
  .map((ambiente, i) => ({
    id: `LAB-${String(i + 1).padStart(2, '0')}`,
    ambienteId: ambiente.id,
    pabellonId: ambiente.pabellonId,
    pisoId: ambiente.pisoId,
    nombre: `Laboratorio de Cómputo ${String(i + 1).padStart(2, '0')}`,
    capacidad: 30,
  }))

const EQUIPOS_BASE = [
  { codigo: 'PC-0001', tipo: 'Escritorio', modelo: 'HP ProDesk 400 G7', area: 'Laboratorio de Cómputo 1', procesador: 'Intel Core i5-10400', ram: 8, disco: '256 GB SSD', video: 'Intel UHD 630', so: 'Windows 11 Pro', ip: '192.168.10.11', serie: '4CE0231AB1', adquisicion: '2021-03-12', estado: 'Operativo' },
  { codigo: 'PC-0002', tipo: 'Escritorio', modelo: 'HP ProDesk 400 G7', area: 'Laboratorio de Cómputo 1', procesador: 'Intel Core i5-10400', ram: 8, disco: '256 GB SSD', video: 'Intel UHD 630', so: 'Windows 11 Pro', ip: '192.168.10.12', serie: '4CE0231AB2', adquisicion: '2021-03-12', estado: 'En mantenimiento' },
  { codigo: 'PC-0004', tipo: 'Escritorio', modelo: 'HP ProDesk 400 G7', area: 'Laboratorio de Cómputo 1', procesador: 'Intel Core i5-10400', ram: 16, disco: '512 GB SSD', video: 'Intel UHD 630', so: 'Windows 11 Pro', ip: '192.168.10.14', serie: '4CE0231AB4', adquisicion: '2021-03-12', estado: 'Repotenciado' },
  { codigo: 'PC-0013', tipo: 'Escritorio', modelo: 'Dell OptiPlex 3080', area: 'Laboratorio de Cómputo 2', procesador: 'Intel Core i7-10700', ram: 16, disco: '512 GB SSD NVMe', video: 'Intel UHD 630', so: 'Windows 11 Pro', ip: '192.168.20.45', serie: '7K2P9M3', adquisicion: '2021-03-12', estado: 'Repotenciado' },
  { codigo: 'PC-0045', tipo: 'Escritorio', modelo: 'Lenovo ThinkCentre M70', area: 'Administración', procesador: 'Intel Core i5-10400', ram: 8, disco: '512 GB SSD', video: 'Intel UHD 630', so: 'Windows 10 Pro', ip: '192.168.30.21', serie: 'MJ0F4K21', adquisicion: '2020-08-04', estado: 'Repotenciado' },
  { codigo: 'LT-0007', tipo: 'Laptop', modelo: 'Lenovo ThinkPad E14', area: 'Dirección', procesador: 'Intel Core i5-1135G7', ram: 16, disco: '512 GB SSD', video: 'Intel Iris Xe', so: 'Windows 11 Pro', ip: '192.168.40.8', serie: 'PF2X8L7Q', adquisicion: '2022-02-20', estado: 'Operativo' },
  { codigo: 'PC-0088', tipo: 'Escritorio', modelo: 'HP EliteDesk 800 G4', area: 'Biblioteca', procesador: 'Intel Core i5-8500', ram: 8, disco: '500 GB HDD', video: 'Intel UHD 630', so: 'Windows 10 Pro', ip: '192.168.50.17', serie: 'MXL8231K9', adquisicion: '2018-11-05', estado: 'En mantenimiento' },
  { codigo: 'PC-0102', tipo: 'Escritorio', modelo: 'Dell OptiPlex 7090', area: 'Secretaría', procesador: 'Intel Core i7-11700', ram: 16, disco: '512 GB SSD', video: 'Intel UHD 750', so: 'Windows 11 Pro', ip: '192.168.60.5', serie: '9H3L2Q8', adquisicion: '2022-06-15', estado: 'Operativo' },
  { codigo: 'PC-0127', tipo: 'Escritorio', modelo: 'Dell OptiPlex 5080', area: 'Sala de docentes', procesador: 'Intel Core i7-10700', ram: 16, disco: '512 GB SSD', video: 'GTX 1650 4 GB', so: 'Windows 11 Pro', ip: '192.168.70.12', serie: '5D8K1R2', adquisicion: '2021-05-10', estado: 'Repotenciado' },
  { codigo: 'PC-0150', tipo: 'Escritorio', modelo: 'HP Compaq 6200 Pro', area: 'Sala de docentes', procesador: 'Intel Core i3-2120', ram: 4, disco: '250 GB HDD', video: 'Intel HD 2000', so: 'Windows 7 Pro', ip: '192.168.70.3', serie: 'MXL1340ZT', adquisicion: '2012-04-02', estado: 'Dado de baja' },
  { codigo: 'SV-0001', tipo: 'Servidor', modelo: 'Dell PowerEdge T40', area: 'Soporte TI', procesador: 'Intel Xeon E-2224G', ram: 32, disco: '2 TB RAID 1', video: 'Intel P630', so: 'Ubuntu 22.04', ip: '192.168.1.10', serie: 'CN0T40X1', adquisicion: '2020-10-01', estado: 'Operativo' },
]

const MODELOS = ['Dell OptiPlex 7090', 'HP ProDesk 400 G7', 'Lenovo ThinkCentre M70', 'Dell OptiPlex 5080']
const PROCESADORES = ['Intel Core i5-10400', 'Intel Core i5-10500', 'Intel Core i7-10700']
const ESTADOS_SIMULADOS = ['Operativo', 'Operativo', 'Operativo', 'En mantenimiento', 'Repotenciado']

const equiposLaboratorio = LABORATORIOS.flatMap((laboratorio, labIndex) => Array.from({ length: laboratorio.capacidad }, (_, puesto) => {
  const n = labIndex * laboratorio.capacidad + puesto + 1
  const ambiente = AMBIENTES.find((item) => item.id === laboratorio.ambienteId)
  return {
    codigo: `UDH-${String(n).padStart(4, '0')}`,
    tipo: 'Escritorio',
    modelo: MODELOS[n % MODELOS.length],
    area: ambiente.nombre,
    pabellonId: laboratorio.pabellonId,
    pisoId: laboratorio.pisoId,
    ambienteId: laboratorio.ambienteId,
    laboratorioId: laboratorio.id,
    posicion: puesto + 1,
    procesador: PROCESADORES[n % PROCESADORES.length],
    ram: n % 9 === 0 ? 4 : n % 4 === 0 ? 16 : 8,
    disco: n % 11 === 0 ? '500 GB HDD' : n % 5 === 0 ? '512 GB SSD NVMe' : '256 GB SSD',
    video: n % 7 === 0 ? 'GTX 1650 4 GB' : 'Intel UHD 630',
    so: n % 13 === 0 ? 'Windows 10 Pro' : 'Windows 11 Pro',
    ip: `10.${labIndex + 1}.${Math.floor(puesto / 25) + 1}.${puesto + 11}`,
    serie: `UDH${String(n).padStart(8, '0')}`,
    adquisicion: `202${n % 5 + 1}-0${n % 8 + 1}-15`,
    estado: ESTADOS_SIMULADOS[n % ESTADOS_SIMULADOS.length],
  }
}))

const equiposAuxiliares = AMBIENTES
  .filter((ambiente) => ambiente.tipo !== 'Laboratorio')
  .slice(0, 36)
  .map((ambiente, i) => ({
    codigo: `UDH-AUX-${String(i + 1).padStart(3, '0')}`,
    tipo: i % 3 === 0 ? 'Laptop' : 'Escritorio',
    modelo: MODELOS[i % MODELOS.length],
    area: ambiente.nombre,
    pabellonId: ambiente.pabellonId,
    pisoId: ambiente.pisoId,
    ambienteId: ambiente.id,
    posicion: 1,
    procesador: PROCESADORES[i % PROCESADORES.length],
    ram: i % 4 === 0 ? 16 : 8,
    disco: '512 GB SSD',
    video: 'Intel UHD 630',
    so: 'Windows 11 Pro',
    ip: `10.90.0.${i + 20}`,
    serie: `AUXUDH${String(i + 1).padStart(5, '0')}`,
    adquisicion: '2024-02-20',
    estado: i % 6 === 0 ? 'En mantenimiento' : 'Operativo',
  }))

// Los 11 registros originales permanecen al inicio del catálogo.
export const EQUIPOS = [...EQUIPOS_BASE, ...equiposLaboratorio, ...equiposAuxiliares]

export const MANTENIMIENTOS = [
  { id: 1, fecha: '2026-11-08', codigo: 'PC-0013', tipo: 'Preventivo', descripcion: 'Limpieza interna y cambio de pasta térmica', tecnico: 'R. Quispe', estado: 'Completado' },
  { id: 2, fecha: '2026-11-05', codigo: 'PC-0002', tipo: 'Correctivo', descripcion: 'Reemplazo de fuente de poder', tecnico: 'R. Quispe', estado: 'En proceso' },
  { id: 3, fecha: '2026-11-02', codigo: 'LT-0007', tipo: 'Preventivo', descripcion: 'Actualización de sistema operativo y antivirus', tecnico: 'L. Vargas', estado: 'Completado' },
  { id: 4, fecha: '2026-10-28', codigo: 'SV-0001', tipo: 'Predictivo', descripcion: 'Revisión de discos RAID y temperatura', tecnico: 'M. Rojas', estado: 'Completado' },
  { id: 5, fecha: '2026-10-24', codigo: 'PC-0088', tipo: 'Correctivo', descripcion: 'Falla de disco duro: respaldo y cambio', tecnico: 'L. Vargas', estado: 'En proceso' },
  { id: 6, fecha: '2026-10-20', codigo: 'PC-0045', tipo: 'Preventivo', descripcion: 'Limpieza de ventiladores y revisión de cables', tecnico: 'R. Quispe', estado: 'Completado' },
  { id: 7, fecha: '2026-09-14', codigo: 'PC-0013', tipo: 'Correctivo', descripcion: 'Reemplazo de fuente de poder', tecnico: 'R. Quispe', estado: 'Completado' },
  { id: 8, fecha: '2026-11-22', codigo: 'PC-0088', tipo: 'Predictivo', descripcion: 'Lectura SMART del disco', tecnico: 'M. Rojas', estado: 'Programado' },
]

export const CAMBIOS = [
  { id: 1, fecha: '2026-03-20', codigo: 'PC-0013', componente: 'Memoria RAM', anterior: '8 GB DDR4', nuevo: '16 GB DDR4', motivo: 'Equipo lento en prácticas' },
  { id: 2, fecha: '2026-03-20', codigo: 'PC-0013', componente: 'Almacenamiento', anterior: '500 GB HDD', nuevo: '512 GB SSD NVMe', motivo: 'Arranque lento del sistema' },
  { id: 3, fecha: '2026-04-02', codigo: 'PC-0004', componente: 'Memoria RAM', anterior: '8 GB DDR4', nuevo: '16 GB DDR4', motivo: 'Prácticas de IA' },
  { id: 4, fecha: '2026-06-15', codigo: 'PC-0045', componente: 'Almacenamiento', anterior: '1 TB HDD', nuevo: '512 GB SSD', motivo: 'Falla de disco' },
  { id: 5, fecha: '2026-09-14', codigo: 'PC-0013', componente: 'Fuente de poder', anterior: '350 W', nuevo: '500 W 80 Plus', motivo: 'Falla de fuente' },
  { id: 6, fecha: '2026-09-30', codigo: 'PC-0127', componente: 'Tarjeta de video', anterior: 'Integrada', nuevo: 'GTX 1650 4 GB', motivo: 'Prácticas de IA' },
]

export const INCIDENCIAS = [
  { id: 1, codigo: 'INC-0001', equipo: 'PC-0002', tipo: 'Falla de fuente de poder', descripcion: 'El equipo no enciende durante la práctica.', prioridad: 'Alta', fecha: '2026-11-05', reportadoPor: 'Laboratorio de Cómputo 1', tecnico: 'R. Quispe', estado: 'En proceso', diagnostico: 'Fuente con voltaje irregular', solucion: '', observaciones: '' },
  { id: 2, codigo: 'INC-0002', equipo: 'PC-0088', tipo: 'Almacenamiento', descripcion: 'El sistema inicia con mucha lentitud.', prioridad: 'Media', fecha: '2026-10-24', reportadoPor: 'Biblioteca', tecnico: 'L. Vargas', estado: 'Asignado', diagnostico: '', solucion: '', observaciones: 'Pendiente respaldo del usuario' },
  { id: 3, codigo: 'INC-0003', equipo: 'UDH-0027', tipo: 'Conectividad', descripcion: 'No obtiene dirección IP en el laboratorio.', prioridad: 'Crítica', fecha: '2026-11-12', reportadoPor: 'Laboratorio de Cómputo 01', tecnico: 'M. Rojas', estado: 'Resuelto', diagnostico: 'Cable de red defectuoso', solucion: 'Se reemplazó patch cord', observaciones: '' },
]

// Usuarios de demostración (acceso simulado, sin servidor)
export const CLAVE_DEMO = 'Demo2026'
export const USUARIOS = [
  { correo: 'admin@udh.edu.pe', nombre: 'Eduardo Morales', perfil: 'Administrador', permisos: { equipo: true, estado: true, mant: true, cambio: true } },
  { correo: 'tecnico@udh.edu.pe', nombre: 'R. Quispe', perfil: 'Técnico', permisos: { equipo: false, estado: true, mant: true, cambio: true } },
  { correo: 'consulta@udh.edu.pe', nombre: 'Dirección', perfil: 'Consulta', permisos: { equipo: false, estado: false, mant: false, cambio: false } },
]
