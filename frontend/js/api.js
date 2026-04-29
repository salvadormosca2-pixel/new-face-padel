/* ═══════════════════════════════════════════════════════════
   api.js — MODO DEMO (sin backend real)
   ═══════════════════════════════════════════════════════════ */

const DEMO_MODE = true;

/* ─── HELPERS DE TORNEOS (lógica WPT) ───────────────────── */

function _uid() {
  return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
}

function _parseSets(resultado) {
  if (!resultado || !resultado.trim()) return { p1Sets: 0, p2Sets: 0, p1Games: 0, p2Games: 0 };
  const sets = resultado.split('/').map(s => s.trim());
  let p1Sets = 0, p2Sets = 0, p1Games = 0, p2Games = 0;
  sets.forEach(set => {
    const partes = set.split('-').map(s => parseInt(s.trim(), 10));
    const a = isNaN(partes[0]) ? 0 : partes[0];
    const b = isNaN(partes[1]) ? 0 : partes[1];
    p1Games += a; p2Games += b;
    if (a > b) p1Sets++; else if (b > a) p2Sets++;
  });
  return { p1Sets, p2Sets, p1Games, p2Games };
}

function _getH2H(grupo, idA, idB) {
  const p = grupo.partidos.find(p =>
    (p.pareja1 === idA && p.pareja2 === idB) ||
    (p.pareja1 === idB && p.pareja2 === idA)
  );
  if (!p || !p.ganador) return 0;
  return p.ganador === idA ? -1 : 1;
}

function _sortTabla(grupo) {
  grupo.tabla.sort((a, b) => {
    if (b.Pts !== a.Pts) return b.Pts - a.Pts;
    const h2h = _getH2H(grupo, a.parejaId, b.parejaId);
    if (h2h !== 0) return h2h;
    const aRatio = a.SP > 0 ? a.SG / a.SP : (a.SG > 0 ? 999 : 0);
    const bRatio = b.SP > 0 ? b.SG / b.SP : (b.SG > 0 ? 999 : 0);
    if (Math.abs(bRatio - aRatio) > 0.001) return bRatio - aRatio;
    const aG = a.JP > 0 ? a.JG / a.JP : (a.JG > 0 ? 999 : 0);
    const bG = b.JP > 0 ? b.JG / b.JP : (b.JG > 0 ? 999 : 0);
    return bG - aG;
  });
}

function _recalcularTabla(grupo) {
  grupo.tabla.forEach(r => { r.V = 0; r.D = 0; r.SG = 0; r.SP = 0; r.JG = 0; r.JP = 0; r.Pts = 0; });
  grupo.partidos.forEach(p => {
    if (!p.ganador || !p.resultado) return;
    const s = _parseSets(p.resultado);
    const r1 = grupo.tabla.find(r => r.parejaId === p.pareja1);
    const r2 = grupo.tabla.find(r => r.parejaId === p.pareja2);
    if (!r1 || !r2) return;
    r1.SG += s.p1Sets; r1.SP += s.p2Sets; r1.JG += s.p1Games; r1.JP += s.p2Games;
    r2.SG += s.p2Sets; r2.SP += s.p1Sets; r2.JG += s.p2Games; r2.JP += s.p1Games;
    if (p.ganador === p.pareja1) { r1.V++; r1.Pts += 3; r2.D++; }
    else { r2.V++; r2.Pts += 3; r1.D++; }
  });
  _sortTabla(grupo);
}

function _generarRoundRobin(grupoLetra, parejaIds) {
  const partidos = [];
  for (let i = 0; i < parejaIds.length; i++) {
    for (let j = i + 1; j < parejaIds.length; j++) {
      partidos.push({
        id: `${grupoLetra}-${parejaIds[i]}-vs-${parejaIds[j]}-${Math.random().toString(36).substr(2, 5)}`,
        pareja1: parejaIds[i],
        pareja2: parejaIds[j],
        hora: null,
        resultado: null,
        ganador: null
      });
    }
  }
  return partidos;
}

function _avanzarBracket(torneo, partido) {
  if (!partido.nextId || !partido.ganador) return;
  const next = torneo.bracket.find(p => p.id === partido.nextId);
  if (!next) return;
  if (partido.nextPos === 'p1') next.pareja1 = partido.ganador;
  else next.pareja2 = partido.ganador;
  if (partido.fase === 'final' && partido.ganador) {
    torneo.campeon = partido.ganador;
    torneo.estado = 'finalizado';
  }
}

