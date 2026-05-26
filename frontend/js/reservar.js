/* ═══════════════════════════════════════════
   reservar.js — Sistema de reservas dinámico
   Slots de 30 min, duraciones 1h / 1.5h / 2h
   ═══════════════════════════════════════════ */

const estado = {
  paso: 1,
  fecha: null,
  duracion: null,
  horaInicio: null,
  horaFin: null,
  precioTotal: null,
  nombre: null,
  telefono: null,
  metodoPago: null,
  confirmacion: null
};

const DURACIONES = [
  { minutos: 60,  label: '1 hora',      labelCorto: '1h' },
  { minutos: 90,  label: '1 hora y media', labelCorto: '1.5h' },
  { minutos: 120, label: '2 horas',     labelCorto: '2h' },
];

function iniciarReservas() {
  renderPasos();
  renderPaso1();
}

/* ─── INDICADOR DE PASOS ──────────────────── */
function renderPasos() {
  const labels = ['Día', 'Duración', 'Horario', 'Datos', 'Confirmación'];
  const c = document.getElementById('steps-bar');
  if (!c) return;
  c.innerHTML = labels.map((lbl, i) => {
    const n = i + 1;
    const cls = n < estado.paso ? 'completo' : n === estado.paso ? 'activo' : '';
    const icono = n < estado.paso ? '✓' : n;
    return `
      <div class="step-num-label">
        <div class="step-circle ${cls}">${icono}</div>
        <span class="step-label ${cls}">${lbl}</span>
      </div>
      ${i < labels.length - 1 ? `<div class="step-line ${n < estado.paso ? 'completo' : ''}"></div>` : ''}
    `;
  }).join('');
}

