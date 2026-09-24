/* ═══════════════════════════════════════════════════════════
   staff.js — Personal, firma con PIN, Caja, Buffet y Auditoría

   El PIN se pide DESPUÉS de la acción: el usuario arma la operación,
   la ejecuta, y recién ahí el modal pregunta quién fue. Nada se
   manda al servidor hasta que la firma está completa.
   ═══════════════════════════════════════════════════════════ */

/* ─── Estado ──────────────────────────────────────────────── */

let _personal      = [];
let _productos     = [];
let _cajaActual    = null;
let _cajaFecha     = null;
let _audFiltro     = { usuarioId: '', accion: '' };

function _fArs(n)     { return '$' + Math.round(n || 0).toLocaleString('es-AR'); }
function _fArsCorto(n){
  const v = Math.round(n || 0);
  if (Math.abs(v) >= 1000000) return '$' + (v / 1000000).toFixed(1).replace('.0', '') + 'M';
  if (Math.abs(v) >= 10000)   return '$' + Math.round(v / 1000) + 'k';
  return '$' + v.toLocaleString('es-AR');
}
function _esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function _hoyKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

async function cargarPersonal(forzar) {
  if (_personal.length && !forzar) return _personal;
  try { _personal = await api.getUsuarios(); } catch (e) { console.warn('No se pudo cargar el personal:', e.message); _personal = []; }
  return _personal;
}

function personaPuede(usuario, permiso) {
  if (!usuario) return false;
  const p = usuario.permisos || [];
  return p.includes('*') || p.includes(permiso);
}

/* ═══════════════════════════════════════════════════════════
   MODAL DE FIRMA — "¿quién hizo esto?" + PIN
   ═══════════════════════════════════════════════════════════ */

let _firmaResolver = null;
let _firmaState    = null;

function _firmaEl() {
  let el = document.getElementById('nf-firma-overlay');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'nf-firma-overlay';
  el.className = 'nf-firma-overlay';
  el.addEventListener('click', ev => { if (ev.target === el) cancelarFirma(); });
  document.body.appendChild(el);
  return el;
}

/*
  Pide la firma de una acción ya decidida.
  Devuelve { usuarioId, pin } o null si se cancela.

    const firma = await pedirFirma('cobro.registrar', {
      titulo: 'Registrar cobro',
      detalle: 'Salvador · $7.000 en efectivo',
      monto: 7000
    });
    if (!firma) return;            // canceló
    await api.registrarPago(id, datos, firma);
*/
async function pedirFirma(permiso, opciones = {}) {
  await cargarPersonal();

  if (_personal.length === 0) {
    toast('No hay personal cargado. Andá a Personal y creá los usuarios.', 'rojo');
    return null;
  }

  /*
    Se muestra a todo el personal activo, no solo a quien puede.
    Si el empleado prueba su PIN, el sistema le dice con nombre y rol que esa
    acción no le corresponde, en vez de hacer como que no existe: así sabe que
    tiene que llamar al jefe y no que el botón está roto.
  */
  const habilitados = _personal.filter(u => u.activo);
  if (habilitados.length === 0) {
    toast('No hay personal activo cargado', 'rojo');
    return null;
  }
  const conPermiso = habilitados.filter(u => !permiso || personaPuede(u, permiso));

  _firmaState = {
    permiso,
    titulo:  opciones.titulo  || 'Confirmá la operación',
    detalle: opciones.detalle || '',
    usuarioId: conPermiso.length === 1 && habilitados.length === 1 ? habilitados[0].id : null,
    pin: '',
    error: '',
    cargando: false,
    habilitados,
    /* Quiénes pueden de verdad: se marca en la lista antes de teclear el PIN */
    puede: Object.fromEntries(habilitados.map(u => [u.id, !permiso || personaPuede(u, permiso)]))
  };

  _renderFirma();
  return new Promise(resolve => { _firmaResolver = resolve; });
}