function _generarBracket(torneo) {
  const letras = Object.keys(torneo.grupos).sort();
  const clas = {};
  letras.forEach(l => { clas[l] = torneo.grupos[l].tabla.slice(0, 2).map(r => r.parejaId); });

  const bracket = [];
  const mkPartido = (id, fase, slot, etiqueta, p1, p2, nextId, nextPos) => ({
    id, fase, slot, etiqueta,
    pareja1: p1 || null, pareja2: p2 || null,
    hora: null, resultado: null, ganador: null,
    nextId: nextId || null, nextPos: nextPos || null
  });

  if (letras.length >= 4) {
    const [qf1, qf2, qf3, qf4, sf1, sf2, fin] = [_uid(), _uid(), _uid(), _uid(), _uid(), _uid(), _uid()];
    bracket.push(
      mkPartido(qf1, 'cuartos', 'QF1', 'Cuartos 1', clas.A[0], clas.D[1], sf1, 'p1'),
      mkPartido(qf2, 'cuartos', 'QF2', 'Cuartos 2', clas.B[0], clas.C[1], sf1, 'p2'),
      mkPartido(qf3, 'cuartos', 'QF3', 'Cuartos 3', clas.C[0], clas.B[1], sf2, 'p1'),
      mkPartido(qf4, 'cuartos', 'QF4', 'Cuartos 4', clas.D[0], clas.A[1], sf2, 'p2'),
      mkPartido(sf1, 'semifinal', 'SF1', 'Semifinal 1', null, null, fin, 'p1'),
      mkPartido(sf2, 'semifinal', 'SF2', 'Semifinal 2', null, null, fin, 'p2'),
      mkPartido(fin, 'final', 'F', 'Gran Final', null, null, null, null)
    );
  } else if (letras.length === 3) {
    const mejoresTerceros = letras.map(l => torneo.grupos[l].tabla[2]).filter(Boolean)
      .sort((a, b) => b.Pts - a.Pts);
    const [sf1, sf2, fin] = [_uid(), _uid(), _uid()];
    bracket.push(
      mkPartido(sf1, 'semifinal', 'SF1', 'Semifinal 1', clas.A[0], mejoresTerceros[0]?.parejaId || null, fin, 'p1'),
      mkPartido(sf2, 'semifinal', 'SF2', 'Semifinal 2', clas.B[0], clas.C[0], fin, 'p2'),
      mkPartido(fin, 'final', 'F', 'Gran Final', null, null, null, null)
    );
  } else if (letras.length === 2) {
    const [sf1, sf2, fin] = [_uid(), _uid(), _uid()];
    bracket.push(
      mkPartido(sf1, 'semifinal', 'SF1', 'Semifinal 1', clas.A[0], clas.B[1], fin, 'p1'),
      mkPartido(sf2, 'semifinal', 'SF2', 'Semifinal 2', clas.B[0], clas.A[1], fin, 'p2'),
      mkPartido(fin, 'final', 'F', 'Gran Final', null, null, null, null)
    );
  } else {
    const fin = _uid();
    bracket.push(mkPartido(fin, 'final', 'F', 'Gran Final', clas.A[0], clas.A[1], null, null));
  }

  torneo.bracket = bracket;
  torneo.estado = 'bracket';
  return torneo;
}

/* ─── DATOS DE DEMO ──────────────────────────────────────── */

