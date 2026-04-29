/* ═══════════════════════════════════════════════════════════
   admin.js — Panel de Administración
   ═══════════════════════════════════════════════════════════ */

/* ─── NAVEGACIÓN ─────────────────────────────────────────── */

function mostrarSeccion(nombre, el) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('activa'));
  const sec = document.getElementById('sec-' + nombre);
  if (sec) sec.classList.add('activa');

  document.querySelectorAll('.sidebar-nav-item').forEach(i => i.classList.remove('activo'));
  if (el) el.classList.add('activo');

  const titulos = { dashboard: 'Dashboard', reservas: 'Reservas', torneos: 'Torneos', profesores: 'Profesores', socios: 'Socios', ingresos: 'Ingresos' };
  const t = document.getElementById('topbar-titulo');
  if (t) t.textContent = titulos[nombre] || nombre;

  switch (nombre) {
    case 'dashboard':  cargarDashboard();       break;
    case 'reservas':   cargarReservasAdmin();    break;
    case 'torneos':    cargarTorneosAdmin();     break;
    case 'profesores': cargarProfesoresAdmin();  break;
    case 'socios':     cargarSocios();           break;
    case 'ingresos':   cargarIngresos();         break;
  }
}

/* ─── SIDEBAR MOBILE ─────────────────────────────────────── */

function toggleSidebar() {
  document.getElementById('admin-sidebar').classList.toggle('abierta');
  document.getElementById('sidebar-overlay').classList.toggle('visible');
}

function cerrarSidebar() {
  document.getElementById('admin-sidebar').classList.remove('abierta');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}

/* ─── MODALES ────────────────────────────────────────────── */

function abrirModal(id) { document.getElementById(id).classList.add('visible'); }
function cerrarModal(id) { document.getElementById(id).classList.remove('visible'); }

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('visible');
});

/* ─── TOPBAR FECHA ───────────────────────────────────────── */

function initTopbarFecha() {
  const el = document.getElementById('topbar-fecha');
  if (!el) return;
  const now = new Date();
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  el.textContent = `${dias[now.getDay()]} ${now.getDate()} de ${meses[now.getMonth()]}`;
}

/* ══════════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════════ */

async function cargarDashboard() {
  try {
    const data = await api.getDashboard();
    renderMetricas(data);
    renderCanchasRealtime(data.canchasRealtime);
    renderMetodoBarras('metodo-barras', data.metodos);
    renderAlertas(data.alertas);
  } catch (e) { console.error('Dashboard error:', e); }
}

function renderMetricas(data) {
  const c = document.getElementById('metricas-grid');
  if (!c) return;
  c.innerHTML = `
    <div class="metrica-card"><div class="metrica-label">Reservas hoy</div><div class="metrica-valor">${data.reservasHoy}</div><div class="metrica-sub"><span class="metrica-variacion pos">↑ ${data.variacionReservas}</span></div></div>
    <div class="metrica-card"><div class="metrica-label">Ingresos hoy</div><div class="metrica-valor">${formatMonto(data.ingresosHoy)}</div><div class="metrica-sub"><span class="metrica-variacion pos">↑ ${data.variacionIngresos}</span></div></div>
    <div class="metrica-card"><div class="metrica-label">Canchas ocupadas</div><div class="metrica-valor">${data.canchasOcupadas} <span style="font-size:18px;color:var(--texto-suave)">/ 4</span></div><div class="metrica-sub" style="color:var(--texto-suave)">En este momento</div></div>
    <div class="metrica-card"><div class="metrica-label">Socios activos</div><div class="metrica-valor">${data.sociosActivos}</div><div class="metrica-sub" style="color:var(--texto-suave)">Con reservas esta semana</div></div>
  `;
}

function renderCanchasRealtime(canchas) {
  const c = document.getElementById('canchas-realtime');
  if (!c) return;
  c.innerHTML = canchas.map(ca => `
    <div class="cancha-rt-card">
      <div class="cancha-rt-header">
        <div><div class="cancha-rt-num">Cancha ${ca.num}</div><div class="cancha-rt-tipo">${ca.tipo}</div></div>
        <span class="badge ${ca.jugando ? 'badge-verde' : 'badge-gris'}">${ca.jugando ? 'Jugando' : 'Libre'}</span>
      </div>
      <div class="cancha-rt-estado">${ca.jugando ? `<span class="jugando">🎾 ${ca.jugadores}</span>` : `<span class="libre">— Libre ahora</span>`}</div>
      <div class="cancha-rt-prox">Próximo: ${ca.prox}</div>
    </div>
  `).join('');
}

function renderMetodoBarras(containerId, metodos) {
  const c = document.getElementById(containerId);
  if (!c || !metodos) return;
  const clases = ['metodo-efectivo', 'metodo-mercadopago', 'metodo-transferencia'];
  c.innerHTML = metodos.map((m, i) => `
    <div class="metodo-fila ${clases[i] || ''}">
      <span class="metodo-nombre">${m.nombre}</span>
      <div class="metodo-barra-wrap"><div class="metodo-barra" style="width:${m.porcentaje}%"></div></div>
      <span class="metodo-monto">${formatMonto(m.monto)}</span>
    </div>
  `).join('');
}

function renderAlertas(alertas) {
  const c = document.getElementById('alertas-section');
  if (!c || !alertas || !alertas.length) return;
  c.innerHTML = `
    <h3 style="font-size:15px;font-weight:700;margin-bottom:14px">Alertas</h3>
    <div class="alertas-lista">
      ${alertas.map(a => `<div class="alerta-item ${a.tipo}"><span class="alerta-icono">${a.icono}</span><span class="alerta-texto">${a.texto}</span></div>`).join('')}
    </div>
  `;
}

/* ══════════════════════════════════════════════════════════
   RESERVAS
══════════════════════════════════════════════════════════ */

let fechaActual = hoy();

