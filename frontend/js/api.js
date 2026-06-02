/* ═══════════════════════════════════════════════════════════
   api.js — DEMO / PRODUCCIÓN
   DEMO_MODE = true  → datos locales en memoria
   DEMO_MODE = false → fetch al backend (Railway)
   ═══════════════════════════════════════════════════════════ */

const DEMO_MODE = window.__DEMO_MODE__ !== false;

const API_URL = window.__API_URL__ || '';

/* ─── TIME HELPERS ──────────────────────────────────────── */
function _timeToMin(t) { const [h,m]=t.split(':').map(Number); return h*60+m; }
function _minToTime(m) { const h=Math.floor(m/60)%24; return String(h).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }
function _cierreMin() { const c=_timeToMin(HORA_CIERRE); return c<=_timeToMin(HORA_APERTURA)?c+1440:c; }

/* ─── CANCHAS CONFIG ────────────────────────────────────── */
const CANCHAS_CONFIG = [
  { id:1, nombre:'Cancha 1', tipo:'Interior', precioHora:5000, activa:true },
  { id:2, nombre:'Cancha 2', tipo:'Interior', precioHora:5000, activa:true },
  { id:3, nombre:'Cancha 3', tipo:'Exterior', precioHora:4000, activa:true },
  { id:4, nombre:'Cancha 4', tipo:'Exterior', precioHora:4000, activa:true },
];
const HORA_APERTURA = '15:00';
const HORA_CIERRE   = '00:00';

/* ─── RESERVATIONS DB (localStorage) ───────────────────── */
const RESERVAS_DB_KEY = 'nf_padel_reservas_v3';
let _reservasDB = [];

function _loadReservasDB() {
  try { _reservasDB = JSON.parse(localStorage.getItem(RESERVAS_DB_KEY)) || []; }
  catch { _reservasDB = []; }
}
function _saveReservasDB() {
  localStorage.setItem(RESERVAS_DB_KEY, JSON.stringify(_reservasDB));
}
function _calcPrecio(canchaId, duracionMin) {
  const c = CANCHAS_CONFIG.find(x => x.id === canchaId);
  return c ? Math.round(c.precioHora * duracionMin / 60) : 0;
}

/* ─── AVAILABILITY ALGORITHM (inteligente: evita huecos muertos) ── */
const _MIN_TURNO = 60;

function _creaHuecoMuerto(reservas, canchaId, slotStart, slotEnd, apertura, cierre) {
  const court = reservas
    .filter(r => r.cancha_id === canchaId)
    .map(r => {
      let s = _timeToMin(r.hora_inicio), e = _timeToMin(r.hora_fin);
      if (e <= s) e += 1440;
      return { start: s, end: e };
    })
    .sort((a, b) => a.start - b.start);

  let prevEnd = apertura;
  for (const r of court) { if (r.end <= slotStart) prevEnd = r.end; }
  const gapBefore = slotStart - prevEnd;
  if (gapBefore > 0 && gapBefore < _MIN_TURNO) return true;

  let nextStart = cierre;
  for (const r of court) { if (r.start >= slotEnd) { nextStart = r.start; break; } }
  const gapAfter = nextStart - slotEnd;
  if (gapAfter > 0 && gapAfter < _MIN_TURNO) return true;

  return false;
}

function _calcDisponibilidad(fecha, duracionMinutos) {
  const resultados = [];
  const apertura = _timeToMin(HORA_APERTURA);
  const cierre = _cierreMin();
  const reservas = _reservasDB.filter(r => r.fecha === fecha && r.estado_reserva !== 'cancelada');

  for (let t = apertura; t + duracionMinutos <= cierre; t += 30) {
    const canchasLibres = [];
    CANCHAS_CONFIG.forEach(cancha => {
      if (!cancha.activa) return;
      const chocan = reservas.some(r =>
        r.cancha_id === cancha.id &&
        _timeToMin(r.hora_inicio) < t + duracionMinutos &&
        _timeToMin(r.hora_fin) > t
      );
      if (chocan) return;
      if (_creaHuecoMuerto(reservas, cancha.id, t, t + duracionMinutos, apertura, cierre)) return;
      canchasLibres.push({ id:cancha.id, nombre:cancha.nombre, tipo:cancha.tipo });
    });
    if (canchasLibres.length > 0) {
      resultados.push({
        hora_inicio: _minToTime(t),
        hora_fin: _minToTime(t + duracionMinutos),
        canchas_disponibles: canchasLibres.length,
        canchas: canchasLibres,
        precio_total: _calcPrecio(canchasLibres[0].id, duracionMinutos)
      });
    }
  }
  return resultados;
}

