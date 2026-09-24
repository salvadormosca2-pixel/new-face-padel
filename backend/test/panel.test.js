/* Carga admin2.html en jsdom con un backend simulado y ejercita el panel. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');

const FRONT = path.join(__dirname, '..', '..', 'frontend');
/* El panel arma la fecha en horario local; el backend usa ISO. Acá usamos la local. */
const _d = new Date();
const HOY = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;

let fallas = 0;
const chk = (c, m) => { if (!c) fallas++; console.log((c ? '  ok  ' : ' FALLA ') + m); };

const ESPACIOS = [
  { id:1, nombre:'Cancha 1', tipo:'Cubierta',      deporte:'padel',        precioHora:5000, duracionMinima:60 },
  { id:2, nombre:'Cancha 2', tipo:'Cubierta',      deporte:'padel',        precioHora:5000, duracionMinima:60 },
  { id:3, nombre:'Cancha 3', tipo:'Al aire libre', deporte:'padel',        precioHora:4000, duracionMinima:60 },
  { id:5, nombre:'Mesa 1',   tipo:'Cubierta',      deporte:'tenis_mesa',   precioHora:2000, duracionMinima:30 },
  { id:7, nombre:'Pickle 1', tipo:'Al aire libre', deporte:'pickleball',   precioHora:3500, duracionMinima:60 },
  { id:8, nombre:'Beach 1',  tipo:'Al aire libre', deporte:'beach_volley', precioHora:4500, duracionMinima:60 },
];

const RESERVAS = [
  { id:101, claveUnica:'k-wa', cancha_id:3, deporte:'padel', fecha:HOY, hora_inicio:'19:00', hora_fin:'20:30',
    duracion_minutos:90, cliente_nombre:'Salvador', cliente_telefono:'11', estado_pago:'parcial', estado_reserva:'confirmada',
    metodo_pago:'efectivo', monto:6000, origen:'whatsapp', asistencia:'pendiente', creado_por:'Lucas',
    consumiciones:[{ id:1, nombre:'Agua 500ml', emoji:'💧', cantidad:2, total:3000, usuarioNombre:'Lucas' },
                   { id:2, nombre:'Sándwich',   emoji:'🥪', cantidad:1, total:4500, usuarioNombre:'Lucas' }],
    pagos:[{ id:9, pagador:'Salvador', monto:7000, metodo:'efectivo', usuarioNombre:'Lucas' }],
    total_cancha:6000, total_consumiciones:7500, total_a_pagar:13500, total_pagado:7000, saldo:6500 },
  { id:102, claveUnica:'k-prof', cancha_id:1, deporte:'padel', fecha:HOY, hora_inicio:'16:00', hora_fin:'17:00',
    duracion_minutos:60, cliente_nombre:'Grupo iniciación', estado_pago:'pagado', estado_reserva:'confirmada',
    monto:5000, origen:'profesor', profesor_nombre:'Valentina López', asistencia:'presente', creado_por:'Nacho',
    consumiciones:[], pagos:[{ id:10, pagador:'Grupo', monto:5000, metodo:'transferencia', usuarioNombre:'Nacho' }],
    total_cancha:5000, total_consumiciones:0, total_a_pagar:5000, total_pagado:5000, saldo:0 },
  { id:103, claveUnica:'k-falta', cancha_id:2, deporte:'padel', fecha:HOY, hora_inicio:'18:00', hora_fin:'19:00',
    duracion_minutos:60, cliente_nombre:'Roberto Díaz', estado_pago:'pendiente', estado_reserva:'confirmada',
    monto:5000, origen:'online', asistencia:'falta', creado_por:'Web',
    consumiciones:[], pagos:[], total_cancha:5000, total_consumiciones:0, total_a_pagar:5000, total_pagado:0, saldo:5000 },
  { id:104, claveUnica:'k-block', cancha_id:2, deporte:'padel', fecha:HOY, hora_inicio:'15:00', hora_fin:'17:00',
    duracion_minutos:120, cliente_nombre:'Mantenimiento', estado_pago:'pendiente', estado_reserva:'confirmada',
    monto:0, origen:'bloqueo', asistencia:'pendiente', creado_por:'Nacho',
    consumiciones:[], pagos:[], total_cancha:0, total_consumiciones:0, total_a_pagar:0, total_pagado:0, saldo:0 },
  { id:105, claveUnica:'k-mesa', cancha_id:5, deporte:'tenis_mesa', fecha:HOY, hora_inicio:'17:00', hora_fin:'17:30',
    duracion_minutos:30, cliente_nombre:'Ping pong Juan', estado_pago:'pendiente', estado_reserva:'confirmada',
    monto:1000, origen:'mostrador', asistencia:'pendiente', creado_por:'Lucas',
    consumiciones:[], pagos:[], total_cancha:1000, total_consumiciones:0, total_a_pagar:1000, total_pagado:0, saldo:1000 },
];

