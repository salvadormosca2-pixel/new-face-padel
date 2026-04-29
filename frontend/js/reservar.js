/* ═══════════════════════════════════════════
   reservar.js — Sistema de reservas 4 pasos
   ═══════════════════════════════════════════ */

const estado = {
  paso: 1,
  fecha: null,
  hora: null,
  nombre: null,
  telefono: null,
  metodoPago: null,
  confirmacion: null
};

function iniciarReservas() {
  renderPasos();
  renderPaso1();
}

/* ─── INDICADOR DE PASOS ──────────────────── */
function renderPasos() {
  const labels = ['Día', 'Horario', 'Datos', 'Confirmación'];
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
  // Aplicar clase premium si existe el contenedor scroll premium
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

  // Seleccionar hoy por defecto
  estado.fecha = hds[0].toISOString().split('T')[0];
}

function seleccionarDia(fecha, btn) {
  document.querySelectorAll('.dia-btn').forEach(b => b.classList.remove('seleccionado'));
  btn.classList.add('seleccionado');
  estado.fecha = fecha;
  estado.hora  = null;
  irAPaso(2);
  cargarHorarios(fecha);
}

/* ─── PASO 2: GRILLA DE HORARIOS ─────────── */
async function cargarHorarios(fecha) {
  const c = document.getElementById('horarios-container');
  if (!c) return;
  spinner(c);
  try {
    const horarios = await api.getHorarios(fecha);
    c.innerHTML = horarios.map(h => {
      const libre = h.libres > 0;
      const ultimo = h.libres === 1;
      const disp = libre
        ? (ultimo ? `<span class="ultimo">¡Último lugar!</span>` : `<span class="disponible">${h.libres} canchas libres</span>`)
        : `<span class="ocupado">Sin lugar</span>`;
      return `
        <button
          class="horario-btn"
          ${!libre ? 'disabled' : ''}
          onclick="seleccionarHora('${h.hora}', this)"
        >
          <span class="horario-hora">${h.hora}</span>
          <span class="horario-disponibilidad">${disp}</span>
        </button>
      `;
    }).join('');
  } catch (e) {
    c.innerHTML = `<p style="color:var(--rojo);padding:20px">No se pudieron cargar los horarios. Intentá de nuevo.</p>`;
  }
}

function seleccionarHora(hora, btn) {
  document.querySelectorAll('.horario-btn').forEach(b => b.classList.remove('seleccionado'));
  btn.classList.add('seleccionado');
  estado.hora = hora;
  irAPaso(3);
  renderPaso3();
}

/* ─── PASO 3: FORMULARIO DE DATOS ─────────── */
function renderPaso3() {
  const resumen = document.getElementById('resumen-seleccion');
  if (resumen) resumen.textContent = `${formatFecha(estado.fecha)} — ${estado.hora}`;

  const metodoPagoC = document.getElementById('metodo-pago-container');
  if (metodoPagoC) {
    metodoPagoC.querySelectorAll('.pago-opcion').forEach(op => {
      op.addEventListener('click', () => {
        metodoPagoC.querySelectorAll('.pago-opcion').forEach(o => o.classList.remove('seleccionada'));
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
      hora: estado.hora
    });
    estado.confirmacion = data;
    irAPaso(4);
    renderConfirmacion(data);
  } catch (e) {
    toast(e.message || 'Error al confirmar la reserva', 'rojo');
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar reserva'; }
  }
}

/* ─── PASO 4: CONFIRMACIÓN ─────────────────── */
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

  c.innerHTML = `
    <div class="confirmacion">
      <div class="confirmacion-check">
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="20" fill="#1D9E75" opacity=".15"/>
          <path d="M11 21l7 7L29 13" stroke="#1D9E75" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <h2>${data.nombre}, tu turno está confirmado</h2>
      <p>${formatFechaLarga(data.fecha)} a las ${data.hora}</p>

      <div class="cancha-asignada">
        <span class="label">Tu cancha asignada es</span>
        <div class="cancha-num-grande">${data.cancha}</div>
        <div class="cancha-tipo-conf">${data.tipo}</div>
        ${avisoMetodo}
      </div>

      <div class="resumen-reserva">
        <div class="resumen-fila"><span class="clave">Nombre</span><span class="valor">${data.nombre}</span></div>
        <div class="resumen-fila"><span class="clave">Teléfono</span><span class="valor">${data.telefono || estado.telefono}</span></div>
        <div class="resumen-fila"><span class="clave">Día</span><span class="valor">${formatFechaLarga(data.fecha)}</span></div>
        <div class="resumen-fila"><span class="clave">Horario</span><span class="valor">${data.hora}</span></div>
        <div class="resumen-fila"><span class="clave">Cancha</span><span class="valor verde">Cancha ${data.cancha} — ${data.tipo}</span></div>
        <div class="resumen-fila"><span class="clave">Forma de pago</span><span class="valor">${metodoLabel}</span></div>
      </div>

      <button class="btn btn-outline btn-bloque" onclick="reiniciarReserva()">
        Hacer otra reserva
      </button>
    </div>
  `;
}

function reiniciarReserva() {
  Object.assign(estado, { paso: 1, fecha: null, hora: null, nombre: null, telefono: null, metodoPago: null, confirmacion: null });
  const nombre = document.getElementById('nombre');
  const tel    = document.getElementById('telefono');
  if (nombre) nombre.value = '';
  if (tel)    tel.value    = '';
  document.querySelectorAll('.pago-opcion').forEach(o => o.classList.remove('seleccionada'));
  irAPaso(1);
  renderPaso1();
}

document.addEventListener('DOMContentLoaded', iniciarReservas);