function _renderFirma() {
  const el = _firmaEl();
  const st = _firmaState;
  if (!st) { el.classList.remove('visible'); el.innerHTML = ''; return; }

  const elegido = st.habilitados.find(u => u.id === st.usuarioId);

  const pasoUsuario = `
    <div class="nf-firma-paso">
      <div class="nf-firma-paso-label">¿Quién hizo esto?</div>
      <div class="nf-firma-personas">
        ${st.habilitados.map(u => `
          <button class="nf-firma-persona ${st.usuarioId === u.id ? 'sel' : ''} ${st.puede[u.id] ? '' : 'sin-permiso'}" onclick="firmaElegirUsuario(${u.id})">
            <span class="nf-firma-avatar" style="background:${_esc(u.color || '#64748b')}">${_esc((u.nombre || '?').trim().charAt(0).toUpperCase())}</span>
            <span class="nf-firma-persona-nombre">${_esc(u.nombre)}</span>
            <span class="nf-firma-persona-rol">${st.puede[u.id] ? _esc(u.rolNombre || u.rol) : 'sin permiso'}</span>
          </button>`).join('')}
      </div>
    </div>`;

  const pasoPin = `
    <div class="nf-firma-paso">
      <div class="nf-firma-paso-label">PIN de ${_esc(elegido ? elegido.nombre : '')}</div>
      <div class="nf-firma-pin-dots">
        ${Array.from({ length: Math.max(4, st.pin.length) }, (_, i) =>
          `<span class="nf-firma-dot ${i < st.pin.length ? 'lleno' : ''}"></span>`).join('')}
      </div>
      <div class="nf-firma-teclado">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="nf-firma-tecla" onclick="firmaTecla('${n}')">${n}</button>`).join('')}
        <button class="nf-firma-tecla nf-firma-tecla-aux" onclick="firmaBorrar()">←</button>
        <button class="nf-firma-tecla" onclick="firmaTecla('0')">0</button>
        <button class="nf-firma-tecla nf-firma-tecla-ok" onclick="confirmarFirma()" ${st.pin.length < 4 || st.cargando ? 'disabled' : ''}>✓</button>
      </div>
    </div>`;

  el.innerHTML = `
    <div class="nf-firma-card" role="dialog" aria-modal="true">
      <div class="nf-firma-header">
        <div>
          <div class="nf-firma-titulo">${_esc(st.titulo)}</div>
          ${st.detalle ? `<div class="nf-firma-detalle">${_esc(st.detalle)}</div>` : ''}
        </div>
        <button class="nf-firma-close" onclick="cancelarFirma()" title="Cancelar">✕</button>
      </div>
      ${elegido && !st.puede[elegido.id]
        ? `<div class="nf-firma-aviso sin-permiso">${_esc(elegido.nombre)} (${_esc(elegido.rolNombre || elegido.rol)}) no puede hacer esto. Hace falta el código de un jefe.</div>`
        : `<div class="nf-firma-aviso">Listo. Firmá para que quede registrado quién lo hizo.</div>`}
      ${st.usuarioId ? pasoPin : pasoUsuario}
      ${st.usuarioId && st.habilitados.length > 1
        ? `<button class="nf-firma-cambiar" onclick="firmaElegirUsuario(null)">← No soy ${_esc(elegido ? elegido.nombre : '')}</button>` : ''}
      ${st.error ? `<div class="nf-firma-error">${_esc(st.error)}</div>` : ''}
    </div>`;

  el.classList.add('visible');
}

function firmaElegirUsuario(id) {
  if (!_firmaState) return;
  _firmaState.usuarioId = id;
  _firmaState.pin = '';
  _firmaState.error = '';
  _renderFirma();
}

function firmaTecla(n) {
  if (!_firmaState || _firmaState.pin.length >= 8) return;
  _firmaState.pin += n;
  _firmaState.error = '';
  _renderFirma();
  if (_firmaState.pin.length >= 4) {
    const okBtn = document.querySelector('.nf-firma-tecla-ok');
    if (okBtn) okBtn.focus();
  }
}

function firmaBorrar() {
  if (!_firmaState) return;
  _firmaState.pin = _firmaState.pin.slice(0, -1);
  _firmaState.error = '';
  _renderFirma();
}

/*
  Valida el PIN contra el servidor antes de devolverlo, así el error de PIN
  se ve acá y no disfrazado de "falló la operación".
*/
async function confirmarFirma() {
  const st = _firmaState;
  if (!st || !st.usuarioId || st.pin.length < 4 || st.cargando) return;

  st.cargando = true;
  st.error = '';
  _renderFirma();

  try {
    await api.verificarPin({ usuarioId: st.usuarioId, pin: st.pin, permiso: st.permiso });
    const firma = { usuarioId: st.usuarioId, pin: st.pin };
    const resolver = _firmaResolver;
    _firmaState = null; _firmaResolver = null;
    _renderFirma();
    if (resolver) resolver(firma);
  } catch (err) {
    st.cargando = false;
    st.pin = '';
    st.error = err.message || 'No se pudo verificar el PIN';
    _renderFirma();
  }
}

function cancelarFirma() {
  const resolver = _firmaResolver;
  _firmaState = null; _firmaResolver = null;
  _renderFirma();
  if (resolver) resolver(null);
}

document.addEventListener('keydown', ev => {
  if (!_firmaState) return;
  if (ev.key === 'Escape') { cancelarFirma(); return; }
  if (!_firmaState.usuarioId) return;
  if (/^[0-9]$/.test(ev.key))      { ev.preventDefault(); firmaTecla(ev.key); }
  else if (ev.key === 'Backspace') { ev.preventDefault(); firmaBorrar(); }
  else if (ev.key === 'Enter')     { ev.preventDefault(); confirmarFirma(); }
});

/* ═══════════════════════════════════════════════════════════
   DESBLOQUEO DE PANTALLAS SENSIBLES

   El panel entra con una sola contraseña compartida, así que la Caja y
   Personal se abren con el PIN de alguien que tenga el permiso. Queda
   abierto un rato para no preguntar en cada ida y vuelta entre pestañas.
   ═══════════════════════════════════════════════════════════ */

const _desbloqueos = {};
const DESBLOQUEO_MS = 10 * 60 * 1000;

function estaDesbloqueado(permiso) {
  const d = _desbloqueos[permiso];
  return !!d && Date.now() - d.desde < DESBLOQUEO_MS;
}

async function desbloquear(permiso, titulo) {
  if (estaDesbloqueado(permiso)) return true;
  const firma = await pedirFirma(permiso, {
    titulo,
    detalle: 'Se cierra sola a los 10 minutos'
  });
  if (!firma) return false;
  _desbloqueos[permiso] = { desde: Date.now(), usuarioId: firma.usuarioId };
  return true;
}

function bloquearTodo() {
  Object.keys(_desbloqueos).forEach(k => delete _desbloqueos[k]);
}

/* ═══════════════════════════════════════════════════════════
   CAJA
   ═══════════════════════════════════════════════════════════ */

function cajaCambiarFecha(delta) {
  const d = new Date((_cajaFecha || _hoyKey()) + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  _cajaFecha = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  renderCaja();
}

async function renderCaja() {
  const cont = document.getElementById('adm2-caja-cont');
  if (!cont) return;
  if (!_cajaFecha) _cajaFecha = _hoyKey();

  cont.innerHTML = `<div class="adm2-cargando">Cargando caja…</div>`;

  try {
    _cajaActual = await api.getCaja(_cajaFecha);
  } catch (err) {
    cont.innerHTML = `<div class="adm2-vacio">No se pudo cargar la caja: ${_esc(err.message)}</div>`;
    return;
  }

  const c = _cajaActual;
  const d = new Date(_cajaFecha + 'T12:00:00');
  const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const MES  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const esHoy = _cajaFecha === _hoyKey();

  const metodo = id => (c.porMetodo || []).find(m => m.id === id) || { total: 0, operaciones: 0 };

  cont.innerHTML = `
    <div class="adm2-caja-topbar">
      <button class="adm2-nav-btn" onclick="cajaCambiarFecha(-1)">←</button>
      <div class="adm2-caja-fecha">
        ${DIAS[d.getDay()]} ${d.getDate()} de ${MES[d.getMonth()]}
        ${esHoy ? '<span class="adm2-caja-hoy">HOY</span>' : ''}
      </div>
      <button class="adm2-nav-btn" onclick="cajaCambiarFecha(1)">→</button>
      <button class="adm2-btn-secundario" onclick="_cajaFecha=null;renderCaja()">Hoy</button>
      <div style="flex:1"></div>
      <button class="adm2-btn-agendar" onclick="abrirCierreCaja()">🔒 Cerrar caja</button>
    </div>

    <div class="adm2-caja-grid">
      <div class="adm2-card adm2-caja-big adm2-caja-efectivo">
        <div class="adm2-caja-label">💵 Efectivo en caja</div>
        <div class="adm2-caja-valor">${_fArs(c.efectivo)}</div>
        <div class="adm2-caja-sub">${metodo('efectivo').operaciones} cobro${metodo('efectivo').operaciones !== 1 ? 's' : ''}</div>
      </div>
      <div class="adm2-card adm2-caja-big adm2-caja-transfer">
        <div class="adm2-caja-label">🏦 Transferencias</div>
        <div class="adm2-caja-valor">${_fArs(c.transferencia)}</div>
        <div class="adm2-caja-sub">${metodo('transferencia').operaciones} cobro${metodo('transferencia').operaciones !== 1 ? 's' : ''}</div>
      </div>
      <div class="adm2-card adm2-caja-big">
        <div class="adm2-caja-label">✅ Total cobrado</div>
        <div class="adm2-caja-valor">${_fArs(c.cobrado)}</div>
        <div class="adm2-caja-sub">canchas ${_fArsCorto(c.totalCanchas)} · buffet ${_fArsCorto(c.totalBuffet)}</div>
      </div>
      <div class="adm2-card adm2-caja-big ${c.porCobrar > 0 ? 'adm2-caja-debe' : ''}">
        <div class="adm2-caja-label">⏳ Falta cobrar</div>
        <div class="adm2-caja-valor">${_fArs(c.porCobrar)}</div>
        <div class="adm2-caja-sub">${c.turnos} turno${c.turnos !== 1 ? 's' : ''} · ${c.faltas} falta${c.faltas !== 1 ? 's' : ''}</div>
      </div>
    </div>

    <div class="adm2-caja-cols">
      <div class="adm2-card">
        <div class="adm2-card-title">Por método de pago</div>
        ${(c.porMetodo || []).filter(m => m.total > 0).length === 0
          ? '<div class="adm2-vacio">Todavía no se cobró nada este día.</div>'
          : (c.porMetodo || []).filter(m => m.total > 0).map(m => {
              const pct = c.cobrado > 0 ? Math.round(m.total / c.cobrado * 100) : 0;
              return `<div class="adm2-metodo-row">
                <span class="adm2-metodo-icon">${m.emoji || '💰'}</span>
                <span class="adm2-metodo-name">${_esc(m.nombre)}</span>
                <div class="adm2-metodo-track"><div class="adm2-metodo-fill" style="width:${pct}%;background:${_esc(m.color || '#22c55e')}"></div></div>
                <span class="adm2-metodo-pct">${pct}%</span>
                <span class="adm2-metodo-monto">${_fArs(m.total)}</span>
              </div>`;
            }).join('')}
      </div>

      <div class="adm2-card">
        <div class="adm2-card-title">Quién cobró</div>
        ${(c.porUsuario || []).length === 0
          ? '<div class="adm2-vacio">Sin movimientos.</div>'
          : c.porUsuario.map(u => `
            <div class="adm2-caja-persona">
              <span class="adm2-caja-persona-nombre">${_esc(u.nombre)}</span>
              <span class="adm2-caja-persona-detalle">💵 ${_fArsCorto(u.efectivo)} · 🏦 ${_fArsCorto(u.transferencia)}</span>
              <span class="adm2-caja-persona-total">${_fArs(u.total)}</span>
            </div>`).join('')}
      </div>

      <div class="adm2-card">
        <div class="adm2-card-title">Turnos por origen</div>
        ${(c.porOrigen || []).length === 0
          ? '<div class="adm2-vacio">Sin turnos.</div>'
          : c.porOrigen.map(o => `
            <div class="adm2-caja-persona">
              <span class="adm2-origen-punto" style="background:${_esc(o.color || '#64748b')}"></span>
              <span class="adm2-caja-persona-nombre">${_esc(o.nombre)}</span>
              <span class="adm2-caja-persona-detalle">${o.turnos} turno${o.turnos !== 1 ? 's' : ''}</span>
              <span class="adm2-caja-persona-total">${_fArs(o.facturado)}</span>
            </div>`).join('')}
      </div>
    </div>

    ${(c.faltasDetalle || []).length > 0 ? `
      <div class="adm2-caja-faltas">
        <span class="adm2-caja-faltas-tit">${c.faltasDetalle.length === 1 ? 'Una falta' : c.faltasDetalle.length + ' faltas'} del día:</span>
        ${c.faltasDetalle.map(f => `<span class="adm2-caja-falta">${f.hora} ${_esc(f.cancha)} · ${_esc(f.cliente)} · ${_fArs(f.monto)}</span>`).join('')}
      </div>` : ''}

    <div class="adm2-card">
      <div class="adm2-card-title">Movimientos (${(c.movimientos || []).length})</div>
      ${(c.movimientos || []).length === 0
        ? '<div class="adm2-vacio">Sin cobros registrados.</div>'
        : `<div class="adm2-mov-lista">${c.movimientos.map(m => `
            <div class="adm2-mov-row">
              <span class="adm2-mov-metodo">${m.metodoEmoji} ${_esc(m.metodoNombre)}</span>
              <span class="adm2-mov-pagador">${_esc(m.pagador || '—')}</span>
              <span class="adm2-mov-cobrador">cobró ${_esc(m.usuarioNombre || '—')}</span>
              <span class="adm2-mov-monto">${_fArs(m.monto)}</span>
              <button class="adm2-mov-anular" onclick="anularPagoDesdeCaja(${m.id}, ${m.monto}, '${_esc(m.pagador || '')}')" title="Anular este cobro">✕</button>
            </div>`).join('')}</div>`}
    </div>`;
}

async function anularPagoDesdeCaja(pagoId, monto, pagador) {
  if (!confirm(`¿Anular el cobro de ${_fArs(monto)} de ${pagador}?`)) return;
  const firma = await pedirFirma('cobro.anular', {
    titulo: 'Anular cobro',
    detalle: `${_fArs(monto)} de ${pagador}`
  });
  if (!firma) return;
  try {
    await api.anularPago(pagoId, firma);
    toast('Cobro anulado', 'verde');
    renderCaja();
    if (typeof _syncReservasDesdeAPI === 'function') await _syncReservasDesdeAPI();
    if (typeof renderTurnos === 'function') renderTurnos();
  } catch (err) { toast(err.message || 'No se pudo anular', 'rojo'); }
}

async function abrirCierreCaja() {
  if (!_cajaActual) return;
  const contado = prompt(
    `Cierre de caja del ${_cajaFecha}\n\nEl sistema tiene ${_fArs(_cajaActual.efectivo)} en efectivo.\n¿Cuánto contaste?`,
    String(Math.round(_cajaActual.efectivo))
  );
  if (contado === null) return;
  const valor = parseFloat(String(contado).replace(/[^\d.-]/g, ''));
  if (isNaN(valor)) { toast('Poné un número', 'rojo'); return; }

  const dif = valor - _cajaActual.efectivo;
  const firma = await pedirFirma('caja.cerrar', {
    titulo: 'Cerrar caja',
    detalle: dif === 0
      ? `${_fArs(valor)} contados, sin diferencia`
      : `${_fArs(valor)} contados · ${dif > 0 ? 'sobran' : 'faltan'} ${_fArs(Math.abs(dif))}`
  });
  if (!firma) return;

  try {
    const r = await api.cerrarCaja({ fecha: _cajaFecha, efectivoContado: valor }, firma);
    toast(r.diferencia === 0 ? 'Caja cerrada sin diferencia ✓' : `Caja cerrada · diferencia ${_fArs(r.diferencia)}`,
          r.diferencia === 0 ? 'verde' : 'rojo');
    renderCaja();
  } catch (err) { toast(err.message || 'No se pudo cerrar la caja', 'rojo'); }
}

/* ═══════════════════════════════════════════════════════════
   BUFFET
   ═══════════════════════════════════════════════════════════ */

async function cargarProductos(forzar) {
  if (_productos.length && !forzar) return _productos;
  try { _productos = await api.getProductos(true); } catch (e) { console.warn('Productos:', e.message); _productos = []; }
  return _productos;
}

async function renderBuffet() {
  const cont = document.getElementById('adm2-buffet-cont');
  if (!cont) return;
  cont.innerHTML = `<div class="adm2-cargando">Cargando productos…</div>`;

  await cargarProductos(true);
  let ventas = { total: 0, unidades: 0, porProducto: [], porUsuario: [] };
  try { ventas = await api.getVentasBuffet(_hoyKey(), _hoyKey()); } catch {}

  const activos   = _productos.filter(p => p.activo);
  const bajos     = activos.filter(p => p.controlaStock && p.stock <= p.stockMinimo);
  const CATS = { bebida: 'Bebidas', comida: 'Comida', alquiler: 'Alquiler', otro: 'Otros' };

  const porCategoria = {};
  activos.forEach(p => { (porCategoria[p.categoria] = porCategoria[p.categoria] || []).push(p); });

  cont.innerHTML = `
    <div class="adm2-stats-row">
      <div class="adm2-card adm2-stat-card adm2-stat-green">
        <div class="adm2-stat-label">Vendido hoy</div>
        <div class="adm2-stat-value">${_fArs(ventas.total)}</div>
        <div class="adm2-stat-sub">${ventas.unidades} unidad${ventas.unidades !== 1 ? 'es' : ''}</div>
      </div>
      <div class="adm2-card adm2-stat-card adm2-stat-blue">
        <div class="adm2-stat-label">Productos activos</div>
        <div class="adm2-stat-value">${activos.length}</div>
        <div class="adm2-stat-sub">${_productos.length - activos.length} dado${_productos.length - activos.length !== 1 ? 's' : ''} de baja</div>
      </div>
      <div class="adm2-card adm2-stat-card ${bajos.length ? 'adm2-stat-yellow' : 'adm2-stat-purple'}">
        <div class="adm2-stat-label">Hay que reponer</div>
        <div class="adm2-stat-value">${bajos.length}</div>
        <div class="adm2-stat-sub">${bajos.length ? bajos.map(p => _esc(p.nombre)).join(', ') : 'Todo con stock'}</div>
      </div>
    </div>

    <div class="adm2-card">
      <div class="adm2-disp-header">
        <div class="adm2-card-title">Catálogo</div>
        <button class="adm2-btn-agendar" onclick="nuevoProducto()">+ Nuevo producto</button>
      </div>
      ${Object.entries(porCategoria).map(([cat, lista]) => `
        <div class="adm2-buffet-cat">
          <div class="adm2-buffet-cat-titulo">${CATS[cat] || cat}</div>
          <div class="adm2-buffet-grid">
            ${lista.map(p => `
              <div class="adm2-prod-card ${p.controlaStock && p.stock <= 0 ? 'sin-stock' : p.controlaStock && p.stock <= p.stockMinimo ? 'stock-bajo' : ''}" onclick="editarProducto(${p.id})">
                <div class="adm2-prod-foto">${p.imagen ? `<img src="${_esc(p.imagen)}" alt="">` : '<span>Sin foto</span>'}</div>
                <div class="adm2-prod-nombre">${_esc(p.nombre)}</div>
                ${p.descripcion ? `<div class="adm2-prod-desc">${_esc(p.descripcion)}</div>` : ''}
                <div class="adm2-prod-precio">${_fArs(p.precio)}</div>
                <div class="adm2-prod-stock">${p.controlaStock ? `stock ${p.stock}` : 'sin control de stock'}${(p.opciones || []).length ? ` · ${p.opciones.length} ingredientes` : ''}</div>
                <div class="adm2-prod-acciones" onclick="event.stopPropagation()">
                  ${p.controlaStock ? `<button onclick="reponer(${p.id})">+ Stock</button>` : ''}
                  <button onclick="editarProducto(${p.id})">Editar</button>
                </div>
              </div>`).join('')}
          </div>
        </div>`).join('')}
    </div>

    ${ventas.porProducto.length ? `
      <div class="adm2-card">
        <div class="adm2-card-title">Lo que más se vendió hoy</div>
        ${ventas.porProducto.map(v => `
          <div class="adm2-caja-persona">
            <span class="adm2-caja-persona-nombre">${v.emoji || ''} ${_esc(v.nombre)}</span>
            <span class="adm2-caja-persona-detalle">${v.unidades} u.</span>
            <span class="adm2-caja-persona-total">${_fArs(v.total)}</span>
          </div>`).join('')}
      </div>` : ''}`;
}

/* ═══════════════════════════════════════════════════════════
   FICHA DE PRODUCTO — un solo formulario, todo a la vista

   Foto, nombre, rubro, dónde se vende, quién lo prepara, precio, costo,
   stock, descripción e ingredientes. Se usa igual para crear y para editar.
   ═══════════════════════════════════════════════════════════ */

let _fp = null;   /* estado del formulario abierto */

function _fpVacio() {
  return { id: null, nombre: '', categoria: 'comida', ambito: 'ambos', estacion: 'directo',
           precio: '', costo: '', stock: '', stockMinimo: 5, controlaStock: true,
           descripcion: '', imagen: '', emoji: '', opciones: [] };
}

function _fpModal() {
  let el = document.getElementById('adm2-modal-producto');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'adm2-modal-producto';
  el.className = 'adm2-modal-overlay';
  el.addEventListener('click', ev => { if (ev.target === el) cerrarFormProducto(); });
  document.body.appendChild(el);
  return el;
}

function nuevoProducto() { _fp = _fpVacio(); pintarFormProducto(); }

function editarProducto(id) {
  const p = _productos.find(x => x.id === id);
  if (!p) return;
  _fp = { id: p.id, nombre: p.nombre, categoria: p.categoria, ambito: p.ambito || 'ambos', estacion: p.estacion || 'directo',
          precio: p.precio, costo: p.costo || '', stock: p.stock, stockMinimo: p.stockMinimo ?? 5, controlaStock: p.controlaStock !== false,
          descripcion: p.descripcion || '', imagen: p.imagen || '', emoji: p.emoji || '',
          opciones: (p.opciones || []).map(o => ({ nombre: o.nombre, precio: Number(o.precio) || 0 })) };
  pintarFormProducto();
}

function cerrarFormProducto() {
  _fp = null;
  const el = document.getElementById('adm2-modal-producto');
  if (el) { el.classList.remove('visible'); el.innerHTML = ''; }
  document.body.classList.remove('adm2-sin-scroll');
}

document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && _fp && !document.querySelector('#nf-firma-overlay.visible')) cerrarFormProducto();
});

function pintarFormProducto() {
  const el = _fpModal();
  const scrollPrevio = el.scrollTop;
  const f = _fp;
  const quitar  = f.opciones.map((o, i) => ({ ...o, i })).filter(o => !o.precio);
  const agregar = f.opciones.map((o, i) => ({ ...o, i })).filter(o => o.precio > 0);
  const margen  = f.precio && f.costo ? Math.round((f.precio - f.costo) / f.precio * 100) : null;

  el.innerHTML = `
    <div class="adm2-modal-card adm2-fp">
      <div class="adm2-panel-header">
        <span class="adm2-panel-header-title">${f.id ? 'Editar producto' : 'Nuevo producto'}</span>
        <button class="adm2-panel-close" onclick="cerrarFormProducto()">✕</button>
      </div>

      <div class="adm2-fp-grid">
        <!-- Foto -->
        <div class="adm2-fp-foto">
          <label class="adm2-fp-drop ${f.imagen ? 'con-foto' : ''}" for="fp-foto">
            ${f.imagen ? `<img src="${_esc(f.imagen)}" alt="">` : '<span>Tocá para poner<br>la foto</span>'}
          </label>
          <input id="fp-foto" type="file" accept="image/*" hidden onchange="fpFoto(this)">
          ${f.imagen ? '<button class="adm2-fp-quitar-foto" onclick="_fp.imagen=\'\';pintarFormProducto()">Quitar foto</button>' : ''}
        </div>

        <!-- Datos -->
        <div class="adm2-fp-datos">
          <label class="adm2-fp-campo grande">
            <span>Nombre</span>
            <input class="adm2-input" type="text" placeholder="Hamburguesa completa" value="${_esc(f.nombre)}" oninput="_fp.nombre=this.value" autofocus>
          </label>

          <div class="adm2-fp-fila">
            <label class="adm2-fp-campo"><span>Rubro</span>
              <select class="adm2-select" onchange="_fp.categoria=this.value">
                ${[['comida','Comida'],['bebida','Bebida'],['alquiler','Alquiler'],['otro','Otro']].map(([v,t]) => `<option value="${v}" ${f.categoria===v?'selected':''}>${t}</option>`).join('')}
              </select></label>
            <label class="adm2-fp-campo"><span>Se vende en</span>
              <select class="adm2-select" onchange="_fp.ambito=this.value">
                ${[['ambos','Cancha y mesa'],['mesa','Solo en la mesa'],['cancha','Solo en la cancha']].map(([v,t]) => `<option value="${v}" ${f.ambito===v?'selected':''}>${t}</option>`).join('')}
              </select></label>
            <label class="adm2-fp-campo"><span>Lo prepara</span>
              <select class="adm2-select" onchange="_fp.estacion=this.value">
                ${[['directo','Nadie, se entrega'],['cocina','La cocina'],['barra','La barra']].map(([v,t]) => `<option value="${v}" ${f.estacion===v?'selected':''}>${t}</option>`).join('')}
              </select></label>
          </div>

          <div class="adm2-fp-fila">
            <label class="adm2-fp-campo"><span>Precio de venta</span>
              <input class="adm2-input" type="number" inputmode="numeric" placeholder="8500" value="${_esc(f.precio)}" oninput="_fp.precio=parseFloat(this.value)||''"></label>
            <label class="adm2-fp-campo"><span>Costo (para el margen)</span>
              <input class="adm2-input" type="number" inputmode="numeric" placeholder="3400" value="${_esc(f.costo)}" oninput="_fp.costo=parseFloat(this.value)||''"></label>
            <div class="adm2-fp-campo"><span>Margen</span>
              <div class="adm2-fp-margen ${margen === null ? 'vacio' : margen < 30 ? 'bajo' : ''}">${margen === null ? '—' : margen + '%'}</div></div>
          </div>

          <div class="adm2-fp-fila">
            <label class="adm2-fp-campo check">
              <input type="checkbox" ${f.controlaStock ? 'checked' : ''} onchange="_fp.controlaStock=this.checked;pintarFormProducto()">
              <span>Controlar stock</span>
            </label>
            ${f.controlaStock ? `
              <label class="adm2-fp-campo"><span>Stock actual</span>
                <input class="adm2-input" type="number" inputmode="numeric" placeholder="20" value="${_esc(f.stock)}" oninput="_fp.stock=parseInt(this.value)||0"></label>
              <label class="adm2-fp-campo"><span>Avisar cuando queden</span>
                <input class="adm2-input" type="number" inputmode="numeric" placeholder="5" value="${_esc(f.stockMinimo)}" oninput="_fp.stockMinimo=parseInt(this.value)||0"></label>` : ''}
          </div>

          <label class="adm2-fp-campo grande">
            <span>Descripción</span>
            <textarea class="adm2-input" rows="2" maxlength="600" placeholder="Medallón de 180 g, cheddar, panceta, cebolla caramelizada, pan de papa." oninput="_fp.descripcion=this.value">${_esc(f.descripcion)}</textarea>
          </label>
        </div>
      </div>

      <!-- Ingredientes -->
      <div class="adm2-fp-ingr">
        <div class="adm2-fp-ingr-head">
          <span class="adm2-panel-label">Ingredientes que el cliente puede tocar</span>
          <span class="adm2-fp-ayuda">Lo que se quita va gratis. Lo que se agrega tiene precio.</span>
        </div>
        <div class="adm2-fp-ingr-cols">
          <div>
            <div class="adm2-fp-ingr-tit">Se puede quitar</div>
            ${quitar.map(o => `<div class="adm2-fp-ingr-row"><span>${_esc(o.nombre)}</span><button class="adm2-mini-btn peligro" onclick="fpQuitarOpcion(${o.i})">✕</button></div>`).join('') || '<div class="adm2-fp-ingr-vacio">—</div>'}
            <div class="adm2-fp-ingr-add">
              <input class="adm2-input" id="fp-quitar-nombre" type="text" placeholder="Sin cebolla" onkeydown="if(event.key==='Enter'){event.preventDefault();fpAgregarOpcion('quitar')}">
              <button class="adm2-btn-secundario" onclick="fpAgregarOpcion('quitar')">Agregar</button>
            </div>
          </div>
          <div>
            <div class="adm2-fp-ingr-tit">Se puede agregar (con precio)</div>
            ${agregar.map(o => `<div class="adm2-fp-ingr-row"><span>${_esc(o.nombre)}</span><b>+${_fArs(o.precio)}</b><button class="adm2-mini-btn peligro" onclick="fpQuitarOpcion(${o.i})">✕</button></div>`).join('') || '<div class="adm2-fp-ingr-vacio">—</div>'}
            <div class="adm2-fp-ingr-add">
              <input class="adm2-input" id="fp-agregar-nombre" type="text" placeholder="Queso extra" onkeydown="if(event.key==='Enter'){event.preventDefault();fpAgregarOpcion('agregar')}">
              <input class="adm2-input adm2-input-monto" id="fp-agregar-precio" type="number" inputmode="numeric" placeholder="1200" onkeydown="if(event.key==='Enter'){event.preventDefault();fpAgregarOpcion('agregar')}">
              <button class="adm2-btn-secundario" onclick="fpAgregarOpcion('agregar')">Agregar</button>
            </div>
          </div>
        </div>
      </div>

      <div class="adm2-panel-danger">
        ${f.id ? `<button class="adm2-btn-liberar" onclick="darDeBajaProducto(${f.id})">Dar de baja</button>` : '<span></span>'}
        <div class="adm2-fp-acciones">
          <button class="adm2-btn-cancel-danger" onclick="cerrarFormProducto()">Cancelar</button>
          <button class="adm2-btn-agendar" onclick="guardarProducto()">${f.id ? 'Guardar cambios' : 'Crear producto'}</button>
        </div>
      </div>
    </div>`;

  el.classList.add('visible');
  document.body.classList.add('adm2-sin-scroll');
  el.scrollTop = scrollPrevio;
}

/* La foto se achica en el navegador antes de guardarse: nadie necesita 4 MB para una hamburguesa */
function fpFoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const lector = new FileReader();
  lector.onload = () => {
    const img = new Image();
    img.onload = () => {
      const MAX = 640;
      const k = Math.min(1, MAX / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      _fp.imagen = c.toDataURL('image/jpeg', 0.82);
      pintarFormProducto();
    };
    img.src = lector.result;
  };
  lector.readAsDataURL(file);
}

function fpAgregarOpcion(tipo) {
  const nombre = (document.getElementById(tipo === 'quitar' ? 'fp-quitar-nombre' : 'fp-agregar-nombre')?.value || '').trim();
  if (!nombre) return;
  const precio = tipo === 'quitar' ? 0 : (parseFloat(document.getElementById('fp-agregar-precio')?.value) || 0);
  if (tipo === 'agregar' && precio <= 0) { toast('Poné el precio del agregado', 'rojo'); return; }
  if (_fp.opciones.some(o => o.nombre.toLowerCase() === nombre.toLowerCase())) { toast('Ese ingrediente ya está', 'rojo'); return; }
  _fp.opciones.push({ nombre, precio });
  pintarFormProducto();
  setTimeout(() => document.getElementById(tipo === 'quitar' ? 'fp-quitar-nombre' : 'fp-agregar-nombre')?.focus(), 30);
}

function fpQuitarOpcion(i) { _fp.opciones.splice(i, 1); pintarFormProducto(); }

async function guardarProducto() {
  const f = _fp;
  if (!f.nombre.trim()) { toast('Poné el nombre', 'rojo'); return; }
  if (!(f.precio > 0)) { toast('Poné el precio de venta', 'rojo'); return; }

  const datos = {
    nombre: f.nombre.trim(), categoria: f.categoria, ambito: f.ambito, estacion: f.estacion,
    precio: f.precio, costo: f.costo || 0,
    controlaStock: !!f.controlaStock, stock: f.controlaStock ? (f.stock || 0) : 0, stockMinimo: f.stockMinimo || 0,
    descripcion: f.descripcion.trim(), imagen: f.imagen, emoji: f.emoji || '',
    opciones: f.opciones
  };

  const firma = await pedirFirma('producto.editar', {
    titulo: f.id ? 'Guardar producto' : 'Crear producto',
    detalle: `${datos.nombre} · ${_fArs(datos.precio)}`
  });
  if (!firma) return;

  try {
    if (f.id) await api.editarProducto(f.id, datos, firma);
    else      await api.crearProducto(datos, firma);
    toast(f.id ? 'Producto guardado' : 'Producto creado', 'verde');
    cerrarFormProducto();
    await cargarCarta('cancha', true); await cargarCarta('mesa', true);
    renderBuffet();
  } catch (err) { toast(err.message || 'No se pudo guardar', 'rojo'); }
}

/* Reposición rápida desde la tarjeta: sigue siendo un número */
async function reponer(id) {
  const p = _productos.find(x => x.id === id);
  if (!p) return;
  const cant = parseInt(prompt(`¿Cuántas unidades de ${p.nombre} entraron?\n(stock actual: ${p.stock})`, '12') || '');
  if (!cant) return;

  const firma = await pedirFirma('producto.editar', { titulo: 'Reponer stock', detalle: `${p.nombre}: ${p.stock} → ${p.stock + cant}` });
  if (!firma) return;
  try {
    await api.reponerStock(id, { sumar: cant, motivo: 'reposición' }, firma);
    toast(`${p.nombre}: stock ${p.stock + cant}`, 'verde');
    renderBuffet();
  } catch (err) { toast(err.message || 'No se pudo reponer', 'rojo'); }
}

async function darDeBajaProducto(id) {
  const p = _productos.find(x => x.id === id);
  if (!p || !confirm(`¿Dar de baja ${p.nombre}?`)) return;
  const firma = await pedirFirma('producto.editar', { titulo: 'Dar de baja producto', detalle: p.nombre });
  if (!firma) return;
  try {
    await api.bajaProducto(id, firma);
    toast('Producto dado de baja', '');
    cerrarFormProducto();
    await cargarCarta('cancha', true); await cargarCarta('mesa', true);
    renderBuffet();
  } catch (err) { toast(err.message || 'No se pudo dar de baja', 'rojo'); }
}

/* ═══════════════════════════════════════════════════════════
   PERSONAL + AUDITORÍA
   ═══════════════════════════════════════════════════════════ */

const ROL_INFO = {
  dueno:    { nombre: 'Dueño',    desc: 'Todo: precios, personal, caja completa y auditoría' },
  jefe:     { nombre: 'Jefe',     desc: 'Carga y cobra, libera turnos, anula cobros y ve la caja' },
  empleado: { nombre: 'Empleado', desc: 'Carga turnos, cobra, carga consumiciones y marca faltas' },
};

async function renderPersonal() {
  const cont = document.getElementById('adm2-personal-cont');
  if (!cont) return;
  cont.innerHTML = `<div class="adm2-cargando">Cargando…</div>`;

  await cargarPersonal(true);
  let resumen = { personas: [] };
  try { resumen = await api.getAuditoriaResumen(_hoyKey(), _hoyKey()); } catch {}

  cont.innerHTML = `
    <div class="adm2-card">
      <div class="adm2-disp-header">
        <div class="adm2-card-title">Personal del club</div>
        <button class="adm2-btn-agendar" onclick="nuevaPersona()">+ Agregar persona</button>
      </div>
      <div class="adm2-personal-grid">
        ${_personal.map(u => {
          const act = resumen.personas.find(p => p.usuarioId === u.id) || {};
          return `
          <div class="adm2-persona-card ${u.activo ? '' : 'inactiva'}">
            <div class="adm2-persona-top">
              <span class="nf-firma-avatar" style="background:${_esc(u.color || '#64748b')}">${_esc((u.nombre || '?').charAt(0).toUpperCase())}</span>
              <div>
                <div class="adm2-persona-nombre">${_esc(u.nombre)}</div>
                <div class="adm2-persona-rol adm2-rol-${_esc(u.rol)}">${_esc(u.rolNombre || u.rol)}</div>
              </div>
            </div>
            <div class="adm2-persona-desc">${_esc(ROL_INFO[u.rol]?.desc || '')}</div>
            <div class="adm2-persona-hoy">
              Hoy: ${act.turnosCargados || 0} turno(s) · ${_fArsCorto(act.montoCobrado || 0)} cobrado(s) · ${act.consumiciones || 0} consumición(es)
            </div>
            <div class="adm2-persona-acciones">
              <button onclick="cambiarPin(${u.id})">Cambiar PIN</button>
              <button onclick="cambiarRol(${u.id})">Cambiar rol</button>
              ${u.activo ? `<button class="peligro" onclick="bajaPersona(${u.id})">Dar de baja</button>`
                         : `<button onclick="reactivarPersona(${u.id})">Reactivar</button>`}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="adm2-card">
      <div class="adm2-disp-header">
        <div class="adm2-card-title">Auditoría — quién hizo qué</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <select class="adm2-select" onchange="_audFiltro.usuarioId=this.value;renderAuditoria()">
            <option value="">Todo el personal</option>
            ${_personal.map(u => `<option value="${u.id}" ${_audFiltro.usuarioId == u.id ? 'selected' : ''}>${_esc(u.nombre)}</option>`).join('')}
          </select>
          <select class="adm2-select" onchange="_audFiltro.accion=this.value;renderAuditoria()">
            <option value="">Todas las acciones</option>
            <option value="reserva.crear">Turnos cargados</option>
            <option value="reserva.liberar">Turnos liberados</option>
            <option value="reserva.asistencia">Asistencias / faltas</option>
            <option value="cobro.registrar">Cobros</option>
            <option value="cobro.anular">Cobros anulados</option>
            <option value="consumicion.crear">Consumiciones</option>
            <option value="producto.editar">Buffet</option>
            <option value="caja.cerrar">Cierres de caja</option>
          </select>
        </div>
      </div>
      <div id="adm2-auditoria-lista"><div class="adm2-cargando">Cargando…</div></div>
    </div>`;

  renderAuditoria();
}

async function renderAuditoria() {
  const el = document.getElementById('adm2-auditoria-lista');
  if (!el) return;

  const d = new Date(); d.setDate(d.getDate() - 30);
  const params = { desde: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`, hasta: _hoyKey(), limit: 300 };
  if (_audFiltro.usuarioId) params.usuarioId = _audFiltro.usuarioId;
  if (_audFiltro.accion)    params.accion    = _audFiltro.accion;

  let registros = [];
  try { registros = await api.getAuditoria(params); }
  catch (err) { el.innerHTML = `<div class="adm2-vacio">No se pudo cargar: ${_esc(err.message)}</div>`; return; }

  if (!registros.length) { el.innerHTML = '<div class="adm2-vacio">Sin movimientos en los últimos 30 días.</div>'; return; }

  const ICONO = {
    'reserva.crear': '📅', 'reserva.liberar': '🗑️', 'reserva.editar': '✏️', 'reserva.asistencia': '✅',
    'cobro.registrar': '💰', 'cobro.anular': '↩️', 'consumicion.crear': '🥤', 'consumicion.anular': '↩️',
    'producto.editar': '📦', 'caja.cerrar': '🔒', 'usuario.editar': '👤', 'espacio.editar': '🎾'
  };

  el.innerHTML = `<div class="adm2-aud-lista">${registros.map(r => {
    const cuando = new Date(r.createdAt);
    const hora = `${String(cuando.getHours()).padStart(2,'0')}:${String(cuando.getMinutes()).padStart(2,'0')}`;
    return `
      <div class="adm2-aud-row">
        <span class="adm2-aud-icono">${ICONO[r.accion] || '•'}</span>
        <span class="adm2-aud-fecha">${r.fecha} ${hora}</span>
        <span class="adm2-aud-quien">${_esc(r.usuarioNombre)}</span>
        <span class="adm2-aud-que">${_esc(r.descripcion)}</span>
        ${r.monto ? `<span class="adm2-aud-monto ${r.monto < 0 ? 'neg' : ''}">${_fArs(r.monto)}</span>` : '<span></span>'}
      </div>`;
  }).join('')}</div>`;
}

async function nuevaPersona() {
  const nombre = prompt('Nombre de la persona:');
  if (!nombre) return;
  const rol = (prompt('Rol: dueno, jefe o empleado', 'empleado') || '').trim().toLowerCase();
  if (!ROL_INFO[rol]) { toast('Rol inválido. Usá dueno, jefe o empleado.', 'rojo'); return; }
  const pin = prompt(`PIN de ${nombre} (4 a 8 números):`);
  if (!pin || !/^\d{4,8}$/.test(pin)) { toast('El PIN tiene que ser de 4 a 8 números', 'rojo'); return; }

  const firma = await pedirFirma('usuario.editar', { titulo: 'Dar de alta personal', detalle: `${nombre} como ${ROL_INFO[rol].nombre}` });
  if (!firma) return;
  try {
    await api.crearUsuario({ nombre, rol, pin }, firma);
    toast(`${nombre} dado de alta`, 'verde');
    renderPersonal();
  } catch (err) { toast(err.message || 'No se pudo crear', 'rojo'); }
}

async function cambiarPin(id) {
  const u = _personal.find(x => x.id === id);
  if (!u) return;
  const nuevoPin = prompt(`Nuevo PIN de ${u.nombre} (4 a 8 números):`);
  if (!nuevoPin || !/^\d{4,8}$/.test(nuevoPin)) { toast('El PIN tiene que ser de 4 a 8 números', 'rojo'); return; }

  const firma = await pedirFirma('usuario.editar', { titulo: 'Cambiar PIN', detalle: u.nombre });
  if (!firma) return;
  try {
    await api.editarUsuario(id, { nuevoPin }, firma);
    toast('PIN actualizado', 'verde');
    renderPersonal();
  } catch (err) { toast(err.message || 'No se pudo cambiar', 'rojo'); }
}

async function cambiarRol(id) {
  const u = _personal.find(x => x.id === id);
  if (!u) return;
  const rol = (prompt(`Rol de ${u.nombre}: dueno, jefe o empleado`, u.rol) || '').trim().toLowerCase();
  if (!ROL_INFO[rol] || rol === u.rol) return;

  const firma = await pedirFirma('usuario.editar', { titulo: 'Cambiar rol', detalle: `${u.nombre}: ${u.rolNombre} → ${ROL_INFO[rol].nombre}` });
  if (!firma) return;
  try {
    await api.editarUsuario(id, { rol }, firma);
    toast('Rol actualizado', 'verde');
    renderPersonal();
  } catch (err) { toast(err.message || 'No se pudo cambiar', 'rojo'); }
}

async function bajaPersona(id) {
  const u = _personal.find(x => x.id === id);
  if (!u || !confirm(`¿Dar de baja a ${u.nombre}? No va a poder firmar más operaciones.`)) return;
  const firma = await pedirFirma('usuario.editar', { titulo: 'Dar de baja', detalle: u.nombre });
  if (!firma) return;
  try {
    await api.bajaUsuario(id, firma);
    toast(`${u.nombre} dado de baja`, '');
    renderPersonal();
  } catch (err) { toast(err.message || 'No se pudo dar de baja', 'rojo'); }
}

async function reactivarPersona(id) {
  const u = _personal.find(x => x.id === id);
  if (!u) return;
  const firma = await pedirFirma('usuario.editar', { titulo: 'Reactivar', detalle: u.nombre });
  if (!firma) return;
  try {
    await api.editarUsuario(id, { activo: true }, firma);
    toast(`${u.nombre} reactivado`, 'verde');
    renderPersonal();
  } catch (err) { toast(err.message || 'No se pudo reactivar', 'rojo'); }
}

/* ═══════════════════════════════════════════════════════════
   FINANZAS — consumiciones y deuda

   Dos preguntas del dueño que antes no tenían respuesta en el
   sistema: qué se vendió exactamente, y cuánta plata quedó en la
   calle. Van dentro de Finanzas, con el mes que ya está elegido.
   ═══════════════════════════════════════════════════════════ */

function _rangoDelMes(year, mes0) {
  const dias  = new Date(year, mes0 + 1, 0).getDate();
  const mm    = String(mes0 + 1).padStart(2, '0');
  return { desde: `${year}-${mm}-01`, hasta: `${year}-${mm}-${String(dias).padStart(2, '0')}` };
}

async function renderFinConsumo(year, mes0) {
  const el = document.getElementById('fin-consumo');
  if (!el) return;
  const { desde, hasta } = _rangoDelMes(year, mes0);

  el.innerHTML = '<div class="adm2-cargando">Cargando consumiciones…</div>';
  let v;
  try { v = await api.getVentasBuffet(desde, hasta); }
  catch (err) { el.innerHTML = `<div class="adm2-vacio">No se pudo cargar: ${_esc(err.message)}</div>`; return; }

  if (!v.porProducto.length) {
    el.innerHTML = `<div class="adm2-card"><div class="adm2-card-title">Consumiciones</div>
      <div class="adm2-vacio">No se vendió nada este mes.</div></div>`;
    return;
  }

  const max = Math.max(...v.porProducto.map(p => p.total));

  el.innerHTML = `
    <div class="adm2-card">
      <div class="adm2-disp-header">
        <div class="adm2-card-title">Consumiciones del mes</div>
        <div class="adm2-fin-resumen">
          <span><b>${_fArs(v.total)}</b> vendido</span>
          <span>${v.unidades} unidades</span>
          ${v.costo > 0 ? `<span class="ok"><b>${_fArs(v.ganancia)}</b> de ganancia · ${v.margen}%</span>` : ''}
          ${v.anulado > 0 ? `<span class="alerta">${_fArs(v.anulado)} anulado (${v.anuladasCantidad})</span>` : ''}
        </div>
      </div>

      <table class="adm2-tabla-consumo">
        <thead>
          <tr>
            <th>Producto</th><th class="num">Unidades</th><th class="num">Vendido</th>
            ${v.costo > 0 ? '<th class="num">Costo</th><th class="num">Ganancia</th>' : ''}
            <th class="num">Stock</th>
          </tr>
        </thead>
        <tbody>
          ${v.porProducto.map(p => `
            <tr>
              <td>
                <div class="adm2-tabla-prod">${_esc(p.nombre)}</div>
                <div class="adm2-tabla-barra"><span style="width:${Math.round(p.total / max * 100)}%"></span></div>
              </td>
              <td class="num fuerte">${p.unidades}</td>
              <td class="num">${_fArs(p.total)}</td>
              ${v.costo > 0 ? `<td class="num tenue">${_fArs(p.costo)}</td><td class="num ok">${_fArs(p.ganancia)}</td>` : ''}
              <td class="num ${p.stock !== null && p.stock <= 0 ? 'mal' : ''}">${p.stock === null ? '—' : p.stock}</td>
            </tr>`).join('')}
        </tbody>
      </table>

      <div class="adm2-fin-cols">
        <div>
          <div class="adm2-panel-label">Por rubro</div>
          ${v.porCategoria.map(c => `
            <div class="adm2-caja-persona">
              <span class="adm2-caja-persona-nombre">${_esc(c.nombre)}</span>
              <span class="adm2-caja-persona-detalle">${c.unidades} u.</span>
              <span class="adm2-caja-persona-total">${_fArs(c.total)}</span>
            </div>`).join('')}
        </div>
        <div>
          <div class="adm2-panel-label">Quién cargó</div>
          ${v.porUsuario.map(u => `
            <div class="adm2-caja-persona">
              <span class="adm2-caja-persona-nombre">${_esc(u.nombre)}</span>
              <span class="adm2-caja-persona-detalle">${u.lineas} cargas${u.anuladas ? ` · ${u.anuladas} anuladas` : ''}</span>
              <span class="adm2-caja-persona-total ${u.anuladas ? 'alerta' : ''}">${_fArs(u.total)}</span>
            </div>`).join('')}
        </div>
      </div>

      ${(v.sinStock.length || v.stockBajo.length) ? `
        <div class="adm2-fin-alerta">
          ${v.sinStock.length ? `<b>Sin stock:</b> ${v.sinStock.map(p => _esc(p.nombre)).join(', ')}. ` : ''}
          ${v.stockBajo.length ? `<b>Queda poco:</b> ${v.stockBajo.map(p => `${_esc(p.nombre)} (${p.stock})`).join(', ')}.` : ''}
        </div>` : ''}
    </div>`;
}

async function renderFinSinCobrar(year, mes0) {
  const el = document.getElementById('fin-sincobrar');
  if (!el) return;
  const { desde, hasta } = _rangoDelMes(year, mes0);

  el.innerHTML = '<div class="adm2-cargando">Cargando deuda…</div>';
  let d;
  try { d = await api.getSinCobrar(desde, hasta); }
  catch (err) { el.innerHTML = `<div class="adm2-vacio">No se pudo cargar: ${_esc(err.message)}</div>`; return; }

  if (d.totalSinCobrar === 0) {
    el.innerHTML = `<div class="adm2-card"><div class="adm2-card-title">Sin cobrar</div>
      <div class="adm2-vacio">Está todo cobrado este mes.</div></div>`;
    return;
  }

  const fila = t => `
    <tr>
      <td class="tenue">${t.fecha.slice(8)}/${t.fecha.slice(5, 7)} ${t.hora}</td>
      <td>${_esc(t.cliente)}${t.telefono ? `<span class="tenue"> · ${_esc(t.telefono)}</span>` : ''}</td>
      <td class="tenue">${_esc(t.cancha)}</td>
      <td><span class="adm2-tl-origen-chip" style="color:${t.origenColor};border-color:${t.origenColor}55">${_esc(t.origen)}</span></td>
      <td class="num tenue">${t.totalConsumo > 0 ? _fArs(t.totalConsumo) : '—'}</td>
      <td class="num fuerte mal">${_fArs(t.saldo)}</td>
    </tr>`;

  el.innerHTML = `
    <div class="adm2-card">
      <div class="adm2-disp-header">
        <div class="adm2-card-title">Sin cobrar este mes</div>
        <div class="adm2-fin-resumen">
          <span class="alerta"><b>${_fArs(d.totalSinCobrar)}</b> en la calle</span>
          <span>${d.cantidadFaltas} faltas · ${_fArs(d.perdidoEnFaltas)}</span>
          <span>${d.cantidadSinCobrar} jugados sin cobrar</span>
        </div>
      </div>

      ${d.faltas.length ? `
        <div class="adm2-panel-label">No vinieron y no se cobró</div>
        <table class="adm2-tabla-consumo"><tbody>${d.faltas.map(fila).join('')}</tbody></table>` : ''}

      ${d.jugadosSinCobrar.length ? `
        <div class="adm2-panel-label" style="margin-top:16px">Jugaron y quedó saldo</div>
        <table class="adm2-tabla-consumo"><tbody>${d.jugadosSinCobrar.map(fila).join('')}</tbody></table>` : ''}

      ${d.porCliente.length > 1 ? `
        <div class="adm2-panel-label" style="margin-top:16px">Quiénes deben</div>
        ${d.porCliente.slice(0, 10).map(c => `
          <div class="adm2-caja-persona">
            <span class="adm2-caja-persona-nombre">${_esc(c.cliente)}</span>
            <span class="adm2-caja-persona-detalle">${c.turnos} turno${c.turnos !== 1 ? 's' : ''}${c.faltas ? ` · ${c.faltas} falta${c.faltas !== 1 ? 's' : ''}` : ''}</span>
            <span class="adm2-caja-persona-total alerta">${_fArs(c.deuda)}</span>
          </div>`).join('')}` : ''}
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   SALÓN — mesas con cuenta abierta

   Misma lógica que un turno de cancha: una cuenta que acumula
   consumo y recibe pagos, con los mismos PIN y la misma auditoría.
   Tocás la mesa, cargás el pedido, ves el total, cobrás y cerrás.
   ═══════════════════════════════════════════════════════════ */

let _mesas       = [];
let _mesaAbierta = null;   /* cuenta que se está mirando */
/*
  Cobro dividido: se anotan las filas ("Salva 7000 efectivo", "Nacho 7000
  transferencia") y se toca Cobrar UNA vez, con UN PIN. La última fila sin
  monto significa "lo que falte".
*/
let _cobroMesa   = { cuentaId: null, filas: [{ pagador: '', monto: '', metodo: 'efectivo' }] };
function _filaNueva() { return { pagador: '', monto: '', metodo: 'efectivo' }; }
let _firmaMesa   = null;   /* { cuentaId, firma, desde } — un PIN por mesa */

const FIRMA_MESA_MS = 5 * 60 * 1000;

function firmaMesaVigente(cuentaId) {
  return _firmaMesa && _firmaMesa.cuentaId === cuentaId && Date.now() - _firmaMesa.desde < FIRMA_MESA_MS
    ? _firmaMesa.firma : null;
}

function _hace(min) {
  if (min < 1)  return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return `hace ${h}h${m ? ' ' + m + 'm' : ''}`;
}

let _salonTimer = null;

async function renderSalon(silencioso) {
  const cont = document.getElementById('adm2-salon-cont');
  if (!cont) return;
  if (!silencioso) cont.innerHTML = '<div class="adm2-cargando">Cargando salón…</div>';

  /* Cada 8 s, solo con el salón a la vista y sin una mesa abierta: así el mozo ve
     aparecer "Comida lista" en el mapa sin tocar nada. */
  if (!_salonTimer) _salonTimer = setInterval(() => {
    const v = document.getElementById('adm2-view-salon');
    if (v && v.classList.contains('active') && !document.hidden && !_mesaAbierta) renderSalon(true);
  }, 8000);

  await cargarCarta('mesa');
  let hist = { cuentas: [], facturado: 0, cobrado: 0, cerradasSinCobrar: [] };
  try {
    _mesas = await api.getMesas();
    hist   = await api.getHistorialMesas(_hoyKey(), _hoyKey());
  } catch (err) {
    cont.innerHTML = `<div class="adm2-vacio">No se pudo cargar: ${_esc(err.message)}</div>`;
    return;
  }

  const ocupadas = _mesas.filter(m => m.ocupada);
  const enMesas   = ocupadas.reduce((s, m) => s + m.cuenta.saldo, 0);
  const servidoEnMesas = ocupadas.reduce((s, m) => s + m.cuenta.total, 0);

  const zonas = {};
  _mesas.forEach(m => { (zonas[m.zona] = zonas[m.zona] || []).push(m); });

  cont.innerHTML = `
    <div class="adm2-stats-row">
      <div class="adm2-card adm2-stat-card">
        <div class="adm2-stat-label">Mesas ocupadas</div>
        <div class="adm2-stat-value">${ocupadas.length}<span class="adm2-stat-de">/${_mesas.length}</span></div>
        <div class="adm2-stat-sub">${_mesas.length - ocupadas.length} libres</div>
      </div>
      <div class="adm2-card adm2-stat-card">
        <div class="adm2-stat-label">Abierto en mesas</div>
        <div class="adm2-stat-value">${_fArs(servidoEnMesas)}</div>
        <div class="adm2-stat-sub">${enMesas > 0 ? _fArs(enMesas) + ' todavía sin cobrar' : 'todo cobrado'}</div>
      </div>
      <div class="adm2-card adm2-stat-card">
        <div class="adm2-stat-label">Facturado hoy</div>
        <div class="adm2-stat-value">${_fArs(hist.facturado)}</div>
        <div class="adm2-stat-sub">${_fArs(hist.cobrado)} cobrado</div>
      </div>
      <div class="adm2-card adm2-stat-card ${hist.cerradasSinCobrar.length ? 'adm2-stat-alerta' : ''}">
        <div class="adm2-stat-label">Cerradas sin cobrar</div>
        <div class="adm2-stat-value">${hist.cerradasSinCobrar.length}</div>
        <div class="adm2-stat-sub">${hist.cerradasSinCobrar.length ? _fArs(hist.cerradasSinCobrar.reduce((s, c) => s + c.saldo, 0)) + ' perdidos' : 'ninguna'}</div>
      </div>
    </div>

    ${Object.entries(zonas).map(([zona, lista]) => `
      <div class="adm2-card">
        <div class="adm2-card-title">${_esc(zona)}</div>
        <div class="adm2-mesas-grid">
          ${lista.map(m => buildMesaCard(m)).join('')}
        </div>
      </div>`).join('')}

    ${hist.cerradasSinCobrar.length ? `
      <div class="adm2-card adm2-card-faltas">
        <div class="adm2-card-title">Mesas que se cerraron con saldo</div>
        ${hist.cerradasSinCobrar.map(c => `
          <div class="adm2-falta-row">
            <span>${_esc(c.mesa)}</span>
            <span class="adm2-falta-cliente">la cerró ${_esc(c.cerradaPor || '—')}</span>
            <span class="adm2-falta-origen">${_esc(c.nota || 'sin motivo')}</span>
            <span class="adm2-falta-monto">${_fArs(c.saldo)}</span>
          </div>`).join('')}
      </div>` : ''}`;

  if (_mesaAbierta) abrirMesaPanel(_mesaAbierta.mesaId, true);
}

/* La ventana de mesa se cierra con Escape, igual que la del turno */
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape') return;
  if (document.querySelector('#nf-firma-overlay.visible')) return;
  if (document.querySelector('#adm2-modal-mesa.visible')) cerrarMesaPanel();
});

function buildMesaCard(m) {
  const c = m.cuenta;
  return `
    <button class="adm2-mesa ${m.ocupada ? 'ocupada' : 'libre'} ${c && c.comidaLista ? 'comida-lista' : ''} ${_mesaAbierta && _mesaAbierta.mesaId === m.id ? 'sel' : ''}"
            onclick="abrirMesaPanel(${m.id})">
      <span class="adm2-mesa-nombre">${_esc(m.nombre)}</span>
      ${m.ocupada
        ? `<span class="adm2-mesa-total">${_fArs(c.total)}</span>
           <span class="adm2-mesa-sub">${c.items} ítem${c.items !== 1 ? 's' : ''} · ${_hace(c.minutosAbierta)}</span>
           ${c.comidaLista ? `<span class="adm2-mesa-aviso lista">Comida lista</span>`
             : c.enCocina ? `<span class="adm2-mesa-aviso cocina">En cocina</span>` : ''}
           ${c.saldo > 0
             ? `<span class="adm2-mesa-saldo">Falta ${_fArs(c.saldo)}</span>`
             : `<span class="adm2-mesa-saldo pagada">Pagada · lista para cerrar</span>`}
           <span class="adm2-mesa-mozo">${_esc(c.abiertaPor)}</span>`
        : `<span class="adm2-mesa-libre">Libre</span>
           <span class="adm2-mesa-sub">${m.capacidad} lugares</span>`}
    </button>`;
}

async function abrirMesaPanel(mesaId, soloRefrescar) {
  const mesa = _mesas.find(m => m.id === mesaId);
  if (!mesa) return;

  /* Tocar de nuevo la misma mesa la cierra */
  if (!soloRefrescar && _mesaAbierta && _mesaAbierta.mesaId === mesaId) {
    _mesaAbierta = null;
    renderSalon();
    return;
  }

  if (!mesa.ocupada) {
    const firma = await pedirFirma('reserva.crear', { titulo: 'Abrir mesa', detalle: mesa.nombre });
    if (!firma) return;
    try {
      const cuenta = await api.abrirMesa(mesaId, {}, firma);
      _firmaMesa = { cuentaId: cuenta.id, firma, desde: Date.now() };
      _mesaAbierta = { mesaId, cuentaId: cuenta.id };
      toast(`${mesa.nombre} abierta`, 'verde');
      await renderSalon();
    } catch (err) { toast(err.message || 'No se pudo abrir', 'rojo'); }
    return;
  }

  _mesaAbierta = { mesaId, cuentaId: mesa.cuenta.id };
  if (_cobroMesa.cuentaId !== mesa.cuenta.id) _cobroMesa = { cuentaId: mesa.cuenta.id, filas: [_filaNueva()] };

  let cuenta;
  try { cuenta = await api.getCuenta(mesa.cuenta.id); }
  catch (err) { toast(err.message || 'No se pudo abrir la cuenta', 'rojo'); return; }

  _mesaAbierta.cuenta = cuenta;
  pintarMesaPanel(mesa, cuenta);
}

/*
  Repintado local: tocar un producto o cambiar de rubro no necesita ir al
  servidor. Se usa la cuenta ya cargada y el scroll de la ventana se conserva.
  Ir al servidor en cada toque era lo que hacía saltar la pantalla arriba.
*/
function repintarMesaLocal() {
  if (!_mesaAbierta || !_mesaAbierta.cuenta) return;
  const mesa = _mesas.find(m => m.id === _mesaAbierta.mesaId);
  if (mesa) pintarMesaPanel(mesa, _mesaAbierta.cuenta);
}

function _modalMesaEl() {
  let el = document.getElementById('adm2-modal-mesa');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'adm2-modal-mesa';
  el.className = 'adm2-modal-overlay';
  el.addEventListener('click', ev => { if (ev.target === el) cerrarMesaPanel(); });
  document.body.appendChild(el);
  return el;
}

function pintarMesaPanel(mesa, cuenta) {
  const el = _modalMesaEl();
  const scrollPrevio = el.scrollTop;

  const saldo = cuenta.saldo;

  /* La carta de la mesa no muestra paletas ni pelotas: eso es de la cancha */
  abrirCarta({
    clave: 'mesa:' + cuenta.cuentaId,
    donde: 'mesa',
    repintar: () => repintarMesaLocal(),
    firmaVigente: () => firmaMesaVigente(cuenta.cuentaId),
    guardarFirma: f => { _firmaMesa = { cuentaId: cuenta.cuentaId, firma: f, desde: Date.now() }; },
    olvidarFirma: () => { _firmaMesa = null; },
    enviar: (items, firma) => api.cargarEnMesa(cuenta.cuentaId, items, firma),
    /* La respuesta ya trae la cuenta nueva: se repinta en el lugar y el mapa se actualiza de fondo */
    refrescar: (res) => { if (res && res.cuenta && _mesaAbierta) { _mesaAbierta.cuenta = { ..._mesaAbierta.cuenta, ...res.cuenta }; repintarMesaLocal(); } _refrescarSalonFondo(); }
  });

  /* Se agrupan las líneas repetidas: tres toques a Pizza son "3 pizzas" */
  const agrupado = {};
  cuenta.consumiciones.forEach(c => {
    const k = c.productoId || c.nombre;
    const clave = k + '|' + (c.detalle || '') + '|' + (c.nota || '');
    if (!agrupado[clave]) agrupado[clave] = {
      nombre: c.nombre, detalle: c.detalle || '', nota: c.nota || '',
      cantidad: 0, total: 0, ids: [], quien: c.usuarioNombre,
      deCocina: !!c.comandaId, estadoCocina: c.estadoCocina || 'pendiente'
    };
    agrupado[clave].cantidad += c.cantidad;
    agrupado[clave].total    += c.total;
    agrupado[clave].ids.push(c.id);
  });
  const lineas = Object.values(agrupado);

  el.innerHTML = `
    <div class="adm2-modal-card adm2-mesa-panel">
      <div class="adm2-panel-header">
        <span class="adm2-panel-header-title">${_esc(mesa.nombre)}</span>
        <button class="adm2-panel-close" onclick="cerrarMesaPanel()">✕</button>
      </div>
      <div class="adm2-panel-info-row">
        Abierta por ${_esc(cuenta.abiertaPor)} · ${_hace(Math.round((Date.now() - new Date(cuenta.abiertaEn).getTime()) / 60000))}
        ${cuenta.comensales ? ` · ${cuenta.comensales} personas` : ''}
      </div>

      <div class="adm2-mesa-cols">
        <div>
          ${cartaHTML()}
        </div>

        <div>
          <div class="adm2-panel-label">Pedido de ${_esc(mesa.nombre)}</div>
          ${lineas.length === 0
            ? '<div class="adm2-vacio">Todavía no pidieron nada.</div>'
            : `<div class="adm2-mesa-pedido">
                 ${lineas.map(l => `
                   <div class="adm2-consumo-row">
                     <span>
                       ${l.cantidad} ${_esc(nombreConsumo(l.nombre, l.cantidad))}
                       ${l.detalle ? `<i class="adm2-consumo-detalle">${_esc(l.detalle)}</i>` : ''}
                       ${l.nota ? `<i class="adm2-consumo-detalle">“${_esc(l.nota)}”</i>` : ''}
                     </span>
                     <span class="adm2-consumo-estado ${l.deCocina ? (l.estadoCocina === 'listo' ? 'listo' : 'cocina') : 'mozo'}">
                       ${l.deCocina ? (l.estadoCocina === 'listo' ? 'listo para servir' : 'en cocina') : 'lo lleva el mozo'}
                     </span>
                     <span class="adm2-consumo-quien">${_esc(l.quien || '')}</span>
                     <span class="adm2-consumo-monto">${_fArs(l.total)}</span>
                     <button class="adm2-mini-btn peligro" title="Quitar uno"
                             onclick="quitarDeMesa(${l.ids[l.ids.length - 1]},${cuenta.cuentaId})">✕</button>
                   </div>`).join('')}
               </div>`}

          <div class="adm2-cuenta" style="margin-top:12px">
            <div class="adm2-cuenta-linea total"><span>Total de la mesa</span><span>${_fArs(cuenta.totalConsumo)}</span></div>
            ${cuenta.totalPagado > 0 ? `<div class="adm2-cuenta-linea pagado"><span>Pagado</span><span>− ${_fArs(cuenta.totalPagado)}</span></div>` : ''}
            <div class="adm2-cuenta-linea saldo ${saldo <= 0 ? 'ok' : ''}">
              <span>${saldo <= 0 ? 'Saldado' : 'Falta cobrar'}</span><span>${_fArs(Math.max(saldo, 0))}</span>
            </div>
          </div>

          ${cuenta.pagos.length ? `
            <div class="adm2-pagos-lista">
              <div class="adm2-panel-label">Ya pagaron</div>
              ${cuenta.pagos.map(p => `
                <div class="adm2-pago-row">
                  <span class="adm2-pago-pagador">${_esc(p.pagador)}</span>
                  <span class="adm2-pago-metodo" style="color:${metodoInfo(p.metodo).color}">${metodoInfo(p.metodo).nombre}</span>
                  <span class="adm2-pago-cobrador">cobró ${_esc(p.usuarioNombre)}</span>
                  <span class="adm2-pago-monto">${_fArs(p.monto)}</span>
                </div>`).join('')}
            </div>` : ''}

          ${saldo > 0 ? cobroFilasHTML(saldo, 'mesa', cuenta.cuentaId) : `<div class="adm2-cobro-ok">Mesa saldada. Ya se puede cerrar.</div>`}
        </div>
      </div>

      <div class="adm2-panel-danger">
        <button class="adm2-btn-liberar" onclick="cerrarMesa(${cuenta.cuentaId},'${_esc(mesa.nombre)}',${saldo})">
          ${saldo > 0 ? 'Cerrar sin cobrar' : 'Cerrar mesa'}
        </button>
        <button class="adm2-btn-cancel-danger" onclick="cerrarMesaPanel()">Seguir después</button>
      </div>
    </div>`;

  el.classList.add('visible');
  document.body.classList.add('adm2-sin-scroll');
  /* La ventana se reescribió: volver exactamente a donde estaba mirando */
  el.scrollTop = scrollPrevio;
}

/* ─── Cobro dividido: filas [quién][cuánto][cómo] + un solo Cobrar ─── */
function _estadoCobro(ctx) { return ctx === 'mesa' ? _cobroMesa : _cobro; }

function cobroFilasHTML(saldo, ctx, id) {
  const st = _estadoCobro(ctx);
  const filas = st.filas;
  const anotado = filas.reduce((s, f) => s + (parseFloat(f.monto) || 0), 0);
  const resto = Math.round((saldo - anotado) * 100) / 100;
  const ultimaVacia = filas.length && filas[filas.length - 1].monto === '';
  const cubre = anotado >= saldo - 0.009 || ultimaVacia;
  const rep = `repintarCobro('${ctx}')`;

  return `
    <div class="adm2-cobro">
      <div class="adm2-panel-label">Quién paga y cuánto</div>
      <div class="adm2-cobro-filas">
        ${filas.map((f, i) => `
          <div class="adm2-cobro-fila">
            <input class="adm2-input" type="text" placeholder="¿Quién?" value="${_esc(f.pagador)}" autocomplete="off"
                   oninput="_estadoCobro('${ctx}').filas[${i}].pagador=this.value">
            <input class="adm2-input adm2-input-monto" type="number" inputmode="numeric" placeholder="${i === filas.length - 1 ? 'resto' : '0'}"
                   value="${_esc(f.monto)}" oninput="_estadoCobro('${ctx}').filas[${i}].monto=this.value;cobroActualizarTotal('${ctx}',${saldo})">
            <div class="adm2-cobro-metodos">
              ${['efectivo','transferencia','mercadopago','tarjeta'].map(m =>
                `<button class="adm2-cobro-met ${f.metodo === m ? 'on' : ''}" title="${metodoInfo(m).nombre}"
                         onclick="_estadoCobro('${ctx}').filas[${i}].metodo='${m}';${rep}">${metodoInfo(m).nombre.slice(0, 5)}</button>`).join('')}
            </div>
            ${filas.length > 1 ? `<button class="adm2-mini-btn peligro" onclick="_estadoCobro('${ctx}').filas.splice(${i},1);${rep}">✕</button>` : '<span style="width:24px"></span>'}
          </div>`).join('')}
      </div>
      <div class="adm2-cobro-pie">
        <button class="adm2-btn-secundario" onclick="_estadoCobro('${ctx}').filas.push(_filaNueva());${rep}">+ otra persona</button>
        <span class="adm2-cobro-total" id="cobro-total-${ctx}">${cobroTotalTexto(ctx, saldo)}</span>
      </div>
      <button class="adm2-btn-agendar adm2-cobro-btn" id="cobro-btn-${ctx}" onclick="${ctx === 'mesa' ? `cobrarMesa(${id})` : `confirmarCobro('${_esc(String(id))}')`}">
        Cobrar
      </button>
      <div class="adm2-cobro-tip">La última fila sin monto cobra lo que falte. Un solo PIN para todos.</div>
    </div>`;
}

function cobroTotalTexto(ctx, saldo) {
  const filas = _estadoCobro(ctx).filas;
  const anotado = filas.reduce((s, f) => s + (parseFloat(f.monto) || 0), 0);
  const ultimaVacia = filas.length && filas[filas.length - 1].monto === '';
  const resto = Math.round((saldo - anotado) * 100) / 100;
  if (ultimaVacia) return `${_fArs(anotado)} anotado · la última paga ${_fArs(Math.max(resto, 0))}`;
  if (resto > 0.009) return `${_fArs(anotado)} de ${_fArs(saldo)} · faltan ${_fArs(resto)}`;
  if (resto < -0.009) return `${_fArs(anotado)} · vuelto ${_fArs(-resto)}`;
  return `${_fArs(anotado)} · justo`;
}

/* Al escribir un monto solo cambia el texto del total: no se repinta el formulario (perdería el foco) */
function cobroActualizarTotal(ctx, saldo) {
  const el = document.getElementById('cobro-total-' + ctx);
  if (el) el.textContent = cobroTotalTexto(ctx, saldo);
}

function repintarCobro(ctx) {
  if (ctx === 'mesa') repintarMesaLocal();
  else if (activePanelInfo) repintarPanel(activePanelInfo.reservaId);
}

/* Lo que se manda: filas con nombre o monto; la última vacía = el resto */
function _filasParaEnviar(ctx) {
  const filas = _estadoCobro(ctx).filas;
  return filas
    .filter((f, i) => f.monto !== '' || f.pagador.trim() || i === filas.length - 1)
    .map(f => ({ pagador: f.pagador.trim(), monto: f.monto === '' ? '' : parseFloat(f.monto), metodo: f.metodo }));
}

function cerrarMesaPanel() {
  _mesaAbierta = null;
  _firmaMesa = null;
  const el = document.getElementById('adm2-modal-mesa');
  if (el) { el.classList.remove('visible'); el.innerHTML = ''; }
  document.body.classList.remove('adm2-sin-scroll');
  renderSalon();
}

async function quitarDeMesa(consumicionId, cuentaId) {
  const firma = await pedirFirma('consumicion.anular', { titulo: 'Quitar del pedido' });
  if (!firma) return;
  try {
    await api.anularConsumicion(consumicionId, firma);
    toast('Quitado del pedido', '');
    await cargarCarta('mesa', true);
    await renderSalon();
  } catch (err) { toast(err.message || 'No se pudo quitar', 'rojo'); }
}

async function cobrarMesa(cuentaId) {
  const cuenta = _mesaAbierta && _mesaAbierta.cuenta;
  if (!cuenta) return;
  const saldo = cuenta.saldo;
  const pagos = _filasParaEnviar('mesa');
  if (!pagos.length) { toast('Anotá al menos un pago', 'rojo'); return; }
  const conMonto = pagos.filter(p => p.monto !== '');
  if (conMonto.some(p => !(p.monto > 0))) { toast('Hay un monto que no es válido', 'rojo'); return; }

  const detalle = pagos.map(p => `${p.pagador || 'Mesa'} ${p.monto === '' ? 'el resto' : _fArs(p.monto)} ${metodoInfo(p.metodo).nombre}`).join(' · ');
  const firma = await pedirFirma('cobro.registrar', { titulo: 'Cobrar mesa', detalle });
  if (!firma) return;

  const btn = document.getElementById('cobro-btn-mesa'); if (btn) { btn.disabled = true; btn.textContent = 'Cobrando…'; }
  try {
    const res = await api.cobrarVariosEnMesa(cuentaId, pagos, firma);
    /* Se repinta con la cuenta que volvió: nada de recargar el salón entero */
    _cobroMesa = { cuentaId, filas: [_filaNueva()] };
    _mesaAbierta.cuenta = { ..._mesaAbierta.cuenta, ...res.cuenta };
    repintarMesaLocal();
    toast(res.vuelto > 0 ? `Cobrado. Vuelto ${_fArs(res.vuelto)}` : `Cobrado ${_fArs(res.pagos.reduce((s, p) => s + p.monto, 0))}`, 'verde');
    _refrescarSalonFondo();
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Cobrar'; }
    toast(err.message || 'No se pudo cobrar', 'rojo');
  }
}

/* El mapa de mesas de atrás se actualiza sin tocar la ventana abierta */
async function _refrescarSalonFondo() {
  try { _mesas = await api.getMesas(); } catch { return; }
  const cont = document.getElementById('adm2-salon-cont');
  if (!cont || !document.getElementById('adm2-view-salon')?.classList.contains('active')) return;
  cont.querySelectorAll('.adm2-mesas-grid').forEach(grid => {
    const zona = grid.closest('.adm2-card')?.querySelector('.adm2-card-title')?.textContent.trim();
    grid.innerHTML = _mesas.filter(m => m.zona === zona).map(buildMesaCard).join('');
  });
}

async function cerrarMesa(cuentaId, nombre, saldo) {
  let motivo = '';
  if (saldo > 0) {
    motivo = (prompt(`${nombre} tiene ${_fArs(saldo)} sin cobrar.\n\nSi la cerrás igual queda registrado como pérdida.\n¿Motivo?`) || '').trim();
    if (!motivo) return;
  } else if (!confirm(`¿Cerrar ${nombre}?`)) return;

  const firma = await pedirFirma(saldo > 0 ? 'cobro.anular' : 'cobro.registrar', {
    titulo: saldo > 0 ? 'Cerrar sin cobrar' : 'Cerrar mesa',
    detalle: saldo > 0 ? `${nombre} · ${_fArs(saldo)} sin cobrar` : nombre
  });
  if (!firma) return;

  try {
    const res = await api.cerrarCuenta(cuentaId, { motivo }, firma);
    _mesaAbierta = null; _firmaMesa = null;
    toast(res.saldoImpago > 0 ? `${nombre} cerrada con ${_fArs(res.saldoImpago)} sin cobrar` : `${nombre} cerrada`,
          res.saldoImpago > 0 ? 'rojo' : 'verde');
    await renderSalon();
  } catch (err) { toast(err.message || 'No se pudo cerrar', 'rojo'); }
}

/* ═══════════════════════════════════════════════════════════
   TURNOS FIJOS

   Un fijo no es un turno con etiqueta: es una regla. "Martes y
   jueves a las 20, cancha 2". De la regla salen los turnos reales
   de la grilla, ocho semanas por delante, y se extienden solos.
   ═══════════════════════════════════════════════════════════ */

let _fijos      = [];
let _fijoForm   = null;   /* null = cerrado; objeto = formulario abierto */

const DIAS_SEMANA = [
  { id: 1, corto: 'Lun' }, { id: 2, corto: 'Mar' }, { id: 3, corto: 'Mié' },
  { id: 4, corto: 'Jue' }, { id: 5, corto: 'Vie' }, { id: 6, corto: 'Sáb' },
  { id: 0, corto: 'Dom' }
];

function _formVacio() {
  return {
    id: null, tipo: 'persona',
    cliente_nombre: '', cliente_telefono: '', profesorId: '',
    cancha_id: (CANCHAS_CONFIG[0] || {}).id || 1,
    dias: [], hora_inicio: '20:00', duracion_minutos: 90,
    desde: _hoyKey(), hasta: '', monto: '', notas: ''
  };
}

async function renderFijos() {
  const cont = document.getElementById('adm2-fijos-cont');
  if (!cont) return;
  cont.innerHTML = '<div class="adm2-cargando">Cargando turnos fijos…</div>';

  try { _fijos = await api.getFijos(true); }
  catch (err) { cont.innerHTML = `<div class="adm2-vacio">No se pudo cargar: ${_esc(err.message)}</div>`; return; }

  const activos   = _fijos.filter(f => f.activo);
  const semanales = activos.reduce((s, f) => s + (f.dias || []).length, 0);
  const porSemana = activos.reduce((s, f) => s + (f.dias || []).length * (f.monto || 0), 0);
  const sinCobrar = activos.reduce((s, f) => s + f.sinCobrar, 0);

  cont.innerHTML = `
    <div class="adm2-stats-row">
      <div class="adm2-card adm2-stat-card">
        <div class="adm2-stat-label">Fijos activos</div>
        <div class="adm2-stat-value">${activos.length}</div>
        <div class="adm2-stat-sub">${semanales} turno${semanales !== 1 ? 's' : ''} por semana</div>
      </div>
      <div class="adm2-card adm2-stat-card">
        <div class="adm2-stat-label">Recaudado</div>
        <div class="adm2-stat-value">${_fArs(activos.reduce((s, f) => s + f.recaudado, 0))}</div>
        <div class="adm2-stat-sub">${porSemana > 0 ? _fArs(porSemana) + ' por semana' : 'histórico de los fijos'}</div>
      </div>
      <div class="adm2-card adm2-stat-card ${sinCobrar ? 'adm2-stat-alerta' : ''}">
        <div class="adm2-stat-label">Fijos sin cobrar</div>
        <div class="adm2-stat-value">${sinCobrar}</div>
        <div class="adm2-stat-sub">turnos ya jugados</div>
      </div>
      <div class="adm2-card adm2-stat-card">
        <div class="adm2-stat-label">Profesores</div>
        <div class="adm2-stat-value">${activos.filter(f => f.tipo === 'profesor').length}</div>
        <div class="adm2-stat-sub">${activos.filter(f => f.tipo === 'persona').length} de particulares</div>
      </div>
    </div>

    <div class="adm2-card">
      <div class="adm2-disp-header">
        <div class="adm2-card-title">Turnos fijos</div>
        ${_fijoForm ? '' : '<button class="adm2-btn-agendar" onclick="nuevoFijo()">Nuevo fijo</button>'}
      </div>
      <div id="adm2-fijo-form">${_fijoForm ? buildFijoForm() : ''}</div>

      ${_fijos.length === 0
        ? '<div class="adm2-vacio">Todavía no hay turnos fijos. Creá el primero con el botón de arriba.</div>'
        : `<div class="adm2-fijos-lista">${_fijos.map(buildFijoCard).join('')}</div>`}
    </div>`;
}

function buildFijoCard(f) {
  const quien = f.tipo === 'profesor' ? f.profesor_nombre : f.cliente_nombre;
  const proximas = (f.proximas || []).slice(0, 4)
    .map(p => p.fecha.slice(8) + '/' + p.fecha.slice(5, 7)).join(' · ');

  return `
    <div class="adm2-fijo ${f.activo ? '' : 'pausado'}">
      <div class="adm2-fijo-head">
        <div>
          <div class="adm2-fijo-quien">
            ${_esc(quien)}
            <span class="adm2-fijo-tipo ${f.tipo}">${f.tipo === 'profesor' ? 'Profesor' : 'Particular'}</span>
            ${f.activo ? '' : '<span class="adm2-fijo-tipo pausado">En pausa</span>'}
          </div>
          <div class="adm2-fijo-cuando">${_esc(f.descripcion)} · ${_esc(f.cancha_nombre)}</div>
        </div>
        <div class="adm2-fijo-dias">
          ${DIAS_SEMANA.map(d => `<span class="adm2-fijo-dia ${(f.dias || []).includes(d.id) ? 'on' : ''}">${d.corto}</span>`).join('')}
        </div>
      </div>

      <div class="adm2-fijo-datos">
        <span>${f.generadas} turnos por delante${proximas ? ': ' + proximas : ''}</span>
        ${f.jugadas ? `<span>${f.jugadas} jugados · ${_fArs(f.recaudado)} cobrado</span>` : ''}
        ${f.sinCobrar ? `<span class="alerta">${f.sinCobrar} sin cobrar</span>` : ''}
        ${f.hasta ? `<span>hasta el ${f.hasta.slice(8)}/${f.hasta.slice(5, 7)}</span>` : ''}
      </div>

      <div class="adm2-fijo-acciones">
        <button onclick="editarFijo(${f.id})">Editar</button>
        <button onclick="pausarFijo(${f.id},${f.activo ? 'false' : 'true'})">${f.activo ? 'Pausar' : 'Reactivar'}</button>
        ${f.activo ? `<button onclick="regenerarFijo(${f.id})">Regenerar</button>` : ''}
        <button class="peligro" onclick="borrarFijo(${f.id})">Eliminar</button>
      </div>
    </div>`;
}

function buildFijoForm() {
  const f = _fijoForm;
  const canchas = CANCHAS_CONFIG;
  const profes  = (typeof _profesoresCache !== 'undefined' ? _profesoresCache : []) || [];
  const cancha  = canchas.find(c => c.id === Number(f.cancha_id)) || canchas[0] || {};
  const durs    = deporteInfo(cancha.deporte).duraciones;
  const precio  = cancha.precioHora ? Math.round(cancha.precioHora * f.duracion_minutos / 60) : 0;

  return `
    <div class="adm2-fijo-form">
      <div class="adm2-fijo-form-head">
        <span>${f.id ? 'Editar turno fijo' : 'Nuevo turno fijo'}</span>
        <button class="adm2-panel-close" onclick="cerrarFijoForm()">✕</button>
      </div>

      <div class="adm2-panel-label">¿De quién es?</div>
      <div class="adm2-fijo-tipos">
        <button class="adm2-asis-btn ${f.tipo === 'persona' ? 'sel-ok' : ''}" onclick="setFijo('tipo','persona')">Una persona</button>
        <button class="adm2-asis-btn ${f.tipo === 'profesor' ? 'sel-ok' : ''}" onclick="setFijo('tipo','profesor')">Un profesor</button>
      </div>

      ${f.tipo === 'profesor'
        ? `<select class="adm2-select adm2-fijo-ancho" onchange="setFijo('profesorId',this.value)">
             <option value="">— Elegí el profesor —</option>
             ${profes.map(p => `<option value="${p.id}" ${String(f.profesorId) === String(p.id) ? 'selected' : ''}>${_esc(p.nombre)}</option>`).join('')}
           </select>`
        : `<div class="adm2-fijo-fila">
             <input class="adm2-input" type="text" placeholder="Nombre del grupo o cliente" value="${_esc(f.cliente_nombre)}"
                    oninput="_fijoForm.cliente_nombre=this.value">
             <input class="adm2-input" type="text" placeholder="Teléfono (opcional)" value="${_esc(f.cliente_telefono)}"
                    oninput="_fijoForm.cliente_telefono=this.value">
           </div>`}

      <div class="adm2-panel-label">¿Qué días?</div>
      <div class="adm2-fijo-dias-pick">
        ${DIAS_SEMANA.map(d => `
          <button class="adm2-fijo-dia-btn ${f.dias.includes(d.id) ? 'on' : ''}" onclick="toggleDiaFijo(${d.id})">${d.corto}</button>`).join('')}
      </div>

      <div class="adm2-panel-label">¿Dónde y a qué hora?</div>
      <div class="adm2-fijo-fila">
        <select class="adm2-select" onchange="setFijo('cancha_id',this.value)">
          ${canchas.map(c => `<option value="${c.id}" ${Number(f.cancha_id) === c.id ? 'selected' : ''}>${_esc(c.nombre)} — ${deporteInfo(c.deporte).nombre}</option>`).join('')}
        </select>
        <input class="adm2-input" type="time" value="${_esc(f.hora_inicio)}" oninput="_fijoForm.hora_inicio=this.value">
        <select class="adm2-select" onchange="setFijo('duracion_minutos',this.value)">
          ${durs.map(m => `<option value="${m}" ${Number(f.duracion_minutos) === m ? 'selected' : ''}>${m >= 60 ? (m / 60).toFixed(1).replace('.0', '') + 'h' : m + 'min'}</option>`).join('')}
        </select>
      </div>

      <div class="adm2-panel-label">¿Desde cuándo?</div>
      <div class="adm2-fijo-fila">
        <input class="adm2-input" type="date" value="${_esc(f.desde)}" oninput="_fijoForm.desde=this.value">
        <input class="adm2-input" type="date" placeholder="Hasta (opcional)" value="${_esc(f.hasta)}" oninput="_fijoForm.hasta=this.value">
        <input class="adm2-input" type="number" placeholder="Precio (por defecto ${precio})" value="${_esc(f.monto)}"
               oninput="_fijoForm.monto=this.value">
      </div>

      <div class="adm2-fijo-resumen">
        ${f.dias.length
          ? `${f.dias.length} turno${f.dias.length !== 1 ? 's' : ''} por semana · unos ${_fArs((f.monto ? Number(f.monto) : precio) * f.dias.length)} semanales`
          : 'Elegí al menos un día'}
      </div>

      <button class="adm2-btn-agendar adm2-fijo-guardar" onclick="guardarFijo()">
        ${f.id ? 'Guardar cambios' : 'Crear turno fijo'}
      </button>
    </div>`;
}

function setFijo(campo, valor) {
  _fijoForm[campo] = campo === 'cancha_id' || campo === 'duracion_minutos' ? Number(valor) : valor;
  if (campo === 'cancha_id') {
    /* Si la cancha nueva no acepta esa duración, se ajusta sola */
    const c = CANCHAS_CONFIG.find(x => x.id === Number(valor));
    const durs = deporteInfo(c?.deporte).duraciones;
    if (!durs.includes(_fijoForm.duracion_minutos)) _fijoForm.duracion_minutos = durs[0];
  }
  document.getElementById('adm2-fijo-form').innerHTML = buildFijoForm();
}

function toggleDiaFijo(dia) {
  const i = _fijoForm.dias.indexOf(dia);
  if (i === -1) _fijoForm.dias.push(dia); else _fijoForm.dias.splice(i, 1);
  document.getElementById('adm2-fijo-form').innerHTML = buildFijoForm();
}

function nuevoFijo()     { _fijoForm = _formVacio(); renderFijos(); }
function cerrarFijoForm(){ _fijoForm = null; renderFijos(); }

function editarFijo(id) {
  const f = _fijos.find(x => x.id === id);
  if (!f) return;
  _fijoForm = {
    id: f.id, tipo: f.tipo,
    cliente_nombre: f.cliente_nombre, cliente_telefono: f.cliente_telefono || '',
    profesorId: f.profesor_id || '',
    cancha_id: f.cancha_id, dias: [...(f.dias || [])],
    hora_inicio: f.hora_inicio, duracion_minutos: f.duracion_minutos,
    desde: f.desde, hasta: f.hasta || '', monto: f.monto || '', notas: f.notas || ''
  };
  renderFijos();
}

async function guardarFijo() {
  const f = _fijoForm;
  if (!f.dias.length) { toast('Elegí al menos un día', 'rojo'); return; }
  if (f.tipo === 'profesor' && !f.profesorId) { toast('Elegí el profesor', 'rojo'); return; }
  if (f.tipo === 'persona' && !f.cliente_nombre.trim()) { toast('Poné el nombre', 'rojo'); return; }

  const quien = f.tipo === 'profesor'
    ? ((typeof _profesoresCache !== 'undefined' ? _profesoresCache : []).find(p => String(p.id) === String(f.profesorId))?.nombre || 'profesor')
    : f.cliente_nombre;
  const dias = f.dias.map(d => DIAS_SEMANA.find(x => x.id === d).corto).join(', ');

  const firma = await pedirFirma(f.id ? 'reserva.editar' : 'reserva.crear', {
    titulo: f.id ? 'Guardar turno fijo' : 'Crear turno fijo',
    detalle: `${quien} · ${dias} ${f.hora_inicio}`
  });
  if (!firma) return;

  const datos = {
    tipo: f.tipo, cliente_nombre: f.cliente_nombre, cliente_telefono: f.cliente_telefono,
    profesorId: f.profesorId || null, cancha_id: f.cancha_id, dias: f.dias,
    hora_inicio: f.hora_inicio, duracion_minutos: f.duracion_minutos,
    desde: f.desde, hasta: f.hasta || null, monto: f.monto || 0
  };

  try {
    const r = f.id ? await api.editarFijo(f.id, datos, firma) : await api.crearFijo(datos, firma);
    _fijoForm = null;
    toast(`${quien}: ${r.generados} turnos cargados en la grilla`, 'verde');
    (r.choques || []).slice(0, 3).forEach(c =>
      toast(`${c.fecha}: ${c.cancha} ya estaba ocupada por ${c.ocupadaPor}`, 'rojo'));
    await renderFijos();
    if (typeof _syncReservasDesdeAPI === 'function') await _syncReservasDesdeAPI();
  } catch (err) { toast(err.message || 'No se pudo guardar', 'rojo'); }
}

async function pausarFijo(id, activar) {
  const f = _fijos.find(x => x.id === id);
  const firma = await pedirFirma('reserva.editar', {
    titulo: activar ? 'Reactivar fijo' : 'Pausar fijo',
    detalle: activar ? f.cliente_nombre : `${f.cliente_nombre} — se liberan los turnos futuros`
  });
  if (!firma) return;
  try {
    const r = await api.editarFijo(id, { activo: activar }, firma);
    toast(activar ? `Reactivado: ${r.generados} turnos` : `Pausado: ${r.canceladas} turnos liberados`, activar ? 'verde' : '');
    await renderFijos();
    if (typeof _syncReservasDesdeAPI === 'function') await _syncReservasDesdeAPI();
  } catch (err) { toast(err.message || 'No se pudo', 'rojo'); }
}

async function regenerarFijo(id) {
  const firma = await pedirFirma('reserva.crear', { titulo: 'Regenerar turnos del fijo' });
  if (!firma) return;
  try {
    const r = await api.regenerarFijo(id, firma);
    toast(r.generados ? `${r.generados} turnos nuevos` : 'Ya estaban todos generados', 'verde');
    (r.choques || []).slice(0, 3).forEach(c => toast(`${c.fecha}: ocupada por ${c.ocupadaPor}`, 'rojo'));
    await renderFijos();
  } catch (err) { toast(err.message || 'No se pudo', 'rojo'); }
}

async function borrarFijo(id) {
  const f = _fijos.find(x => x.id === id);
  if (!confirm(`¿Eliminar el fijo de ${f.tipo === 'profesor' ? f.profesor_nombre : f.cliente_nombre}?\n\nSe liberan todos los turnos futuros que no estén cobrados.`)) return;
  const firma = await pedirFirma('reserva.liberar', { titulo: 'Eliminar turno fijo', detalle: f.cliente_nombre });
  if (!firma) return;
  try {
    const r = await api.borrarFijo(id, firma);
    toast(`Eliminado · ${r.canceladas} turnos liberados`, '');
    await renderFijos();
    if (typeof _syncReservasDesdeAPI === 'function') await _syncReservasDesdeAPI();
  } catch (err) { toast(err.message || 'No se pudo', 'rojo'); }
}

/* ═══════════════════════════════════════════════════════════
   CARTA DE PRODUCTOS

   Una sola carta que sirve al turno de cancha y a la mesa del salón.
   Cada producto trae su stepper — o sea, se pone la cantidad de una
   en vez de tocar cinco veces — y los que tienen ingredientes abren
   el detalle para quitar o agregar antes de mandarlos.

   Lo tocado no se manda de a uno: se junta y sale en un solo pedido
   800ms después del último toque, así tres taps son una sola operación
   y un solo PIN.
   ═══════════════════════════════════════════════════════════ */

const _cartas = { cancha: [], mesa: [] };
let _carta      = null;   /* contexto activo: { clave, donde, permiso, enviar, refrescar } */
let _pend       = {};     /* { productoId: { cantidad, opciones, detalle, extra } } */
let _pendTimer  = null;
let _ingredientes = null; /* { productoId, seleccion: [], cantidad, nota } */
let _busca      = '';     /* buscador de la carta */
let _rubro      = 'todo'; /* rubro elegido */

/*
  Rubros del mozo. No son las categorías del sistema: son los seis botones
  que se tocan mil veces por noche, ordenados por lo que más sale.
*/
const RUBROS = [
  { id: 'todo',    nombre: 'Todo',      test: () => true },
  { id: 'burger',  nombre: 'Burgers',   test: p => /hamburgues/i.test(p.nombre) },
  { id: 'lomito',  nombre: 'Lomitos',   test: p => /lomito/i.test(p.nombre) },
  { id: 'pizza',   nombre: 'Pizzas',    test: p => /pizza/i.test(p.nombre) },
  { id: 'papas',   nombre: 'Papas',     test: p => /papas/i.test(p.nombre) },
  { id: 'bebida',  nombre: 'Bebidas',   test: p => p.categoria === 'bebida' },
  { id: 'kiosco',  nombre: 'Kiosco',    test: p => p.categoria !== 'bebida' && p.estacion === 'directo' }
];

function _sinTildes(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function cargarCarta(donde, forzar) {
  if (_cartas[donde] && _cartas[donde].length && !forzar) return _cartas[donde];
  try { _cartas[donde] = await api.getProductos(false, donde); }
  catch (e) { console.warn('Carta:', e.message); _cartas[donde] = []; }
  return _cartas[donde];
}

function abrirCarta(ctx) {
  if (!_carta || _carta.clave !== ctx.clave) { _pend = {}; _ingredientes = null; _busca = ''; _rubro = 'todo'; }
  _carta = ctx;
}

function _prod(id) { return (_cartas[_carta.donde] || []).find(p => p.id === Number(id)); }
function _claveP(id, detalle) { return detalle ? `${id}|${detalle}` : String(id); }

function _pendienteDe(productoId) {
  return Object.values(_pend).filter(x => x.productoId === Number(productoId))
    .reduce((s, x) => s + x.cantidad, 0);
}

/* ─── Dibujo ─────────────────────────────────────────────── */

let _cartaReintento = null;

function cartaHTML() {
  const todos = _cartas[_carta.donde] || [];
  if (!todos.length) {
    /* Vacía porque todavía no se cargó (o falló antes del login): se pide una vez y se repinta */
    if (_cartaReintento !== _carta.clave) {
      _cartaReintento = _carta.clave;
      cargarCarta(_carta.donde, true).then(() => _repintarCarta());
      return '<div class="adm2-cargando">Cargando la carta…</div>';
    }
    return '<div class="adm2-vacio">No hay productos cargados para este lugar. Se agregan desde la pestaña Productos.</div>';
  }

  /* Solo se ofrecen los rubros que este lugar realmente tiene */
  const rubros = RUBROS.filter(r => r.id === 'todo' || todos.some(p => r.test(p)));
  const rubroActivo = rubros.some(r => r.id === _rubro) ? _rubro : 'todo';
  const filtroRubro = RUBROS.find(r => r.id === rubroActivo);

  const q = _sinTildes(_busca).trim();
  const lista = todos
    .filter(p => filtroRubro.test(p))
    .filter(p => !q || _sinTildes(p.nombre).includes(q));

  const pendientes = Object.entries(_pend).filter(([, x]) => x.cantidad > 0);
  const totalPend  = pendientes.reduce((s, [, x]) => s + x.cantidad * x.precioUnitario, 0);
  const platosPend = pendientes.reduce((s, [, x]) => s + x.cantidad, 0);

  return `
    <div class="adm2-carta-buscar">
      <input class="adm2-input" type="search" inputmode="search" placeholder="Buscar producto…"
             value="${_esc(_busca)}" oninput="cartaBuscar(this.value)">
      ${_busca ? '<button class="adm2-carta-limpiar" onclick="cartaBuscar(\'\')">✕</button>' : ''}
    </div>

    <div class="adm2-rubros">
      ${rubros.map(r => `<button class="adm2-rubro ${r.id === rubroActivo ? 'on' : ''}"
                           onclick="cartaRubro('${r.id}')">${r.nombre}</button>`).join('')}
    </div>

    ${lista.length === 0 ? '<div class="adm2-vacio">Nada con ese nombre.</div>' : ''}
    <div class="adm2-carta">
      ${lista.map(p => {
        const n = _pendienteDe(p.id);
        const conOpciones = (p.opciones || []).length > 0;
        return `
          <div class="adm2-carta-item ${n ? 'con-cant' : ''} ${p.sinStock ? 'agotado' : ''}">
            <button class="adm2-carta-tocar" onclick="cartaTocar(${p.id})">
              <span class="adm2-carta-nombre">${_esc(p.nombre)}</span>
              <span class="adm2-carta-precio">${_fArs(p.precio)}</span>
              ${conOpciones ? '<span class="adm2-carta-editable">tocá para cambiar ingredientes</span>' : ''}
            </button>
            <div class="adm2-carta-stepper">
              <button class="adm2-step ${n ? '' : 'off'}" onclick="cartaSumar(${p.id},-1)" ${n ? '' : 'disabled'}>−</button>
              <span class="adm2-step-n">${n || ''}</span>
              <button class="adm2-step" onclick="cartaSumar(${p.id},1)">+</button>
            </div>
          </div>`;
      }).join('')}
    </div>

    ${_ingredientes ? ingredientesHTML() : ''}

    ${pendientes.length ? `
      <div class="adm2-pend">
        <div class="adm2-pend-lineas">
          ${pendientes.map(([k, x]) => `
            <span class="adm2-pend-chip">
              ${x.cantidad}× ${_esc(x.nombre)}${x.detalle ? ` <i>${_esc(x.detalle)}</i>` : ''}${x.nota ? ` <i>“${_esc(x.nota)}”</i>` : ''}
              <button onclick="cartaQuitarPendiente('${_esc(k)}')">✕</button>
            </span>`).join('')}
        </div>
        <div class="adm2-pend-pie">
          <span>${platosPend} ${platosPend === 1 ? 'ítem' : 'ítems'} · ${_fArs(totalPend)}</span>
          <button class="adm2-btn-agendar" onclick="cartaEnviar()">Mandar a cocina</button>
        </div>
      </div>` : ''}`;
}

function cartaBuscar(v) { _busca = v; _repintarCarta(); }
function cartaRubro(id) { _rubro = id; _busca = ''; _repintarCarta(); }

function ingredientesHTML() {
  const p = _prod(_ingredientes.productoId);
  if (!p) return '';
  const sel = _ingredientes.seleccion;
  const quitar  = (p.opciones || []).filter(o => !Number(o.precio));
  const agregar = (p.opciones || []).filter(o => Number(o.precio) > 0);
  const extra   = sel.reduce((s, n) => s + (Number((p.opciones.find(o => o.nombre === n) || {}).precio) || 0), 0);
  const unit    = p.precio + extra;

  /* Se abre como recuadro centrado sobre la carta: el plato puede estar al fondo de la lista */
  return `
    <div class="adm2-ingr-overlay" onclick="if (event.target === this) cartaCerrarIngredientes()">
    <div class="adm2-ingr">
      <div class="adm2-ingr-head">
        <span>${_esc(p.nombre)} · ${_fArs(unit)} c/u</span>
        <button class="adm2-panel-close" onclick="cartaCerrarIngredientes()">✕</button>
      </div>

      ${quitar.length ? `
        <div class="adm2-ingr-grupo">
          <span class="adm2-ingr-label">Quitar</span>
          ${quitar.map(o => `<button class="adm2-ingr-op ${sel.includes(o.nombre) ? 'on' : ''}"
                               onclick="cartaToggleIngrediente('${_esc(o.nombre)}')">${_esc(o.nombre)}</button>`).join('')}
        </div>` : ''}

      ${agregar.length ? `
        <div class="adm2-ingr-grupo">
          <span class="adm2-ingr-label">Agregar</span>
          ${agregar.map(o => `<button class="adm2-ingr-op suma ${sel.includes(o.nombre) ? 'on' : ''}"
                               onclick="cartaToggleIngrediente('${_esc(o.nombre)}')">${_esc(o.nombre)} +${_fArs(o.precio)}</button>`).join('')}
        </div>` : ''}

      <input class="adm2-input adm2-ingr-nota" type="text" maxlength="120"
             placeholder="Aclaración para la cocina (ej: bien jugosa, sin sal)"
             value="${_esc(_ingredientes.nota || '')}" oninput="_ingredientes.nota=this.value">

      <div class="adm2-ingr-pie">
        <div class="adm2-carta-stepper grande">
          <button class="adm2-step" onclick="cartaIngrCantidad(-1)">−</button>
          <span class="adm2-step-n">${_ingredientes.cantidad}</span>
          <button class="adm2-step" onclick="cartaIngrCantidad(1)">+</button>
        </div>
        <button class="adm2-btn-agendar" onclick="cartaConfirmarIngredientes()">
          Agregar ${_ingredientes.cantidad > 1 ? _ingredientes.cantidad + ' × ' : ''}${_fArs(unit * _ingredientes.cantidad)}
        </button>
      </div>
    </div>
    </div>`;
}

function _repintarCarta() { if (_carta && _carta.repintar) _carta.repintar(); }

/* ─── Interacción ────────────────────────────────────────── */

function cartaTocar(productoId) {
  const p = _prod(productoId);
  if (!p) return;
  if ((p.opciones || []).length) {
    _ingredientes = { productoId: p.id, seleccion: [], cantidad: 1, nota: '' };
    _repintarCarta();
    return;
  }
  cartaSumar(productoId, 1);
}

/*
  El + siempre suma el plato tal como viene, sin frenar a preguntar nada.
  Para cambiarle los ingredientes se toca el nombre, que abre el detalle.
*/
function cartaSumar(productoId, delta) {
  const p = _prod(productoId);
  if (!p) return;

  if (delta < 0) {
    /* Resta desde la última línea pendiente de ese producto */
    const claves = Object.keys(_pend).filter(k => _pend[k].productoId === p.id);
    const k = claves[claves.length - 1];
    if (!k) return;
    _pend[k].cantidad--;
    if (_pend[k].cantidad <= 0) delete _pend[k];
  } else {
    const k = _claveP(p.id);
    if (!_pend[k]) _pend[k] = { productoId: p.id, nombre: p.nombre, cantidad: 0, opciones: [], detalle: '', nota: '', precioUnitario: p.precio };
    _pend[k].cantidad++;
  }

  _programarEnvio();
  _repintarCarta();
}

function cartaToggleIngrediente(nombre) {
  const i = _ingredientes.seleccion.indexOf(nombre);
  if (i === -1) _ingredientes.seleccion.push(nombre); else _ingredientes.seleccion.splice(i, 1);
  _repintarCarta();
}

function cartaIngrCantidad(delta) {
  _ingredientes.cantidad = Math.max(1, _ingredientes.cantidad + delta);
  _repintarCarta();
}

function cartaCerrarIngredientes() { _ingredientes = null; _repintarCarta(); }

function cartaConfirmarIngredientes() {
  const p = _prod(_ingredientes.productoId);
  const sel = [..._ingredientes.seleccion];
  const detalle = sel.join(', ');
  const nota = (_ingredientes.nota || '').trim();
  const extra = sel.reduce((s, n) => s + (Number((p.opciones.find(o => o.nombre === n) || {}).precio) || 0), 0);

  /* Dos platos iguales con aclaraciones distintas son dos líneas distintas */
  const k = _claveP(p.id, detalle + '§' + nota);
  if (!_pend[k]) _pend[k] = { productoId: p.id, nombre: p.nombre, cantidad: 0, opciones: sel, detalle, nota, precioUnitario: p.precio + extra };
  _pend[k].cantidad += _ingredientes.cantidad;

  _ingredientes = null;
  _programarEnvio();
  _repintarCarta();
}

function cartaQuitarPendiente(clave) {
  delete _pend[clave];
  _repintarCarta();
}

/*
  El envío se junta: tres toques seguidos son un solo pedido y un solo PIN.
  Si la persona sigue tocando, el reloj se reinicia.
*/
function _programarEnvio() {
  clearTimeout(_pendTimer);
  _pendTimer = setTimeout(cartaEnviar, 800);
}

async function cartaEnviar() {
  clearTimeout(_pendTimer);
  if (!_carta) return;
  const items = Object.values(_pend).filter(x => x.cantidad > 0);
  if (!items.length) return;

  const ctx = _carta;
  let firma = ctx.firmaVigente ? ctx.firmaVigente() : null;
  if (!firma) {
    const texto = items.map(x => `${x.cantidad}× ${x.nombre}`).join(', ');
    firma = await pedirFirma('consumicion.crear', { titulo: 'Cargar consumición', detalle: texto });
    if (!firma) return;
    if (ctx.guardarFirma) ctx.guardarFirma(firma);
  }

  const payload = items.map(x => ({ productoId: x.productoId, cantidad: x.cantidad, opciones: x.opciones, nota: x.nota || '' }));
  _pend = {};
  _repintarCarta();

  try {
    const res = await ctx.enviar(payload, firma);
    (res.alertas || []).forEach(a => toast(a, 'rojo'));
    toast(res.comanda
      ? `Comanda #${res.comanda.numero} mandada a ${res.comanda.estacion}`
      : items.map(x => `${x.cantidad}× ${x.nombre}`).join(', ') + ' agregado', 'verde');
    cargarCarta(ctx.donde, true);
    await ctx.refrescar(res);
  } catch (err) {
    if ((err.status === 401 || err.status === 403) && ctx.olvidarFirma) ctx.olvidarFirma();
    /* Lo que no entró vuelve al pendiente para no perder el pedido */
    items.forEach(x => { _pend[_claveP(x.productoId, (x.detalle || '') + '§' + (x.nota || ''))] = x; });
    _repintarCarta();
    toast(err.message || 'No se pudo cargar', 'rojo');
  }
}

/* ═══════════════════════════════════════════════════════════
   COCINA — el tablero del cocinero

   Pensado para leerse parado, a un metro y medio, con las manos
   ocupadas: número grande, mesa, reloj con semáforo y los platos
   en letra grande. Las aclaraciones y lo que se quita van
   resaltadas, porque un "sin ketchup" que no se ve es un plato
   que vuelve.

   Se refresca solo cada 5 segundos. Cuando entra una comanda nueva
   la tarjeta late para que se note sin tener que mirar fijo.
   ═══════════════════════════════════════════════════════════ */

let _cocina        = { comandas: [], resumen: {} };
let _cocinaTimer   = null;
let _cocinaVerTodo = false;
let _cocinaVistas  = new Set();   /* comandas ya vistas, para marcar solo las nuevas */
let _cocinero      = '';

function abrirCocina() {
  renderCocina();
  clearInterval(_cocinaTimer);
  _cocinaTimer = setInterval(() => {
    const vista = document.getElementById('adm2-view-cocina');
    if (vista && vista.classList.contains('active') && !document.hidden) renderCocina(true);
  }, 5000);
}

function cerrarCocina() { clearInterval(_cocinaTimer); _cocinaTimer = null; }

function _relojCocina(min) {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

async function renderCocina(silencioso) {
  const cont = document.getElementById('adm2-cocina-cont');
  if (!cont) return;
  if (!silencioso) cont.innerHTML = '<div class="adm2-cargando">Abriendo cocina…</div>';

  try { _cocina = await api.getCocina(_hoyKey(), _cocinaVerTodo); }
  catch (err) {
    if (!silencioso) cont.innerHTML = `<div class="adm2-vacio">No se pudo cargar: ${_esc(err.message)}</div>`;
    return;
  }

  const r = _cocina.resumen || {};
  const pendientes = (r.nuevas || 0) + (r.preparando || 0);
  [['tab-cocina-badge', 'adm2-tab-badge'], ['bn-cocina-badge', 'adm2-bn-badge']].forEach(([id, cls]) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.textContent = pendientes || '';
    b.className = cls + (r.nuevas ? ' nuevo' : '');
  });

  const cols = [
    { estado: 'pendiente',  titulo: 'Nuevas',     n: r.nuevas },
    { estado: 'preparando', titulo: 'En cocina',  n: r.preparando },
    { estado: 'listo',      titulo: 'Para servir', n: r.listas }
  ];

  cont.innerHTML = `
    <div class="adm2-cocina-top">
      <div class="adm2-cocina-nums">
        <span class="adm2-cocina-num nuevas"><b>${r.nuevas || 0}</b> nuevas</span>
        <span class="adm2-cocina-num"><b>${r.preparando || 0}</b> en cocina</span>
        <span class="adm2-cocina-num listas"><b>${r.listas || 0}</b> para servir</span>
        <span class="adm2-cocina-num"><b>${r.platos || 0}</b> platos</span>
        ${r.demoradas ? `<span class="adm2-cocina-num tarde"><b>${r.demoradas}</b> demoradas</span>` : ''}
      </div>
      <div class="adm2-cocina-acciones">
        <input class="adm2-input adm2-cocina-quien" type="text" placeholder="¿Quién cocina?" value="${_esc(_cocinero)}"
               oninput="_cocinero=this.value" autocomplete="off">
        <button class="adm2-btn-secundario" onclick="_cocinaVerTodo=!_cocinaVerTodo;renderCocina()">
          ${_cocinaVerTodo ? 'Ocultar entregadas' : 'Ver entregadas'}
        </button>
      </div>
    </div>

    <div class="adm2-cocina-tablero">
      ${cols.map(col => {
        const lista = _cocina.comandas.filter(c => c.estado === col.estado);
        return `
          <div class="adm2-cocina-col ${col.estado}">
            <div class="adm2-cocina-col-tit">${col.titulo} <span>${lista.length}</span></div>
            ${lista.length ? lista.map(buildComanda).join('')
                           : '<div class="adm2-cocina-vacio">—</div>'}
          </div>`;
      }).join('')}
    </div>

    ${_cocinaVerTodo ? `
      <div class="adm2-card" style="margin-top:14px">
        <div class="adm2-card-title">Entregadas</div>
        <div class="adm2-cocina-entregadas">
          ${_cocina.comandas.filter(c => c.estado === 'entregado').map(c =>
            `<span class="adm2-cocina-chip">#${c.numero} ${_esc(c.lugar)} · ${c.platos} platos</span>`).join('') || '<div class="adm2-vacio">Todavía ninguna.</div>'}
        </div>
      </div>` : ''}`;

  _cocina.comandas.forEach(c => _cocinaVistas.add(c.id));
}

function buildComanda(c) {
  const nueva = c.estado === 'pendiente' && !_cocinaVistas.has(c.id);

  const siguiente = {
    pendiente:  { estado: 'preparando', texto: 'Empezar' },
    preparando: { estado: 'listo',      texto: 'Listo' },
    listo:      { estado: 'entregado',  texto: 'Entregado' }
  }[c.estado];

  return `
    <div class="adm2-comanda ${c.urgencia} ${nueva ? 'nueva' : ''}">
      <div class="adm2-comanda-head">
        <span class="adm2-comanda-num">#${c.numero}</span>
        <span class="adm2-comanda-lugar">${_esc(c.lugar)}</span>
        <span class="adm2-comanda-reloj">${_relojCocina(c.minutos)}</span>
      </div>

      <div class="adm2-comanda-items">
        ${c.items.map(i => `
          <div class="adm2-comanda-item ${i.estadoCocina === 'listo' ? 'hecho' : ''}"
               onclick="marcarItemCocina(${i.id}, '${i.estadoCocina === 'listo' ? 'pendiente' : 'listo'}')">
            <span class="adm2-comanda-cant">${i.cantidad}</span>
            <span class="adm2-comanda-plato">
              ${_esc(i.nombre)}
              ${i.detalle ? `<span class="adm2-comanda-cambios">${_esc(i.detalle)}</span>` : ''}
              ${i.nota ? `<span class="adm2-comanda-nota">${_esc(i.nota)}</span>` : ''}
            </span>
          </div>`).join('')}
      </div>

      <div class="adm2-comanda-pie">
        <span class="adm2-comanda-mozo">${_esc(c.mozo)}${c.tomadaPor ? ` · ${_esc(c.tomadaPor)}` : ''}</span>
        ${siguiente ? `<button class="adm2-comanda-btn" onclick="pasarComanda(${c.id},'${siguiente.estado}')">${siguiente.texto}</button>` : ''}
      </div>
    </div>`;
}

async function pasarComanda(id, estado) {
  try {
    await api.estadoComanda(id, estado, _cocinero);
    await renderCocina(true);
    if (estado === 'listo') toast('Listo para servir', 'verde');
  } catch (err) { toast(err.message || 'No se pudo actualizar', 'rojo'); }
}

async function marcarItemCocina(id, estadoCocina) {
  try {
    await api.estadoItemComanda(id, estadoCocina);
    await renderCocina(true);
  } catch (err) { toast(err.message || 'No se pudo marcar', 'rojo'); }
}


/* ═══════════════════════════════════════════════════════════
   DASHBOARD — el salón y la cocina en este momento
   El dueño entra al dashboard y ve todo el negocio, no solo canchas.
   ═══════════════════════════════════════════════════════════ */
async function renderDashSalon() {
  const el = document.getElementById('dash-salon');
  if (!el) return;
  let mesas = [], cocina = { resumen: {} };
  try { [mesas, cocina] = await Promise.all([api.getMesas(), api.getCocina(_hoyKey())]); }
  catch { el.innerHTML = ''; return; }

  const ocupadas = mesas.filter(m => m.ocupada);
  if (!mesas.length) { el.innerHTML = ''; return; }
  const r = cocina.resumen || {};
  const abierto = ocupadas.reduce((s, m) => s + m.cuenta.saldo, 0);

  el.innerHTML = `
    <div class="adm2-card adm2-dash-salon">
      <div class="adm2-dash-salon-tit">Salón y cocina ahora</div>
      <div class="adm2-dash-salon-grid">
        <div><b>${ocupadas.length}<i>/${mesas.length}</i></b><span>mesas ocupadas</span></div>
        <div><b>${_fArs(abierto)}</b><span>abierto en mesas</span></div>
        <div class="${r.nuevas ? 'nuevo' : ''}"><b>${r.nuevas || 0}</b><span>comandas nuevas</span></div>
        <div><b>${r.preparando || 0}</b><span>en cocina</span></div>
        <div class="${r.listas ? 'listo' : ''}"><b>${r.listas || 0}</b><span>para servir</span></div>
        <div class="${r.demoradas ? 'tarde' : ''}"><b>${r.demoradas || 0}</b><span>demoradas</span></div>
      </div>
      ${ocupadas.length ? `
        <div class="adm2-dash-mesas">
          ${ocupadas.map(m => `
            <span class="adm2-dash-mesa ${m.cuenta.comidaLista ? 'lista' : m.cuenta.enCocina ? 'cocina' : ''}">
              ${_esc(m.nombre)} · ${_fArs(m.cuenta.total)}${m.cuenta.comidaLista ? ' · comida lista' : m.cuenta.enCocina ? ' · en cocina' : ''}
            </span>`).join('')}
        </div>` : ''}
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   ASISTENTE DEL DUEÑO

   Un chat sobre el sistema: "¿cuánto cobramos hoy?", "¿quién debe?",
   "¿qué anuló Lucas?". Solo lectura. El historial vive en la sesión
   del navegador para que la conversación tenga memoria.
   ═══════════════════════════════════════════════════════════ */

let _asisHistorial = [];
let _asisOcupado   = false;

const SUGERENCIAS = [
  '¿Cuánto cobramos hoy, y cuánto en efectivo?',
  '¿Quién debe plata este mes?',
  '¿Qué se vendió más esta semana?',
  '¿Cómo está el salón ahora?',
  '¿Qué anuló cada empleado esta semana?',
  '¿Cuántas faltas hubo este mes y de quién?'
];

async function abrirAsistente() {
  const ov = document.getElementById('adm2-asis');
  if (!ov) return;
  ov.classList.add('visible');
  document.body.classList.add('adm2-sin-scroll');

  const sub = document.getElementById('adm2-asis-sub');
  try {
    const e = await api.estadoAsistente();
    if (!e.disponible) {
      sub.textContent = 'No está configurado: falta la clave ANTHROPIC_API_KEY en el servidor.';
      sub.classList.add('alerta');
    } else {
      sub.textContent = 'Preguntale al sistema. Solo consulta, no modifica nada.';
      sub.classList.remove('alerta');
    }
  } catch {}

  _pintarAsistente();
  setTimeout(() => document.getElementById('adm2-asis-input')?.focus(), 80);
}

function cerrarAsistente() {
  document.getElementById('adm2-asis')?.classList.remove('visible');
  document.body.classList.remove('adm2-sin-scroll');
}

document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && document.querySelector('#adm2-asis.visible')) cerrarAsistente();
});

function _pintarAsistente() {
  const chat = document.getElementById('adm2-asis-chat');
  const sug  = document.getElementById('adm2-asis-sug');
  if (!chat) return;

  if (!_asisHistorial.length) {
    chat.innerHTML = `<div class="adm2-asis-vacio">Preguntá lo que quieras saber del negocio. Consulto la caja, la deuda, las ventas, la auditoría, el salón y la cocina.</div>`;
    sug.innerHTML = SUGERENCIAS.map(t => `<button class="adm2-asis-chip" data-t="${_esc(t)}" onclick="preguntarRapido(this.dataset.t)">${_esc(t)}</button>`).join('');
  } else {
    chat.innerHTML = _asisHistorial.map(m => `
      <div class="adm2-asis-msg ${m.role}">
        <div class="adm2-asis-burbuja">${m.role === 'assistant' ? _md(m.content) : _esc(m.content)}</div>
      </div>`).join('') + (_asisOcupado ? '<div class="adm2-asis-msg assistant"><div class="adm2-asis-burbuja pensando">Consultando…</div></div>' : '');
    sug.innerHTML = _asisOcupado ? '' : `<button class="adm2-asis-chip tenue" onclick="_asisHistorial=[];_pintarAsistente()">Nueva conversación</button>`;
  }
  chat.scrollTop = chat.scrollHeight;
}

/* Negrita, listas y saltos: lo mínimo para que la respuesta se lea bien */
function _md(t) {
  let h = _esc(t);
  h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  h = h.replace(/^\s*[-•]\s+(.*)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>.*<\/li>\n?)+/g, m => '<ul>' + m + '</ul>');
  return h.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
}

function preguntarRapido(texto) {
  const inp = document.getElementById('adm2-asis-input');
  if (inp) inp.value = texto;
  enviarAsistente();
}

async function enviarAsistente(ev) {
  if (ev) ev.preventDefault();
  if (_asisOcupado) return;
  const inp = document.getElementById('adm2-asis-input');
  const texto = (inp?.value || '').trim();
  if (!texto) return;

  const historialPrevio = _asisHistorial.map(m => ({ role: m.role, content: m.content }));
  _asisHistorial.push({ role: 'user', content: texto });
  inp.value = '';
  _asisOcupado = true;
  document.getElementById('adm2-asis-btn').disabled = true;
  _pintarAsistente();

  try {
    const r = await api.preguntarAsistente(texto, historialPrevio);
    _asisHistorial.push({ role: 'assistant', content: r.respuesta });
  } catch (err) {
    _asisHistorial.push({ role: 'assistant', content: err.message || 'No pude responder.' });
  } finally {
    _asisOcupado = false;
    document.getElementById('adm2-asis-btn').disabled = false;
    _pintarAsistente();
    inp.focus();
  }
}
