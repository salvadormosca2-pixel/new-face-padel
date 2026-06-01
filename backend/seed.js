const { Profesor, Torneo, Socio, Premio, ClubConfig } = require('./models');

async function seedClub() {
  const count = await ClubConfig.count();
  if (count > 0) return;
  await ClubConfig.create({
    nombre: 'New Face Padel Club',
    direccion: 'Buenos Aires, Argentina',
    telefono: '5491145678900',
    whatsapp: '5491145678900',
    email: 'info@newfacepadel.com',
    redes: { instagram: '@newfacepadel', facebook: 'newfacepadel', tiktok: '' },
    horarios: { lunesViernes: '15:00 a 00:00', sabados: '09:00 a 00:00', domingos: '09:00 a 00:00', feriados: '09:00 a 00:00' },
    canchas: [
      { numero: 1, tipo: 'Cubierta', techada: true },
      { numero: 2, tipo: 'Cubierta', techada: true },
      { numero: 3, tipo: 'Al aire libre', techada: false },
      { numero: 4, tipo: 'Al aire libre', techada: false }
    ],
    servicios: ['Estacionamiento', 'Vestuarios', 'Buffet', 'Pro Shop'],
    metodosPago: ['Efectivo', 'MercadoPago', 'Transferencia bancaria'],
    sistemaPuntos: { puntosPorReserva: 10, descripcion: 'Ganas puntos por cada reserva y los canjeas por premios.' }
  });
  console.log('Seed: ClubConfig creado');
}

async function seedProfesores() {
  const count = await Profesor.count();
  if (count > 0) { console.log('Seed: profesores ya existen (' + count + ')'); return; }
  await Profesor.bulkCreate([
    {
      nombre: 'Carlos Rodriguez',
      especialidad: 'Entrenamiento competitivo',
      experiencia: '10 anos de trayectoria en torneos nacionales',
      horarios: 'Lun a Vie 16:00-22:00',
      whatsapp: '5491145678901',
      alumnos: 24,
      niveles: ['Intermedio', 'Avanzado'],
      gruposEdad: ['Adultos', 'Senior'],
      rating: 4.9
    },
    {
      nombre: 'Valentina Lopez',
      especialidad: 'Iniciacion y tecnica de base',
      experiencia: '6 anos formando jugadores desde cero',
      horarios: 'Mar, Jue y Sab 15:00-20:00',
      whatsapp: '5491156781234',
      alumnos: 18,
      niveles: ['Principiante', 'Intermedio'],
      gruposEdad: ['Ninos', 'Adultos'],
      rating: 4.8
    },
    {
      nombre: 'Javier Mendez',
      especialidad: 'Tactica y juego en pareja',
      experiencia: '8 anos como entrenador de dobles',
      horarios: 'Lun, Mie y Vie 18:00-23:00',
      whatsapp: '5491167891234',
      alumnos: 15,
      niveles: ['Intermedio', 'Avanzado'],
      gruposEdad: ['Adultos'],
      rating: 4.7
    }
  ]);
  console.log('Seed: 3 profesores creados');
}

async function seedSocios() {
  const count = await Socio.count();
  if (count > 0) { console.log('Seed: socios ya existen (' + count + ')'); return; }
  await Socio.bulkCreate([
    { nombre: 'Martin Gomez',    telefono: '1145678901', puntos: 320, totalGastado: 45000, activo: true },
    { nombre: 'Carla Mendez',    telefono: '1134567890', puntos: 210, totalGastado: 32000, activo: true },
    { nombre: 'Roberto Diaz',    telefono: '1189012345', puntos: 150, totalGastado: 28000, activo: true },
    { nombre: 'Fernando Castro', telefono: '1123456789', puntos: 80,  totalGastado: 15000, activo: false },
    { nombre: 'Valeria Torres',  telefono: '1145670123', puntos: 430, totalGastado: 52000, activo: true },
    { nombre: 'Sebastian Mora',  telefono: '1156781234', puntos: 180, totalGastado: 24000, activo: true },
    { nombre: 'Lucas Herrera',   telefono: '1167891234', puntos: 290, totalGastado: 38000, activo: true },
    { nombre: 'Paula Sanchez',   telefono: '1156783456', puntos: 110, totalGastado: 18000, activo: true },
  ]);
  console.log('Seed: 8 socios creados');
}

