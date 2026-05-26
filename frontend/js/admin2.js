/* ════════════════════════════════════════════════════
   admin2.js — Dashboard + Turnos dinámicos + Finanzas
   Slots de 30 min, duraciones variables
   ════════════════════════════════════════════════════ */

/* ─── AUTH ───────────────────────────────────────────── */
const AUTH_KEY    = 'padelpro_token';
const _ADM_API   = window.__API_URL__ || '';
const _USE_API   = window.__DEMO_MODE__ === false && !!_ADM_API;

function _apiFetch(endpoint, opts = {}) {
  const token = localStorage.getItem(AUTH_KEY);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch(_ADM_API + endpoint, { ...opts, headers }).then(async res => {
    if (res.status === 401) { doLogout(); throw new Error('Sesión expirada'); }
    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Error del servidor'); }
    return res.json();
  });
}

async function authCheck() {
  const token = localStorage.getItem(AUTH_KEY);
  if (!token) return;
  if (_USE_API) {
    try { await _apiFetch('/api/auth/verify'); document.getElementById('login-overlay').classList.add('hidden'); }
    catch { localStorage.removeItem(AUTH_KEY); }
  } else {
    document.getElementById('login-overlay').classList.add('hidden');
  }
}

async function doLogin(e) {
  e.preventDefault();
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  const btn   = document.getElementById('login-btn');
  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Ingresando...';
  if (_USE_API) {
    try {
      const data = await _apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ password: pass }) });
      localStorage.setItem(AUTH_KEY, data.token);
      document.getElementById('login-overlay').classList.add('hidden');
      renderDashboard();
    } catch (err) {
      errEl.textContent = err.message || 'Error al conectar';
      document.getElementById('login-pass').value = '';
    } finally { btn.disabled = false; btn.textContent = 'Ingresar'; }
  } else {
    if (pass !== 'newface2026') {
      errEl.textContent = 'Contraseña incorrecta. Intentá de nuevo.';
      document.getElementById('login-pass').value = '';
      btn.disabled = false; btn.textContent = 'Ingresar'; return;
    }
    localStorage.setItem(AUTH_KEY, 'token-' + Date.now());
    setTimeout(() => { document.getElementById('login-overlay').classList.add('hidden'); btn.disabled = false; btn.textContent = 'Ingresar'; }, 400);
  }
}

function doLogout() {
  localStorage.removeItem(AUTH_KEY);
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('login-overlay').classList.remove('hidden');
}

/* ─── Config ─────────────────────────────────────────── */
const CANCHAS = CANCHAS_CONFIG;
const DIAS_CORTO  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const DIAS_LARGO  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESES       = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

