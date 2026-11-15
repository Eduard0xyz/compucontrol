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
export const TIPOS_MANT = ['Preventivo', 'Correctivo', 'Predictivo']
export const TECNICOS = ['R. Quispe', 'L. Vargas', 'M. Rojas']

export const EQUIPOS = [
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

// Usuarios de demostración (acceso simulado, sin servidor)
export const CLAVE_DEMO = 'Demo2026'
export const USUARIOS = [
  { correo: 'admin@udh.edu.pe', nombre: 'Eduardo Morales', perfil: 'Administrador', permisos: { equipo: true, estado: true, mant: true, cambio: true } },
  { correo: 'tecnico@udh.edu.pe', nombre: 'R. Quispe', perfil: 'Técnico', permisos: { equipo: false, estado: true, mant: true, cambio: true } },
  { correo: 'consulta@udh.edu.pe', nombre: 'Dirección', perfil: 'Consulta', permisos: { equipo: false, estado: false, mant: false, cambio: false } },
]