/* ─── DEMO RESERVATIONS GENERATOR ──────────────────────── */
function _generarReservasDemo() {
  const hoy = new Date().toISOString().split('T')[0];
  const base = [
    { cancha_id:1, hora_inicio:'15:00', hora_fin:'16:00', duracion_minutos:60,  cliente_nombre:'Lucas Herrera',   cliente_telefono:'1167891234', estado_pago:'pendiente', metodo_pago:null },
    { cancha_id:1, hora_inicio:'19:00', hora_fin:'21:00', duracion_minutos:120, cliente_nombre:'Sebastián Mora',  cliente_telefono:'1156781234', estado_pago:'pagado',    metodo_pago:'transferencia' },
    { cancha_id:1, hora_inicio:'22:00', hora_fin:'23:30', duracion_minutos:90,  cliente_nombre:'Martín Gómez',    cliente_telefono:'1145678901', estado_pago:'pagado',    metodo_pago:'efectivo' },
    { cancha_id:2, hora_inicio:'16:00', hora_fin:'17:00', duracion_minutos:60,  cliente_nombre:'Valeria Torres',  cliente_telefono:'1145670123', estado_pago:'pagado',    metodo_pago:'efectivo' },
    { cancha_id:2, hora_inicio:'18:30', hora_fin:'20:00', duracion_minutos:90,  cliente_nombre:'Carla Méndez',    cliente_telefono:'1134567890', estado_pago:'pagado',    metodo_pago:'mercadopago' },
    { cancha_id:2, hora_inicio:'20:00', hora_fin:'21:30', duracion_minutos:90,  cliente_nombre:'Paula Sánchez',   cliente_telefono:'1156783456', estado_pago:'pendiente', metodo_pago:null },
    { cancha_id:3, hora_inicio:'17:00', hora_fin:'18:30', duracion_minutos:90,  cliente_nombre:'Gustavo Ruiz',    cliente_telefono:'1190123456', estado_pago:'pendiente', metodo_pago:null },
    { cancha_id:3, hora_inicio:'21:00', hora_fin:'22:00', duracion_minutos:60,  cliente_nombre:'Nicolás Vega',    cliente_telefono:'1112345678', estado_pago:'pagado',    metodo_pago:'efectivo' },
    { cancha_id:3, hora_inicio:'23:00', hora_fin:'00:00', duracion_minutos:60,  cliente_nombre:'Roberto Díaz',    cliente_telefono:'1189012345', estado_pago:'pagado',    metodo_pago:'efectivo' },
    { cancha_id:4, hora_inicio:'15:00', hora_fin:'16:30', duracion_minutos:90,  cliente_nombre:'Fernando Castro',  cliente_telefono:'1123456789', estado_pago:'pagado',    metodo_pago:'transferencia' },
    { cancha_id:4, hora_inicio:'18:00', hora_fin:'19:00', duracion_minutos:60,  cliente_nombre:'Agustín Romero',  cliente_telefono:'1134560123', estado_pago:'pagado',    metodo_pago:'efectivo' },
    { cancha_id:4, hora_inicio:'20:00', hora_fin:'22:00', duracion_minutos:120, cliente_nombre:'Emilio Suárez',   cliente_telefono:'1145671234', estado_pago:'pendiente', metodo_pago:null },
  ];
  return base.map((r, i) => ({ ...r, id:`demo-${i+1}`, fecha:hoy, estado_reserva:'confirmada', created_at:hoy }));
}

