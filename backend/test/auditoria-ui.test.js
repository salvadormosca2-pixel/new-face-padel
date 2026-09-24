/*
  Auditoría de la interfaz, botón por botón.

  1) Estática: cada onclick/onsubmit/oninput/onchange del HTML y de las
     plantillas del JS tiene que apuntar a una función que exista en los
     scripts que esa página carga. Un botón que llama a algo inexistente
     no falla al cargar: falla cuando alguien lo toca.
  2) Dinámica: se carga cada página y cada pestaña del panel en jsdom, con
     el backend real del demo, y se anotan los errores de JavaScript.
*/
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path'), http = require('http');
const FRONT = path.join(__dirname, '..', '..', 'frontend');

const pedir = (u, o = {}) => new Promise((res, rej) => {
  const U = new URL(u);
  /* Node solo encuadra el cuerpo con chunked en POST/PUT/PATCH; a un DELETE con
     cuerpo hay que ponerle Content-Length, como hace un navegador. */
  const cuerpo = o.body ? Buffer.from(o.body) : null;
  const headers = { ...(o.headers || {}), ...(cuerpo ? { 'Content-Length': cuerpo.length } : {}) };
  const r = http.request({ hostname: U.hostname, port: U.port, path: U.pathname + U.search, method: o.method || 'GET', headers },
    x => { let b = ''; x.on('data', d => b += d); x.on('end', () => res({ ok: x.statusCode < 400, status: x.statusCode, body: b })); });
  r.on('error', rej); if (o.body) r.write(o.body); r.end();
});

let fallas = 0;
const chk = (c, m) => { if (!c) fallas++; console.log((c ? '  ok  ' : ' FALLA ') + m); };

/* ── 1. Estática ──────────────────────────────────────────── */
const paginas = ['index.html', 'reservar.html', 'torneos.html', 'profesores.html', 'premios.html', 'admin2.html'];
const RE_HANDLER = /\bon(?:click|submit|input|change|keydown)\s*=\s*["']\s*(?:event\.stopPropagation\(\);\s*)?(?:if\s*\([^)]*\)\s*)?([A-Za-z_$][\w$.]*)\s*\(/g;

function scriptsDe(html) {
  return [...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]);
}
function definidas(codigo) {
  const set = new Set();
  for (const m of codigo.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) set.add(m[1]);
  for (const m of codigo.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function|[A-Za-z_$][\w$]*\s*=>)/gm)) set.add(m[1]);
  for (const m of codigo.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=/g)) set.add(m[1]);
  /* Objetos con métodos (AC.doLogin, api.x): se anotan como OBJ.metodo */
  for (const obj of codigo.matchAll(/\b(?:const|let|var)\s+([A-Z][\w$]*)\s*=\s*\(?\s*function\s*\(\)\s*\{[\s\S]*?return\s*\{([\s\S]*?)\};\s*\}\)\(\)/g)) {
    for (const m of obj[2].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*[,:}]/gm)) set.add(obj[1] + '.' + m[1]);
  }
  return set;
}

console.log('\n— Estática: cada botón apunta a una función que existe —');
const resumenEstatico = {};
for (const pagina of paginas) {
  const html = fs.readFileSync(path.join(FRONT, pagina), 'utf8');
  const codigos = scriptsDe(html).map(s => { try { return fs.readFileSync(path.join(FRONT, s), 'utf8'); } catch { return ''; } });
  const inline = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const todo = [...codigos, ...inline].join('\n');
  const defs = definidas(todo);

  const llamadas = new Set();
  for (const fuente of [html, ...codigos]) for (const m of fuente.matchAll(RE_HANDLER)) llamadas.add(m[1]);

  const NATIVOS = /^(document|window|event|this|location|history|console|navigator)\./;
  const PALABRAS = new Set(['if', 'for', 'while', 'switch', 'return']);
  const faltan = [...llamadas].filter(n => {
    if (PALABRAS.has(n) || NATIVOS.test(n) || defs.has(n)) return false;
    if (n.includes('.')) { const [o, met] = n.split('.'); return !(defs.has(o + '.' + met) || (defs.has(o) && new RegExp(`\\b${met}\\s*[:(]`).test(todo))); }
    return !new RegExp(`\\b${n}\\s*[:=]\\s*(async\\s*)?(function|\\()`).test(todo);
  });
  resumenEstatico[pagina] = { total: llamadas.size, faltan };
  chk(faltan.length === 0, `${pagina.padEnd(15)} ${String(llamadas.size).padStart(3)} handlers` + (faltan.length ? '  → sin definir: ' + faltan.join(', ') : ''));
}

