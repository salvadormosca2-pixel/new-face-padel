const { Profesor, Torneo, Socio, Premio, ClubConfig } = require('./models');

async function seed() {
  try {
    // Club config
    const configCount = await ClubConfig.count();
    if (configCount === 0) {
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

    // Profesores
    const profCount = await Profesor.count();
    if (profCount === 0) {
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
          rating: 4.9,
          imagen: ''
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
          rating: 4.8,
          imagen: ''
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
          rating: 4.7,
          imagen: ''
        }
      ]);
      console.log('Seed: 3 profesores creados');
    }

    // Socios
    const socioCount = await Socio.count();
    if (socioCount === 0) {
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

    // Torneos
    const torneoCount = await Torneo.count();
    if (torneoCount === 0) {
      await Torneo.bulkCreate([
        {
          nombre: 'Copa Primavera 2026',
          fecha: '2026-06-15',
          descripcion: 'Torneo de dobles mixto abierto a todos los niveles. Formato de fase de grupos + bracket eliminatorio. Los mejores 2 de cada grupo avanzan a cuartos de final.',
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
        },
        {
          nombre: 'Copa Otono 2025',
          fecha: '2025-10-15',
          descripcion: 'Torneo finalizado. Participaron 8 parejas en dos grupos. Fase de grupos completa y bracket eliminatorio disputado.',
          imagen: 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=1200&auto=format&fit=crop&q=80',
          estado: 'finalizado',
          inscripciones: [
            { id: 't2p1', jugador1: { nombre: 'Martin Gomez', telefono: '1145678901' }, jugador2: { nombre: 'Lucas Herrera', telefono: '1167891234' }, nombrePareja: 'Gomez / Herrera', estadoInscripcion: 'aceptada' },
            { id: 't2p2', jugador1: { nombre: 'Roberto Diaz', telefono: '1189012345' }, jugador2: { nombre: 'Gustavo Ruiz', telefono: '1190123456' }, nombrePareja: 'Diaz / Ruiz', estadoInscripcion: 'aceptada' },
            { id: 't2p3', jugador1: { nombre: 'Diego Fernandez', telefono: '1178904567' }, jugador2: { nombre: 'Sebastian Mora', telefono: '1156781234' }, nombrePareja: 'Fernandez / Mora', estadoInscripcion: 'aceptada' },
            { id: 't2p4', jugador1: { nombre: 'Fernando Castro', telefono: '1123456789' }, jugador2: { nombre: 'Agustin Romero', telefono: '1134560123' }, nombrePareja: 'Castro / Romero', estadoInscripcion: 'aceptada' },
            { id: 't2p5', jugador1: { nombre: 'Emilio Suarez', telefono: '1145671234' }, jugador2: { nombre: 'Ricardo Alvarez', telefono: '1156782345' }, nombrePareja: 'Suarez / Alvarez', estadoInscripcion: 'aceptada' },
            { id: 't2p6', jugador1: { nombre: 'Nicolas Vega', telefono: '1112345678' }, jugador2: { nombre: 'Pablo Mendez', telefono: '1123450000' }, nombrePareja: 'Vega / Mendez', estadoInscripcion: 'aceptada' },
            { id: 't2p7', jugador1: { nombre: 'Carlos Lopez', telefono: '1111111111' }, jugador2: { nombre: 'Andres Garcia', telefono: '1122222222' }, nombrePareja: 'Lopez / Garcia', estadoInscripcion: 'aceptada' },
            { id: 't2p8', jugador1: { nombre: 'Tomas Benitez', telefono: '1133333333' }, jugador2: { nombre: 'Ignacio Cruz', telefono: '1144444444' }, nombrePareja: 'Benitez / Cruz', estadoInscripcion: 'aceptada' },
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
            B: {
              parejas: ['t2p5', 't2p6', 't2p7', 't2p8'],
              tabla: [
                { parejaId: 't2p5', V: 3, D: 0, SG: 6, SP: 0, JG: 31, JP: 14, Pts: 9 },
                { parejaId: 't2p6', V: 2, D: 1, SG: 4, SP: 2, JG: 28, JP: 22, Pts: 6 },
                { parejaId: 't2p7', V: 1, D: 2, SG: 2, SP: 4, JG: 23, JP: 27, Pts: 3 },
                { parejaId: 't2p8', V: 0, D: 3, SG: 0, SP: 6, JG: 11, JP: 30, Pts: 0 },
              ],
              partidos: [
                { id: 'gb1', pareja1: 't2p5', pareja2: 't2p6', hora: '09:30', resultado: '6-4 / 6-3', ganador: 't2p5' },
                { id: 'gb2', pareja1: 't2p5', pareja2: 't2p7', hora: '11:30', resultado: '6-2 / 6-4', ganador: 't2p5' },
                { id: 'gb3', pareja1: 't2p5', pareja2: 't2p8', hora: '15:30', resultado: '6-1 / 6-2', ganador: 't2p5' },
                { id: 'gb4', pareja1: 't2p6', pareja2: 't2p7', hora: '10:30', resultado: '6-3 / 7-5', ganador: 't2p6' },
                { id: 'gb5', pareja1: 't2p6', pareja2: 't2p8', hora: '13:30', resultado: '6-2 / 6-4', ganador: 't2p6' },
                { id: 'gb6', pareja1: 't2p7', pareja2: 't2p8', hora: '14:30', resultado: '7-5 / 6-4', ganador: 't2p7' },
              ],
            },
          },
          bracket: [
            { id: 'tsf1', fase: 'semifinal', slot: 'SF1', etiqueta: 'Semifinal 1', pareja1: 't2p1', pareja2: 't2p6', hora: '17:00', resultado: '6-4 / 6-3', ganador: 't2p1', nextId: 'tfin', nextPos: 'p1' },
            { id: 'tsf2', fase: 'semifinal', slot: 'SF2', etiqueta: 'Semifinal 2', pareja1: 't2p5', pareja2: 't2p2', hora: '17:30', resultado: '7-5 / 4-6 / 10-7', ganador: 't2p5', nextId: 'tfin', nextPos: 'p2' },
            { id: 'tfin', fase: 'final', slot: 'F', etiqueta: 'Gran Final', pareja1: 't2p1', pareja2: 't2p5', hora: '19:00', resultado: '6-3 / 6-4', ganador: 't2p1', nextId: null, nextPos: null },
          ],
          campeon: 't2p1'
        }
      ]);
      console.log('Seed: 2 torneos creados');
    }

    // Premios
    const premioCount = await Premio.count();
    if (premioCount === 0) {
      await Premio.bulkCreate([
        { nombre: '1 hora gratis',  descripcion: 'Una hora en cualquier cancha del club', icono: '', puntos: 1000, stock: -1, activo: true },
        { nombre: 'Descuento 20%',  descripcion: 'En tu proxima reserva',                  icono: '', puntos: 500,  stock: -1, activo: true },
        { nombre: 'Kit de paleta',  descripcion: 'Paleta + 3 pelotas de regalo',            icono: '', puntos: 1500, stock: 5,  activo: true },
      ]);
      console.log('Seed: 3 premios creados');
    }

    console.log('Seed: completado');
  } catch (err) {
    console.error('Seed error:', err.message);
  }
}

module.exports = seed;