const _demo = {

  horarios: () => [
    { hora: '08:00', libres: 4 },
    { hora: '09:00', libres: 2 },
    { hora: '10:00', libres: 3 },
    { hora: '11:00', libres: 1 },
    { hora: '15:00', libres: 3 },
    { hora: '16:00', libres: 2 },
    { hora: '17:00', libres: 0 },
    { hora: '18:00', libres: 1 },
    { hora: '19:00', libres: 4 },
    { hora: '20:00', libres: 0 },
    { hora: '21:00', libres: 2 },
    { hora: '22:00', libres: 3 },
  ],

  reservasAdmin: () => {
    const horasBase = ['08:00','09:00','10:00','11:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00'];
    const datos = {
      'cancha-1': [
        { claveUnica: 'c1-08', hora: '08:00', nombre: 'Martín Gómez', telefono: '1145678901', metodoPago: 'efectivo', estado: 'pagado' },
        { claveUnica: 'c1-15', hora: '15:00', nombre: 'Lucas Herrera', telefono: '1167891234', metodoPago: 'mercadopago', estado: 'pendiente' },
        { claveUnica: 'c1-19', hora: '19:00', nombre: 'Sebastián Mora', telefono: '1156781234', metodoPago: 'transferencia', estado: 'pagado' },
        { claveUnica: 'c1-21', hora: '21:00', nombre: 'Diego Fernández', telefono: '1178904567', metodoPago: 'efectivo', estado: 'pendiente' },
      ],
      'cancha-2': [
        { claveUnica: 'c2-09', hora: '09:00', nombre: 'Carla Méndez', telefono: '1134567890', metodoPago: 'mercadopago', estado: 'pagado' },
        { claveUnica: 'c2-16', hora: '16:00', nombre: 'Valeria Torres', telefono: '1145670123', metodoPago: 'efectivo', estado: 'pagado' },
        { claveUnica: 'c2-20', hora: '20:00', nombre: 'Paula Sánchez', telefono: '1156783456', metodoPago: 'transferencia', estado: 'pendiente' },
        { claveUnica: 'c2-22', hora: '22:00', nombre: 'Andrea López', telefono: '1167896789', metodoPago: 'efectivo', estado: 'pagado' },
      ],
      'cancha-3': [
        { claveUnica: 'c3-10', hora: '10:00', nombre: 'Roberto Díaz', telefono: '1189012345', metodoPago: 'efectivo', estado: 'pagado' },
        { claveUnica: 'c3-17', hora: '17:00', nombre: 'Gustavo Ruiz', telefono: '1190123456', metodoPago: 'mercadopago', estado: 'pendiente' },
        { claveUnica: 'c3-21', hora: '21:00', nombre: 'Nicolás Vega', telefono: '1112345678', metodoPago: 'efectivo', estado: 'pagado' },
      ],
      'cancha-4': [
        { claveUnica: 'c4-11', hora: '11:00', nombre: 'Fernando Castro', telefono: '1123456789', metodoPago: 'transferencia', estado: 'pagado' },
        { claveUnica: 'c4-18', hora: '18:00', nombre: 'Agustín Romero', telefono: '1134560123', metodoPago: 'efectivo', estado: 'pagado' },
        { claveUnica: 'c4-20', hora: '20:00', nombre: 'Emilio Suárez', telefono: '1145671234', metodoPago: 'mercadopago', estado: 'pendiente' },
        { claveUnica: 'c4-22', hora: '22:00', nombre: 'Ricardo Álvarez', telefono: '1156782345', metodoPago: 'efectivo', estado: 'pagado' },
      ],
    };
    const canchas = [
      { id: 'cancha-1', nombre: 'Cancha 1', tipo: 'Cubierta' },
      { id: 'cancha-2', nombre: 'Cancha 2', tipo: 'Cubierta' },
      { id: 'cancha-3', nombre: 'Cancha 3', tipo: 'Aire libre' },
      { id: 'cancha-4', nombre: 'Cancha 4', tipo: 'Aire libre' },
    ];
    return canchas.map(c => ({
      ...c,
      horas: horasBase.map(h => {
        const reserva = datos[c.id].find(r => r.hora === h);
        return reserva ? { ...reserva, tipo: 'ocupado' } : { hora: h, tipo: 'libre' };
      })
    }));
  },

  torneos: () => [
    // ─── Torneo 1: Inscripción abierta ─────────────────────
    {
      _id: 'torneo-1',
      nombre: 'Copa Primavera 2026',
      fecha: '2026-06-01',
      estado: 'inscripcion',
      inscripciones: [
        { id: 't1p1', jugador1: { nombre: 'Martín Gómez', telefono: '1145678901' }, jugador2: { nombre: 'Lucas Herrera', telefono: '1167891234' }, nombrePareja: 'Gómez / Herrera', estadoInscripcion: 'aceptada' },
        { id: 't1p2', jugador1: { nombre: 'Roberto Díaz', telefono: '1189012345' }, jugador2: { nombre: 'Gustavo Ruiz', telefono: '1190123456' }, nombrePareja: 'Díaz / Ruiz', estadoInscripcion: 'aceptada' },
        { id: 't1p3', jugador1: { nombre: 'Fernando Castro', telefono: '1123456789' }, jugador2: { nombre: 'Agustín Romero', telefono: '1134560123' }, nombrePareja: 'Castro / Romero', estadoInscripcion: 'pendiente' },
        { id: 't1p4', jugador1: { nombre: 'Emilio Suárez', telefono: '1145671234' }, jugador2: { nombre: 'Ricardo Álvarez', telefono: '1156782345' }, nombrePareja: 'Suárez / Álvarez', estadoInscripcion: 'pendiente' },
      ],
      grupos: {},
      bracket: [],
      campeon: null,
    },

    // ─── Torneo 2: Finalizado (Copa Otoño 2025) ────────────
    {
      _id: 'torneo-2',
      nombre: 'Copa Otoño 2025',
      fecha: '2025-10-15',
      estado: 'finalizado',
      inscripciones: [
        { id: 't2p1', jugador1: { nombre: 'Martín Gómez', telefono: '1145678901' }, jugador2: { nombre: 'Lucas Herrera', telefono: '1167891234' }, nombrePareja: 'Gómez / Herrera', estadoInscripcion: 'aceptada' },
        { id: 't2p2', jugador1: { nombre: 'Roberto Díaz', telefono: '1189012345' }, jugador2: { nombre: 'Gustavo Ruiz', telefono: '1190123456' }, nombrePareja: 'Díaz / Ruiz', estadoInscripcion: 'aceptada' },
        { id: 't2p3', jugador1: { nombre: 'Diego Fernández', telefono: '1178904567' }, jugador2: { nombre: 'Sebastián Mora', telefono: '1156781234' }, nombrePareja: 'Fernández / Mora', estadoInscripcion: 'aceptada' },
        { id: 't2p4', jugador1: { nombre: 'Fernando Castro', telefono: '1123456789' }, jugador2: { nombre: 'Agustín Romero', telefono: '1134560123' }, nombrePareja: 'Castro / Romero', estadoInscripcion: 'aceptada' },
        { id: 't2p5', jugador1: { nombre: 'Emilio Suárez', telefono: '1145671234' }, jugador2: { nombre: 'Ricardo Álvarez', telefono: '1156782345' }, nombrePareja: 'Suárez / Álvarez', estadoInscripcion: 'aceptada' },
        { id: 't2p6', jugador1: { nombre: 'Nicolás Vega', telefono: '1112345678' }, jugador2: { nombre: 'Pablo Méndez', telefono: '1123450000' }, nombrePareja: 'Vega / Méndez', estadoInscripcion: 'aceptada' },
        { id: 't2p7', jugador1: { nombre: 'Carlos López', telefono: '1111111111' }, jugador2: { nombre: 'Andrés García', telefono: '1122222222' }, nombrePareja: 'López / García', estadoInscripcion: 'aceptada' },
        { id: 't2p8', jugador1: { nombre: 'Tomás Benítez', telefono: '1133333333' }, jugador2: { nombre: 'Ignacio Cruz', telefono: '1144444444' }, nombrePareja: 'Benítez / Cruz', estadoInscripcion: 'aceptada' },
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
      campeon: 't2p1',
    },
  ],

  profesores: [
    {
      _id: 'prof-1',
      nombre: 'Carlos Rodríguez',
      especialidad: 'Entrenamiento competitivo',
      experiencia: '10 años de trayectoria en torneos nacionales',
      horarios: 'Lun a Vie 16:00–22:00',
      alumnos: 24,
      whatsapp: '5491145678901',
      niveles: ['Intermedio', 'Avanzado'],
      gruposEdad: ['Adultos', 'Senior'],
      rating: 4.9,
      imagen: '',
    },
    {
      _id: 'prof-2',
      nombre: 'Valentina López',
      especialidad: 'Iniciación y técnica de base',
      experiencia: '6 años formando jugadores desde cero',
      horarios: 'Mar, Jue y Sáb 15:00–20:00',
      alumnos: 18,
      whatsapp: '5491156781234',
      niveles: ['Principiante', 'Intermedio'],
      gruposEdad: ['Niños', 'Adultos'],
      rating: 4.8,
      imagen: '',
    },
    {
      _id: 'prof-3',
      nombre: 'Javier Méndez',
      especialidad: 'Táctica y juego en pareja',
      experiencia: '8 años como entrenador de dobles',
      horarios: 'Lun, Mié y Vie 18:00–23:00',
      alumnos: 15,
      whatsapp: '5491167891234',
      niveles: ['Intermedio', 'Avanzado'],
      gruposEdad: ['Adultos'],
      rating: 4.7,
      imagen: '',
    },
  ],

  socios: [
    { _id: 's1', nombre: 'Martín Gómez', telefono: '1145678901', puntos: 320, ultimoMetodo: 'efectivo', ultimoTurno: '2025-10-15', estado: 'activo' },
    { _id: 's2', nombre: 'Carla Méndez', telefono: '1134567890', puntos: 210, ultimoMetodo: 'mercadopago', ultimoTurno: '2025-10-14', estado: 'activo' },
    { _id: 's3', nombre: 'Roberto Díaz', telefono: '1189012345', puntos: 150, ultimoMetodo: 'efectivo', ultimoTurno: '2025-10-13', estado: 'activo' },
    { _id: 's4', nombre: 'Fernando Castro', telefono: '1123456789', puntos: 80, ultimoMetodo: 'transferencia', ultimoTurno: '2025-10-08', estado: 'inactivo' },
    { _id: 's5', nombre: 'Valeria Torres', telefono: '1145670123', puntos: 430, ultimoMetodo: 'efectivo', ultimoTurno: '2025-10-15', estado: 'activo' },
  ],

  dashboard: {
    reservasHoy: 11,
    ingresosHoy: 27500,
    canchasOcupadas: 3,
    sociosActivos: 4,
    variacionReservas: '+2 vs ayer',
    variacionIngresos: '+$4.500 vs ayer',
    canchasRealtime: [
      { num: 1, tipo: 'Cubierta', jugando: true, jugadores: 'Martín G. / Lucas H.', prox: '19:00 — Sebastián M.' },
      { num: 2, tipo: 'Cubierta', jugando: false, jugadores: null, prox: '16:00 — Carla M.' },
      { num: 3, tipo: 'Aire libre', jugando: true, jugadores: 'Roberto D. / Gustavo R.', prox: '17:00 — Gustavo R.' },
      { num: 4, tipo: 'Aire libre', jugando: false, jugadores: null, prox: '16:00 — Fernando C.' },
    ],
    metodos: [
      { nombre: 'Efectivo', monto: 14000, porcentaje: 51 },
      { nombre: 'MercadoPago', monto: 8500, porcentaje: 31 },
      { nombre: 'Transferencia', monto: 5000, porcentaje: 18 },
    ],
    alertas: [
      { tipo: 'amarillo', icono: '⚠️', texto: '2 reservas pendientes de cobro en Cancha 2' },
      { tipo: 'verde', icono: '✅', texto: 'Cancha 1 y 3 están al máximo de ocupación hoy' },
      { tipo: 'amarillo', icono: '🏆', texto: 'Copa Primavera 2026: inscripción abierta, 2 parejas confirmadas' },
    ],
  },

  ingresosHoy: { total: 27500, reservas: 11, promedio: 2500, metodo_top: 'Efectivo' },
  ingresosSemana: { total: 148000, reservas: 59, promedio: 21142, mejor_dia: 'Sábado' },
  metodosSemana: [
    { nombre: 'Efectivo', monto: 72000, porcentaje: 49 },
    { nombre: 'MercadoPago', monto: 48000, porcentaje: 32 },
    { nombre: 'Transferencia', monto: 28000, porcentaje: 19 },
  ],
};

/* ─── ESTADO LOCAL DEMO ──────────────────────────────────── */
let _reservasDemo = null;
let _profesoresDemo = null;
let _torneosDemo = null;
let _sociosDemo = null;

function _delay(ms = 350) {
  return new Promise(r => setTimeout(r, ms));
}

/* ─── HELPERS INTERNOS ────────────────────────────────────── */

function _getTorneosDemo() {
  if (!_torneosDemo) _torneosDemo = JSON.parse(JSON.stringify(_demo.torneos()));
  return _torneosDemo;
}

function _findPareja(torneo, parejaId) {
  return torneo.inscripciones.find(i => i.id === parejaId) || null;
}

function _getParejaNombre(torneo, parejaId) {
  const p = _findPareja(torneo, parejaId);
  return p ? p.nombrePareja : (parejaId || '—');
}

function _findPartidoEnGrupos(torneo, partidoId) {
  for (const [letra, grupo] of Object.entries(torneo.grupos || {})) {
    const p = (grupo.partidos || []).find(p => p.id === partidoId);
    if (p) return { partido: p, grupo, letra };
  }
  return null;
}

function _findPartidoEnBracket(torneo, partidoId) {
  return (torneo.bracket || []).find(p => p.id === partidoId) || null;
}

/* ─── API DEMO ───────────────────────────────────────────── */

const api = {

  /* ── Horarios ── */
  getHorarios: async () => {
    await _delay();
    return _demo.horarios();
  },

  reservar: async (datos) => {
    await _delay(600);
    const canchas = ['Cubierta', 'Cubierta', 'Aire libre', 'Aire libre'];
    const cancha = Math.floor(Math.random() * 4) + 1;
    return { ...datos, cancha, tipo: canchas[cancha - 1], claveUnica: 'demo-' + Date.now() };
  },

  getReservasAdmin: async () => {
    await _delay();
    if (!_reservasDemo) _reservasDemo = _demo.reservasAdmin();
    return _reservasDemo;
  },

  marcarPagado: async ({ claveUnica, metodoPago }) => {
    await _delay(300);
    if (_reservasDemo) {
      _reservasDemo.forEach(c => {
        const slot = c.horas.find(h => h.claveUnica === claveUnica);
        if (slot) { slot.estado = 'pagado'; slot.metodoPago = metodoPago; }
      });
    }
    toast('Pago registrado ✓', 'verde');
    return { ok: true };
  },

  agregarTurnoAdmin: async (datos) => {
    await _delay(400);
    if (_reservasDemo) {
      const cancha = _reservasDemo.find(c => c.id === datos.canchaId);
      if (cancha) {
        const slot = cancha.horas.find(h => h.hora === datos.hora);
        if (slot) Object.assign(slot, { ...datos, tipo: 'ocupado', estado: 'pendiente', claveUnica: 'demo-' + Date.now() });
      }
    }
    return { ok: true };
  },

  quitarTurno: async ({ claveUnica }) => {
    await _delay(300);
    if (_reservasDemo) {
      _reservasDemo.forEach(c => {
        const i = c.horas.findIndex(h => h.claveUnica === claveUnica);
        if (i !== -1) c.horas[i] = { hora: c.horas[i].hora, tipo: 'libre' };
      });
    }
    return { ok: true };
  },

  /* ── Torneos ── */

  getTorneos: async () => {
    await _delay();
    return _getTorneosDemo();
  },

  getTorneo: async (id) => {
    await _delay(300);
    return _getTorneosDemo().find(t => t._id === id) || null;
  },

  crearTorneo: async ({ nombre, fecha }) => {
    await _delay(400);
    const nuevo = {
      _id: 'torneo-' + Date.now(),
      nombre, fecha,
      estado: 'inscripcion',
      inscripciones: [],
      grupos: {},
      bracket: [],
      campeon: null,
    };
    _getTorneosDemo().unshift(nuevo);
    toast('Torneo creado ✓', 'verde');
    return nuevo;
  },

  eliminarTorneo: async (id) => {
    await _delay(300);
    _torneosDemo = _getTorneosDemo().filter(t => t._id !== id);
    toast('Torneo eliminado', '');
    return { ok: true };
  },

  /* Inscripción pública (desde frontend) — queda pendiente hasta que admin acepte */
  inscribirsePublico: async (torneoId, { jugador1, jugador2 }) => {
    await _delay(500);
    const torneo = _getTorneosDemo().find(t => t._id === torneoId);
    if (!torneo) throw new Error('Torneo no encontrado');
    if (torneo.estado !== 'inscripcion') throw new Error('El torneo ya no acepta inscripciones');
    const nombrePareja = `${jugador1.nombre.split(' ').pop()} / ${jugador2.nombre.split(' ').pop()}`;
    const nueva = {
      id: _uid(),
      jugador1, jugador2,
      nombrePareja,
      estadoInscripcion: 'pendiente',
    };
    torneo.inscripciones.push(nueva);
    return { ok: true, inscripcion: nueva };
  },

  /* Admin agrega pareja directamente — queda aceptada */
  agregarParejaAdmin: async (torneoId, { jugador1, jugador2 }) => {
    await _delay(400);
    const torneo = _getTorneosDemo().find(t => t._id === torneoId);
    if (!torneo) throw new Error('Torneo no encontrado');
    const nombrePareja = `${jugador1.nombre.split(' ').pop()} / ${jugador2.nombre.split(' ').pop()}`;
    const nueva = {
      id: _uid(),
      jugador1, jugador2,
      nombrePareja,
      estadoInscripcion: 'aceptada',
    };
    torneo.inscripciones.push(nueva);
    toast('Pareja agregada ✓', 'verde');
    return torneo;
  },

  /* Admin acepta inscripción pendiente */
  aceptarInscripcion: async (torneoId, inscripcionId) => {
    await _delay(300);
    const torneo = _getTorneosDemo().find(t => t._id === torneoId);
    if (!torneo) throw new Error('Torneo no encontrado');
    const insc = torneo.inscripciones.find(i => i.id === inscripcionId);
    if (insc) insc.estadoInscripcion = 'aceptada';
    toast('Inscripción aceptada ✓', 'verde');
    return torneo;
  },

  /* Admin rechaza / elimina inscripción */
  eliminarInscripcion: async (torneoId, inscripcionId) => {
    await _delay(300);
    const torneo = _getTorneosDemo().find(t => t._id === torneoId);
    if (!torneo) throw new Error('Torneo no encontrado');
    torneo.inscripciones = torneo.inscripciones.filter(i => i.id !== inscripcionId);
    toast('Pareja eliminada', '');
    return torneo;
  },

  /* Genera grupos automáticos (sorteo WPT) */
  generarGrupos: async (torneoId) => {
    await _delay(600);
    const torneo = _getTorneosDemo().find(t => t._id === torneoId);
    if (!torneo) throw new Error('Torneo no encontrado');

    const aceptadas = torneo.inscripciones.filter(i => i.estadoInscripcion === 'aceptada');
    if (aceptadas.length < 2) throw new Error('Se necesitan al menos 2 parejas aceptadas');

    // Mezcla aleatoria (Fisher-Yates)
    const shuffled = [...aceptadas];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const n = shuffled.length;
    let numGrupos;
    if (n <= 4) numGrupos = 1;
    else if (n <= 8) numGrupos = 2;
    else if (n <= 12) numGrupos = 3;
    else numGrupos = 4;

    const letras = ['A', 'B', 'C', 'D'].slice(0, numGrupos);
    torneo.grupos = {};

    letras.forEach((letra, idx) => {
      const inicio = Math.floor(idx * n / numGrupos);
      const fin = Math.floor((idx + 1) * n / numGrupos);
      const parejasDel = shuffled.slice(inicio, fin);
      const ids = parejasDel.map(p => p.id);

      torneo.grupos[letra] = {
        parejas: ids,
        tabla: ids.map(id => ({ parejaId: id, V: 0, D: 0, SG: 0, SP: 0, JG: 0, JP: 0, Pts: 0 })),
        partidos: _generarRoundRobin(letra, ids),
      };
    });

    torneo.estado = 'grupos';
    torneo.bracket = [];
    torneo.campeon = null;
    toast('Grupos generados ✓', 'verde');
    return torneo;
  },

  /* Actualiza hora o resultado de un partido de grupo */
  actualizarPartidoGrupo: async (torneoId, grupoLetra, partidoId, { hora, resultado, ganador }) => {
    await _delay(350);
    const torneo = _getTorneosDemo().find(t => t._id === torneoId);
    if (!torneo) throw new Error('Torneo no encontrado');
    const grupo = torneo.grupos[grupoLetra];
    if (!grupo) throw new Error('Grupo no encontrado');
    const partido = grupo.partidos.find(p => p.id === partidoId);
    if (!partido) throw new Error('Partido no encontrado');

    if (hora !== undefined) partido.hora = hora;
    if (resultado !== undefined && ganador !== undefined) {
      partido.resultado = resultado;
      partido.ganador = ganador;
      _recalcularTabla(grupo);
    }

    toast('Partido actualizado ✓', 'verde');
    return torneo;
  },

  /* Genera el cuadro eliminatorio (WPT) */
  generarBracket: async (torneoId) => {
    await _delay(600);
    const torneo = _getTorneosDemo().find(t => t._id === torneoId);
    if (!torneo) throw new Error('Torneo no encontrado');

    const letras = Object.keys(torneo.grupos).sort();
    for (const l of letras) {
      const pendientes = torneo.grupos[l].partidos.filter(p => !p.ganador);
      if (pendientes.length > 0) throw new Error(`Hay partidos sin resultado en Grupo ${l}`);
    }

    _generarBracket(torneo);
    toast('Cuadro eliminatorio generado ✓', 'verde');
    return torneo;
  },

  /* Actualiza hora o resultado de un partido del bracket */
  actualizarPartidoBracket: async (torneoId, partidoId, { hora, resultado, ganador }) => {
    await _delay(350);
    const torneo = _getTorneosDemo().find(t => t._id === torneoId);
    if (!torneo) throw new Error('Torneo no encontrado');
    const partido = torneo.bracket.find(p => p.id === partidoId);
    if (!partido) throw new Error('Partido no encontrado');

    if (hora !== undefined) partido.hora = hora;
    if (resultado !== undefined && ganador !== undefined) {
      partido.resultado = resultado;
      partido.ganador = ganador;
      _avanzarBracket(torneo, partido);
    }

    toast('Resultado cargado ✓', 'verde');
    return torneo;
  },

  /* ── Profesores ── */

  getProfesores: async () => {
    await _delay();
    if (!_profesoresDemo) _profesoresDemo = JSON.parse(JSON.stringify(_demo.profesores));
    return _profesoresDemo;
  },

  agregarProfesor: async (datos) => {
    await _delay(400);
    if (!_profesoresDemo) _profesoresDemo = JSON.parse(JSON.stringify(_demo.profesores));
    const nuevo = { _id: 'prof-' + Date.now(), ...datos };
    _profesoresDemo.push(nuevo);
    toast('Profesor agregado ✓', 'verde');
    return nuevo;
  },

  editarProfesor: async (id, datos) => {
    await _delay(300);
    if (_profesoresDemo) {
      const i = _profesoresDemo.findIndex(p => p._id === id);
      if (i !== -1) _profesoresDemo[i] = { ..._profesoresDemo[i], ...datos };
    }
    toast('Profesor actualizado ✓', 'verde');
    return { ok: true };
  },

  quitarProfesor: async (id) => {
    await _delay(300);
    if (_profesoresDemo) _profesoresDemo = _profesoresDemo.filter(p => p._id !== id);
    toast('Profesor eliminado', '');
    return { ok: true };
  },

  /* ── Socios ── */

  getSocios: async () => {
    await _delay();
    if (!_sociosDemo) _sociosDemo = JSON.parse(JSON.stringify(_demo.socios));
    return _sociosDemo;
  },

  getSocioPuntos: async (tel) => {
    await _delay(300);
    if (!_sociosDemo) _sociosDemo = JSON.parse(JSON.stringify(_demo.socios));
    return _sociosDemo.find(s => s.telefono === tel) || null;
  },

  ajustarPuntos: async (id, puntos) => {
    await _delay(300);
    if (_sociosDemo) {
      const s = _sociosDemo.find(s => s._id === id);
      if (s) s.puntos = Math.max(0, (s.puntos || 0) + puntos);
    }
    toast('Puntos actualizados ✓', 'verde');
    return { ok: true };
  },

  editarSocio: async (id, datos) => {
    await _delay(300);
    if (_sociosDemo) {
      const i = _sociosDemo.findIndex(s => s._id === id);
      if (i !== -1) _sociosDemo[i] = { ..._sociosDemo[i], ...datos };
    }
    toast('Socio actualizado ✓', 'verde');
    return { ok: true };
  },

  /* ── Ingresos / Dashboard ── */

  getReporte: async () => {
    await _delay();
    return { hoy: _demo.ingresosHoy, semana: _demo.ingresosSemana, metodos: _demo.metodosSemana };
  },

  getReporteMes: async (año, mes) => {
    await _delay();
    const seed = (año * 12 + mes) % 8;
    const totales  = [285000, 312000, 298000, 340000, 275000, 325000, 308000, 354000];
    const reservas = [114,    125,    119,    136,    110,    130,    123,    142];
    const mejores  = ['Sábado','Viernes','Sábado','Domingo','Sábado','Viernes','Sábado','Domingo'];
    const total = totales[seed];
    const dias  = new Date(año, mes, 0).getDate();
    const ef    = Math.round(total * 0.50);
    const mp    = Math.round(total * 0.32);
    const tr    = total - ef - mp;
    return {
      mes: { total, reservas: reservas[seed], promedio: Math.round(total / dias), mejor_dia: mejores[seed] },
      metodos: [
        { nombre: 'Efectivo',      monto: ef, porcentaje: 50 },
        { nombre: 'MercadoPago',   monto: mp, porcentaje: 32 },
        { nombre: 'Transferencia', monto: tr, porcentaje: 18 },
      ]
    };
  },

  getDashboard: async () => {
    await _delay();
    return _demo.dashboard;
  },
};

/* ─── UTILIDADES GLOBALES ─────────────────────────────────── */

function toast(msg, tipo = '') {
  let c = document.getElementById('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = `toast${tipo ? ' toast-' + tipo : ''}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(30px)';
    t.style.transition = '.3s';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

function spinner(contenedor) {
  if (!contenedor) return;
  contenedor.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><p>Cargando...</p></div>';
}

function formatFecha(fechaStr) {
  if (!fechaStr) return '';
  const [y, m, d] = fechaStr.split('-');
  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const fecha = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  return `${dias[fecha.getDay()]} ${d}/${m}`;
}

function formatFechaLarga(fechaStr) {
  if (!fechaStr) return '';
  const [y, m, d] = fechaStr.split('-');
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const fecha = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  return `${dias[fecha.getDay()]} ${parseInt(d)} de ${meses[parseInt(m) - 1]}`;
}

function hoy() {
  return new Date().toISOString().split('T')[0];
}

function iniciales(nombre) {
  return nombre.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase();
}

function formatMonto(n) {
  return '$' + (n || 0).toLocaleString('es-AR');
}