const PRODUCTOS = [
  { id:1, nombre:'Agua 500ml', categoria:'bebida', emoji:'💧', precio:1500, stock:46, stockMinimo:12, controlaStock:true, activo:true },
  { id:2, nombre:'Gatorade',   categoria:'bebida', emoji:'🧃', precio:2500, stock:24, stockMinimo:6,  controlaStock:true, activo:true },
  { id:3, nombre:'Sándwich',   categoria:'comida', emoji:'🥪', precio:4500, stock:9,  stockMinimo:3,  controlaStock:true, activo:true },
];

const USUARIOS = [
  { id:1, nombre:'Salvador', rol:'dueno',    rolNombre:'Dueño',    nivel:3, activo:true, color:'#f59e0b', permisos:['*'], tienePin:true },
  { id:2, nombre:'Nacho',    rol:'jefe',     rolNombre:'Jefe',     nivel:2, activo:true, color:'#3b82f6', permisos:['reserva.crear','reserva.editar','reserva.asistencia','cobro.registrar','consumicion.crear','caja.ver_turno','reserva.liberar','cobro.anular','consumicion.anular','producto.editar','caja.ver','caja.cerrar'], tienePin:true },
  { id:3, nombre:'Lucas',    rol:'empleado', rolNombre:'Empleado', nivel:1, activo:true, color:'#22c55e', permisos:['reserva.crear','reserva.editar','reserva.asistencia','cobro.registrar','consumicion.crear','caja.ver_turno'], tienePin:true },
];

const llamadas = [];

function respuesta(url, opts) {
  const metodo = (opts && opts.method) || 'GET';
  const cuerpo = opts && opts.body ? JSON.parse(opts.body) : null;
  llamadas.push({ url, metodo, cuerpo });

  if (url.includes('/api/auth/verify'))                return { valid: true };
  if (url.includes('/api/espacios'))                   return ESPACIOS;
  if (url.includes('/api/admin/espacios'))             return ESPACIOS;
  if (url.includes('/api/admin/usuarios/verificar'))   return { ok: true, usuario: USUARIOS.find(u => u.id === cuerpo.usuarioId) };
  if (url.includes('/api/admin/usuarios'))             return USUARIOS;
  if (url.includes('/api/admin/productos'))            return PRODUCTOS;
  if (url.includes('/api/admin/reservas?'))            return RESERVAS;
  if (url.includes('/api/profesores'))                 return [{ id:1, nombre:'Valentina López' }];
  if (url.includes('/api/admin/auditoria/resumen'))    return { personas: [] };
  if (url.includes('/api/admin/auditoria'))            return [{ id:1, fecha:HOY, createdAt:new Date().toISOString(), usuarioNombre:'Lucas', accion:'cobro.registrar', descripcion:'Cobró $7000 en Efectivo de Salvador', monto:7000 }];
  if (url.includes('/api/admin/caja'))                 return { desde:HOY, hasta:HOY, cobrado:12000, facturado:18500, porCobrar:6500, totalCanchas:11000, totalBuffet:7500, efectivo:7000, transferencia:5000, porMetodo:[{id:'efectivo',nombre:'Efectivo',emoji:'💵',color:'#22c55e',total:7000,operaciones:1},{id:'transferencia',nombre:'Transferencia',emoji:'🏦',color:'#3b82f6',total:5000,operaciones:1}], porUsuario:[{nombre:'Lucas',total:7000,operaciones:1,efectivo:7000,transferencia:0,otros:0}], porOrigen:[{id:'whatsapp',nombre:'WhatsApp',color:'#25d366',turnos:1,facturado:6000}], turnos:5, faltas:1, faltasDetalle:[{id:103,cliente:'Roberto Díaz',fecha:HOY,hora:'18:00',cancha:'Cancha 2',origen:'Online',monto:5000}], movimientos:[{id:9,pagador:'Salvador',monto:7000,metodo:'efectivo',metodoNombre:'Efectivo',metodoEmoji:'💵',usuarioNombre:'Lucas'}] };
  if (url.includes('/api/admin/buffet/ventas'))        return { total:7500, unidades:3, porProducto:[{nombre:'Sándwich',emoji:'🥪',unidades:1,total:4500}], porUsuario:[] };
  if (url.includes('/api/admin/reserva') && metodo === 'POST')  return { id: 999, ...cuerpo };
  if (url.includes('/api/admin/reserva') && metodo === 'PATCH') return { id: 101, ...cuerpo };
  if (url.includes('/api/torneos'))                    return [];
  return {};
}