async function seedTorneos() {
  const count = await Torneo.count();
  if (count > 0) { console.log('Seed: torneos ya existen (' + count + ')'); return; }
  await Torneo.create({
    nombre: 'Copa Primavera 2026',
    fecha: '2026-06-15',
    descripcion: 'Torneo de dobles mixto abierto a todos los niveles. Formato de fase de grupos + bracket eliminatorio.',
    imagen: 'https://images.unsplash.com/photo-1554284126-aa88f22d8b74?w=1200&auto=format&fit=crop&q=80',
    estado: 'inscripcion',
    inscripciones: [
      { id: 't1p1', jugador1: { nombre: 'Martin Gomez', telefono: '1145678901' }, jugador2: { nombre: 'Lucas Herrera', telefono: '1167891234' }, nombrePareja: 'Gomez / Herrera', estadoInscripcion: 'aceptada' },
      { id: 't1p2', jugador1: { nombre: 'Roberto Diaz', telefono: '1189012345' }, jugador2: { nombre: 'Gustavo Ruiz', telefono: '1190123456' }, nombrePareja: 'Diaz / Ruiz', estadoInscripcion: 'aceptada' },
      { id: 't1p3', jugador1: { nombre: 'Fernando Castro', telefono: '1123456789' }, jugador2: { nombre: 'Agustin Romero', telefono: '1134560123' }, nombrePareja: 'Castro / Romero', estadoInscripcion: 'pendiente' },
    ],
    grupos: {},
    bracket: [],
    campeon: null
  });
  await Torneo.create({
    nombre: 'Copa Otono 2025',
    fecha: '2025-10-15',
    descripcion: 'Torneo finalizado. 8 parejas, 2 grupos, bracket completo.',
    imagen: 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=1200&auto=format&fit=crop&q=80',
    estado: 'finalizado',
    inscripciones: [
      { id: 't2p1', jugador1: { nombre: 'Martin Gomez', telefono: '1145678901' }, jugador2: { nombre: 'Lucas Herrera', telefono: '1167891234' }, nombrePareja: 'Gomez / Herrera', estadoInscripcion: 'aceptada' },
      { id: 't2p2', jugador1: { nombre: 'Roberto Diaz', telefono: '1189012345' }, jugador2: { nombre: 'Gustavo Ruiz', telefono: '1190123456' }, nombrePareja: 'Diaz / Ruiz', estadoInscripcion: 'aceptada' },
      { id: 't2p3', jugador1: { nombre: 'Diego Fernandez', telefono: '1178904567' }, jugador2: { nombre: 'Sebastian Mora', telefono: '1156781234' }, nombrePareja: 'Fernandez / Mora', estadoInscripcion: 'aceptada' },
      { id: 't2p4', jugador1: { nombre: 'Fernando Castro', telefono: '1123456789' }, jugador2: { nombre: 'Agustin Romero', telefono: '1134560123' }, nombrePareja: 'Castro / Romero', estadoInscripcion: 'aceptada' },
    ],
    grupos: {
      A: {
        parejas: ['t2p1', 't2p2', 't2p3', 't2p4'],
        tabla: [
          { parejaId: 't2p1', V: 3, D: 0, SG: 6, SP: 0, JG: 36, JP: 11, Pts: 9 },
          { parejaId: 't2p2', V: 2, D: 1, SG: 4, SP: 2, JG: 32, JP: 26, Pts: 6 },
          { parejaId: 't2p3', V: 1, D: 2, SG: 2, SP: 4, JG: 24, JP: 32, Pts: 3 },
          { parejaId: 't2p4', V: 0, D: 3, SG: 0, SP: 6, JG: 13, JP: 36, Pts: 0 },
        ],
        partidos: [
          { id: 'ga1', pareja1: 't2p1', pareja2: 't2p2', hora: '09:00', resultado: '6-3 / 6-4', ganador: 't2p1' },
          { id: 'ga2', pareja1: 't2p1', pareja2: 't2p3', hora: '11:00', resultado: '6-2 / 6-1', ganador: 't2p1' },
          { id: 'ga3', pareja1: 't2p1', pareja2: 't2p4', hora: '15:00', resultado: '6-0 / 6-1', ganador: 't2p1' },
          { id: 'ga4', pareja1: 't2p2', pareja2: 't2p3', hora: '10:00', resultado: '7-5 / 6-4', ganador: 't2p2' },
          { id: 'ga5', pareja1: 't2p2', pareja2: 't2p4', hora: '13:00', resultado: '6-3 / 6-2', ganador: 't2p2' },
          { id: 'ga6', pareja1: 't2p3', pareja2: 't2p4', hora: '14:00', resultado: '6-4 / 6-3', ganador: 't2p3' },
        ],
      },
    },
    bracket: [
      { id: 'tfin', fase: 'final', slot: 'F', etiqueta: 'Gran Final', pareja1: 't2p1', pareja2: 't2p2', hora: '19:00', resultado: '6-3 / 6-4', ganador: 't2p1', nextId: null, nextPos: null },
    ],
    campeon: 't2p1'
  });
  console.log('Seed: 2 torneos creados');
}

async function seedPremios() {
  const count = await Premio.count();
  if (count > 0) { console.log('Seed: premios ya existen (' + count + ')'); return; }
  await Premio.bulkCreate([
    { nombre: '1 hora gratis',  descripcion: 'Una hora en cualquier cancha del club', puntos: 1000, stock: -1, activo: true },
    { nombre: 'Descuento 20%',  descripcion: 'En tu proxima reserva',                  puntos: 500,  stock: -1, activo: true },
    { nombre: 'Kit de paleta',  descripcion: 'Paleta + 3 pelotas de regalo',            puntos: 1500, stock: 5,  activo: true },
  ]);
  console.log('Seed: 3 premios creados');
}

async function seed() {
  const steps = [
    ['ClubConfig', seedClub],
    ['Profesores', seedProfesores],
    ['Socios', seedSocios],
    ['Torneos', seedTorneos],
    ['Premios', seedPremios],
  ];

  for (const [name, fn] of steps) {
    try {
      await fn();
    } catch (err) {
      console.error(`Seed ${name} ERROR:`, err.message);
    }
  }

  console.log('Seed: proceso completado');
}

module.exports = seed;