function irAHoy() {
  fechaActual = hoy();
  const fi = document.getElementById('reservas-fecha');
  if (fi) fi.value = fechaActual;
  cargarReservasAdmin();
}

function cambiarFecha(delta) {
  const d = new Date(fechaActual + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  fechaActual = d.toISOString().split('T')[0];
  const fi = document.getElementById('reservas-fecha');
  if (fi) fi.value = fechaActual;
  cargarReservasAdmin();
}

async function cargarReservasAdmin() {
  const fi = document.getElementById('reservas-fecha');
  if (fi && fi.value) fechaActual = fi.value;
  const colsEl = document.getElementById('canchas-columnas');
  const contEl = document.getElementById('reservas-contadores');
  if (colsEl) colsEl.innerHTML = '<div class="loading-overlay" style="grid-column:1/-1"><div class="spinner"></div></div>';
  if (contEl) contEl.innerHTML = '';
  try {
    const canchas = await api.getReservasAdmin(fechaActual);
    renderColumnasCanchas(canchas);
    renderContadores(canchas);
  } catch (e) {
    if (colsEl) colsEl.innerHTML = `<p style="color:var(--rojo);padding:20px;grid-column:1/-1">Error al cargar reservas.</p>`;
  }
}

function renderContadores(canchas) {
  const c = document.getElementById('reservas-contadores');
  if (!c) return;
  let total = 0, pagados = 0, pendientes = 0, ingresos = 0;
  canchas.forEach(ca => {
    ca.horas.forEach(h => {
      if (h.nombre || h.tipo === 'ocupado') {
        total++;
        if (h.estado === 'pagado') { pagados++; ingresos += 2500; }
        else pendientes++;
      }
    });
  });
  c.innerHTML = `
    <div class="contador-chip total">📋 Total: ${total}</div>
    <div class="contador-chip pagados">✅ Pagados: ${pagados}</div>
    <div class="contador-chip pendientes">⏳ Pendientes: ${pendientes}</div>
    <div class="contador-chip ingresos">💰 ${formatMonto(ingresos)}</div>
  `;
}

function renderColumnasCanchas(canchas) {
  const c = document.getElementById('canchas-columnas');
  if (!c) return;
  c.innerHTML = canchas.map(ca => `
    <div class="cancha-columna">
      <div class="cancha-col-header">
        <div><div class="cancha-col-titulo">${ca.nombre}</div><div class="cancha-col-tipo">${ca.tipo}</div></div>
      </div>
      <div class="cancha-col-slots">
        ${ca.horas.map(h => renderSlot(h, ca.id)).join('')}
      </div>
    </div>
  `).join('');
}

function slotKey(canchaId, hora) { return (canchaId + '-' + hora).replace(/[^a-z0-9]/gi, '_'); }

function renderSlot(h, canchaId) {
  const key = slotKey(canchaId, h.hora);
  if (!h.nombre && h.tipo !== 'ocupado') {
    return `
      <div class="slot-card libre" id="slot-${key}">
        <div class="slot-body"><div class="slot-hora">${h.hora}</div><div style="font-size:12px;color:var(--gris)">Libre</div></div>
        <div class="slot-inline-form" id="form-${key}">
          <input type="text" placeholder="Nombre completo" id="inp-nom-${key}">
          <input type="tel" placeholder="Teléfono" id="inp-tel-${key}">
          <select id="inp-pago-${key}">
            <option value="efectivo">Efectivo</option>
            <option value="mercadopago">MercadoPago</option>
            <option value="transferencia">Transferencia</option>
          </select>
          <div class="form-btns">
            <button class="btn-ok" onclick="confirmarAgregarSlot('${canchaId}','${h.hora}','${key}')">Confirmar</button>
            <button class="btn-cancelar" onclick="cancelarFormSlot('${key}')">✕</button>
          </div>
        </div>
        <div style="padding:8px 12px 12px 16px">
          <button class="btn btn-verde btn-sm btn-bloque" onclick="mostrarFormSlot('${key}')">+ Agregar turno</button>
        </div>
      </div>
    `;
  }
  const pagado = h.estado === 'pagado';
  return `
    <div class="slot-card ${pagado ? 'pagado' : 'pendiente'}" id="slot-${key}">
      <div class="slot-body">
        <div class="slot-hora">${h.hora}</div>
        <div class="slot-nombre">${h.nombre || ''}</div>
        <div class="slot-telefono">${h.telefono || ''}</div>
      </div>
      <div class="slot-footer">
        <span class="badge ${pagado ? 'badge-verde' : 'badge-amarillo'}">${pagado ? '✅ Pagado' : '⏳ Pendiente'}</span>
        <span class="badge badge-gris" style="margin-left:4px">${h.metodoPago || ''}</span>
        ${!pagado ? `
          <div class="slot-accion" style="margin-top:8px">
            <select class="slot-select" id="met-${h.claveUnica}">
              <option value="efectivo">Efectivo</option>
              <option value="mercadopago">MercadoPago</option>
              <option value="transferencia">Transferencia</option>
            </select>
            <button class="btn-cobrar" onclick="cobrarSlot('${h.claveUnica}')">Cobrar</button>
            <button class="btn-quitar" onclick="quitarSlot('${h.claveUnica}')">✕</button>
          </div>
        ` : `
          <div style="margin-top:8px"><button class="btn-quitar" style="font-size:11px;padding:4px 10px" onclick="quitarSlot('${h.claveUnica}')">Quitar</button></div>
        `}
      </div>
    </div>
  `;
}

function mostrarFormSlot(key) { document.getElementById('form-' + key)?.classList.add('visible'); }
function cancelarFormSlot(key) { document.getElementById('form-' + key)?.classList.remove('visible'); }

async function confirmarAgregarSlot(canchaId, hora, key) {
  const nombre = (document.getElementById('inp-nom-' + key)?.value || '').trim();
  const tel = (document.getElementById('inp-tel-' + key)?.value || '').trim();
  const pago = document.getElementById('inp-pago-' + key)?.value || 'efectivo';
  if (!nombre) { toast('Ingresá el nombre', 'rojo'); return; }
  try {
    await api.agregarTurnoAdmin({ canchaId, hora, nombre, telefono: tel, metodoPago: pago, fecha: fechaActual });
    cargarReservasAdmin();
  } catch (e) { toast(e.message || 'Error al agregar', 'rojo'); }
}

async function cobrarSlot(claveUnica) {
  const metEl = document.getElementById('met-' + claveUnica);
  try {
    await api.marcarPagado({ claveUnica, metodoPago: metEl ? metEl.value : 'efectivo' });
    cargarReservasAdmin();
  } catch (e) { toast(e.message || 'Error', 'rojo'); }
}

async function quitarSlot(claveUnica) {
  if (!confirm('¿Quitar este turno?')) return;
  try {
    await api.quitarTurno({ claveUnica });
    cargarReservasAdmin();
  } catch (e) { toast(e.message || 'Error', 'rojo'); }
}

/* ══════════════════════════════════════════════════════════
   TORNEOS — Sistema WPT completo
══════════════════════════════════════════════════════════ */

/* ── Carga principal ── */

async function cargarTorneosAdmin() {
  const c = document.getElementById('torneos-admin-lista');
  if (!c) return;
  spinner(c);
  try {
    const torneos = await api.getTorneos();
    if (!torneos.length) {
      c.innerHTML = '<p style="color:var(--texto-suave);padding:40px;text-align:center">No hay torneos. Creá uno con el botón de arriba.</p>';
      return;
    }
    c.innerHTML = torneos.map(t => renderTorneoAdminCard(t)).join('');
  } catch (e) {
    c.innerHTML = '<p style="color:var(--rojo);padding:20px">Error al cargar torneos.</p>';
  }
}

/* ── Card principal de torneo ── */

function renderTorneoAdminCard(t) {
  const estadoColor = { inscripcion: 'badge-azul', grupos: 'badge-amarillo', bracket: 'badge-verde', finalizado: 'badge-gris' }[t.estado] || 'badge-gris';
  const estadoLabel = { inscripcion: 'Inscripción abierta', grupos: 'Fase de grupos', bracket: 'Cuadro eliminatorio', finalizado: 'Finalizado' }[t.estado] || t.estado;
  const totalParejas = (t.inscripciones || []).filter(i => i.estadoInscripcion === 'aceptada').length;
  const pendientes = (t.inscripciones || []).filter(i => i.estadoInscripcion === 'pendiente').length;

  return `
    <div class="torneo-admin-card" id="tc-${t._id}">

      <!-- Header -->
      <div class="torneo-admin-card-header">
        <div>
          <div class="torneo-admin-nombre">${t.nombre}</div>
          <div class="torneo-admin-meta">
            📅 ${t.fecha}
            &nbsp;·&nbsp; 🎾 ${totalParejas} pareja${totalParejas !== 1 ? 's' : ''} confirmada${totalParejas !== 1 ? 's' : ''}
            ${pendientes > 0 ? `&nbsp;·&nbsp; <span style="color:#f59e0b">⏳ ${pendientes} pendiente${pendientes > 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="badge ${estadoColor}">${estadoLabel}</span>
          <button class="btn btn-rojo btn-sm" onclick="eliminarTorneo('${t._id}')">Eliminar</button>
        </div>
      </div>

      <!-- Contenido según estado -->
      ${t.estado === 'inscripcion' ? renderInscripcionesAdmin(t) : ''}
      ${t.estado === 'grupos' ? renderGruposAdmin(t) : ''}
      ${t.estado === 'bracket' ? renderGruposResumenAdmin(t) + renderBracketAdmin(t) : ''}
      ${t.estado === 'finalizado' ? renderCampeon(t) + renderBracketAdmin(t) + renderGruposResumenAdmin(t) : ''}

    </div>
  `;
}

/* ── FASE: INSCRIPCIÓN ── */

function renderInscripcionesAdmin(t) {
  const aceptadas = (t.inscripciones || []).filter(i => i.estadoInscripcion === 'aceptada');
  const pendientes = (t.inscripciones || []).filter(i => i.estadoInscripcion === 'pendiente');
  const puedeGenerar = aceptadas.length >= 2;

  return `
    <div class="torneo-fase-bloque">
      <div class="torneo-fase-header">
        <span class="torneo-fase-titulo">Inscriptos</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-verde btn-sm" onclick="abrirModalPareja('${t._id}')">+ Agregar pareja</button>
          ${puedeGenerar
            ? `<button class="btn btn-azul btn-sm" onclick="confirmarGenerarGrupos('${t._id}')">⚡ Generar grupos (${aceptadas.length} parejas)</button>`
            : `<span style="font-size:12px;color:var(--texto-suave);align-self:center">Se necesitan al menos 2 parejas para generar grupos</span>`
          }
        </div>
      </div>

      ${pendientes.length > 0 ? `
        <div style="margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">⏳ Pendientes de aprobación</div>
          ${pendientes.map(i => `
            <div class="inscripcion-row pendiente">
              <div class="inscripcion-pareja-info">
                <span class="inscripcion-nombre">${i.nombrePareja}</span>
                <span class="inscripcion-jugadores">${i.jugador1.nombre} (${i.jugador1.telefono}) · ${i.jugador2.nombre} (${i.jugador2.telefono})</span>
              </div>
              <div class="inscripcion-acciones">
                <button class="btn btn-verde btn-sm" onclick="aceptarInscripcion('${t._id}','${i.id}')">Aceptar</button>
                <button class="btn btn-rojo btn-sm" onclick="eliminarInscripcion('${t._id}','${i.id}')">Rechazar</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${aceptadas.length > 0 ? `
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--verde);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">✅ Confirmadas</div>
          ${aceptadas.map((i, idx) => `
            <div class="inscripcion-row aceptada">
              <div class="inscripcion-pareja-info">
                <span class="inscripcion-num">${idx + 1}</span>
                <div>
                  <span class="inscripcion-nombre">${i.nombrePareja}</span>
                  <span class="inscripcion-jugadores">${i.jugador1.nombre} · ${i.jugador2.nombre}</span>
                </div>
              </div>
              <div class="inscripcion-acciones">
                <button class="btn btn-gris btn-sm" onclick="eliminarInscripcion('${t._id}','${i.id}')">Quitar</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<p style="color:var(--texto-suave);font-size:13px;padding:8px 0">Sin parejas confirmadas aún.</p>`}
    </div>
  `;
}

/* ── FASE: GRUPOS ── */

function renderGruposAdmin(t) {
  const letras = Object.keys(t.grupos || {}).sort();
  if (!letras.length) return '<p style="color:var(--texto-suave);padding:20px">Sin grupos generados.</p>';

  const todosPendientes = letras.every(l =>
    (t.grupos[l].partidos || []).every(p => !p.ganador)
  );

  const todosCompletos = letras.every(l =>
    (t.grupos[l].partidos || []).every(p => !!p.ganador)
  );

  return `
    <div class="torneo-fase-bloque">
      <div class="torneo-fase-header">
        <span class="torneo-fase-titulo">Fase de grupos</span>
        ${todosCompletos
          ? `<button class="btn btn-azul btn-sm" onclick="confirmarGenerarBracket('${t._id}')">🏆 Generar cuadro eliminatorio</button>`
          : `<span style="font-size:12px;color:var(--texto-suave);align-self:center">Completá todos los partidos para avanzar</span>`
        }
      </div>

      <div class="grupos-admin-grid">
        ${letras.map(l => renderGrupoAdmin(t, l)).join('')}
      </div>
    </div>
  `;
}

function renderGrupoAdmin(t, letra) {
  const grupo = t.grupos[letra];
  const inscripciones = t.inscripciones || [];

  const tabla = `
    <table class="admin-tabla-grupo">
      <thead>
        <tr>
          <th>#</th><th>Pareja</th><th>V</th><th>D</th><th>SG</th><th>SP</th><th>Pts</th>
        </tr>
      </thead>
      <tbody>
        ${grupo.tabla.map((row, idx) => {
          const pareja = inscripciones.find(i => i.id === row.parejaId);
          const nombre = pareja ? pareja.nombrePareja : row.parejaId;
          const clasifica = idx < 2;
          return `
            <tr class="${clasifica ? 'clasifica-row' : ''}">
              <td>${clasifica ? ['🥇','🥈'][idx] : idx + 1}</td>
              <td><strong>${nombre}</strong>${clasifica ? ' <span class="clasifica-tag">CLASIFICA</span>' : ''}</td>
              <td>${row.V}</td><td>${row.D}</td><td>${row.SG}</td><td>${row.SP}</td>
              <td><strong>${row.Pts}</strong></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  const partidos = `
    <div class="admin-partidos-lista">
      ${grupo.partidos.map(p => {
        const p1 = inscripciones.find(i => i.id === p.pareja1);
        const p2 = inscripciones.find(i => i.id === p.pareja2);
        const n1 = p1 ? p1.nombrePareja : p.pareja1;
        const n2 = p2 ? p2.nombrePareja : p.pareja2;
        const terminado = !!p.ganador;
        const ganadorNombre = p.ganador === p.pareja1 ? n1 : n2;

        return `
          <div class="admin-partido-row ${terminado ? 'terminado' : 'pendiente'}">
            <div class="partido-hora-col">
              ${p.hora
                ? `<span class="partido-hora">${p.hora}</span>`
                : `<span style="color:var(--texto-xs);font-size:11px">Sin hora</span>`
              }
            </div>
            <div class="partido-parejas-col">
              <span class="${p.ganador === p.pareja1 ? 'ganador-txt' : ''}">${n1}</span>
              <span class="partido-vs">vs</span>
              <span class="${p.ganador === p.pareja2 ? 'ganador-txt' : ''}">${n2}</span>
            </div>
            <div class="partido-resultado-col">
              ${terminado
                ? `<span class="resultado-badge">${p.resultado}</span>`
                : `<span style="color:var(--texto-xs);font-size:11px">—</span>`
              }
            </div>
            <div class="partido-acciones-col">
              <button class="btn btn-gris btn-sm" onclick="abrirModalResultadoGrupo('${t._id}','${letra}','${p.id}','${n1}','${n2}')">
                ${terminado ? '✏️ Editar' : '+ Resultado'}
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  return `
    <div class="grupo-admin-card">
      <div class="grupo-admin-header">
        <div class="grupo-admin-letra">${letra}</div>
        <span class="grupo-admin-titulo">Grupo ${letra}</span>
        <span style="font-size:12px;color:var(--texto-suave)">${grupo.tabla.length} parejas</span>
      </div>
      ${tabla}
      ${partidos}
    </div>
  `;
}

/* ── FASE: BRACKET (cuadro eliminatorio) ── */

function renderBracketAdmin(t) {
  if (!t.bracket || !t.bracket.length) return '';

  const inscripciones = t.inscripciones || [];
  const getNombre = id => {
    if (!id) return '<span style="color:var(--texto-xs)">Por definir</span>';
    const p = inscripciones.find(i => i.id === id);
    return p ? p.nombrePareja : id;
  };

  const fases = ['cuartos', 'semifinal', 'final'];
  const faseLabel = { cuartos: 'Cuartos de Final', semifinal: 'Semifinal', final: 'Gran Final' };

  const activasFases = fases.filter(f => t.bracket.some(p => p.fase === f));

  return `
    <div class="torneo-fase-bloque">
      <div class="torneo-fase-header">
        <span class="torneo-fase-titulo">Cuadro eliminatorio</span>
      </div>
      <div class="bracket-admin-wrap">
        ${activasFases.map(fase => `
          <div class="bracket-admin-columna">
            <div class="bracket-col-titulo">${faseLabel[fase] || fase}</div>
            ${t.bracket.filter(p => p.fase === fase).map(p => {
              const n1 = getNombre(p.pareja1);
              const n2 = getNombre(p.pareja2);
              const terminado = !!p.ganador;
              const puedeCargar = p.pareja1 && p.pareja2 && !terminado;
              const puedeEditar = terminado;

              return `
                <div class="bracket-admin-match ${terminado ? 'terminado' : (p.pareja1 && p.pareja2 ? 'listo' : 'esperando')}">
                  <div class="bracket-admin-match-parejas">
                    <div class="bracket-admin-pareja ${p.ganador === p.pareja1 ? 'ganador' : ''}">
                      ${n1}
                    </div>
                    <div class="bracket-admin-pareja ${p.ganador === p.pareja2 ? 'ganador' : ''}">
                      ${n2}
                    </div>
                  </div>
                  ${p.hora || p.resultado ? `
                    <div class="bracket-admin-match-info">
                      ${p.hora ? `<span>🕐 ${p.hora}</span>` : ''}
                      ${p.resultado ? `<span class="resultado-badge">${p.resultado}</span>` : ''}
                    </div>
                  ` : ''}
                  ${(puedeCargar || puedeEditar) ? `
                    <button class="btn btn-gris btn-sm" style="margin-top:6px;width:100%" onclick="abrirModalResultadoBracket('${t._id}','${p.id}','${p.pareja1 || ''}','${p.pareja2 || ''}')">
                      ${puedeEditar ? '✏️ Editar resultado' : '+ Cargar resultado'}
                    </button>
                  ` : ''}
                  ${!p.pareja1 || !p.pareja2 ? `
                    <div style="font-size:11px;color:var(--texto-xs);margin-top:6px;text-align:center">Esperando clasificados</div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* ── Resumen de grupos (para estado bracket/finalizado) ── */

function renderGruposResumenAdmin(t) {
  const letras = Object.keys(t.grupos || {}).sort();
  if (!letras.length) return '';
  const inscripciones = t.inscripciones || [];

  return `
    <div class="torneo-fase-bloque" style="padding-top:0">
      <details>
        <summary style="cursor:pointer;font-size:13px;font-weight:700;color:var(--texto-suave);padding:8px 0;list-style:none">▶ Ver resultados de grupos</summary>
        <div class="grupos-admin-grid" style="margin-top:12px">
          ${letras.map(l => {
            const grupo = t.grupos[l];
            return `
              <div class="grupo-admin-card">
                <div class="grupo-admin-header">
                  <div class="grupo-admin-letra">${l}</div>
                  <span class="grupo-admin-titulo">Grupo ${l}</span>
                </div>
                <table class="admin-tabla-grupo">
                  <thead><tr><th>#</th><th>Pareja</th><th>V</th><th>D</th><th>Pts</th></tr></thead>
                  <tbody>
                    ${grupo.tabla.map((row, idx) => {
                      const pareja = inscripciones.find(i => i.id === row.parejaId);
                      return `<tr class="${idx < 2 ? 'clasifica-row' : ''}">
                        <td>${idx + 1}</td>
                        <td><strong>${pareja ? pareja.nombrePareja : row.parejaId}</strong></td>
                        <td>${row.V}</td><td>${row.D}</td><td><strong>${row.Pts}</strong></td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            `;
          }).join('')}
        </div>
      </details>
    </div>
  `;
}

/* ── Campeón ── */

function renderCampeon(t) {
  if (!t.campeon) return '';
  const pareja = (t.inscripciones || []).find(i => i.id === t.campeon);
  const nombre = pareja ? pareja.nombrePareja : t.campeon;
  return `
    <div class="campeon-admin-display">
      <div style="font-size:48px">🏆</div>
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--verde);margin-bottom:4px">Campeón</div>
      <div style="font-size:22px;font-weight:900">${nombre}</div>
    </div>
  `;
}

/* ── Acciones ── */

function abrirModalTorneo() {
  document.getElementById('torneo-nombre').value = '';
  document.getElementById('torneo-fecha').value = hoy();
  abrirModal('modal-torneo');
}

async function crearTorneo() {
  const nombre = document.getElementById('torneo-nombre').value.trim();
  const fecha = document.getElementById('torneo-fecha').value;
  if (!nombre) { toast('Ingresá un nombre para el torneo', 'rojo'); return; }
  try {
    await api.crearTorneo({ nombre, fecha });
    cerrarModal('modal-torneo');
    cargarTorneosAdmin();
  } catch (e) { toast(e.message || 'Error al crear torneo', 'rojo'); }
}

async function eliminarTorneo(id) {
  if (!confirm('¿Eliminar este torneo? Esta acción no se puede deshacer.')) return;
  try {
    await api.eliminarTorneo(id);
    cargarTorneosAdmin();
  } catch (e) { toast(e.message || 'Error', 'rojo'); }
}

/* ── Modal: Agregar pareja ── */

function abrirModalPareja(torneoId) {
  document.getElementById('pareja-torneo-id').value = torneoId;
  ['pareja-j1-nombre', 'pareja-j1-tel', 'pareja-j2-nombre', 'pareja-j2-tel'].forEach(id => {
    document.getElementById(id).value = '';
  });
  abrirModal('modal-pareja');
}

async function confirmarAgregarPareja() {
  const torneoId = document.getElementById('pareja-torneo-id').value;
  const j1n = document.getElementById('pareja-j1-nombre').value.trim();
  const j1t = document.getElementById('pareja-j1-tel').value.trim();
  const j2n = document.getElementById('pareja-j2-nombre').value.trim();
  const j2t = document.getElementById('pareja-j2-tel').value.trim();
  if (!j1n || !j2n) { toast('Ingresá el nombre de ambos jugadores', 'rojo'); return; }
  try {
    await api.agregarParejaAdmin(torneoId, {
      jugador1: { nombre: j1n, telefono: j1t },
      jugador2: { nombre: j2n, telefono: j2t },
    });
    cerrarModal('modal-pareja');
    cargarTorneosAdmin();
  } catch (e) { toast(e.message || 'Error', 'rojo'); }
}

async function aceptarInscripcion(torneoId, inscripcionId) {
  try {
    await api.aceptarInscripcion(torneoId, inscripcionId);
    cargarTorneosAdmin();
  } catch (e) { toast(e.message || 'Error', 'rojo'); }
}

async function eliminarInscripcion(torneoId, inscripcionId) {
  if (!confirm('¿Quitar esta pareja?')) return;
  try {
    await api.eliminarInscripcion(torneoId, inscripcionId);
    cargarTorneosAdmin();
  } catch (e) { toast(e.message || 'Error', 'rojo'); }
}

async function confirmarGenerarGrupos(torneoId) {
  const torneo = (await api.getTorneos()).find(t => t._id === torneoId);
  const aceptadas = (torneo?.inscripciones || []).filter(i => i.estadoInscripcion === 'aceptada');
  if (!confirm(`¿Generar grupos con ${aceptadas.length} parejas? El sorteo es automático y esta acción reiniciará el torneo.`)) return;
  try {
    await api.generarGrupos(torneoId);
    cargarTorneosAdmin();
  } catch (e) { toast(e.message || 'Error al generar grupos', 'rojo'); }
}

async function confirmarGenerarBracket(torneoId) {
  if (!confirm('¿Generar el cuadro eliminatorio con los clasificados de cada grupo?')) return;
  try {
    await api.generarBracket(torneoId);
    cargarTorneosAdmin();
  } catch (e) { toast(e.message || 'Error: ' + e.message, 'rojo'); }
}

/* ── Modal: Resultado partido de grupo ── */

let _resCtx = null;

function abrirModalResultadoGrupo(torneoId, grupoLetra, partidoId, n1, n2) {
  _resCtx = { tipo: 'grupo', torneoId, grupoLetra, partidoId };
  document.getElementById('res-partido-titulo').textContent = `${n1} vs ${n2}`;
  document.getElementById('res-hora').value = '';
  document.getElementById('res-resultado').value = '';
  const sel = document.getElementById('res-ganador');
  sel.innerHTML = `
    <option value="">— Seleccioná el ganador —</option>
    <option value="${_resCtx.p1Id || ''}">Ganador: ${n1}</option>
    <option value="${_resCtx.p2Id || ''}">Ganador: ${n2}</option>
  `;

  // Fetch current partido data to pre-fill
  api.getTorneo(torneoId).then(t => {
    if (!t) return;
    const grupo = t.grupos[grupoLetra];
    if (!grupo) return;
    const p = grupo.partidos.find(p => p.id === partidoId);
    if (!p) return;
    _resCtx.p1Id = p.pareja1;
    _resCtx.p2Id = p.pareja2;
    if (p.hora) document.getElementById('res-hora').value = p.hora;
    if (p.resultado) document.getElementById('res-resultado').value = p.resultado;
    sel.innerHTML = `
      <option value="">— Seleccioná el ganador —</option>
      <option value="${p.pareja1}" ${p.ganador === p.pareja1 ? 'selected' : ''}>${n1}</option>
      <option value="${p.pareja2}" ${p.ganador === p.pareja2 ? 'selected' : ''}>${n2}</option>
    `;
  });

  abrirModal('modal-resultado');
}

function abrirModalResultadoBracket(torneoId, partidoId, p1Id, p2Id) {
  api.getTorneo(torneoId).then(t => {
    if (!t) return;
    const p = (t.bracket || []).find(b => b.id === partidoId);
    if (!p) return;

    const insc = t.inscripciones || [];
    const n1 = insc.find(i => i.id === (p1Id || p.pareja1))?.nombrePareja || 'Pareja 1';
    const n2 = insc.find(i => i.id === (p2Id || p.pareja2))?.nombrePareja || 'Pareja 2';

    _resCtx = { tipo: 'bracket', torneoId, partidoId, p1Id: p.pareja1, p2Id: p.pareja2 };

    document.getElementById('res-partido-titulo').textContent = `${n1} vs ${n2}`;
    if (p.hora) document.getElementById('res-hora').value = p.hora;
    else document.getElementById('res-hora').value = '';
    if (p.resultado) document.getElementById('res-resultado').value = p.resultado;
    else document.getElementById('res-resultado').value = '';

    document.getElementById('res-ganador').innerHTML = `
      <option value="">— Seleccioná el ganador —</option>
      <option value="${p.pareja1}" ${p.ganador === p.pareja1 ? 'selected' : ''}>${n1}</option>
      <option value="${p.pareja2}" ${p.ganador === p.pareja2 ? 'selected' : ''}>${n2}</option>
    `;

    abrirModal('modal-resultado');
  });
}

async function confirmarResultado() {
  if (!_resCtx) return;
  const hora = document.getElementById('res-hora').value.trim();
  const resultado = document.getElementById('res-resultado').value.trim();
  const ganador = document.getElementById('res-ganador').value;

  if (!ganador) { toast('Seleccioná el ganador', 'rojo'); return; }
  if (!resultado) { toast('Ingresá el resultado (ej: 6-3 / 6-4)', 'rojo'); return; }

  try {
    if (_resCtx.tipo === 'grupo') {
      await api.actualizarPartidoGrupo(_resCtx.torneoId, _resCtx.grupoLetra, _resCtx.partidoId, { hora: hora || null, resultado, ganador });
    } else {
      await api.actualizarPartidoBracket(_resCtx.torneoId, _resCtx.partidoId, { hora: hora || null, resultado, ganador });
    }
    cerrarModal('modal-resultado');
    cargarTorneosAdmin();
  } catch (e) { toast(e.message || 'Error al guardar', 'rojo'); }
}

/* ══════════════════════════════════════════════════════════
   PROFESORES
══════════════════════════════════════════════════════════ */

let _editandoProfId = null;

async function cargarProfesoresAdmin() {
  const c = document.getElementById('prof-admin-grid');
  if (!c) return;
  spinner(c);
  try {
    const profs = await api.getProfesores();
    if (!profs.length) {
      c.innerHTML = '<p style="color:var(--texto-suave);padding:40px;text-align:center;grid-column:1/-1">Sin profesores. Agregá uno con el botón de arriba.</p>';
      return;
    }
    c.innerHTML = profs.map(p => `
      <div class="prof-admin-card">
        <div class="prof-admin-header">
          <div class="prof-admin-avatar">${p.imagen ? `<img src="${p.imagen}" alt="${p.nombre}">` : iniciales(p.nombre)}</div>
          <div><div class="prof-admin-nombre">${p.nombre}</div><div class="prof-admin-esp">${p.especialidad}</div></div>
        </div>
        <div style="font-size:13px;color:var(--texto-suave);line-height:1.7;margin-bottom:4px">
          <div>🕐 ${p.horarios}</div>
          <div>👥 ${p.alumnos || 0} alumnos activos</div>
          ${p.rating ? `<div>⭐ ${p.rating}/5.0</div>` : ''}
        </div>
        <div class="prof-admin-acciones">
          <button class="btn btn-gris btn-sm" onclick="editarProfesor('${p._id}')">Editar</button>
          <button class="btn btn-rojo btn-sm" onclick="eliminarProfesor('${p._id}')">Eliminar</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    c.innerHTML = '<p style="color:var(--rojo);padding:20px;grid-column:1/-1">Error al cargar profesores.</p>';
  }
}

function abrirModalProfesor() {
  _editandoProfId = null;
  document.getElementById('modal-prof-titulo').textContent = 'Agregar profesor';
  document.getElementById('prof-btn-guardar').textContent = 'Guardar';
  ['nombre', 'especialidad', 'experiencia', 'horarios', 'whatsapp', 'niveles', 'grupos', 'imagen'].forEach(f => {
    const el = document.getElementById('prof-' + f);
    if (el) el.value = '';
  });
  const al = document.getElementById('prof-alumnos'); if (al) al.value = '0';
  const rt = document.getElementById('prof-rating'); if (rt) rt.value = '';
  abrirModal('modal-profesor');
}

async function editarProfesor(id) {
  try {
    const profs = await api.getProfesores();
    const p = profs.find(p => p._id === id);
    if (!p) return;
    _editandoProfId = id;
    document.getElementById('modal-prof-titulo').textContent = 'Editar profesor';
    document.getElementById('prof-btn-guardar').textContent = 'Actualizar';
    document.getElementById('prof-nombre').value = p.nombre || '';
    document.getElementById('prof-especialidad').value = p.especialidad || '';
    document.getElementById('prof-experiencia').value = p.experiencia || '';
    document.getElementById('prof-horarios').value = p.horarios || '';
    document.getElementById('prof-whatsapp').value = p.whatsapp || '';
    document.getElementById('prof-alumnos').value = p.alumnos || 0;
    document.getElementById('prof-niveles').value = (p.niveles || []).join(', ');
    document.getElementById('prof-grupos').value = (p.gruposEdad || []).join(', ');
    document.getElementById('prof-rating').value = p.rating || '';
    document.getElementById('prof-imagen').value = p.imagen || '';
    abrirModal('modal-profesor');
  } catch (e) { toast('Error al cargar datos del profesor', 'rojo'); }
}

async function guardarProfesor() {
  const datos = {
    nombre: document.getElementById('prof-nombre').value.trim(),
    especialidad: document.getElementById('prof-especialidad').value.trim(),
    experiencia: document.getElementById('prof-experiencia').value.trim(),
    horarios: document.getElementById('prof-horarios').value.trim(),
    whatsapp: document.getElementById('prof-whatsapp').value.trim(),
    alumnos: parseInt(document.getElementById('prof-alumnos').value) || 0,
    rating: parseFloat(document.getElementById('prof-rating').value) || null,
    imagen: document.getElementById('prof-imagen').value.trim(),
    niveles: document.getElementById('prof-niveles').value.split(',').map(s => s.trim()).filter(Boolean),
    gruposEdad: document.getElementById('prof-grupos').value.split(',').map(s => s.trim()).filter(Boolean),
  };
  if (!datos.nombre) { toast('El nombre es obligatorio', 'rojo'); return; }
  try {
    if (_editandoProfId) await api.editarProfesor(_editandoProfId, datos);
    else await api.agregarProfesor(datos);
    cerrarModal('modal-profesor');
    cargarProfesoresAdmin();
  } catch (e) { toast(e.message || 'Error al guardar', 'rojo'); }
}

async function eliminarProfesor(id) {
  if (!confirm('¿Eliminar este profesor?')) return;
  try {
    await api.quitarProfesor(id);
    cargarProfesoresAdmin();
  } catch (e) { toast(e.message || 'Error', 'rojo'); }
}

/* ══════════════════════════════════════════════════════════
   SOCIOS
══════════════════════════════════════════════════════════ */

let _todosSocios = [];

async function cargarSocios() {
  const tbody = document.getElementById('socios-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px"><div class="spinner"></div></td></tr>`;
  try {
    _todosSocios = await api.getSocios();
    renderTablasSocios(_todosSocios);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--rojo);padding:20px">Error al cargar socios.</td></tr>`;
  }
}

function renderTablasSocios(socios) {
  const tbody = document.getElementById('socios-tbody');
  if (!tbody) return;
  if (!socios.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--texto-suave);padding:40px">Sin socios registrados.</td></tr>`;
    return;
  }
  tbody.innerHTML = socios.map(s => `
    <tr>
      <td><strong>${s.nombre}</strong></td>
      <td>${s.telefono}</td>
      <td><div class="puntos-col"><span class="estrella">⭐</span><span class="puntos-badge">${s.puntos || 0} pts</span></div></td>
      <td>${s.ultimoMetodo || '—'}</td>
      <td>${s.ultimoTurno ? formatFecha(s.ultimoTurno) : '—'}</td>
      <td><span class="badge ${s.estado === 'activo' ? 'badge-verde' : 'badge-gris'}">${s.estado === 'activo' ? 'Activo' : 'Inactivo'}</span></td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn btn-gris btn-sm" onclick="ajustarPuntos('${s._id}', 50)">+50</button>
        <button class="btn btn-gris btn-sm" onclick="ajustarPuntos('${s._id}', -50)">-50</button>
      </td>
    </tr>
  `).join('');
}

function filtrarSocios(query) {
  if (!query) { renderTablasSocios(_todosSocios); return; }
  const q = query.toLowerCase();
  renderTablasSocios(_todosSocios.filter(s => s.nombre.toLowerCase().includes(q) || s.telefono.includes(q)));
}

async function ajustarPuntos(id, puntos) {
  try {
    await api.ajustarPuntos(id, puntos);
    cargarSocios();
  } catch (e) { toast(e.message || 'Error', 'rojo'); }
}

/* ══════════════════════════════════════════════════════════
   INGRESOS
══════════════════════════════════════════════════════════ */

let _mesOffset = 0;

const _NOMBRES_MES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function _getMesInfo(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return { label: `${_NOMBRES_MES[d.getMonth()]} ${d.getFullYear()}`, año: d.getFullYear(), mes: d.getMonth() + 1 };
}

function cambiarMes(delta) {
  if (_mesOffset + delta > 0) return;
  _mesOffset += delta;
  cargarReporteMes();
}

async function cargarIngresos() {
  try {
    const reporte = await api.getReporte();
    renderReporteHoy(reporte.hoy);
    renderReporteSemana(reporte.semana);
    renderMetodoBarras('ingresos-metodo-barras', reporte.metodos);
  } catch (e) { console.error('Ingresos error:', e); }
  cargarReporteMes();
}

async function cargarReporteMes() {
  const info = _getMesInfo(_mesOffset);
  const label = document.getElementById('ingresos-mes-label');
  const btnSig = document.getElementById('btn-mes-sig');
  if (label) label.textContent = info.label;
  if (btnSig) btnSig.disabled = _mesOffset >= 0;

  const cMes = document.getElementById('reporte-mes');
  const cMetMes = document.getElementById('ingresos-metodo-mes');
  if (cMes) cMes.innerHTML = '<div class="loading-overlay" style="min-height:80px"><div class="spinner"></div></div>';

  try {
    const data = await api.getReporteMes(info.año, info.mes);
    renderReporteMes(data.mes);
    renderMetodoBarras('ingresos-metodo-mes', data.metodos);
  } catch (e) { console.error('Reporte mes error:', e); }
}

function renderReporteHoy(d) {
  const c = document.getElementById('reporte-hoy');
  if (!c) return;
  c.innerHTML = `
    <div class="reporte-card"><div class="titulo">Ingresos</div><div class="valor">${formatMonto(d.total)}</div><div class="sub">Total recaudado hoy</div></div>
    <div class="reporte-card"><div class="titulo">Reservas</div><div class="valor">${d.reservas}</div><div class="sub">Turnos confirmados</div></div>
    <div class="reporte-card"><div class="titulo">Promedio</div><div class="valor">${formatMonto(d.promedio)}</div><div class="sub">Por reserva</div></div>
    <div class="reporte-card"><div class="titulo">Método top</div><div class="valor" style="font-size:18px">${d.metodo_top}</div><div class="sub">Más usado hoy</div></div>
  `;
}

function renderReporteSemana(d) {
  const c = document.getElementById('reporte-semana');
  if (!c) return;
  c.innerHTML = `
    <div class="reporte-card"><div class="titulo">Ingresos semana</div><div class="valor">${formatMonto(d.total)}</div><div class="sub">Últimos 7 días</div></div>
    <div class="reporte-card"><div class="titulo">Reservas semana</div><div class="valor">${d.reservas}</div><div class="sub">Turnos totales</div></div>
    <div class="reporte-card"><div class="titulo">Promedio diario</div><div class="valor">${formatMonto(d.promedio)}</div><div class="sub">Ingreso por día</div></div>
    <div class="reporte-card"><div class="titulo">Mejor día</div><div class="valor" style="font-size:18px">${d.mejor_dia}</div><div class="sub">Mayor recaudación</div></div>
  `;
}

function renderReporteMes(d) {
  const c = document.getElementById('reporte-mes');
  if (!c) return;
  c.innerHTML = `
    <div class="reporte-card"><div class="titulo">Ganancia del mes</div><div class="valor">${formatMonto(d.total)}</div><div class="sub">Total recaudado</div></div>
    <div class="reporte-card"><div class="titulo">Reservas del mes</div><div class="valor">${d.reservas}</div><div class="sub">Turnos totales</div></div>
    <div class="reporte-card"><div class="titulo">Promedio diario</div><div class="valor">${formatMonto(d.promedio)}</div><div class="sub">Ingreso por día</div></div>
    <div class="reporte-card"><div class="titulo">Mejor día</div><div class="valor" style="font-size:18px">${d.mejor_dia}</div><div class="sub">Mayor recaudación</div></div>
  `;
}

/* ══════════════════════════════════════════════════════════
   INICIALIZACIÓN
══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  initTopbarFecha();
  const fechaInput = document.getElementById('reservas-fecha');
  if (fechaInput) fechaInput.value = hoy();
  const menuBtn = document.querySelector('.menu-toggle');
  if (menuBtn) menuBtn.style.display = 'flex';
  cargarDashboard();
});