/* ── 2. Dinámica ──────────────────────────────────────────── */
(async () => {
  const base = 'http://localhost:4000';
  const login = await pedir(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'demo' }) });
  if (!login.ok) { console.log('\n  (demo no corre en :4000: salteo la parte dinámica)'); process.exit(fallas ? 1 : 0); }
  const tok = JSON.parse(login.body).token;

  async function cargar(pagina) {
    const errores = [];
    const vc = new VirtualConsole(); vc.on('jsdomError', e => errores.push(e.message.split('\n')[0]));
    const dom = await JSDOM.fromFile(path.join(FRONT, pagina), {
      runScripts: 'dangerously', url: base + '/' + pagina, virtualConsole: vc,
      beforeParse(w) {
        w.localStorage.setItem('padelpro_token', tok);
        w.fetch = async (u, o = {}) => {
          const f = String(u).startsWith('http') ? String(u) : base + u;
          const r = await pedir(f, { ...o, headers: { ...(o.headers || {}), Authorization: 'Bearer ' + tok } });
          if (process.env.AUDIT_DEBUG && ((o.method || 'GET') !== 'GET' || !r.ok || !r.body)) console.log('    [http] ' + (o.method || 'GET') + ' ' + u + ' → ' + r.status + ' ' + (r.body || '(vacío)').slice(0, 120));
          return { ok: r.ok, status: r.status, json: async () => JSON.parse(r.body), text: async () => r.body };
        };
        w.requestAnimationFrame = cb => setTimeout(cb, 0); w.scrollTo = () => {}; w.confirm = () => true; w.prompt = () => null; w.alert = () => {};
        /* config.js apunta a producción: acá el backend es el demo local */
        w.__c = () => scriptsDe(fs.readFileSync(path.join(FRONT, pagina), 'utf8')).filter(rel => !/config\.js$/.test(rel)).forEach(rel => { const e = w.document.createElement('script'); try { e.textContent = fs.readFileSync(path.join(FRONT, rel), 'utf8'); w.document.head.appendChild(e); } catch {} });
      }
    });
    const w = dom.window; w.document.querySelectorAll('script[src]').forEach(s => s.remove());
    w.eval("window.__API_URL__=''; window.__DEMO_MODE__=false;"); w.__c();
    w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
    await new Promise(r => setTimeout(r, 900));
    return { w, errores };
  }

  console.log('\n— Dinámica: páginas públicas —');
  for (const pagina of paginas.filter(p => p !== 'admin2.html')) {
    const { errores } = await cargar(pagina);
    chk(errores.length === 0, pagina.padEnd(15) + (errores.length ? ' → ' + errores.slice(0, 2).join(' | ') : ' carga sin errores'));
  }

  console.log('\n— Dinámica: cada pestaña del panel —');
  const { w, errores } = await cargar('admin2.html');
  chk(errores.length === 0, 'carga inicial' + (errores.length ? ' → ' + errores.join(' | ') : ''));
  w.eval("window.pedirFirma = async () => ({ usuarioId: 1, pin: '1111' }); _desbloqueos['caja.ver']={desde:Date.now()}; _desbloqueos['auditoria.ver']={desde:Date.now()};");
  const tabs = ['dashboard', 'turnos', 'mensajes', 'torneos', 'fijos', 'salon', 'cocina', 'caja', 'buffet', 'finanzas', 'usuarios', 'personal', 'premios'];
  for (const t of tabs) {
    const antes = errores.length;
    const el = w.document.querySelector(`.adm2-tab[data-tab="${t}"]`);
    try { w.adm2SwitchTab(t, el); } catch (e) { errores.push(t + ': ' + e.message); }
    await new Promise(r => setTimeout(r, 700));
    const nuevos = errores.slice(antes);
    chk(nuevos.length === 0, ('pestaña ' + t).padEnd(20) + (nuevos.length ? ' → ' + nuevos.slice(0, 2).join(' | ') : ' ok'));
  }

  console.log('\n— Dinámica: el asistente, la ventana del turno y la mesa —');
  let antes = errores.length;
  await w.eval('abrirAsistente()'); await new Promise(r => setTimeout(r, 400)); w.eval('cerrarAsistente()');
  chk(errores.length === antes, 'asistente abre y cierra');
  w.adm2SwitchTab('turnos', w.document.querySelector('.adm2-tab[data-tab="turnos"]')); await new Promise(r => setTimeout(r, 500));
  const seg = [...w.document.querySelectorAll('.adm2-tl-segment.ocupado')][0];
  antes = errores.length;
  if (seg) { seg.click(); await new Promise(r => setTimeout(r, 300)); w.eval("panelSolapa('buffet', activePanelInfo && activePanelInfo.reservaId)"); await new Promise(r => setTimeout(r, 200)); w.eval('closeActivePanel()'); }
  chk(errores.length === antes, 'ventana del turno: abre, cambia de solapa, cierra');
  w.adm2SwitchTab('salon', w.document.querySelector('.adm2-tab[data-tab="salon"]')); await new Promise(r => setTimeout(r, 700));
  antes = errores.length;
  const mesa = [...w.document.querySelectorAll('.adm2-mesa')][0];
  if (mesa) { mesa.click(); await new Promise(r => setTimeout(r, 900)); w.eval("cartaRubro('bebida'); cartaBuscar('agu'); cartaBuscar('')"); await new Promise(r => setTimeout(r, 200)); w.eval('cerrarMesaPanel()'); }
  chk(errores.length === antes, 'mesa: abre, filtra la carta, cierra');

  console.log('\n— Dinámica: flujos que escriben, contra el backend real —');
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  w.eval("window.__toasts = []; window.toast = (m, t) => __toasts.push((t || 'info') + ': ' + m);");
  const flujo = async (nombre, fn) => {
    const antes = errores.length;
    w.eval('__toasts.length = 0');
    let err = null;
    try { await fn(); } catch (e) { err = e; }
    await esperar(300);
    const nuevos = errores.slice(antes);
    const toasts = w.eval('__toasts.slice()');
    const malo = err || nuevos.length;
    chk(!malo, nombre + (malo ? ' → ' + (err ? err.message : nuevos[0]) + (toasts.length ? '   [toasts: ' + toasts.join(' | ') + ']' : '') : ''));
  };

  /* Turnos: alta rápida en un hueco, cobro dividido, consumición, falta, liberar */
  w.adm2SwitchTab('turnos', w.document.querySelector('.adm2-tab[data-tab="turnos"]')); await esperar(500);
  const NOMBRE = 'Auditoría ' + Date.now().toString().slice(-5);
  let idTurno = null;
  await flujo('turnos · alta rápida desde el cuadrante', async () => {
    const chip = w.document.querySelector('.adm2-libre-chip'); if (!chip) throw new Error('no hay huecos');
    chip.click(); await esperar(200);
    const inp = w.document.querySelector('[id^="ar-nombre-"]'); inp.value = NOMBRE;
    const id = parseInt(inp.id.replace('ar-nombre-', ''));
    await w.eval(`confirmarAltaRapida(${id})`); await esperar(900);
    idTurno = w.eval(`(_reservasDB.find(r => r.cliente_nombre === ${JSON.stringify(NOMBRE)}) || {}).id`);
    if (!idTurno) throw new Error('el turno no apareció en la grilla');
  });
  await flujo('turnos · abrir el turno nuevo y cobrar dividido (Ana efectivo + Beto transferencia) en un paso', async () => {
    const seg = [...w.document.querySelectorAll('.adm2-tl-segment.ocupado')].find(s => s.textContent.includes(NOMBRE));
    if (!seg) throw new Error('no está la franja del turno nuevo');
    seg.click(); await esperar(300);
    if (w.eval('_panelSolapa') !== 'cuenta') throw new Error('abrió en la solapa ' + w.eval('_panelSolapa') + ' en vez de Cobrar');
    const rid = w.eval('activePanelInfo.reservaId');
    w.eval("_cobro.filas = [{ pagador: 'Ana', monto: '1000', metodo: 'efectivo' }, { pagador: 'Beto', monto: '500', metodo: 'transferencia' }]");
    await w.eval(`confirmarCobro('${rid}')`); await esperar(900);
    const t = w.document.querySelector('#adm2-modal-turno .adm2-cuenta').textContent;
    if (!t.includes('Pagado')) throw new Error('la cuenta no muestra el pago');
    const r2 = w.eval(`reservaPorId('${rid}')`);
    if (!(r2.pagos || []).some(p => p.pagador === 'Beto')) throw new Error('no quedó el segundo pago');
  });
  await flujo('turnos · marcar falta y volver a "sin marcar"', async () => {
    const rid = w.eval('activePanelInfo.reservaId');
    await w.eval(`marcarAsistenciaTurno('${rid}','falta')`); await esperar(800);
    if (!w.document.querySelector('#adm2-modal-turno .adm2-asis-btn.sel-falta')) throw new Error('no quedó marcada la falta');
    await w.eval(`marcarAsistenciaTurno('${rid}','pendiente')`); await esperar(800);
  });
  await flujo('turnos · cargar una consumición con el + y que se envíe sola', async () => {
    const rid = w.eval('activePanelInfo.reservaId');
    w.eval(`panelSolapa('buffet','${rid}')`); await esperar(200);
    const pid = w.eval("(_cartas.cancha.find(p => p.nombre === 'Agua 500ml')||{}).id");
    w.eval(`cartaSumar(${pid},1)`); await esperar(1600);
    const t = w.document.querySelector('#adm2-modal-turno').textContent;
    if (!/1 agua/i.test(t)) throw new Error('el agua no quedó cargada');
  });
  await flujo('turnos · liberar el turno de prueba', async () => {
    const rid = w.eval('activePanelInfo.reservaId');
    await w.eval(`liberarTurno('${rid}',${JSON.stringify(NOMBRE)})`); await esperar(900);
    if (w.eval(`_reservasDB.some(r => r.id === '${rid}' && r.estado_reserva !== 'cancelada')`)) throw new Error('sigue en la grilla');
  });

  /* Fijos: crear, pausar, reactivar, eliminar */
  w.adm2SwitchTab('fijos', w.document.querySelector('.adm2-tab[data-tab="fijos"]')); await esperar(600);
  await flujo('fijos · crear, pausar, reactivar y eliminar', async () => {
    const NF = 'Fijo ' + NOMBRE;
    /* Una hora distinta por corrida, para no chocar con fijos de corridas anteriores */
    const hora = String(15 + (Date.now() % 8)).padStart(2, '0') + ':30';
    w.eval('nuevoFijo()'); await esperar(200);
    w.eval(`_fijoForm.cliente_nombre=${JSON.stringify(NF)}; _fijoForm.cancha_id=8; _fijoForm.hora_inicio='${hora}'; _fijoForm.duracion_minutos=60; _fijoForm.dias=[3]`);
    await w.eval('guardarFijo()'); await esperar(1500);
    const f = w.eval(`(_fijos.find(x => x.cliente_nombre === ${JSON.stringify(NF)})||{}).id`); if (!f) throw new Error('no se creó');
    await w.eval(`pausarFijo(${f}, false)`); await esperar(900);
    if (w.eval(`_fijos.find(x => x.id === ${f}).activo`)) throw new Error('no se pausó');
    await w.eval(`pausarFijo(${f}, true)`);  await esperar(900);
    if (!w.eval(`_fijos.find(x => x.id === ${f}).activo`)) throw new Error('no se reactivó');
    await w.eval(`borrarFijo(${f})`);        await esperar(900);
    if (w.eval(`(_fijos.find(x => x.id === ${f})||{}).activo`)) throw new Error('sigue activo');
  });

  /* Salón: abrir mesa, cargar con +, cobrar todo, cerrar */
  w.adm2SwitchTab('salon', w.document.querySelector('.adm2-tab[data-tab="salon"]')); await esperar(700);
  await flujo('salón · abrir mesa, 2 cervezas, cobro dividido en un paso (Salva efectivo + Nacho el resto), cerrar', async () => {
    const libre = w.eval("(_mesas.find(m => !m.ocupada) || _mesas[0] || {}).id"); if (!libre) throw new Error('no hay mesas');
    await w.eval(`abrirMesaPanel(${libre})`); await esperar(1200);
    const pid = w.eval("(_cartas.mesa.find(p => p.nombre === 'Cerveza')||{}).id");
    w.eval(`cartaSumar(${pid},1); cartaSumar(${pid},1)`); await esperar(1800);
    const cid = w.eval('_mesaAbierta.cuentaId');
    if (!w.document.querySelector('#adm2-modal-mesa').textContent.includes('2 cervezas')) throw new Error('las cervezas no quedaron');
    /* Cobro dividido: dos filas, un solo Cobrar */
    w.eval("_cobroMesa.filas = [{ pagador: 'Salva', monto: '1000', metodo: 'efectivo' }, { pagador: 'Nacho', monto: '', metodo: 'transferencia' }]");
    await w.eval(`cobrarMesa(${cid})`); await esperar(1200);
    const cta = w.eval('_mesaAbierta && _mesaAbierta.cuenta');
    if (!cta || cta.saldo > 0.009) throw new Error('la mesa no quedó saldada: saldo ' + (cta && cta.saldo));
    if (!(cta.pagos || []).some(p => p.pagador === 'Salva') || !(cta.pagos || []).some(p => p.pagador === 'Nacho')) throw new Error('no quedaron los dos pagos');
    w.prompt = () => 'ok';
    const saldo = w.eval(`(_mesas.find(m => m.id === ${libre}).cuenta || {}).saldo || 0`);
    await w.eval(`cerrarMesa(${cid}, 'Mesa auditoría', ${saldo})`); await esperar(1200);
    if (w.eval(`_mesas.find(m => m.id === ${libre}).ocupada`)) throw new Error('la mesa sigue ocupada');
  });

  /* Cocina: pasar una comanda por los tres estados */
  w.adm2SwitchTab('cocina', w.document.querySelector('.adm2-tab[data-tab="cocina"]')); await esperar(800);
  await flujo('cocina · empezar → listo → entregado', async () => {
    let id = w.eval("(_cocina.comandas.find(c => c.estado === 'pendiente')||{}).id");
    if (!id) {
      /* Se fabrica una: una pizza a la primera mesa que haya */
      w.adm2SwitchTab('salon', w.document.querySelector('.adm2-tab[data-tab="salon"]')); await esperar(700);
      const m = w.eval("(_mesas[0]||{}).id"); await w.eval(`abrirMesaPanel(${m})`); await esperar(1200);
      const pid = w.eval("(_cartas.mesa.find(p => /pizza/i.test(p.nombre))||{}).id");
      w.eval(`cartaSumar(${pid},1)`); await esperar(1800); w.eval('cerrarMesaPanel()'); await esperar(400);
      w.adm2SwitchTab('cocina', w.document.querySelector('.adm2-tab[data-tab="cocina"]')); await esperar(900);
      id = w.eval("(_cocina.comandas.find(c => c.estado === 'pendiente')||{}).id");
      if (!id) throw new Error('no se pudo generar una comanda');
    }
    for (const e of ['preparando', 'listo', 'entregado']) { await w.eval(`pasarComanda(${id},'${e}')`); await esperar(600); }
    if (w.eval(`_cocina.comandas.some(c => c.id === ${id} && c.estado !== 'entregado')`)) throw new Error('no llegó a entregado');
  });

  /* Caja: navegar fechas y cerrar con arqueo */
  w.adm2SwitchTab('caja', w.document.querySelector('.adm2-tab[data-tab="caja"]')); await esperar(800);
  await flujo('caja · ayer, hoy, y cierre con arqueo', async () => {
    await w.eval('cajaCambiarFecha(-1)'); await esperar(600);
    await w.eval('_cajaFecha=null; renderCaja()'); await esperar(600);
    w.prompt = () => String(Math.round(w.eval('_cajaActual.efectivo')));
    await w.eval('abrirCierreCaja()'); await esperar(1000);
  });

  /* Finanzas: cambiar de mes y volver */
  w.adm2SwitchTab('finanzas', w.document.querySelector('.adm2-tab[data-tab="finanzas"]')); await esperar(800);
  await flujo('finanzas · mes anterior y volver', async () => { w.eval('finChangeMonth(-1)'); await esperar(700); w.eval('finChangeMonth(1)'); await esperar(700); });

  /* Productos y Personal: los botones que abren prompt no deben romper si se cancela */
  w.prompt = () => null;
  w.adm2SwitchTab('buffet', w.document.querySelector('.adm2-tab[data-tab="buffet"]')); await esperar(700);
  await flujo('productos · ficha nueva, ficha de edición con foto e ingredientes, reponer y baja cancelados', async () => {
    const id = w.eval('(_productos[0]||{}).id');
    await w.eval('nuevoProducto()'); await esperar(100);
    if (!w.document.querySelector('#adm2-modal-producto.visible .adm2-fp')) throw new Error('la ficha de producto no abrió');
    w.eval('cerrarFormProducto()');
    await w.eval(`editarProducto(${id})`); await esperar(100);
    if (!w.document.querySelector('#adm2-modal-producto.visible input[type=file]')) throw new Error('la ficha de edición no tiene el campo de foto');
    w.eval("fpAgregarOpcionTest = true; document.getElementById('fp-quitar-nombre').value = 'Sin sal'; fpAgregarOpcion('quitar')");
    if (!w.eval("_fp.opciones.some(o => o.nombre === 'Sin sal')")) throw new Error('no agregó el ingrediente');
    w.eval('cerrarFormProducto()');
    await w.eval(`reponer(${id})`); w.confirm = () => false; await w.eval(`darDeBajaProducto(${id})`); w.confirm = () => true;
  });
  w.adm2SwitchTab('personal', w.document.querySelector('.adm2-tab[data-tab="personal"]')); await esperar(900);
  await flujo('personal · alta/PIN/rol cancelados no rompen, filtro de auditoría', async () => {
    const id = w.eval('(_personal[0]||{}).id');
    await w.eval('nuevaPersona()'); await w.eval(`cambiarPin(${id})`); await w.eval(`cambiarRol(${id})`);
    w.eval("_audFiltro.accion='cobro.registrar'"); await w.eval('renderAuditoria()'); await esperar(600);
  });

  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