function _generarHistorialReservas() {
  const today = new Date();
  const hoy = today.toISOString().split('T')[0];
  const nombres = ['Juan García','María López','Carlos Ruiz','Ana Martínez','Diego Hernández','Lucía González','Pablo Fernández','Sofía Torres','Roberto Sánchez','Valentina Díaz','Tomás Pérez','Camila Rodríguez','Andrés Gómez','Florencia Castro','Matías Silva','Julia Romero','Gustavo Morales','Natalia Jiménez','Fernando Cruz','Laura Navarro'];
  const metodos = ['efectivo','efectivo','transferencia','transferencia','mercadopago'];
  const duraciones = [60,60,60,90,90,120];
  const seed = (n) => { let x = Math.sin(n)*10000; return x - Math.floor(x); };
  const reservas = [];
  let globalId = 100;

  for (let dia = 1; dia <= 60; dia++) {
    const d = new Date(today); d.setDate(d.getDate() - dia);
    const fecha = d.toISOString().split('T')[0];
    const dow = d.getDay();
    const isWeekend = dow === 0 || dow === 6;
    let seedOffset = dia * 17;

    CANCHAS_CONFIG.forEach((cancha, ci) => {
      let cursor = _timeToMin(HORA_APERTURA);
      const cierre = _cierreMin();
      let attempts = 0;

      while (cursor < cierre && attempts < 30) {
        attempts++;
        seedOffset++;
        if (seed(seedOffset + ci*100) > (isWeekend ? 0.55 : 0.40)) {
          cursor += 30;
          continue;
        }
        const dur = duraciones[Math.floor(seed(seedOffset*7) * duraciones.length)];
        if (cursor + dur > cierre) break;

        const chocan = reservas.some(r =>
          r.cancha_id === cancha.id && r.fecha === fecha &&
          _timeToMin(r.hora_inicio) < cursor + dur && _timeToMin(r.hora_fin) > cursor
        );
        if (chocan) { cursor += 30; continue; }

        const ni = Math.floor(seed(seedOffset*3) * nombres.length);
        const mi = Math.floor(seed(seedOffset*11) * metodos.length);
        const isPagado = seed(seedOffset*5) < 0.82;
        reservas.push({
          id: `hist-${globalId++}`,
          cancha_id: cancha.id,
          fecha,
          hora_inicio: _minToTime(cursor),
          hora_fin: _minToTime(cursor + dur),
          duracion_minutos: dur,
          cliente_nombre: nombres[ni],
          cliente_telefono: '11' + String(Math.floor(seed(seedOffset*9)*90000000+10000000)),
          estado_pago: isPagado ? 'pagado' : 'pendiente',
          estado_reserva: 'confirmada',
          metodo_pago: isPagado ? metodos[mi] : null,
          created_at: fecha
        });
        cursor += dur;
      }
    });
  }
  return reservas;
}