function irAPaso(n) {
  estado.paso = n;
  renderPasos();
  document.querySelectorAll('.paso').forEach(p => p.classList.remove('activo'));
  const target = document.getElementById(`paso${n}`);
  if (target) { target.classList.add('activo'); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

/* ─── PASO 1: SELECTOR DE DÍA ─────────────── */
function renderPaso1() {
  const c = document.getElementById('dias-container');
  if (!c) return;
  if (c.closest('.rprem-card')) c.classList.add('dias-scroll-prem');
  const hds = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    hds.push(d);
  }
  const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  c.innerHTML = hds.map((d, i) => {
    const f = d.toISOString().split('T')[0];
    const label = i === 0 ? 'Hoy' : dias[d.getDay()];
    return `
      <button class="dia-btn${i === 0 ? ' seleccionado' : ''}" onclick="seleccionarDia('${f}', this)">
        <span class="dia-nombre">${label}</span>
        <span class="dia-num">${d.getDate()}</span>
        <span class="dia-mes">${meses[d.getMonth()]}</span>
      </button>
    `;
  }).join('');
  estado.fecha = hds[0].toISOString().split('T')[0];
}

function seleccionarDia(fecha, btn) {
  document.querySelectorAll('.dia-btn').forEach(b => b.classList.remove('seleccionado'));
  btn.classList.add('seleccionado');
  estado.fecha = fecha;
  estado.horaInicio = null;
  estado.horaFin = null;
  irAPaso(2);
  renderPaso2();
}

/* ─── PASO 2: SELECTOR DE DURACIÓN ─────────── */
function renderPaso2() {
  const c = document.getElementById('duracion-container');
  if (!c) return;
  c.innerHTML = DURACIONES.map(d => {
    const precioDesde = Math.min(...CANCHAS_CONFIG.map(cc => Math.round(cc.precioHora * d.minutos / 60)));
    return `
      <button class="duracion-btn${estado.duracion === d.minutos ? ' seleccionado' : ''}"
              onclick="seleccionarDuracion(${d.minutos}, this)">
        <span class="duracion-tiempo">${d.label}</span>
        <span class="duracion-precio">desde $${precioDesde.toLocaleString('es-AR')}</span>
      </button>
    `;
  }).join('');
}

function seleccionarDuracion(minutos, btn) {
  document.querySelectorAll('.duracion-btn').forEach(b => b.classList.remove('seleccionado'));
  btn.classList.add('seleccionado');
  estado.duracion = minutos;
  estado.horaInicio = null;
  estado.horaFin = null;
  irAPaso(3);
  cargarHorarios();
}

/* ─── PASO 3: GRILLA DE HORARIOS DINÁMICA ──── */
async function cargarHorarios() {
  const c = document.getElementById('horarios-container');
  if (!c) return;
  spinner(c);
  try {
    const horarios = await api.getDisponibilidad(estado.fecha, estado.duracion);
    if (!horarios.length) {
      c.innerHTML = `<p class="rprem-no-horarios">No hay horarios disponibles para ${_durLabel(estado.duracion)} el ${formatFechaLarga(estado.fecha)}. Probá otro día o duración.</p>`;
      return;
    }
    c.innerHTML = horarios.map(h => {
      const ultimo = h.canchas_disponibles === 1;
      const disp = ultimo
        ? `<span class="ultimo">¡Último lugar!</span>`
        : `<span class="disponible">${h.canchas_disponibles} canchas libres</span>`;
      return `
        <button class="horario-btn horario-dinamico"
                onclick="seleccionarHorario('${h.hora_inicio}','${h.hora_fin}',${h.precio_total}, this)">
          <span class="horario-rango">${h.hora_inicio} — ${h.hora_fin}</span>
          <span class="horario-disponibilidad">${disp}</span>
          <span class="horario-precio">$${h.precio_total.toLocaleString('es-AR')}</span>
        </button>
      `;
    }).join('');
  } catch (e) {
    c.innerHTML = `<p style="color:var(--rojo);padding:20px">No se pudieron cargar los horarios. Intentá de nuevo.</p>`;
  }
}

function seleccionarHorario(horaInicio, horaFin, precio, btn) {
  document.querySelectorAll('.horario-btn').forEach(b => b.classList.remove('seleccionado'));
  btn.classList.add('seleccionado');
  estado.horaInicio = horaInicio;
  estado.horaFin = horaFin;
  estado.precioTotal = precio;
  irAPaso(4);
  renderPaso4();
}

/* ─── PASO 4: FORMULARIO DE DATOS ─────────── */
function renderPaso4() {
  const resumen = document.getElementById('resumen-seleccion');
  if (resumen) resumen.textContent = `${formatFecha(estado.fecha)} — ${estado.horaInicio} a ${estado.horaFin} (${_durLabel(estado.duracion)}) — $${estado.precioTotal.toLocaleString('es-AR')}`;

  const metodoPagoC = document.getElementById('metodo-pago-container');
  if (metodoPagoC && !metodoPagoC._listenersReady) {
    metodoPagoC._listenersReady = true;
    metodoPagoC.querySelectorAll('.pago-prem-opcion').forEach(op => {
      op.addEventListener('click', () => {
        metodoPagoC.querySelectorAll('.pago-prem-opcion').forEach(o => o.classList.remove('seleccionada'));
        op.classList.add('seleccionada');
        const radio = op.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
        estado.metodoPago = radio ? radio.value : null;
        const aviso = document.getElementById('aviso-pago-online');
        if (aviso) aviso.classList.toggle('visible', estado.metodoPago !== 'efectivo');
      });
    });
  }
}

function validarYEnviar() {
  const campoNombre = document.getElementById('nombre');
  const campoTel    = document.getElementById('telefono');
  let ok = true;

  function marcarError(campo, msg) {
    campo.classList.add('error');
    let err = campo.nextElementSibling;
    if (!err || !err.classList.contains('form-error')) {
      err = document.createElement('p');
      err.className = 'form-error';
      campo.parentNode.insertBefore(err, campo.nextSibling);
    }
    err.textContent = msg;
    ok = false;
  }
  function limpiarError(campo) {
    campo.classList.remove('error');
    const err = campo.nextElementSibling;
    if (err && err.classList.contains('form-error')) err.remove();
  }

  limpiarError(campoNombre);
  limpiarError(campoTel);

  if (!campoNombre.value.trim())       marcarError(campoNombre, 'Ingresá tu nombre completo');
  if (!campoTel.value.trim())          marcarError(campoTel, 'Ingresá tu número de teléfono');
  if (!estado.metodoPago)              { toast('Elegí un método de pago', 'rojo'); ok = false; }

  if (!ok) return;

  estado.nombre    = campoNombre.value.trim();
  estado.telefono  = campoTel.value.trim();
  enviarReserva();
}

async function enviarReserva() {
  const btn = document.getElementById('btn-confirmar');
  if (btn) { btn.disabled = true; btn.textContent = 'Confirmando...'; }

  try {
    const data = await api.reservar({
      nombre: estado.nombre,
      telefono: estado.telefono,
      metodoPago: estado.metodoPago,
      fecha: estado.fecha,
      hora_inicio: estado.horaInicio,
      duracion_minutos: estado.duracion
    });
    estado.confirmacion = data;
    irAPaso(5);
    renderConfirmacion(data);
    _sumarPuntosReserva();
  } catch (e) {
    toast(e.message || 'Error al confirmar la reserva', 'rojo');
    if (btn) { btn.disabled = false; btn.innerHTML = 'Confirmar reserva <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'; }
  }
}

/* ─── PASO 5: CONFIRMACIÓN ─────────────────── */
function renderConfirmacion(data) {
  const c = document.getElementById('confirmacion-container');
  if (!c) return;

  const metodoLabel = {
    efectivo: 'Pago al llegar al club',
    mercadopago: 'Pago online (MercadoPago)',
    transferencia: 'Pago por transferencia'
  }[data.metodoPago] || data.metodoPago;

  const avisoMetodo = data.metodoPago !== 'efectivo'
    ? `<div class="aviso-pago-online visible" style="margin-top:16px">
        <strong>🔵 Link de pago por WhatsApp</strong><br>
        Te enviamos el link de pago al número <strong>${data.nombre}</strong>. Tenés <strong>30 minutos</strong> para completar el pago o la reserva se cancela automáticamente.
       </div>`
    : `<div class="alerta-item verde" style="margin-top:16px;border-radius:var(--radio)">
        <span class="alerta-icono">💵</span>
        <span>Abonás al llegar al club. ¡Te esperamos!</span>
       </div>`;

  const durLabel = _durLabel(data.duracion_minutos);
  const precio = data.precio_total || estado.precioTotal;

  c.innerHTML = `
    <div class="confirmacion">
      <div class="confirmacion-check">
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="20" fill="#1D9E75" opacity=".15"/>
          <path d="M11 21l7 7L29 13" stroke="#1D9E75" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <h2>${data.nombre}, tu turno está confirmado</h2>
      <p>${formatFechaLarga(data.fecha)} de ${data.hora_inicio} a ${data.hora_fin} (${durLabel})</p>

      <div class="cancha-asignada">
        <span class="label">Tu cancha asignada es</span>
        <div class="cancha-num-grande">${data.cancha}</div>
        <div class="cancha-tipo-conf">${data.tipo || data.cancha_nombre}</div>
        ${avisoMetodo}
      </div>

      <div class="resumen-reserva">
        <div class="resumen-fila"><span class="clave">Nombre</span><span class="valor">${data.nombre}</span></div>
        <div class="resumen-fila"><span class="clave">Teléfono</span><span class="valor">${data.telefono || estado.telefono}</span></div>
        <div class="resumen-fila"><span class="clave">Día</span><span class="valor">${formatFechaLarga(data.fecha)}</span></div>
        <div class="resumen-fila"><span class="clave">Horario</span><span class="valor">${data.hora_inicio} a ${data.hora_fin} (${durLabel})</span></div>
        <div class="resumen-fila"><span class="clave">Cancha</span><span class="valor verde">Cancha ${data.cancha} — ${data.tipo || data.cancha_nombre}</span></div>
        <div class="resumen-fila"><span class="clave">Precio</span><span class="valor verde">$${precio.toLocaleString('es-AR')}</span></div>
        <div class="resumen-fila"><span class="clave">Forma de pago</span><span class="valor">${metodoLabel}</span></div>
      </div>

      <button class="btn btn-outline btn-bloque" onclick="reiniciarReserva()">
        Hacer otra reserva
      </button>
    </div>
  `;
}

function reiniciarReserva() {
  Object.assign(estado, { paso:1, fecha:null, duracion:null, horaInicio:null, horaFin:null, precioTotal:null, nombre:null, telefono:null, metodoPago:null, confirmacion:null });
  const nombre = document.getElementById('nombre');
  const tel    = document.getElementById('telefono');
  if (nombre) nombre.value = '';
  if (tel)    tel.value    = '';
  document.querySelectorAll('.pago-prem-opcion').forEach(o => o.classList.remove('seleccionada'));
  irAPaso(1);
  renderPaso1();
}

/* ─── HELPERS ──────────────────────────────── */
function _durLabel(min) {
  const d = DURACIONES.find(x => x.minutos === min);
  return d ? d.label : min + ' min';
}

document.addEventListener('DOMContentLoaded', iniciarReservas);

function _sumarPuntosReserva() {
  try {
    const sess  = JSON.parse(localStorage.getItem('padelpro_session'));
    if (!sess) return;
    const users = JSON.parse(localStorage.getItem('padelpro_users')) || [];
    const i = users.findIndex(u => u.id === sess.userId);
    if (i === -1) return;
    users[i].puntos   = (users[i].puntos   || 0) + 100;
    users[i].reservas = (users[i].reservas || 0) + 1;
    if (!users[i].historial) users[i].historial = [];
    users[i].historial.unshift({ pts: 100, nota: 'Reserva confirmada', fecha: new Date().toISOString().split('T')[0] });
    localStorage.setItem('padelpro_users', JSON.stringify(users));
    sess.puntos   = users[i].puntos;
    sess.reservas = users[i].reservas;
    localStorage.setItem('padelpro_session', JSON.stringify(sess));
  } catch {}
}