/* ─── Date helpers ───────────────────────────────────── */
function _key(y,m,d){ return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function todayKey(){ const d=new Date(); return _key(d.getFullYear(),d.getMonth()+1,d.getDate()); }
function getDateKey(d){ return _key(d.getFullYear(),d.getMonth()+1,d.getDate()); }

function mondayOf(d) {
  const r = new Date(d);
  const day = r.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  return r;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatArs(n) {
  if (n === 0)    return '$0';
  if (n >= 1000000) return '$' + (n/1000000).toFixed(1).replace('.0','') + 'M';
  if (n >= 1000)  return '$' + (n/1000).toFixed(0) + 'k';
  return '$' + n.toLocaleString('es-AR');
}

function formatArsLong(n) {
  return '$' + (n||0).toLocaleString('es-AR');
}

/* ─── Data helpers (read from _reservasDB) ──────────── */
function getReservasDelDia(dateKey) {
  return _reservasDB.filter(r => r.fecha === dateKey && r.estado_reserva !== 'cancelada');
}

function getReservasCancha(dateKey, canchaId) {
  return _reservasDB.filter(r => r.fecha === dateKey && r.cancha_id === canchaId && r.estado_reserva !== 'cancelada')
    .sort((a,b) => _timeToMin(a.hora_inicio) - _timeToMin(b.hora_inicio));
}

function getDayData(dateKey) {
  const reservas = getReservasDelDia(dateKey);
  let ingresos=0, pendiente=0, efectivo=0, transferencia=0, online=0;
  reservas.forEach(r => {
    const precio = _calcPrecio(r.cancha_id, r.duracion_minutos);
    if (r.estado_pago === 'pagado') {
      ingresos += precio;
      if (r.metodo_pago === 'efectivo') efectivo += precio;
      else if (r.metodo_pago === 'transferencia') transferencia += precio;
      else online += precio;
    } else {
      pendiente += precio;
    }
  });
  return { reservas: reservas.length, ingresos, pendiente, efectivo, transferencia, online };
}

function getWeekData(monday) {
  let total=0, reservas=0, bestDay=null, bestAmt=0;
  const days=[];
  for (let i=0; i<7; i++) {
    const d   = addDays(monday, i);
    const key = getDateKey(d);
    const dd  = getDayData(key);
    days.push({ date:d, key, ...dd });
    total    += dd.ingresos;
    reservas += dd.reservas;
    if (dd.ingresos > bestAmt) { bestAmt=dd.ingresos; bestDay=d; }
  }
  return { total, reservas, bestDay, bestAmt, days };
}

function getMonthData(year, month) {
  let total=0, reservas=0, bestDay=null, bestAmt=0, efectivo=0, transferencia=0, online=0, pendiente=0, turnosPendientes=0;
  const daysInMonth = new Date(year, month+1, 0).getDate();
  for (let d=1; d<=daysInMonth; d++) {
    const key = _key(year, month+1, d);
    const dd  = getDayData(key);
    total      += dd.ingresos;
    pendiente  += dd.pendiente;
    reservas   += dd.reservas;
    efectivo   += dd.efectivo;
    transferencia += dd.transferencia;
    online     += dd.online;
    if (dd.ingresos > bestAmt) { bestAmt=dd.ingresos; bestDay=new Date(year, month, d); }
    const dayReservas = getReservasDelDia(key);
    dayReservas.forEach(r => { if (r.estado_pago !== 'pagado') turnosPendientes++; });
  }
  return { total, reservas, bestDay, bestAmt, efectivo, transferencia, online, pendiente, turnosPendientes, daysInMonth };
}

/* ─── CSV Export ─────────────────────────────────────── */
function exportCSV() {
  const rows = [['Fecha','Cancha','Tipo','Hora Inicio','Hora Fin','Duración','Cliente','Estado Pago','Método de pago','Precio']];
  const fechas = [...new Set(_reservasDB.filter(r => r.estado_reserva !== 'cancelada').map(r => r.fecha))].sort();
  fechas.forEach(fecha => {
    const reservas = getReservasDelDia(fecha);
    reservas.forEach(r => {
      const cancha = CANCHAS.find(c => c.id === r.cancha_id);
      const precio = _calcPrecio(r.cancha_id, r.duracion_minutos);
      rows.push([fecha, cancha?.nombre || r.cancha_id, cancha?.tipo || '', r.hora_inicio, r.hora_fin, r.duracion_minutos+'min', r.cliente_nombre, r.estado_pago, r.metodo_pago||'—', precio]);
    });
  });
  const csv = '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `padel-finanzas-${todayKey()}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  toast('✓ CSV exportado correctamente','green');
}

/* ════════════════════════════════════════════════════
   NAVEGACIÓN TABS
   ════════════════════════════════════════════════════ */

function adm2SwitchTab(nombre, el) {
  document.querySelectorAll('.adm2-view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.adm2-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('adm2-view-'+nombre)?.classList.add('active');
  el?.classList.add('active');

  if (nombre==='dashboard') renderDashboard();
  if (nombre==='torneos')   cargarTorneosAdmin();
  if (nombre==='finanzas')  renderFinanzas();
  if (nombre==='usuarios')  renderUsuarios();
  if (nombre==='premios')   renderPremios();
}

/* ─── Modales ────────────────────────────────────────── */
function abrirModal(id) { document.getElementById(id)?.classList.add('visible'); }
function cerrarModal(id) { document.getElementById(id)?.classList.remove('visible'); }
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('visible');
});

/* ════════════════════════════════════════════════════
   RELOJ
   ════════════════════════════════════════════════════ */

function tickClock() {
  const el = document.getElementById('adm2-clock');
  if (!el) return;
  const now = new Date();
  el.textContent = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
}

/* ════════════════════════════════════════════════════
   DASHBOARD
   ════════════════════════════════════════════════════ */

function renderDashboard() {
  renderTurnos();
  updateDashStats();
}

/* ════════════════════════════════════════════════════
   TURNOS — Timeline view
   ════════════════════════════════════════════════════ */

let currentDate     = new Date();
let activePanelInfo = null;

function adm2GoToday()       { currentDate=new Date(); renderTurnos(); }
function adm2ChangeDate(d)   { currentDate=addDays(currentDate,d); renderTurnos(); }
function adm2SetVista(tipo)  {
  document.getElementById('btn-vista-dia').classList.toggle('active',tipo==='dia');
  document.getElementById('btn-vista-sem').classList.toggle('active',tipo==='semana');
}

function formatDateLabel(d) {
  return `📅 ${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

function buildTimeline(canchaId, dateKey) {
  const apertura = _timeToMin(HORA_APERTURA);
  const cierre = _timeToMin(HORA_CIERRE);
  const reservas = getReservasCancha(dateKey, canchaId);
  const segments = [];
  let cursor = apertura;

  reservas.forEach(r => {
    const start = _timeToMin(r.hora_inicio);
    const end = _timeToMin(r.hora_fin);
    if (start > cursor) {
      segments.push({ tipo:'libre', desde:_minToTime(cursor), hasta:_minToTime(start), duracion:start-cursor });
    }
    segments.push({ tipo:'ocupado', reserva:r, desde:r.hora_inicio, hasta:r.hora_fin, duracion:r.duracion_minutos });
    cursor = end;
  });

  if (cursor < cierre) {
    segments.push({ tipo:'libre', desde:_minToTime(cursor), hasta:_minToTime(cierre), duracion:cierre-cursor });
  }
  return segments;
}

function renderTurnos() {
  closeActivePanel();
  const key = getDateKey(currentDate);
  const lbl = document.getElementById('adm2-date-label');
  if (lbl) lbl.textContent = formatDateLabel(currentDate);
  const grid = document.getElementById('adm2-canchas-grid');
  if (!grid) return;
  grid.innerHTML = CANCHAS.map(c => buildCanchaCard(c, key)).join('');
  updateDashStats();
}

function buildCanchaCard(cancha, dateKey) {
  const reservas = getReservasCancha(dateKey, cancha.id);
  const timeline = buildTimeline(cancha.id, dateKey);
  const totalMinLibres = timeline.filter(s => s.tipo === 'libre').reduce((a,s) => a + s.duracion, 0);
  const horasLibres = (totalMinLibres / 60).toFixed(1).replace('.0','');
  const precioFmt = '$' + cancha.precioHora.toLocaleString('es-AR');

  const timelineHtml = timeline.map((seg, idx) => {
    if (seg.tipo === 'libre') {
      const durLabel = seg.duracion >= 60 ? (seg.duracion/60).toFixed(1).replace('.0','') + 'h' : seg.duracion + 'min';
      return `
        <div class="adm2-tl-segment libre" data-cancha="${cancha.id}" data-desde="${seg.desde}" data-hasta="${seg.hasta}" data-dur="${seg.duracion}"
             onclick="handleFreeClick(${cancha.id},'${seg.desde}','${seg.hasta}',${seg.duracion},${idx})">
          <div class="adm2-tl-time">${seg.desde} — ${seg.hasta}</div>
          <div class="adm2-tl-label">LIBRE · ${durLabel}</div>
          <div class="adm2-tl-action">+ Agendar</div>
        </div>`;
    } else {
      const r = seg.reserva;
      const durLabel = r.duracion_minutos >= 60 ? (r.duracion_minutos/60).toFixed(1).replace('.0','') + 'h' : r.duracion_minutos + 'min';
      const isPagado = r.estado_pago === 'pagado';
      const badgeCls = isPagado ? 'pagado' : 'pendiente';
      const badgeTxt = isPagado ? 'PAGADO ✓' : 'PENDIENTE';
      const precio = _calcPrecio(cancha.id, r.duracion_minutos);
      return `
        <div class="adm2-tl-segment ocupado" onclick="handleOcupadoClick(${cancha.id},'${r.id}',${idx})">
          <div class="adm2-tl-time">${r.hora_inicio} — ${r.hora_fin}</div>
          <div class="adm2-tl-cliente">${r.cliente_nombre}</div>
          <div class="adm2-tl-meta">
            <span class="adm2-tl-dur">${durLabel}</span>
            <span class="adm2-pago-badge ${badgeCls}">${badgeTxt}</span>
            <span class="adm2-tl-precio">$${precio.toLocaleString('es-AR')}</span>
          </div>
        </div>`;
    }
  }).join('');

  return `
    <div class="adm2-cancha-card">
      <div class="adm2-cancha-card-header">
        <div>
          <div class="adm2-cancha-card-nombre">${cancha.nombre}</div>
          <div class="adm2-cancha-card-meta">${cancha.tipo} · <span>${precioFmt}/h</span></div>
        </div>
        <div class="adm2-badge-libres">${reservas.length} turno${reservas.length!==1?'s':''} · ${horasLibres}h libres</div>
      </div>
      <div class="adm2-timeline" id="timeline-${cancha.id}">${timelineHtml}</div>
    </div>`;
}

/* ─── Panel interactions ─────────────────────────────── */

function handleFreeClick(canchaId, desde, hasta, durDisponible, idx) {
  if (activePanelInfo?.canchaId===canchaId && activePanelInfo?.idx===idx) {
    closeActivePanel(); return;
  }
  closeActivePanel();

  const tlEl = document.getElementById('timeline-'+canchaId);
  if (!tlEl) return;
  const segments = [...tlEl.querySelectorAll('.adm2-tl-segment')];
  const anchor = segments[idx];
  if (!anchor) return;

  const panel = document.createElement('div');
  panel.className = 'adm2-inline-panel';
  panel.innerHTML = buildAddForm(canchaId, desde, hasta, durDisponible);
  anchor.insertAdjacentElement('afterend', panel);
  requestAnimationFrame(()=>panel.classList.add('visible'));
  activePanelInfo = { canchaId, idx, panelEl:panel };
  setTimeout(()=>panel.querySelector('.adm2-input')?.focus(), 80);
}

function handleOcupadoClick(canchaId, reservaId, idx) {
  if (activePanelInfo?.canchaId===canchaId && activePanelInfo?.idx===idx) {
    closeActivePanel(); return;
  }
  closeActivePanel();

  const r = _reservasDB.find(x => x.id === reservaId);
  if (!r) return;

  const tlEl = document.getElementById('timeline-'+canchaId);
  if (!tlEl) return;
  const segments = [...tlEl.querySelectorAll('.adm2-tl-segment')];
  const anchor = segments[idx];
  if (!anchor) return;

  const panel = document.createElement('div');
  panel.className = 'adm2-inline-panel';
  panel.innerHTML = buildDetailPanel(canchaId, r);
  anchor.insertAdjacentElement('afterend', panel);
  requestAnimationFrame(()=>panel.classList.add('visible'));
  activePanelInfo = { canchaId, idx, panelEl:panel, reservaId };
}

function closeActivePanel() {
  if (activePanelInfo) { activePanelInfo.panelEl.remove(); activePanelInfo=null; }
}

function buildAddForm(canchaId, desde, hasta, durDisponible) {
  const cancha = CANCHAS.find(x=>x.id===canchaId);
  const iid = `inp-${canchaId}-${desde.replace(':','')}`;

  const startOptions = [];
  const tDesde = _timeToMin(desde);
  const tHasta = _timeToMin(hasta);
  for (let t = tDesde; t < tHasta; t += 30) {
    startOptions.push(_minToTime(t));
  }

  const durOptions = [60, 90, 120].filter(d => d <= durDisponible);
  if (durOptions.length === 0 && durDisponible >= 30) durOptions.push(durDisponible);

  return `
    <div class="adm2-panel-inner">
      <div class="adm2-panel-header">
        <span class="adm2-panel-header-title">+ Agendar · ${cancha.nombre}</span>
        <button class="adm2-panel-close" onclick="closeActivePanel()">✕</button>
      </div>
      <div class="adm2-add-form">
        <input class="adm2-input" id="${iid}" type="text" placeholder="Nombre del cliente" autocomplete="off">
        <div class="adm2-add-row">
          <select class="adm2-select" id="sel-inicio-${canchaId}">
            ${startOptions.map(h => `<option value="${h}">${h}</option>`).join('')}
          </select>
          <select class="adm2-select" id="sel-dur-${canchaId}" onchange="updateEndTime(${canchaId})">
            ${durOptions.map(d => `<option value="${d}">${d>=60?(d/60).toFixed(1).replace('.0','')+'h':d+'min'}</option>`).join('')}
          </select>
          <span class="adm2-add-precio" id="precio-${canchaId}">$${_calcPrecio(canchaId, durOptions[0]).toLocaleString('es-AR')}</span>
        </div>
        <button class="adm2-btn-agendar" onclick="agendarTurno(${canchaId},'${iid}')">✓ Agendar</button>
      </div>
    </div>`;
}

function updateEndTime(canchaId) {
  const dur = parseInt(document.getElementById('sel-dur-'+canchaId)?.value || 60);
  const precioEl = document.getElementById('precio-'+canchaId);
  if (precioEl) precioEl.textContent = '$' + _calcPrecio(canchaId, dur).toLocaleString('es-AR');
}

function buildDetailPanel(canchaId, r) {
  const cancha = CANCHAS.find(x=>x.id===canchaId);
  const ip = r.estado_pago === 'pagado';
  const precio = _calcPrecio(canchaId, r.duracion_minutos);
  const durLabel = r.duracion_minutos >= 60 ? (r.duracion_minutos/60).toFixed(1).replace('.0','')+'h' : r.duracion_minutos+'min';
  const ml = {efectivo:'💵 Efectivo', transferencia:'🏦 Transferencia', mercadopago:'💳 MercadoPago', online:'🌐 Online'};

  const metBtns = ip && !r.metodo_pago ? `
    <div class="adm2-metodo-btns">
      <button class="adm2-metodo-btn" onclick="setMetodo('${r.id}','efectivo')">💵 Efectivo</button>
      <button class="adm2-metodo-btn" onclick="setMetodo('${r.id}','transferencia')">🏦 Transferencia</button>
      <button class="adm2-metodo-btn" onclick="setMetodo('${r.id}','mercadopago')">💳 MercadoPago</button>
    </div>` : ip && r.metodo_pago ? `<div style="font-size:11px;color:#64748b;margin-top:6px">${ml[r.metodo_pago]||r.metodo_pago}</div>` : '';

  return `
    <div class="adm2-panel-inner">
      <div class="adm2-panel-header">
        <span class="adm2-panel-header-title">📋 ${r.cliente_nombre}</span>
        <button class="adm2-panel-close" onclick="closeActivePanel()">✕</button>
      </div>
      <div class="adm2-panel-info-row"><b>${r.hora_inicio} — ${r.hora_fin}</b> · ${durLabel} · ${cancha.nombre} · $${precio.toLocaleString('es-AR')}</div>
      ${r.cliente_telefono ? `<div class="adm2-panel-info-row" style="font-size:12px;color:#64748b">Tel: ${r.cliente_telefono}</div>` : ''}
      <div class="adm2-panel-section">
        <div class="adm2-payment-toggle">
          <button class="adm2-toggle-btn ${!ip?'active-red':''}" onclick="setEstado('${r.id}','pendiente')">PENDIENTE</button>
          <button class="adm2-toggle-btn ${ip?'active-green':''}" onclick="setEstado('${r.id}','pagado')">PAGADO</button>
        </div>
        ${metBtns}
      </div>
      <div class="adm2-panel-danger">
        <button class="adm2-btn-liberar" onclick="liberarTurno('${r.id}','${r.cliente_nombre}')">Liberar turno</button>
        <button class="adm2-btn-cancel-danger" onclick="closeActivePanel()">Cancelar</button>
      </div>
    </div>`;
}

async function agendarTurno(canchaId, inputId) {
  const nombre = (document.getElementById(inputId)?.value||'').trim();
  if (!nombre) { toast('Ingresá el nombre del cliente','red'); return; }
  const key = getDateKey(currentDate);
  const cancha = CANCHAS.find(x=>x.id===canchaId);
  const horaInicio = document.getElementById('sel-inicio-'+canchaId)?.value;
  const dur = parseInt(document.getElementById('sel-dur-'+canchaId)?.value || 60);

  try {
    await api.agregarReservaAdmin({ canchaId, fecha:key, hora_inicio:horaInicio, duracion_minutos:dur, nombre, telefono:'' });
    closeActivePanel(); renderTurnos();
    toast(`✓ ${nombre} agendado ${horaInicio} — ${_minToTime(_timeToMin(horaInicio)+dur)} — ${cancha.nombre}`,'green');
  } catch (err) { toast(err.message||'Error al agendar','red'); }
}

function setEstado(reservaId, estado) {
  const r = _reservasDB.find(x => x.id === reservaId);
  if (!r) return;
  r.estado_pago = estado;
  if (estado === 'pendiente') r.metodo_pago = null;
  _saveReservasDB();
  closeActivePanel(); renderTurnos();
}

function setMetodo(reservaId, metodo) {
  const r = _reservasDB.find(x => x.id === reservaId);
  if (!r) return;
  r.metodo_pago = metodo;
  _saveReservasDB();
  closeActivePanel(); renderTurnos();
}

async function liberarTurno(reservaId, nombre) {
  await api.cancelarReserva({ id: reservaId });
  closeActivePanel(); renderTurnos();
  toast(`✕ Turno de ${nombre} liberado`,'red');
}

/* ─── Dashboard stats ────────────────────────────────── */
function updateDashStats() {
  const key = getDateKey(currentDate);
  const dd  = getDayData(key);
  const reservas = getReservasDelDia(key);
  let pagados=0, pendientesCount=0, canchasConTurnos=new Set();
  const horaCount = {};

  reservas.forEach(r => {
    if (r.estado_pago === 'pagado') pagados++; else pendientesCount++;
    canchasConTurnos.add(r.cancha_id);
    const h = r.hora_inicio.split(':')[0] + ':00';
    horaCount[h] = (horaCount[h]||0) + 1;
  });

  let horaPico='—', maxC=0;
  Object.entries(horaCount).forEach(([h,c])=>{ if(c>maxC){ maxC=c; horaPico=h.replace(':00','')+'hs'; } });

  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('dash-cobrado-hoy',   formatArs(dd.ingresos));
  set('dash-cobrado-sub',   `${pagados} turno${pagados!==1?'s':''} cobrado${pagados!==1?'s':''}`);
  set('dash-pendiente',     formatArs(dd.pendiente));
  set('dash-pendiente-sub', `${pendientesCount} sin cobrar`);
  set('dash-turnos-hoy',    reservas.length);
  set('dash-canchas-con-turnos', `${canchasConTurnos.size}/4 canchas activas`);
  set('dash-hora-pico',     horaPico);

  const total = dd.efectivo + dd.transferencia + dd.online;
  const pct   = v => total > 0 ? (v/total*100).toFixed(0) : 0;
  const metEl = document.getElementById('dash-metodos');
  if(metEl) metEl.innerHTML = [
    ['💵','Efectivo','green',dd.efectivo],
    ['🏦','Transferencia','blue',dd.transferencia],
    ['💳','Online/MP','purple',dd.online],
  ].map(([icon,name,cls,v])=>`
    <div class="adm2-metodo-row">
      <span class="adm2-metodo-icon">${icon}</span>
      <span class="adm2-metodo-name">${name}</span>
      <div class="adm2-metodo-track"><div class="adm2-metodo-fill ${cls}" style="width:${pct(v)}%"></div></div>
      <span class="adm2-metodo-pct">${pct(v)}%</span>
      <span class="adm2-metodo-monto">${formatArsLong(v)}</span>
    </div>`).join('');

  const colors = {1:'#22c55e',2:'#3b82f6',3:'#eab308',4:'#a855f7'};
  const estEl  = document.getElementById('dash-estado-canchas');
  if(estEl) estEl.innerHTML = CANCHAS.map(c => {
    const cReservas = getReservasCancha(key, c.id);
    const ocu = cReservas.length;
    const pag = cReservas.filter(r=>r.estado_pago==='pagado').length;
    const pen = ocu - pag;
    const totalMin = cReservas.reduce((a,r) => a + r.duracion_minutos, 0);
    const totalHoras = _timeToMin(HORA_CIERRE) - _timeToMin(HORA_APERTURA);
    return `
      <div class="adm2-cancha-week-item">
        <div class="adm2-cancha-week-header">
          <div class="adm2-cancha-week-dot" style="background:${colors[c.id]}"></div>
          <span class="adm2-cancha-week-name">${c.nombre} · ${c.tipo}</span>
          <span class="adm2-cancha-week-count">${pag}✓${pen>0?' '+pen+'⏳':''} · ${((totalHoras-totalMin)/60).toFixed(1).replace('.0','')}h lib.</span>
        </div>
        <div class="adm2-cancha-week-track">
          <div class="adm2-cancha-week-fill" style="background:${colors[c.id]};width:${(totalMin/totalHoras*100).toFixed(0)}%"></div>
        </div>
      </div>`;
  }).join('');
}

/* ════════════════════════════════════════════════════
   FINANZAS
   ════════════════════════════════════════════════════ */

let finYear  = new Date().getFullYear();
let finMonth = new Date().getMonth();
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelectedKey = null;

function calChangeMonth(d) {
  calMonth += d;
  if (calMonth < 0)  { calMonth=11; calYear--; }
  if (calMonth > 11) { calMonth=0;  calYear++; }
  calSelectedKey = null;
  renderCalendario();
}

function renderFinanzas() {
  renderResumenMes();
  renderCalendario();
  renderHistorial();
}

function finChangeMonth(d) {
  const now = new Date();
  finMonth += d;
  if (finMonth < 0)  { finMonth = 11; finYear--; }
  if (finMonth > 11) { finMonth = 0;  finYear++; }
  const btnSig = document.getElementById('fin-btn-sig');
  if (btnSig) btnSig.disabled = finYear === now.getFullYear() && finMonth >= now.getMonth();
  renderResumenMes();
  renderHistorial();
}

/* ─── Bloque A: Resumen del mes ──────────────────────── */
function renderResumenMes() {
  const md  = getMonthData(finYear, finMonth);
  const now = new Date();
  const esMesActual = finYear === now.getFullYear() && finMonth === now.getMonth();
  const btnSig = document.getElementById('fin-btn-sig');
  if (btnSig) btnSig.disabled = esMesActual;
  const dayOfMonth = esMesActual ? now.getDate() : new Date(finYear, finMonth+1, 0).getDate();
  const diasEnMes  = new Date(finYear, finMonth+1, 0).getDate();
  const avgDaily   = dayOfMonth > 0 ? md.total / dayOfMonth : 0;
  const proyeccion = Math.round(avgDaily * diasEnMes);
  const diasRest   = diasEnMes - dayOfMonth;

  const lbl = document.getElementById('fin-mes-label');
  if (lbl) lbl.textContent = `${MESES[finMonth]} ${finYear}`;

  const bestSemana = calcBestWeek(finYear, finMonth);
  const el = document.getElementById('fin-stats-cards');
  if (el) el.innerHTML = `
    <div class="adm2-fin-card">
      <div class="adm2-fin-label">Total del mes</div>
      <div class="adm2-fin-value" style="color:var(--a2-green)">${formatArs(md.total)}</div>
      <div class="adm2-fin-sub">${md.reservas} reservas confirmadas</div>
    </div>
    <div class="adm2-fin-card adm2-fin-card-pending">
      <div class="adm2-fin-label">Pagos pendientes</div>
      <div class="adm2-fin-value" style="color:var(--a2-red)">${formatArs(md.pendiente)}</div>
      <div class="adm2-fin-sub">${md.turnosPendientes} turno${md.turnosPendientes!==1?'s':''} sin cobrar</div>
    </div>
    <div class="adm2-fin-card">
      <div class="adm2-fin-label">Turnos del mes</div>
      <div class="adm2-fin-value" style="color:var(--a2-blue)">${md.reservas}</div>
      <div class="adm2-fin-sub">${md.reservas - md.turnosPendientes} pagado${md.reservas - md.turnosPendientes!==1?'s':''} · ${md.turnosPendientes} pendiente${md.turnosPendientes!==1?'s':''}</div>
    </div>
    <div class="adm2-fin-card">
      <div class="adm2-fin-label">Mejor semana</div>
      <div class="adm2-fin-value" style="color:var(--a2-purple)">${formatArs(bestSemana.total)}</div>
      <div class="adm2-fin-sub">${bestSemana.reservas} reservas · ${bestSemana.label}</div>
    </div>
    <div class="adm2-fin-card">
      <div class="adm2-fin-label">Mejor día</div>
      <div class="adm2-fin-value" style="color:var(--a2-yellow)">${md.bestDay ? formatArs(md.bestAmt) : '—'}</div>
      <div class="adm2-fin-sub">${md.bestDay ? DIAS_LARGO[md.bestDay.getDay()]+' '+md.bestDay.getDate() : 'Sin datos aún'}</div>
    </div>
    <div class="adm2-fin-card">
      <div class="adm2-fin-label">Promedio diario</div>
      <div class="adm2-fin-value" style="color:var(--a2-text-dim)">${formatArs(Math.round(avgDaily))}</div>
      <div class="adm2-fin-sub">Basado en ${dayOfMonth} día${dayOfMonth!==1?'s':''} con datos</div>
    </div>`;

  const semanas = calcWeeksOfMonth(finYear, finMonth);
  const maxSem  = Math.max(1, ...semanas.map(s=>s.total));
  const semanasEl = document.getElementById('fin-semanas-list');
  if (semanasEl) semanasEl.innerHTML = semanas.map(s=>`
    <div class="adm2-semana-row">
      <span class="adm2-semana-label">${s.label}</span>
      <div class="adm2-semana-track"><div class="adm2-semana-fill" style="width:${(s.total/maxSem*100).toFixed(1)}%"></div></div>
      <span class="adm2-semana-valor">${formatArs(s.total)}</span>
    </div>`).join('');

  const proyEl = document.getElementById('fin-proyeccion');
  if (proyEl) proyEl.innerHTML = `
    <div class="adm2-proy-item"><span class="adm2-proy-lbl">Proyección cierre</span><span class="adm2-proy-val">${formatArs(proyeccion)}</span></div>
    <div class="adm2-proy-item"><span class="adm2-proy-lbl">Recaudado hoy</span><span class="adm2-proy-val dim">${formatArs(getDayData(todayKey()).ingresos)}</span></div>
    <div class="adm2-proy-item"><span class="adm2-proy-lbl">Días restantes</span><span class="adm2-proy-val dim">${diasRest}</span></div>`;

  const totalMetodos = md.efectivo + md.transferencia + md.online;
  const pct = (v) => totalMetodos > 0 ? (v/totalMetodos*100).toFixed(0) : 0;
  const metEl = document.getElementById('fin-metodos');
  if (metEl) metEl.innerHTML = `
    <div class="adm2-metodo-row">
      <span class="adm2-metodo-icon">💵</span>
      <span class="adm2-metodo-name">Efectivo</span>
      <div class="adm2-metodo-track"><div class="adm2-metodo-fill green" style="width:${pct(md.efectivo)}%"></div></div>
      <span class="adm2-metodo-pct">${pct(md.efectivo)}%</span>
      <span class="adm2-metodo-monto">${formatArs(md.efectivo)}</span>
    </div>
    <div class="adm2-metodo-row">
      <span class="adm2-metodo-icon">🏦</span>
      <span class="adm2-metodo-name">Transferencia</span>
      <div class="adm2-metodo-track"><div class="adm2-metodo-fill blue" style="width:${pct(md.transferencia)}%"></div></div>
      <span class="adm2-metodo-pct">${pct(md.transferencia)}%</span>
      <span class="adm2-metodo-monto">${formatArs(md.transferencia)}</span>
    </div>
    <div class="adm2-metodo-row">
      <span class="adm2-metodo-icon">💳</span>
      <span class="adm2-metodo-name">Online/MercadoPago</span>
      <div class="adm2-metodo-track"><div class="adm2-metodo-fill purple" style="width:${pct(md.online)}%"></div></div>
      <span class="adm2-metodo-pct">${pct(md.online)}%</span>
      <span class="adm2-metodo-monto">${formatArs(md.online)}</span>
    </div>`;
}

function calcWeeksOfMonth(year, month) {
  const semanas = [];
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month+1, 0);
  let cursor = mondayOf(firstDay);
  let n = 1;
  while (cursor <= lastDay) {
    const wd = getWeekData(cursor);
    const d1 = cursor.getMonth()!==month ? new Date(year, month, 1) : cursor;
    const d2 = addDays(cursor,6); const d2f = d2 > lastDay ? lastDay : d2;
    semanas.push({ ...wd, label:`Sem ${n} (${d1.getDate()}–${d2f.getDate()})` });
    cursor = addDays(cursor, 7);
    n++;
    if (n > 6) break;
  }
  return semanas;
}

function calcBestWeek(year, month) {
  const sems = calcWeeksOfMonth(year, month);
  if (!sems.length) return { total:0, reservas:0, label:'—' };
  return sems.reduce((best,s) => s.total > best.total ? s : best, sems[0]);
}

/* ─── Bloque B: Calendario ───────────────────────────── */
function renderCalendario() {
  const HDRS = ['Lu','Ma','Mi','Ju','Vi','Sá','Do'];
  const hdrEl  = document.getElementById('cal-headers');
  const gridEl = document.getElementById('cal-grid');
  const lblEl  = document.getElementById('cal-month-label');
  if (!gridEl) return;

  if (lblEl) lblEl.textContent = `${MESES[calMonth]} ${calYear}`;
  if (hdrEl) hdrEl.innerHTML = HDRS.map(h=>`<div class="adm2-cal-hdr">${h}</div>`).join('');

  const firstDay   = new Date(calYear, calMonth, 1);
  const daysInMonth= new Date(calYear, calMonth+1, 0).getDate();
  const todayStr   = todayKey();

  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  let cells = '';
  for (let e=0; e<startDow; e++) cells += `<div class="adm2-cal-cell empty"></div>`;

  let maxAmt = 0;
  for (let d=1; d<=daysInMonth; d++) {
    const amt = getDayData(_key(calYear, calMonth+1, d)).ingresos;
    if (amt > maxAmt) maxAmt = amt;
  }

  for (let d=1; d<=daysInMonth; d++) {
    const key    = _key(calYear, calMonth+1, d);
    const dd     = getDayData(key);
    const isToday= key===todayStr;
    const isSel  = key===calSelectedKey;

    let cls = 'no-data';
    if (maxAmt > 0 && dd.ingresos > 0) {
      const ratio = dd.ingresos / maxAmt;
      cls = ratio >= 0.7 ? 'high' : ratio >= 0.35 ? 'mid' : 'low';
    }
    if (isToday) cls += ' today';
    if (isSel)   cls += ' selected';

    const amtHtml = dd.reservas > 0
      ? `<span class="adm2-cal-amt">${formatArs(dd.ingresos)}</span><span class="adm2-cal-res">${dd.reservas} res.</span>`
      : `<span class="adm2-cal-res" style="opacity:.4">—</span>`;

    cells += `<div class="adm2-cal-cell ${cls}" onclick="selectCalDay('${key}')" title="${key}">
      <span class="adm2-cal-num">${d}</span>
      ${amtHtml}
    </div>`;
  }

  gridEl.innerHTML = cells;
  if (calSelectedKey) renderDayDetail(calSelectedKey);
}

function selectCalDay(key) {
  if (calSelectedKey === key) {
    calSelectedKey = null;
    document.getElementById('cal-day-detail').innerHTML = '';
    renderCalendario();
    return;
  }
  calSelectedKey = key;
  renderCalendario();
  renderDayDetail(key);
}

function renderDayDetail(key) {
  const detailEl = document.getElementById('cal-day-detail');
  if (!detailEl) return;
  const dd  = getDayData(key);
  const dp  = new Date(key + 'T12:00:00');
  const tit = `${DIAS_LARGO[dp.getDay()]} ${dp.getDate()} de ${MESES[dp.getMonth()]} ${dp.getFullYear()}`;

  let canchasHtml = '';
  CANCHAS.forEach(c => {
    const reservas = getReservasCancha(key, c.id);
    const rows = reservas.map(r => {
      const precio = _calcPrecio(c.id, r.duracion_minutos);
      const durLabel = r.duracion_minutos >= 60 ? (r.duracion_minutos/60).toFixed(1).replace('.0','')+'h' : r.duracion_minutos+'min';
      return `
      <div class="adm2-day-turno-row">
        <span class="adm2-day-hora">${r.hora_inicio}—${r.hora_fin}</span>
        <span class="adm2-day-nom">${r.cliente_nombre}</span>
        <span class="adm2-day-dur">${durLabel}</span>
        <span class="adm2-day-badge ${r.estado_pago}">${r.estado_pago==='pagado'?'PAGADO ✓':'PENDIENTE'}</span>
        <span class="adm2-day-precio">${r.estado_pago==='pagado'?'$'+precio.toLocaleString('es-AR'):'—'}</span>
      </div>`;
    }).join('');
    canchasHtml += `
      <div class="adm2-day-cancha-block">
        <div class="adm2-day-cancha-title">${c.nombre} · ${c.tipo}</div>
        ${rows || '<div class="adm2-day-empty">Sin turnos</div>'}
      </div>`;
  });

  detailEl.innerHTML = `
    <div class="adm2-day-detail">
      <div class="adm2-day-detail-header">
        <span class="adm2-day-detail-title">${tit}</span>
        <div class="adm2-day-detail-summary">
          <div class="adm2-day-sum-item"><span class="adm2-day-sum-lbl">Ingresos</span><span class="adm2-day-sum-val" style="color:var(--a2-green)">${formatArsLong(dd.ingresos)}</span></div>
          <div class="adm2-day-sum-item"><span class="adm2-day-sum-lbl">Reservas</span><span class="adm2-day-sum-val">${dd.reservas}</span></div>
          <div class="adm2-day-sum-item"><span class="adm2-day-sum-lbl">Pendiente</span><span class="adm2-day-sum-val" style="color:var(--a2-yellow)">${formatArsLong(dd.pendiente)}</span></div>
          <button class="adm2-panel-close" onclick="selectCalDay('${key}')" style="margin-left:8px">✕</button>
        </div>
      </div>
      <div class="adm2-day-cancha-grid">${canchasHtml}</div>
    </div>`;
}

/* ─── Bloque C: Historial semanas del mes seleccionado ── */
function renderHistorial() {
  const el = document.getElementById('fin-hist-list');
  if (!el) return;

  const lblMes = document.getElementById('fin-hist-mes-label');
  if (lblMes) lblMes.textContent = `${MESES[finMonth]} ${finYear}`;

  const weeks  = calcWeeksOfMonth(finYear, finMonth);
  const todayStr = todayKey();
  const DIASN  = ['Lu','Ma','Mi','Ju','Vi','Sá','Do'];

  if (!weeks.length) {
    el.innerHTML = '<p style="color:var(--a2-text-muted);padding:20px;text-align:center">Sin datos para este mes.</p>';
    return;
  }

  const todayMonday = getDateKey(mondayOf(new Date()));
  const firstOfMonth = new Date(finYear, finMonth, 1);
  const lastOfMonth  = new Date(finYear, finMonth + 1, 0);

  el.innerHTML = weeks.map((w, idx) => {
    const d1 = w.days[0].date < firstOfMonth ? firstOfMonth : w.days[0].date;
    const d7 = w.days[6].date > lastOfMonth  ? lastOfMonth  : w.days[6].date;
    const label = `${d1.getDate()} ${MESES_CORTO[d1.getMonth()]} — ${d7.getDate()} ${MESES_CORTO[d7.getMonth()]}`;
    const isCurrentWeek = getDateKey(w.days[0].date) === todayMonday;

    const daysDelMes = w.days.filter(d => d.date.getMonth() === finMonth && d.date.getFullYear() === finYear);
    const maxDay = Math.max(1, ...daysDelMes.map(d => d.ingresos));
    const daysHtml = daysDelMes.map(d => `
      <div class="adm2-hist-day">
        <span class="adm2-hist-day-name">${DIASN[d.date.getDay() === 0 ? 6 : d.date.getDay() - 1]} ${d.date.getDate()}/${d.date.getMonth()+1}</span>
        <div class="adm2-hist-day-track"><div class="adm2-hist-day-fill" style="width:${(d.ingresos/maxDay*100).toFixed(0)}%"></div></div>
        <span class="adm2-hist-day-res">${d.reservas} res.</span>
        <span class="adm2-hist-day-total ${d.ingresos===0?'zero':''}">${d.ingresos>0?formatArsLong(d.ingresos):'—'}</span>
      </div>`).join('');

    const bestStr = w.bestDay ? DIAS_LARGO[w.bestDay.getDay()] + ' ' + w.bestDay.getDate() : '—';

    return `
      <div class="adm2-hist-item">
        <div class="adm2-hist-header" onclick="toggleHistItem(this)" data-idx="${idx}">
          <span class="adm2-hist-chevron">▶</span>
          <span class="adm2-hist-label">${isCurrentWeek ? 'Esta semana · ' : ''}<b style="color:var(--a2-text)">${label}</b></span>
          <div class="adm2-hist-badges">
            <span class="adm2-hist-res">${w.reservas} res.</span>
            <span class="adm2-hist-best">⭐ ${bestStr}</span>
            <span class="adm2-hist-total">${formatArs(w.total)}</span>
          </div>
        </div>
        <div class="adm2-hist-body" id="hist-body-${idx}">
          <div class="adm2-hist-days">${daysHtml}</div>
        </div>
      </div>`;
  }).join('');

  const currentHeader = el.querySelector('.adm2-hist-header[data-idx]');
  const allHeaders = el.querySelectorAll('.adm2-hist-header');
  const toOpen = Array.from(allHeaders).find(h => {
    return h.querySelector('.adm2-hist-label')?.textContent?.includes('Esta semana');
  }) || currentHeader;
  if (toOpen) toggleHistItem(toOpen);
}

function toggleHistItem(header) {
  const idx  = header.getAttribute('data-idx');
  const body = document.getElementById('hist-body-'+idx);
  if (!body) return;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  header.classList.toggle('open', !isOpen);
}

/* ════════════════════════════════════════════════════
   TORNEOS (integración completa)
   ════════════════════════════════════════════════════ */

async function cargarTorneosAdmin() {
  const c = document.getElementById('torneos-admin-lista');
  if (!c) return;
  spinner(c);
  try {
    const torneos = await api.getTorneos();
    if (!torneos.length) { c.innerHTML='<p style="color:var(--texto-suave);padding:40px;text-align:center">No hay torneos. Creá uno con el botón de arriba.</p>'; return; }
    c.innerHTML = torneos.map(t=>renderTorneoAdminCard(t)).join('');
  } catch(e) { c.innerHTML='<p style="color:var(--rojo);padding:20px">Error al cargar torneos.</p>'; }
}

function renderTorneoAdminCard(t) {
  const eColor={'inscripcion':'badge-azul','grupos':'badge-amarillo','bracket':'badge-verde','finalizado':'badge-gris'}[t.estado]||'badge-gris';
  const eLabel={'inscripcion':'Inscripción abierta','grupos':'Fase de grupos','bracket':'Cuadro eliminatorio','finalizado':'Finalizado'}[t.estado]||t.estado;
  const total= (t.inscripciones||[]).filter(i=>i.estadoInscripcion==='aceptada').length;
  const pend = (t.inscripciones||[]).filter(i=>i.estadoInscripcion==='pendiente').length;
  return `
    <div class="torneo-admin-card" id="tc-${t._id}">
      <div class="torneo-admin-card-header">
        <div>
          <div class="torneo-admin-nombre">${t.nombre}</div>
          <div class="torneo-admin-meta">📅 ${t.fecha} &nbsp;·&nbsp; 🎾 ${total} pareja${total!==1?'s':''} confirmada${total!==1?'s':''}${pend>0?` &nbsp;·&nbsp; <span style="color:#f59e0b">⏳ ${pend} pendiente${pend>1?'s':''}</span>`:''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="badge ${eColor}">${eLabel}</span>
          <button class="btn btn-rojo btn-sm" onclick="eliminarTorneo('${t._id}')">Eliminar</button>
        </div>
      </div>
      ${t.estado==='inscripcion'?renderInscripcionesAdmin(t):''}
      ${t.estado==='grupos'?renderGruposAdmin(t):''}
      ${t.estado==='bracket'?renderGruposResumenAdmin(t)+renderBracketAdmin(t):''}
      ${t.estado==='finalizado'?renderCampeon(t)+renderBracketAdmin(t)+renderGruposResumenAdmin(t):''}
    </div>`;
}

function renderInscripcionesAdmin(t) {
  const ac=(t.inscripciones||[]).filter(i=>i.estadoInscripcion==='aceptada');
  const pe=(t.inscripciones||[]).filter(i=>i.estadoInscripcion==='pendiente');
  return `
    <div class="torneo-fase-bloque">
      <div class="torneo-fase-header">
        <span class="torneo-fase-titulo">Inscriptos</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-verde btn-sm" onclick="abrirModalPareja('${t._id}')">+ Agregar pareja</button>
          ${ac.length>=2?`<button class="btn btn-azul btn-sm" onclick="confirmarGenerarGrupos('${t._id}')">⚡ Generar grupos (${ac.length} parejas)</button>`:`<span style="font-size:12px;color:var(--texto-suave);align-self:center">Se necesitan al menos 2 parejas</span>`}
        </div>
      </div>
      ${pe.length?`<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">⏳ Pendientes</div>${pe.map(i=>`<div class="inscripcion-row pendiente"><div class="inscripcion-pareja-info"><span class="inscripcion-nombre">${i.nombrePareja}</span><span class="inscripcion-jugadores">${i.jugador1.nombre} (${i.jugador1.telefono}) · ${i.jugador2.nombre} (${i.jugador2.telefono})</span></div><div class="inscripcion-acciones"><button class="btn btn-verde btn-sm" onclick="aceptarInscripcion('${t._id}','${i.id}')">Aceptar</button><button class="btn btn-rojo btn-sm" onclick="eliminarInscripcion('${t._id}','${i.id}')">Rechazar</button></div></div>`).join('')}</div>`:''}
      ${ac.length?`<div><div style="font-size:12px;font-weight:700;color:var(--verde);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">✅ Confirmadas</div>${ac.map((i,idx)=>`<div class="inscripcion-row aceptada"><div class="inscripcion-pareja-info"><span class="inscripcion-num">${idx+1}</span><div><span class="inscripcion-nombre">${i.nombrePareja}</span><span class="inscripcion-jugadores">${i.jugador1.nombre} · ${i.jugador2.nombre}</span></div></div><div class="inscripcion-acciones"><button class="btn btn-gris btn-sm" onclick="eliminarInscripcion('${t._id}','${i.id}')">Quitar</button></div></div>`).join('')}</div>`:`<p style="color:var(--texto-suave);font-size:13px;padding:8px 0">Sin parejas confirmadas aún.</p>`}
    </div>`;
}

function renderGruposAdmin(t) {
  const letras=Object.keys(t.grupos||{}).sort();
  if(!letras.length) return '<p style="color:var(--texto-suave);padding:20px">Sin grupos generados.</p>';
  const todos=letras.every(l=>(t.grupos[l].partidos||[]).every(p=>!!p.ganador));
  return `<div class="torneo-fase-bloque"><div class="torneo-fase-header"><span class="torneo-fase-titulo">Fase de grupos</span>${todos?`<button class="btn btn-azul btn-sm" onclick="confirmarGenerarBracket('${t._id}')">🏆 Generar cuadro eliminatorio</button>`:`<span style="font-size:12px;color:var(--texto-suave);align-self:center">Completá todos los partidos para avanzar</span>`}</div><div class="grupos-admin-grid">${letras.map(l=>renderGrupoAdmin(t,l)).join('')}</div></div>`;
}

function renderGrupoAdmin(t,letra) {
  const g=t.grupos[letra]; const insc=t.inscripciones||[];
  const tabla=`<table class="admin-tabla-grupo"><thead><tr><th>#</th><th>Pareja</th><th>V</th><th>D</th><th>SG</th><th>SP</th><th>Pts</th></tr></thead><tbody>${g.tabla.map((r,i)=>{const p=insc.find(x=>x.id===r.parejaId);const cl=i<2;return`<tr class="${cl?'clasifica-row':''}"><td>${cl?['🥇','🥈'][i]:i+1}</td><td><strong>${p?p.nombrePareja:r.parejaId}</strong>${cl?' <span class="clasifica-tag">CLASIFICA</span>':''}</td><td>${r.V}</td><td>${r.D}</td><td>${r.SG}</td><td>${r.SP}</td><td><strong>${r.Pts}</strong></td></tr>`;}).join('')}</tbody></table>`;
  const parts=`<div class="admin-partidos-lista">${g.partidos.map(p=>{const p1=insc.find(i=>i.id===p.pareja1);const p2=insc.find(i=>i.id===p.pareja2);const n1=p1?p1.nombrePareja:p.pareja1;const n2=p2?p2.nombrePareja:p.pareja2;return`<div class="admin-partido-row ${p.ganador?'terminado':''}"><div class="partido-hora-col">${p.hora||'—'}</div><div class="partido-parejas-col"><span class="${p.ganador===p.pareja1?'ganador-txt':''}">${n1}</span><span class="partido-vs">vs</span><span class="${p.ganador===p.pareja2?'ganador-txt':''}">${n2}</span></div><div class="partido-resultado-col">${p.ganador?`<span class="resultado-badge">${p.resultado}</span>`:'—'}</div><div class="partido-acciones-col"><button class="btn btn-gris btn-sm" onclick="abrirModalResultadoGrupo('${t._id}','${letra}','${p.id}','${n1}','${n2}')">${p.ganador?'✏️ Editar':'+ Resultado'}</button></div></div>`;}).join('')}</div>`;
  return `<div class="grupo-admin-card"><div class="grupo-admin-header"><div class="grupo-admin-letra">${letra}</div><span class="grupo-admin-titulo">Grupo ${letra}</span><span style="font-size:12px;color:var(--texto-suave)">${g.tabla.length} parejas</span></div>${tabla}${parts}</div>`;
}

function renderBracketAdmin(t) {
  if(!t.bracket||!t.bracket.length) return '';
  const insc=t.inscripciones||[];
  const gn=id=>{if(!id)return'<span style="color:var(--texto-xs)">Por definir</span>';const p=insc.find(i=>i.id===id);return p?p.nombrePareja:id;};
  const fases=['cuartos','semifinal','final'];
  const fl={cuartos:'Cuartos de Final',semifinal:'Semifinal',final:'Gran Final'};
  const act=fases.filter(f=>t.bracket.some(p=>p.fase===f));
  return `<div class="torneo-fase-bloque"><div class="torneo-fase-header"><span class="torneo-fase-titulo">Cuadro eliminatorio</span></div><div class="bracket-admin-wrap">${act.map(fase=>`<div class="bracket-admin-columna"><div class="bracket-col-titulo">${fl[fase]}</div>${t.bracket.filter(p=>p.fase===fase).map(p=>{const n1=gn(p.pareja1);const n2=gn(p.pareja2);const ok=!!p.ganador;const can=p.pareja1&&p.pareja2&&!ok;return`<div class="bracket-admin-match ${ok?'terminado':(p.pareja1&&p.pareja2?'listo':'esperando')}"><div class="bracket-admin-match-parejas"><div class="bracket-admin-pareja ${p.ganador===p.pareja1?'ganador':''}">${n1}</div><div class="bracket-admin-pareja ${p.ganador===p.pareja2?'ganador':''}">${n2}</div></div>${p.hora||p.resultado?`<div class="bracket-admin-match-info">${p.hora?`<span>🕐 ${p.hora}</span>`:''}${p.resultado?`<span class="resultado-badge">${p.resultado}</span>`:''}</div>`:''} ${(can||ok)?`<button class="btn btn-gris btn-sm" style="margin-top:6px;width:100%" onclick="abrirModalResultadoBracket('${t._id}','${p.id}','${p.pareja1||''}','${p.pareja2||''}')">${ok?'✏️ Editar resultado':'+ Cargar resultado'}</button>`:''} ${!p.pareja1||!p.pareja2?`<div style="font-size:11px;color:var(--texto-xs);margin-top:6px;text-align:center">Esperando clasificados</div>`:''}</div>`;}).join('')}</div>`).join('')}</div></div>`;
}

function renderGruposResumenAdmin(t) {
  const letras=Object.keys(t.grupos||{}).sort(); if(!letras.length) return '';
  const insc=t.inscripciones||[];
  return `<div class="torneo-fase-bloque" style="padding-top:0"><details><summary style="cursor:pointer;font-size:13px;font-weight:700;color:var(--texto-suave);padding:8px 0;list-style:none">▶ Ver resultados de grupos</summary><div class="grupos-admin-grid" style="margin-top:12px">${letras.map(l=>{const g=t.grupos[l];return`<div class="grupo-admin-card"><div class="grupo-admin-header"><div class="grupo-admin-letra">${l}</div><span class="grupo-admin-titulo">Grupo ${l}</span></div><table class="admin-tabla-grupo"><thead><tr><th>#</th><th>Pareja</th><th>V</th><th>D</th><th>Pts</th></tr></thead><tbody>${g.tabla.map((r,i)=>{const p=insc.find(x=>x.id===r.parejaId);return`<tr class="${i<2?'clasifica-row':''}"><td>${i+1}</td><td><strong>${p?p.nombrePareja:r.parejaId}</strong></td><td>${r.V}</td><td>${r.D}</td><td><strong>${r.Pts}</strong></td></tr>`;}).join('')}</tbody></table></div>`;}).join('')}</div></details></div>`;
}

function renderCampeon(t) {
  if(!t.campeon) return '';
  const p=(t.inscripciones||[]).find(i=>i.id===t.campeon);
  return `<div class="campeon-admin-display"><div style="font-size:48px">🏆</div><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--verde);margin-bottom:4px">Campeón</div><div style="font-size:22px;font-weight:900">${p?p.nombrePareja:t.campeon}</div></div>`;
}

function abrirModalTorneo() {
  document.getElementById('torneo-nombre').value = '';
  document.getElementById('torneo-fecha').value  = new Date().toISOString().split('T')[0];
  document.getElementById('torneo-desc').value   = '';
  document.getElementById('torneo-imagen').value = '';
  document.querySelectorAll('.tip-img').forEach(i => i.classList.remove('seleccionada'));
  abrirModal('modal-torneo');
}

function seleccionarImgTorneo(el, url) {
  document.querySelectorAll('.tip-img').forEach(i => i.classList.remove('seleccionada'));
  el.classList.add('seleccionada');
  document.getElementById('torneo-imagen').value = url;
}

function cargarImgPropia(input) {
  const file = input.files[0];
  if (!file) return;
  document.querySelectorAll('.tip-img').forEach(i => i.classList.remove('seleccionada'));
  const nombreEl = document.getElementById('tip-file-nombre');
  if (nombreEl) nombreEl.textContent = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    document.getElementById('torneo-imagen').value = dataUrl;
    const preview = document.getElementById('tip-preview-propia');
    if (preview) { preview.src = dataUrl; preview.style.display = 'block'; }
  };
  reader.readAsDataURL(file);
}

async function crearTorneo() {
  const n    = document.getElementById('torneo-nombre').value.trim();
  const f    = document.getElementById('torneo-fecha').value;
  const desc = document.getElementById('torneo-desc').value.trim();
  const img  = document.getElementById('torneo-imagen').value;
  if (!n) { toast('Ingresá un nombre para el torneo', 'rojo'); return; }
  try {
    await api.crearTorneo({ nombre:n, fecha:f, descripcion:desc, imagen:img });
    cerrarModal('modal-torneo');
    cargarTorneosAdmin();
  } catch(e) { toast(e.message || 'Error', 'rojo'); }
}
async function eliminarTorneo(id) {
  if(!confirm('¿Eliminar este torneo?')) return;
  try{await api.eliminarTorneo(id);cargarTorneosAdmin();}catch(e){toast(e.message||'Error','rojo');}
}
function abrirModalPareja(tid) {
  document.getElementById('pareja-torneo-id').value=tid;
  ['pareja-j1-nombre','pareja-j1-tel','pareja-j2-nombre','pareja-j2-tel'].forEach(id=>document.getElementById(id).value='');
  abrirModal('modal-pareja');
}
async function confirmarAgregarPareja() {
  const tid=document.getElementById('pareja-torneo-id').value;
  const j1n=document.getElementById('pareja-j1-nombre').value.trim();
  const j1t=document.getElementById('pareja-j1-tel').value.trim();
  const j2n=document.getElementById('pareja-j2-nombre').value.trim();
  const j2t=document.getElementById('pareja-j2-tel').value.trim();
  if(!j1n||!j2n){toast('Ingresá el nombre de ambos jugadores','rojo');return;}
  try{await api.agregarParejaAdmin(tid,{jugador1:{nombre:j1n,telefono:j1t},jugador2:{nombre:j2n,telefono:j2t}});cerrarModal('modal-pareja');cargarTorneosAdmin();}catch(e){toast(e.message||'Error','rojo');}
}
async function aceptarInscripcion(tid,iid) { try{await api.aceptarInscripcion(tid,iid);cargarTorneosAdmin();}catch(e){toast(e.message||'Error','rojo');} }
async function eliminarInscripcion(tid,iid) { if(!confirm('¿Quitar esta pareja?'))return; try{await api.eliminarInscripcion(tid,iid);cargarTorneosAdmin();}catch(e){toast(e.message||'Error','rojo');} }
async function confirmarGenerarGrupos(tid) {
  const t=(await api.getTorneos()).find(x=>x._id===tid);
  const ac=(t?.inscripciones||[]).filter(i=>i.estadoInscripcion==='aceptada');
  if(!confirm(`¿Generar grupos con ${ac.length} parejas? El sorteo es automático.`))return;
  try{await api.generarGrupos(tid);cargarTorneosAdmin();}catch(e){toast(e.message||'Error','rojo');}
}
async function confirmarGenerarBracket(tid) {
  if(!confirm('¿Generar el cuadro eliminatorio con los clasificados?'))return;
  try{await api.generarBracket(tid);cargarTorneosAdmin();}catch(e){toast(e.message||'Error','rojo');}
}

let _resCtx=null;
function abrirModalResultadoGrupo(tid,gl,pid,n1,n2) {
  _resCtx={tipo:'grupo',torneoId:tid,grupoLetra:gl,partidoId:pid};
  document.getElementById('res-partido-titulo').textContent=`${n1} vs ${n2}`;
  document.getElementById('res-hora').value=''; document.getElementById('res-resultado').value='';
  api.getTorneo(tid).then(t=>{
    if(!t)return; const g=t.grupos[gl]; if(!g)return;
    const p=g.partidos.find(x=>x.id===pid); if(!p)return;
    _resCtx.p1Id=p.pareja1; _resCtx.p2Id=p.pareja2;
    if(p.hora) document.getElementById('res-hora').value=p.hora;
    if(p.resultado) document.getElementById('res-resultado').value=p.resultado;
    document.getElementById('res-ganador').innerHTML=`<option value="">— Seleccioná el ganador —</option><option value="${p.pareja1}" ${p.ganador===p.pareja1?'selected':''}>${n1}</option><option value="${p.pareja2}" ${p.ganador===p.pareja2?'selected':''}>${n2}</option>`;
  });
  abrirModal('modal-resultado');
}
function abrirModalResultadoBracket(tid,pid,p1id,p2id) {
  api.getTorneo(tid).then(t=>{
    if(!t)return; const p=(t.bracket||[]).find(b=>b.id===pid); if(!p)return;
    const insc=t.inscripciones||[];
    const n1=insc.find(i=>i.id===(p1id||p.pareja1))?.nombrePareja||'Pareja 1';
    const n2=insc.find(i=>i.id===(p2id||p.pareja2))?.nombrePareja||'Pareja 2';
    _resCtx={tipo:'bracket',torneoId:tid,partidoId:pid,p1Id:p.pareja1,p2Id:p.pareja2};
    document.getElementById('res-partido-titulo').textContent=`${n1} vs ${n2}`;
    document.getElementById('res-hora').value=p.hora||''; document.getElementById('res-resultado').value=p.resultado||'';
    document.getElementById('res-ganador').innerHTML=`<option value="">— Seleccioná el ganador —</option><option value="${p.pareja1}" ${p.ganador===p.pareja1?'selected':''}>${n1}</option><option value="${p.pareja2}" ${p.ganador===p.pareja2?'selected':''}>${n2}</option>`;
    abrirModal('modal-resultado');
  });
}
async function confirmarResultado() {
  if(!_resCtx)return;
  const hora=document.getElementById('res-hora').value.trim();
  const res=document.getElementById('res-resultado').value.trim();
  const gan=document.getElementById('res-ganador').value;
  if(!gan){toast('Seleccioná el ganador','rojo');return;}
  if(!res){toast('Ingresá el resultado','rojo');return;}
  try{
    if(_resCtx.tipo==='grupo') await api.actualizarPartidoGrupo(_resCtx.torneoId,_resCtx.grupoLetra,_resCtx.partidoId,{hora:hora||null,resultado:res,ganador:gan});
    else await api.actualizarPartidoBracket(_resCtx.torneoId,_resCtx.partidoId,{hora:hora||null,resultado:res,ganador:gan});
    cerrarModal('modal-resultado'); cargarTorneosAdmin();
  }catch(e){toast(e.message||'Error','rojo');}
}

/* ════════════════════════════════════════════════════
   TOAST
   ════════════════════════════════════════════════════ */

function toast(msg, tipo='green') {
  const c = document.getElementById('adm2-toasts');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `adm2-toast ${tipo}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(()=>{ t.classList.add('out'); setTimeout(()=>t.remove(),320); }, 2800);
}

/* ════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  await authCheck();
  initPremios();
  tickClock();
  setInterval(tickClock, 10000);
  renderDashboard();
});

/* ════════════════════════════════════════════════════
   PREMIOS — STORE COMPARTIDO
   ════════════════════════════════════════════════════ */

const PREMIOS_KEY   = 'padelpro_premios';
const ADM_USERS_KEY = 'padelpro_users';
const ADM_SESS_KEY  = 'padelpro_session';

const DEFAULT_PREMIOS = [
  { id:'p_def1', nombre:'1 hora gratis',  descripcion:'Una hora en cualquier cancha del club', puntos:1000, activo:true, icono:'🎾' },
  { id:'p_def2', nombre:'Descuento 20%',  descripcion:'En tu próxima reserva',                 puntos:500,  activo:true, icono:'💰' },
  { id:'p_def3', nombre:'Kit de paleta',  descripcion:'Paleta + 3 pelotas de regalo',           puntos:1500, activo:true, icono:'🏆' },
];

function initPremios() {
  if (!localStorage.getItem(PREMIOS_KEY))
    localStorage.setItem(PREMIOS_KEY, JSON.stringify(DEFAULT_PREMIOS));
}

function getPremios()        { try { return JSON.parse(localStorage.getItem(PREMIOS_KEY)) || DEFAULT_PREMIOS; } catch { return DEFAULT_PREMIOS; } }
function savePremios(list)   { localStorage.setItem(PREMIOS_KEY, JSON.stringify(list)); }
function getAdmUsers()       { try { return JSON.parse(localStorage.getItem(ADM_USERS_KEY)) || []; } catch { return []; } }
function saveAdmUsers(list)  { localStorage.setItem(ADM_USERS_KEY, JSON.stringify(list)); }

function addPtsToUser(userId, pts, nota) {
  const users = getAdmUsers();
  const i = users.findIndex(u => u.id === userId);
  if (i === -1) return false;
  users[i].puntos = Math.max(0, (users[i].puntos || 0) + pts);
  if (!users[i].historial) users[i].historial = [];
  users[i].historial.unshift({ pts, nota: nota || 'Ajuste manual', fecha: new Date().toISOString().split('T')[0] });
  saveAdmUsers(users);
  try {
    const sess = JSON.parse(localStorage.getItem(ADM_SESS_KEY));
    if (sess && sess.userId === userId) {
      sess.puntos = users[i].puntos;
      localStorage.setItem(ADM_SESS_KEY, JSON.stringify(sess));
    }
  } catch {}
  return true;
}

/* ════════════════════════════════════════════════════
   USUARIOS
   ════════════════════════════════════════════════════ */

function renderUsuarios() {
  const users = getAdmUsers();
  const countEl = document.getElementById('usuarios-count');
  if (countEl) countEl.textContent = users.length + ' usuario' + (users.length !== 1 ? 's' : '');
  const searchEl = document.getElementById('usuarios-search');
  if (searchEl) searchEl.value = '';
  renderUsuariosTabla(users);
}

function filtrarUsuarios(q) {
  const term = q.trim().toLowerCase();
  const users = getAdmUsers();
  renderUsuariosTabla(term ? users.filter(u =>
    u.nombre.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)
  ) : users);
}

function renderUsuariosTabla(users) {
  const tbody = document.getElementById('usuarios-tbody');
  if (!tbody) return;
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="adm-empty-row">No hay usuarios aún${document.getElementById('usuarios-search')?.value ? ' con ese criterio' : ''}</td></tr>`;
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong style="color:var(--a2-text)">${u.nombre}</strong></td>
      <td style="color:var(--a2-text-muted)">${u.email}</td>
      <td><span class="adm-pts-badge">★ ${u.puntos || 0}</span></td>
      <td style="color:var(--a2-text-muted)">${u.reservas || 0}</td>
      <td style="color:var(--a2-text-muted)">${u.fechaRegistro || '—'}</td>
      <td>
        <div class="adm-usr-actions">
          <button class="adm-pts-btn plus"   onclick="admAddPts('${u.id}',  100, 'Suma manual')">+100</button>
          <button class="adm-pts-btn minus"  onclick="admAddPts('${u.id}', -100, 'Resta manual')">−100</button>
          <button class="adm-pts-btn custom" onclick="abrirModalPuntos('${u.id}', '${u.nombre.replace(/'/g, "\'")}')">Custom</button>
        </div>
      </td>
    </tr>`).join('');
}

function admAddPts(userId, pts, nota) {
  if (!addPtsToUser(userId, pts, nota)) return;
  renderUsuarios();
  const q = document.getElementById('usuarios-search')?.value || '';
  if (q) filtrarUsuarios(q);
  toast((pts > 0 ? '+' : '') + pts + ' puntos aplicados', pts > 0 ? 'verde' : 'rojo');
}

let _modalPuntosUserId = null;

function abrirModalPuntos(userId, nombre) {
  _modalPuntosUserId = userId;
  document.getElementById('mpts-nombre').textContent = nombre;
  document.getElementById('mpts-cantidad').value = '';
  document.getElementById('mpts-nota').value = '';
  document.getElementById('mpts-error').textContent = '';
  abrirModal('modal-puntos');
}

function guardarPuntosCustom() {
  const cantidad = parseInt(document.getElementById('mpts-cantidad').value);
  const nota     = document.getElementById('mpts-nota').value.trim() || 'Ajuste manual';
  const errEl    = document.getElementById('mpts-error');
  if (isNaN(cantidad) || cantidad === 0) { errEl.textContent = 'Ingresá una cantidad válida (puede ser negativa)'; return; }
  if (!addPtsToUser(_modalPuntosUserId, cantidad, nota)) { errEl.textContent = 'Usuario no encontrado'; return; }
  cerrarModal('modal-puntos');
  renderUsuarios();
  toast((cantidad > 0 ? '+' : '') + cantidad + ' puntos aplicados', cantidad > 0 ? 'verde' : 'rojo');
}

/* ════════════════════════════════════════════════════
   PREMIOS — CRUD
   ════════════════════════════════════════════════════ */

function renderPremios() {
  const premios = getPremios();
  const grid = document.getElementById('premios-grid');
  if (!grid) return;

  const btnNuevo = `
    <div style="margin-bottom:20px">
      <button class="adm2-btn-nuevo" onclick="abrirModalPremio(null)">+ Nuevo premio</button>
    </div>`;

  if (!premios.length) {
    grid.innerHTML = btnNuevo + '<p style="color:var(--a2-text-muted);text-align:center;padding:40px">No hay premios todavía.</p>';
    return;
  }

  grid.innerHTML = btnNuevo + `<div class="premios-admin-grid">${premios.map(p => `
    <div class="premio-admin-card${p.activo ? '' : ' inactivo'}">
      <div class="premio-admin-top">
        <span class="premio-admin-icono">${p.icono || '🎁'}</span>
        <span class="premio-admin-estado ${p.activo ? 'activo' : 'inac'}">${p.activo ? 'Activo' : 'Inactivo'}</span>
      </div>
      <div class="premio-admin-nombre">${p.nombre}</div>
      <div class="premio-admin-desc">${p.descripcion}</div>
      <div class="premio-admin-pts">★ ${p.puntos} puntos</div>
      <div class="premio-admin-acciones">
        <button class="adm-pts-btn custom" onclick="editarPremio('${p.id}')">Editar</button>
        <button class="adm-pts-btn ${p.activo ? 'minus' : 'plus'}" onclick="togglePremio('${p.id}')">${p.activo ? 'Desactivar' : 'Activar'}</button>
        <button class="adm-pts-btn danger" onclick="eliminarPremio('${p.id}')">Eliminar</button>
      </div>
    </div>`).join('')}</div>`;
}

let _editingPremioId = null;

function abrirModalPremio(id) {
  _editingPremioId = id || null;
  const p = id ? getPremios().find(x => x.id === id) : null;
  document.getElementById('modal-premio-titulo').textContent = id ? 'Editar premio' : 'Nuevo premio';
  document.getElementById('mp-nombre').value = p ? p.nombre : '';
  document.getElementById('mp-desc').value   = p ? p.descripcion : '';
  document.getElementById('mp-puntos').value = p ? p.puntos : '';
  document.getElementById('mp-icono').value  = p ? p.icono : '';
  document.getElementById('mp-error').textContent = '';
  abrirModal('modal-premio');
}

function editarPremio(id) { abrirModalPremio(id); }

function guardarPremio() {
  const nombre      = document.getElementById('mp-nombre').value.trim();
  const descripcion = document.getElementById('mp-desc').value.trim();
  const puntos      = parseInt(document.getElementById('mp-puntos').value);
  const icono       = document.getElementById('mp-icono').value.trim() || '';
  const errEl       = document.getElementById('mp-error');

  if (!nombre)               { errEl.textContent = 'El nombre es obligatorio'; return; }
  if (!puntos || puntos < 1) { errEl.textContent = 'Ingresa una cantidad de puntos valida'; return; }

  const premios = getPremios();
  if (_editingPremioId) {
    const i = premios.findIndex(p => p.id === _editingPremioId);
    if (i !== -1) premios[i] = Object.assign({}, premios[i], { nombre, descripcion, puntos, icono });
  } else {
    premios.push({ id: 'p_' + Date.now(), nombre, descripcion, puntos, activo: true, icono });
  }
  savePremios(premios);
  cerrarModal('modal-premio');
  renderPremios();
  toast(_editingPremioId ? 'Premio actualizado' : 'Premio creado', 'verde');
}

function togglePremio(id) {
  const premios = getPremios();
  const i = premios.findIndex(p => p.id === id);
  if (i !== -1) premios[i].activo = !premios[i].activo;
  savePremios(premios);
  renderPremios();
}

function eliminarPremio(id) {
  if (!confirm('Eliminar este premio?')) return;
  savePremios(getPremios().filter(p => p.id !== id));
  renderPremios();
  toast('Premio eliminado', 'rojo');
}