async function _fetch(endpoint, opts = {}) {
  const token = localStorage.getItem('padelpro_token');
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API_URL + endpoint, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Error del servidor');
  }
  return res.json();
}

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

  // horarios and reservasAdmin are now handled by _reservasDB

  torneos: () => [
    // ─── Torneo 1: Inscripción abierta ─────────────────────
    {
      _id: 'torneo-1',
      nombre: 'Copa Primavera 2026',
      fecha: '2026-06-01',
      descripcion: 'Torneo de dobles mixto abierto a todos los niveles. Formato de fase de grupos + bracket eliminatorio. Los mejores 2 de cada grupo avanzan a cuartos de final. Premiación para los 3 primeros puestos. ¡Inscribite y viví la experiencia!',
      imagen: 'https://images.unsplash.com/photo-1554284126-aa88f22d8b74?w=1200&auto=format&fit=crop&q=80',
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
      descripcion: 'Torneo ya finalizado. Participaron 8 parejas en dos grupos. Fase de grupos completa y bracket eliminatorio disputado. Revivé todos los resultados y el campeón del torneo.',
      imagen: 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=1200&auto=format&fit=crop&q=80',
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

/* ─── API ────────────────────────────────────────────────── */

const _apiDemo = {

  /* ── Disponibilidad + Reservas ── */
  getDisponibilidad: async (fecha, duracionMinutos) => {
    await _delay();
    return _calcDisponibilidad(fecha, duracionMinutos || 60);
  },

  getHorarios: async (fecha) => {
    await _delay();
    return _calcDisponibilidad(fecha, 60);
  },

  reservar: async (datos) => {
    await _delay(600);
    const { fecha, hora_inicio, duracion_minutos, nombre, telefono, metodoPago } = datos;
    const dur = duracion_minutos || 60;
    const horaFin = _minToTime(_timeToMin(hora_inicio) + dur);
    const canchasLibres = CANCHAS_CONFIG.filter(cancha => {
      if (!cancha.activa) return false;
      return !_reservasDB.some(r =>
        r.cancha_id === cancha.id && r.fecha === fecha && r.estado_reserva !== 'cancelada' &&
        _timeToMin(r.hora_inicio) < _timeToMin(hora_inicio) + dur &&
        _timeToMin(r.hora_fin) > _timeToMin(hora_inicio)
      );
    });
    if (!canchasLibres.length) throw new Error('No hay canchas disponibles para ese horario');
    const cancha = canchasLibres[0];
    const reserva = {
      id: 'res-' + Date.now() + '-' + Math.random().toString(36).substr(2,4),
      cancha_id: cancha.id, fecha, hora_inicio, hora_fin: horaFin, duracion_minutos: dur,
      cliente_nombre: nombre, cliente_telefono: telefono,
      estado_pago: 'pendiente', estado_reserva: 'confirmada',
      metodo_pago: metodoPago || null, created_at: new Date().toISOString()
    };
    _reservasDB.push(reserva);
    _saveReservasDB();
    return { id: reserva.id, nombre, telefono, fecha, hora: hora_inicio, hora_inicio, hora_fin: horaFin,
      duracion_minutos: dur, cancha: cancha.id, cancha_nombre: cancha.nombre, tipo: cancha.tipo,
      precio_total: _calcPrecio(cancha.id, dur), metodoPago };
  },

  getReservasAdmin: async (fecha) => {
    await _delay();
    const f = fecha || new Date().toISOString().split('T')[0];
    return _reservasDB.filter(r => r.fecha === f && r.estado_reserva !== 'cancelada');
  },

  marcarPagado: async ({ id, metodoPago }) => {
    await _delay(300);
    const r = _reservasDB.find(x => x.id === id);
    if (r) { r.estado_pago = 'pagado'; if (metodoPago) r.metodo_pago = metodoPago; _saveReservasDB(); }
    toast('Pago registrado ✓', 'verde');
    return { ok: true };
  },

  agregarReservaAdmin: async (datos) => {
    await _delay(400);
    const { canchaId, fecha, hora_inicio, duracion_minutos, nombre, telefono } = datos;
    const dur = duracion_minutos || 60;
    const horaFin = _minToTime(_timeToMin(hora_inicio) + dur);
    const chocan = _reservasDB.some(r =>
      r.cancha_id === canchaId && r.fecha === fecha && r.estado_reserva !== 'cancelada' &&
      _timeToMin(r.hora_inicio) < _timeToMin(hora_inicio) + dur && _timeToMin(r.hora_fin) > _timeToMin(hora_inicio)
    );
    if (chocan) throw new Error('Ese horario ya está ocupado');
    const reserva = {
      id: 'adm-' + Date.now() + '-' + Math.random().toString(36).substr(2,4),
      cancha_id: canchaId, fecha, hora_inicio, hora_fin: horaFin, duracion_minutos: dur,
      cliente_nombre: nombre, cliente_telefono: telefono || '',
      estado_pago: 'pendiente', estado_reserva: 'confirmada', metodo_pago: null,
      created_at: new Date().toISOString()
    };
    _reservasDB.push(reserva); _saveReservasDB();
    return reserva;
  },

  agregarTurnoAdmin: async (datos) => {
    return _apiDemo.agregarReservaAdmin(datos);
  },

  cancelarReserva: async ({ id }) => {
    await _delay(300);
    const r = _reservasDB.find(x => x.id === id);
    if (r) { r.estado_reserva = 'cancelada'; _saveReservasDB(); }
    return { ok: true };
  },

  quitarTurno: async ({ id }) => {
    return _apiDemo.cancelarReserva({ id });
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

  crearTorneo: async ({ nombre, fecha, descripcion, imagen }) => {
    await _delay(400);
    const nuevo = {
      _id: 'torneo-' + Date.now(),
      nombre, fecha,
      descripcion: descripcion || '',
      imagen: imagen || '',
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

  aceptarInscripcion: async (torneoId, inscripcionId) => {
    await _delay(300);
    const torneo = _getTorneosDemo().find(t => t._id === torneoId);
    if (!torneo) throw new Error('Torneo no encontrado');
    const insc = torneo.inscripciones.find(i => i.id === inscripcionId);
    if (insc) insc.estadoInscripcion = 'aceptada';
    toast('Inscripción aceptada ✓', 'verde');
    return torneo;
  },

  eliminarInscripcion: async (torneoId, inscripcionId) => {
    await _delay(300);
    const torneo = _getTorneosDemo().find(t => t._id === torneoId);
    if (!torneo) throw new Error('Torneo no encontrado');
    torneo.inscripciones = torneo.inscripciones.filter(i => i.id !== inscripcionId);
    toast('Pareja eliminada', '');
    return torneo;
  },

  generarGrupos: async (torneoId) => {
    await _delay(600);
    const torneo = _getTorneosDemo().find(t => t._id === torneoId);
    if (!torneo) throw new Error('Torneo no encontrado');

    const aceptadas = torneo.inscripciones.filter(i => i.estadoInscripcion === 'aceptada');
    if (aceptadas.length < 2) throw new Error('Se necesitan al menos 2 parejas aceptadas');

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

const _apiReal = {

  /* ── Disponibilidad + Reservas ── */

  getDisponibilidad: (fecha, duracionMinutos) =>
    _fetch('/api/disponibilidad/' + (fecha || hoy()) + '?duracion=' + (duracionMinutos || 60)),

  getHorarios: (fecha) =>
    _fetch('/api/horarios/' + (fecha || hoy())),

  reservar: (datos) =>
    _fetch('/api/reservar', { method: 'POST', body: JSON.stringify(datos) }),

  getReservasAdmin: (fecha) =>
    _fetch('/api/admin/reservas/' + (fecha || hoy())),

  agregarReservaAdmin: (datos) =>
    _fetch('/api/admin/reserva', { method: 'POST', body: JSON.stringify(datos) }),

  agregarTurnoAdmin: (datos) =>
    _fetch('/api/admin/reserva', { method: 'POST', body: JSON.stringify(datos) }),

  marcarPagado: async ({ id, metodoPago }) => {
    const r = await _fetch('/api/admin/pago', { method: 'PATCH', body: JSON.stringify({ id, metodoPago }) });
    toast('Pago registrado', 'verde');
    return r;
  },

  cancelarReserva: async ({ id }) => {
    const r = await _fetch('/api/admin/reserva', { method: 'DELETE', body: JSON.stringify({ id }) });
    return r;
  },

  quitarTurno: (datos) =>
    _fetch('/api/admin/reserva', { method: 'DELETE', body: JSON.stringify(datos) }),

  /* ── Torneos ── */

  getTorneos: async () => {
    const list = await _fetch('/api/torneos');
    return list.map(t => ({ ...t, _id: String(t.id) }));
  },

  getTorneo: async (id) => {
    const t = await _fetch('/api/torneos/' + id);
    if (t) t._id = String(t.id);
    return t;
  },

  crearTorneo: async (d) => {
    const t = await _fetch('/api/admin/torneos', { method: 'POST', body: JSON.stringify(d) });
    t._id = String(t.id);
    toast('Torneo creado', 'verde');
    return t;
  },

  eliminarTorneo: async (id) => {
    const r = await _fetch('/api/admin/torneos/' + id, { method: 'DELETE' });
    toast('Torneo eliminado', '');
    return r;
  },

  inscribirsePublico: (tId, datos) =>
    _fetch('/api/torneos/' + tId + '/inscripcion', { method: 'POST', body: JSON.stringify(datos) }),

  agregarParejaAdmin: async (tId, datos) => {
    const torneo = await _fetch('/api/torneos/' + tId);
    const nombrePareja = `${datos.jugador1.nombre.split(' ').pop()} / ${datos.jugador2.nombre.split(' ').pop()}`;
    const nueva = { id: _uid(), jugador1: datos.jugador1, jugador2: datos.jugador2, nombrePareja, estadoInscripcion: 'aceptada' };
    if (!Array.isArray(torneo.inscripciones)) torneo.inscripciones = [];
    torneo.inscripciones.push(nueva);
    const u = await _fetch('/api/admin/torneos/' + tId, { method: 'PUT', body: JSON.stringify(torneo) });
    if (u) u._id = String(u.id);
    toast('Pareja agregada', 'verde'); return u;
  },

  aceptarInscripcion: async (tId, iId) => {
    const torneo = await _fetch('/api/torneos/' + tId);
    const insc = (torneo.inscripciones || []).find(i => i.id === iId);
    if (insc) insc.estadoInscripcion = 'aceptada';
    const u = await _fetch('/api/admin/torneos/' + tId, { method: 'PUT', body: JSON.stringify(torneo) });
    if (u) u._id = String(u.id);
    toast('Inscripcion aceptada', 'verde'); return u;
  },

  eliminarInscripcion: async (tId, iId) => {
    const torneo = await _fetch('/api/torneos/' + tId);
    torneo.inscripciones = (torneo.inscripciones || []).filter(i => i.id !== iId);
    const u = await _fetch('/api/admin/torneos/' + tId, { method: 'PUT', body: JSON.stringify(torneo) });
    if (u) u._id = String(u.id);
    toast('Pareja eliminada', ''); return u;
  },

  generarGrupos: async (tId) => {
    const torneo = await _fetch('/api/torneos/' + tId);
    const aceptadas = (torneo.inscripciones || []).filter(i => i.estadoInscripcion === 'aceptada');
    if (aceptadas.length < 2) throw new Error('Se necesitan al menos 2 parejas aceptadas');
    const shuffled = [...aceptadas];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    const n = shuffled.length;
    const numGrupos = n <= 4 ? 1 : n <= 8 ? 2 : n <= 12 ? 3 : 4;
    const letras = ['A','B','C','D'].slice(0, numGrupos);
    torneo.grupos = {};
    letras.forEach((letra, idx) => {
      const ids = shuffled.slice(Math.floor(idx * n / numGrupos), Math.floor((idx + 1) * n / numGrupos)).map(p => p.id);
      torneo.grupos[letra] = { parejas: ids, tabla: ids.map(id => ({ parejaId: id, V:0, D:0, SG:0, SP:0, JG:0, JP:0, Pts:0 })), partidos: _generarRoundRobin(letra, ids) };
    });
    torneo.estado = 'grupos'; torneo.bracket = []; torneo.campeon = null;
    const u = await _fetch('/api/admin/torneos/' + tId, { method: 'PUT', body: JSON.stringify(torneo) });
    if (u) u._id = String(u.id);
    toast('Grupos generados', 'verde'); return u;
  },

  actualizarPartidoGrupo: async (tId, gl, pId, datos) => {
    const torneo = await _fetch('/api/torneos/' + tId);
    const grupo = torneo.grupos?.[gl]; if (!grupo) throw new Error('Grupo no encontrado');
    const partido = (grupo.partidos || []).find(p => p.id === pId); if (!partido) throw new Error('Partido no encontrado');
    if (datos.hora !== undefined) partido.hora = datos.hora;
    if (datos.resultado !== undefined && datos.ganador !== undefined) { partido.resultado = datos.resultado; partido.ganador = datos.ganador; _recalcularTabla(grupo); }
    const u = await _fetch('/api/admin/torneos/' + tId, { method: 'PUT', body: JSON.stringify(torneo) });
    if (u) u._id = String(u.id);
    toast('Partido actualizado', 'verde'); return u;
  },

  generarBracket: async (tId) => {
    const torneo = await _fetch('/api/torneos/' + tId);
    for (const l of Object.keys(torneo.grupos || {}).sort()) { if ((torneo.grupos[l].partidos || []).some(p => !p.ganador)) throw new Error(`Hay partidos sin resultado en Grupo ${l}`); }
    _generarBracket(torneo);
    const u = await _fetch('/api/admin/torneos/' + tId, { method: 'PUT', body: JSON.stringify(torneo) });
    if (u) u._id = String(u.id);
    toast('Cuadro eliminatorio generado', 'verde'); return u;
  },

  actualizarPartidoBracket: async (tId, pId, datos) => {
    const torneo = await _fetch('/api/torneos/' + tId);
    const partido = (torneo.bracket || []).find(p => p.id === pId); if (!partido) throw new Error('Partido no encontrado');
    if (datos.hora !== undefined) partido.hora = datos.hora;
    if (datos.resultado !== undefined && datos.ganador !== undefined) { partido.resultado = datos.resultado; partido.ganador = datos.ganador; _avanzarBracket(torneo, partido); }
    const u = await _fetch('/api/admin/torneos/' + tId, { method: 'PUT', body: JSON.stringify(torneo) });
    if (u) u._id = String(u.id);
    toast('Resultado cargado', 'verde'); return u;
  },

  /* ── Profesores ── */

  getProfesores:            () => _fetch('/api/profesores'),
  agregarProfesor:          async (d) => { const p = await _fetch('/api/admin/profesores', { method: 'POST', body: JSON.stringify(d) }); toast('Profesor agregado', 'verde'); return p; },
  editarProfesor:           async (id, d) => { const p = await _fetch('/api/admin/profesores/' + id, { method: 'PATCH', body: JSON.stringify(d) }); toast('Profesor actualizado', 'verde'); return p; },
  quitarProfesor:           async (id) => { const r = await _fetch('/api/admin/profesores/' + id, { method: 'DELETE' }); toast('Profesor eliminado', ''); return r; },

  /* ── Socios ── */

  getSocios:                () => _fetch('/api/admin/socios'),
  getSocioPuntos:           (tel) => _fetch('/api/socios/' + tel),
  ajustarPuntos:            async (id, pts) => { const s = await _fetch('/api/admin/socios/' + id + '/puntos', { method: 'PATCH', body: JSON.stringify({ puntos: pts }) }); toast('Puntos actualizados', 'verde'); return s; },
  editarSocio:              async (id, d) => { const s = await _fetch('/api/admin/socios/' + id, { method: 'PATCH', body: JSON.stringify(d) }); toast('Socio actualizado', 'verde'); return s; },

  /* ── Ingresos / Dashboard ── */

  getReporte:               () => _fetch('/api/admin/ingresos/reporte'),
  getReporteMes:            (year, mes) => _fetch('/api/admin/ingresos/mes?year=' + year + '&mes=' + mes),
  getDashboard:             () => _fetch('/api/admin/dashboard'),
};

/* ─── SYNC: cargar reservas desde API al formato local ─── */

async function _syncReservasDesdeAPI() {
  if (DEMO_MODE) return;
  try {
    const hoyStr = new Date().toISOString().split('T')[0];
    const d = new Date(); d.setDate(d.getDate() - 60);
    const desde = d.toISOString().split('T')[0];
    const d2 = new Date(); d2.setDate(d2.getDate() + 7);
    const hasta = d2.toISOString().split('T')[0];
    const data = await _fetch('/api/admin/reservas?desde=' + desde + '&hasta=' + hasta);
    if (!Array.isArray(data)) return;
    _reservasDB = data.map(r => ({
      id: r.claveUnica || String(r.id),
      cancha_id: r.cancha_id,
      fecha: r.fecha,
      hora_inicio: r.hora_inicio,
      hora_fin: r.hora_fin,
      duracion_minutos: r.duracion_minutos || 60,
      cliente_nombre: r.cliente_nombre,
      cliente_telefono: r.cliente_telefono || '',
      estado_pago: r.estado_pago || 'pendiente',
      estado_reserva: r.estado_reserva || 'confirmada',
      metodo_pago: r.metodo_pago || null,
      monto: r.monto || 0,
      created_at: r.createdAt || r.fecha
    }));
    _saveReservasDB();
  } catch (e) {
    console.warn('No se pudo sincronizar reservas desde API:', e.message);
  }
}

/* ─── INIT RESERVAS ─────────────────────────────────────── */
_loadReservasDB();
if (DEMO_MODE && _reservasDB.length === 0) {
  _reservasDB = [..._generarReservasDemo(), ..._generarHistorialReservas()];
  _saveReservasDB();
}

const api = DEMO_MODE ? _apiDemo : _apiReal;

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