const vc = new VirtualConsole();
const errores = [];
vc.on('jsdomError', e => errores.push('jsdomError: ' + (e.message || e)));
vc.on('error', (...a) => errores.push('console.error: ' + a.join(' ')));

(async () => {
  const dom = await JSDOM.fromFile(path.join(FRONT, 'admin2.html'), {
    runScripts: 'dangerously',
    resources: undefined,
    url: 'https://club.test/admin2.html',
    virtualConsole: vc,
    beforeParse(win) {
      win.localStorage.setItem('padelpro_token', 'tok');
      win.fetch = async (url, opts) => ({
        ok: true, status: 200,
        json: async () => respuesta(String(url), opts),
        text: async () => JSON.stringify(await respuesta(String(url), opts)),
      });
      win.requestAnimationFrame = cb => setTimeout(cb, 0);
      win.confirm = () => true;
      win.prompt = () => null;
      /* Los <script src> locales se inyectan a mano: jsdom no los trae del disco */
      const scripts = ['js/config.js', 'js/api.js', 'js/staff.js', 'js/admin2.js'];
      win.__cargarScripts = () => scripts.forEach(rel => {
        const el = win.document.createElement('script');
        el.textContent = fs.readFileSync(path.join(FRONT, rel), 'utf8');
        win.document.head.appendChild(el);
      });
    }
  });

  const win = dom.window;
  win.document.querySelectorAll('script[src]').forEach(s => s.remove());
  win.__cargarScripts();
  win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true }));

  const esperar = ms => new Promise(r => setTimeout(r, ms));
  /* const/let de un script clásico viven en el scope léxico global, no en window */
  const ev = expr => win.eval(expr);
  await esperar(700);

  console.log('\n— Carga —');
  chk(errores.length === 0, 'sin errores de JS' + (errores.length ? ': ' + errores.slice(0,3).join(' | ') : ''));
  chk(ev('CANCHAS_CONFIG').length === 6, 'espacios cargados del backend: ' + ev('CANCHAS_CONFIG').length);
  chk(ev('_reservasDB').length === 5, 'reservas sincronizadas: ' + ev('_reservasDB').length);

  console.log('\n— Deportes —');
  const tabs = win.document.querySelectorAll('.adm2-deporte-tab');
  chk(tabs.length === 4, 'una solapa por deporte: ' + tabs.length);
  chk([...tabs].some(t => t.textContent.includes('Tenis de mesa')), 'aparece Tenis de mesa');
  chk([...tabs].some(t => t.textContent.includes('Pickleball')),    'aparece Pickleball');
  chk([...tabs].some(t => t.textContent.includes('Beach')),         'aparece Beach vóley');
  chk(ev("canchasVisibles()").length === 3, 'con padel activo se ven 3 canchas');

  console.log('\n— Colores por origen —');
  const ocupados = [...win.document.querySelectorAll('.adm2-tl-segment.ocupado')];
  chk(ocupados.length === 4, 'franjas ocupadas dibujadas: ' + ocupados.length);
  const colores = ocupados.map(o => o.getAttribute('style'));
  chk(colores.some(c => c.toUpperCase().includes('#25D366')), 'WhatsApp pintado en verde WhatsApp');
  chk(colores.some(c => c.toUpperCase().includes('#B57BFF')), 'Profesor pintado en violeta');
  chk(colores.some(c => c.toUpperCase().includes('#4DA3FF')), 'Online pintado en azul');
  chk(colores.some(c => c.toUpperCase().includes('#8296B0')), 'Bloqueo pintado en gris');
  chk(!colores.some(c => c.toUpperCase().includes('#C8FF00')), 'ningún origen usa el lima de la marca');
  chk(win.document.querySelectorAll('.adm2-tl-segment.falta').length === 1, 'la falta se marca en la grilla');
  chk(win.document.querySelector('.adm2-tl-falta').textContent.includes('Faltó'), 'dice que faltó');
  chk([...win.document.querySelectorAll('.adm2-pago-badge')].some(b => b.textContent.includes('Falta $6.500')), 'muestra el saldo que falta cobrar');
  chk(![...win.document.querySelectorAll('.adm2-pago-badge, .adm2-tl-label')].some(b => /^[A-ZÁÉÍÓÚÑ ·]{5,}$/.test(b.textContent.trim())), 'nada escrito todo en mayúscula');
  chk([...win.document.querySelectorAll('.adm2-tl-resumen')].some(c => c.textContent.includes('2 aguas')), 'la franja cuenta lo que consumió');
  chk(win.document.querySelector('.adm2-origen-leyenda').textContent.includes('WhatsApp'), 'leyenda de colores presente');

  console.log('\n— Turnos libres en el cuadrante —');
  const tiras = win.document.querySelectorAll('.adm2-libres');
  chk(tiras.length === 3, 'cada cancha muestra sus huecos: ' + tiras.length);
  const chips3 = [...win.document.querySelectorAll('#timeline-3')].length
    ? [...win.document.querySelectorAll('.adm2-cancha-card')].find(c => c.textContent.includes('Cancha 3'))
    : null;
  const chipsC3 = [...chips3.querySelectorAll('.adm2-libre-chip')].map(b => b.textContent.trim());
  chk(chipsC3.length > 0, 'la cancha 3 ofrece horarios: ' + chipsC3.slice(0,5).join(' '));
  chk(!chipsC3.includes('19:00'), 'no ofrece las 19:00, que está ocupada');
  ev("setDurLibres(3, 120)");
  await esperar(60);
  const card3b = [...win.document.querySelectorAll('.adm2-cancha-card')].find(c => c.textContent.includes('Cancha 3'));
  chk(card3b.textContent.includes('Libre para 2h'), 'cambia la duración y recalcula');
  ev("setDurLibres(3, 60)");
  await esperar(60);
  const card3c = [...win.document.querySelectorAll('.adm2-cancha-card')].find(c => c.textContent.includes('Cancha 3'));
  const hora1 = card3c.querySelector('.adm2-libre-chip').textContent.trim();
  ev(`abrirAltaRapida(3,'${hora1}',60)`);
  await esperar(80);
  const card3d = [...win.document.querySelectorAll('.adm2-cancha-card')].find(c => c.textContent.includes('Cancha 3'));
  chk(!!card3d.querySelector('.adm2-ar'), 'tocar un horario abre el alta ahí mismo');
  chk(!!card3d.querySelector('#ar-nombre-3'), 'con el campo de nombre listo');
  ev("cerrarAltaRapida()");
  await esperar(60);

  console.log('\n— Panel del turno —');
  const idx = [...win.document.querySelectorAll('#timeline-3 .adm2-tl-segment')].findIndex(s => s.className.includes('ocupado'));
  ev(`handleOcupadoClick(3, 'k-wa', ${idx})`);
  await esperar(60);
  const panel = win.document.querySelector('#adm2-modal-turno.visible .adm2-modal-card');
  chk(!!panel, 'el turno se abre en ventana centrada, no desplegado abajo');
  const t = panel ? panel.textContent : '';
  chk(t.includes('Salvador'),        'muestra el cliente');
  chk(t.includes('WhatsApp'),        'muestra el origen');
  chk(t.includes('Cargado por Lucas'), 'muestra quién lo cargó');
  chk(t.includes('$13.500'),         'total = cancha + buffet');
  chk(t.includes('$7.000'),          'muestra lo ya pagado');
  chk(t.includes('$6.500'),          'muestra el saldo');
  chk(t.includes('Vino') && t.includes('Faltó'), 'botones de asistencia');
  chk(t.includes('cobró Lucas'),     'dice quién cobró');

  console.log('\n— Consumiciones desde la grilla —');
  ev("closeActivePanel()");
  await esperar(40);
  const segMartin = [...win.document.querySelectorAll('.adm2-tl-segment.ocupado')].find(s2 => s2.textContent.includes('Grupo iniciación'));
  chk(!!segMartin.querySelector('.adm2-tl-accion'), 'la franja del turno tiene el atajo de consumición');
  chk(segMartin.textContent.includes('Agregar consumición'), 'el botón dice Agregar consumición');
  const idxWa = [...win.document.querySelectorAll('#timeline-3 .adm2-tl-segment')].findIndex(s2 => s2.className.includes('ocupado'));
  ev(`abrirBuffetDeTurno(3, 'k-wa', ${idxWa})`);
  await esperar(120);
  const pBuf = win.document.querySelector('#adm2-modal-turno.visible .adm2-modal-card');
  chk(!!pBuf && !!pBuf.querySelector('.adm2-carta-item'), 'el atajo abre la ventana directo en los productos');
  chk(win.document.body.classList.contains('adm2-sin-scroll'), 'el fondo queda fijo mientras la ventana está abierta');
  chk([...pBuf.querySelectorAll('.adm2-panel-solapa')].find(t => t.className.includes('active')).textContent.includes('Consumiciones'),
      'abre directo en Consumiciones, sin toques extra');
  chk(!pBuf.textContent.toLowerCase().includes('buffet'), 'en el turno no se habla de "buffet"');

  console.log('\n— Consumiciones dentro del turno —');
  ev("panelSolapa('buffet', 'k-wa')");
  await esperar(30);
  const prodBtns = win.document.querySelectorAll('#adm2-modal-turno .adm2-carta-item');
  chk(prodBtns.length === 3, 'catálogo tocable: ' + prodBtns.length + ' productos');
  chk([...prodBtns].every(b => !/[\u{1F300}-\u{1FAFF}]/u.test(b.textContent)), 'los productos no tienen emoji');
  chk([...prodBtns].every(b => b.querySelectorAll('.adm2-step').length === 2), 'cada producto tiene su − y su +');

  /* Stepper: se pone la cantidad sin tocar cinco veces */
  ev("cartaSumar(1, 1); cartaSumar(1, 1); cartaSumar(1, 1)");
  await esperar(60);
  const conCant = win.document.querySelector('#adm2-modal-turno .adm2-carta-item.con-cant');
  chk(!!conCant && conCant.querySelector('.adm2-step-n').textContent === '3', 'el + acumula: 3 de una');
  ev("cartaSumar(1, -1)");
  await esperar(60);
  chk(win.document.querySelector('#adm2-modal-turno .adm2-carta-item.con-cant .adm2-step-n').textContent === '2',
      'el − resta sin mandar nada');
  chk(!!win.document.querySelector('#adm2-modal-turno .adm2-pend'), 'muestra lo que está por agregarse');
  ev("_pend = {}; clearTimeout(_pendTimer); repintarPanel('k-wa')");
  await esperar(60);
  chk(win.document.querySelector('#adm2-modal-turno .adm2-consumo-row').textContent.includes('aguas'), 'lista lo consumido en plural: 2 aguas');

  console.log('\n— Resumen en palabras —');
  const resumenes = [...win.document.querySelectorAll('.adm2-tl-resumen')].map(e => e.textContent.trim());
  chk(resumenes.some(t => t === 'Jugó 1,5 horas, consumió 2 aguas y 1 sándwich'),
      'la grilla lo cuenta en castellano: ' + (resumenes.find(t => t.includes('consumió')) || '—'));
  chk(resumenes.some(t => t === 'Jugó 1 hora'), 'un turno sin consumo dice solo cuánto jugó');

  console.log('\n— Sin emoji en la sección de turnos —');
  ev("closeActivePanel()");
  await esperar(40);
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  const zonas = ['#adm2-canchas-grid', '#adm2-deporte-tabs', '#adm2-origen-leyenda'];
  zonas.forEach(z => {
    const el = win.document.querySelector(z);
    chk(el && !emoji.test(el.textContent), 'sin emoji en ' + z);
  });

  console.log('\n— Firma con PIN después de la acción —');
  const p = ev("pedirFirma('cobro.registrar', { titulo: 'Registrar cobro', detalle: 'Nacho \u00b7 $6.500 en Transferencia' })");
  await esperar(80);
  const firmaCard = win.document.querySelector('#nf-firma-overlay.visible');
  chk(!!firmaCard, 'el modal de firma aparece DESPUÉS de armar la acción');
  chk(firmaCard.textContent.includes('$6.500'), 'el modal dice qué se está firmando');
  chk(win.document.querySelectorAll('.nf-firma-persona').length === 3, 'ofrece las 3 personas');
  ev("firmaElegirUsuario(3)");
  await esperar(30);
  chk(win.document.querySelectorAll('.nf-firma-tecla').length === 12, 'teclado numérico');
  ev("firmaTecla('1')"); ev("firmaTecla('2')"); ev("firmaTecla('3')"); ev("firmaTecla('4')");
  await esperar(30);
  chk(win.document.querySelectorAll('.nf-firma-dot.lleno').length === 4, 'los 4 dígitos entran');
  ev("confirmarFirma()");
  const firma = await p;
  chk(firma && firma.usuarioId === 3 && firma.pin === '1234', 'devuelve la firma { usuarioId, pin }');
  chk(!win.document.querySelector('#nf-firma-overlay.visible'), 'el modal se cierra al firmar');

  console.log('\n— Permisos en el modal —');
  const p2 = ev("pedirFirma('reserva.liberar', { titulo: 'Liberar turno' })");
  await esperar(80);
  const personas = [...win.document.querySelectorAll('.nf-firma-persona-nombre')].map(e => e.textContent);
  chk(personas.includes('Lucas'), 'el empleado aparece igual, para poder intentar');
  const lucasBtn = [...win.document.querySelectorAll('.nf-firma-persona')].find(b => b.textContent.includes('Lucas'));
  chk(lucasBtn.className.includes('sin-permiso'), 'a Lucas se le marca que no tiene permiso');
  chk(lucasBtn.textContent.includes('sin permiso'), 'y se lo dice con todas las letras');
  const nachoBtn = [...win.document.querySelectorAll('.nf-firma-persona')].find(b => b.textContent.includes('Nacho'));
  chk(!nachoBtn.className.includes('sin-permiso'), 'el jefe aparece habilitado');
  ev("firmaElegirUsuario(3)");
  await esperar(60);
  chk(win.document.querySelector('.nf-firma-aviso.sin-permiso').textContent.includes('Hace falta el código de un jefe'),
      'al elegirlo avisa que hace falta el código del jefe');
  ev("cancelarFirma()");
  chk((await p2) === null, 'cancelar devuelve null y no manda nada');

  console.log('\n— Cambio de deporte —');
  ev("adm2SetDeporte('tenis_mesa')");
  await esperar(60);
  chk(ev("canchasVisibles()").length === 1, 'tenis de mesa: 1 mesa');
  chk(win.document.querySelector('#adm2-canchas-grid').textContent.includes('Mesa 1'), 'la grilla cambia a la mesa');
  chk(win.document.querySelector('#adm2-canchas-grid').textContent.includes('Ping pong Juan'), 'muestra el turno de la mesa');
  ev("adm2SetDeporte('padel')");
  await esperar(40);

  console.log('\n— Pantallas nuevas —');
  ev("_desbloqueos['caja.ver'] = { desde: Date.now() }; _desbloqueos['auditoria.ver'] = { desde: Date.now() };");
  await ev("renderCaja()");      await esperar(80);
  const caja = win.document.querySelector('#adm2-caja-cont').textContent;
  chk(caja.includes('$7.000') && caja.includes('Efectivo'),      'caja: efectivo separado');
  chk(caja.includes('$5.000') && caja.includes('Transferencias'), 'caja: transferencias separadas');
  chk(caja.includes('Roberto Díaz'),                              'caja: lista las faltas');
  chk(caja.includes('cobró Lucas'),                               'caja: dice quién cobró cada movimiento');

  await ev("renderBuffet()");    await esperar(80);
  const buffet = win.document.querySelector('#adm2-buffet-cont').textContent;
  chk(buffet.includes('Agua 500ml') && buffet.includes('stock 46'), 'buffet: catálogo con stock');

  await ev("renderPersonal()");  await esperar(150);
  const personal = win.document.querySelector('#adm2-personal-cont').textContent;
  chk(personal.includes('Salvador') && personal.includes('Dueño'), 'personal: roles listados');
  chk(personal.includes('Cobró $7000 en Efectivo de Salvador'),    'auditoría: se ve quién hizo qué');

  console.log('\n— Caja protegida por PIN —');
  ev("bloquearTodo()");
  const tabCaja = [...win.document.querySelectorAll('.adm2-tab')].find(t => t.textContent.trim() === 'Caja');
  win.adm2SwitchTab('caja', tabCaja);
  await esperar(120);
  chk(!!win.document.querySelector('#nf-firma-overlay.visible'), 'abrir Caja pide PIN');
  const lucasCaja = [...win.document.querySelectorAll('.nf-firma-persona')].find(b => b.textContent.includes('Lucas'));
  chk(lucasCaja && lucasCaja.className.includes('sin-permiso'), 'al empleado se le marca que no puede abrir la Caja');
  ev("cancelarFirma()");
  await esperar(120);
  chk(win.document.querySelector('#adm2-caja-cont').textContent.includes('bloqueada'), 'si cancela, la Caja queda bloqueada');
  chk(win.document.querySelector('#adm2-view-turnos').classList.contains('active'), 'vuelve a Turnos');

  console.log('\n— Salón: mesas —');
  win.__mesasDemo = true;
  const tabSalon = [...win.document.querySelectorAll('.adm2-tab')].find(t => t.textContent.trim().startsWith('Salón'));
  chk(!!tabSalon, 'existe la pestaña Salón');
  chk(!!win.document.querySelector('#adm2-salon-cont'), 'existe el contenedor del salón');
  chk(typeof win.renderSalon === 'function' && typeof win.abrirMesaPanel === 'function' &&
      typeof win.cartaEnviar === 'function' && typeof win.cobrarMesa === 'function' &&
      typeof win.cerrarMesa === 'function', 'el flujo de mesa está completo');

  console.log('\n— Nada se mandó sin firma —');
  const mutaciones = llamadas.filter(l => l.metodo !== 'GET' && !l.url.includes('verificar'));
  chk(mutaciones.length === 0, 'no hubo mutaciones sin firmar (' + mutaciones.length + ')');

  chk(errores.length === 0, 'sin errores de JS al final' + (errores.length ? ': ' + errores.slice(0,3).join(' | ') : ''));

  console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLA(S)`);
  process.exit(fallas === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR:', e.message); console.error(e.stack.split('\n').slice(0,8).join('\n')); process.exit(1); });
