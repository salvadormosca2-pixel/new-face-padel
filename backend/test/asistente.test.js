/*
  Prueba del asistente sin gastar un peso: un cliente falso que devuelve
  primero un pedido de herramienta y después la respuesta final. Las
  herramientas sí pegan al backend real (el demo en :4000), para verificar
  que el circuito completo —modelo → herramienta → HTTP → JSON → modelo— cierra.
*/
const http = require('http');
const { preguntar, crearEjecutor, HERRAMIENTAS } = require('../lib/asistente');

const pedir = (u, o = {}) => new Promise((res, rej) => {
  const U = new URL(u);
  /* Node solo encuadra el cuerpo con chunked en POST/PUT/PATCH; a un DELETE con
     cuerpo hay que ponerle Content-Length, como hace un navegador. */
  const cuerpo = o.body ? Buffer.from(o.body) : null;
  const headers = { ...(o.headers || {}), ...(cuerpo ? { 'Content-Length': cuerpo.length } : {}) };
  const r = http.request({ hostname: U.hostname, port: U.port, path: U.pathname + U.search, method: o.method || 'GET', headers },
    x => { let b = ''; x.on('data', d => b += d); x.on('end', () => res({ ok: x.statusCode < 400, body: b })); });
  r.on('error', rej); if (o.body) r.write(o.body); r.end();
});

let fallas = 0;
const chk = (c, m) => { if (!c) fallas++; console.log((c ? '  ok  ' : ' FALLA ') + m); };

(async () => {
  const base = 'http://localhost:4000';
  const login = await pedir(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'demo' }) });
  if (!login.ok) { console.log('  (demo no está corriendo en :4000, salteo)'); process.exit(0); }
  const token = 'Bearer ' + JSON.parse(login.body).token;
  const ejecutor = crearEjecutor({ baseUrl: base, authorization: token });

  console.log('\n— Herramientas —');
  chk(HERRAMIENTAS.length === 5, 'cinco herramientas, todas de lectura');
  chk(HERRAMIENTAS.every(h => h.input_schema.additionalProperties === false), 'esquemas cerrados (sin campos extra)');
  chk(HERRAMIENTAS.every(h => h.name.startsWith('ver_')), 'todas empiezan con ver_: ninguna modifica nada');

  const hoy = new Date().toISOString().slice(0, 10);
  const caja = await ejecutor.ver_caja({ desde: hoy, hasta: hoy });
  chk(typeof caja.cobrado === 'number' && Array.isArray(caja.porMetodo), 'ver_caja trae la caja real');
  const salon = await ejecutor.ver_salon_y_cocina({});
  chk(Array.isArray(salon.mesas) && salon.cocina, 'ver_salon_y_cocina trae mesas y cocina');
  let err = null; try { await ejecutor.ver_caja({ desde: 'ayer', hasta: hoy }); } catch (e) { err = e; }
  chk(!!err, 'una fecha mal armada se rechaza antes de pegar al servidor');

  console.log('\n— El ciclo completo, con un modelo simulado —');
  const llamadas = [];
  const clienteFalso = {
    beta: { messages: { create: async (params) => {
      llamadas.push(params);
      const ultimo = params.messages[params.messages.length - 1];
      const esResultado = Array.isArray(ultimo.content) && ultimo.content.some(b => b.type === 'tool_result');
      if (!esResultado) {
        return {
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'tu_1', name: 'ver_caja', input: { desde: hoy, hasta: hoy } }],
          usage: { input_tokens: 500, output_tokens: 40, cache_read_input_tokens: 0 }
        };
      }
      const datos = JSON.parse(ultimo.content[0].content);
      return {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: `Hoy cobramos $${Math.round(datos.cobrado)}, de los cuales $${Math.round(datos.efectivo)} en efectivo.` }],
        usage: { input_tokens: 900, output_tokens: 60, cache_read_input_tokens: 400 }
      };
    } } }
  };

  const r = await preguntar({ mensaje: '¿Cuánto cobramos hoy?', ejecutor, cliente: clienteFalso });
  chk(llamadas.length === 2, 'dos vueltas: pedido de herramienta y respuesta');
  chk(llamadas[0].model === 'claude-opus-5-5', 'modelo: claude-opus-5-5');
  chk(llamadas[0].fallbacks === 'default' && llamadas[0].betas.includes('server-side-fallback-2026-07-01'), 'fallback de refusal activado');
  chk(llamadas[0].system[0].cache_control?.type === 'ephemeral', 'el sistema se cachea');
  chk(!/\d{4}-\d{2}-\d{2}/.test(llamadas[0].system[0].text), 'el sistema no lleva fecha (no rompe la caché)');
  chk(/Hoy es \d{4}-\d{2}-\d{2}/.test(llamadas[0].messages[0].content), 'la fecha va en el mensaje');
  chk(llamadas[1].messages[1].role === 'assistant' && llamadas[1].messages[2].content[0].type === 'tool_result', 'el resultado vuelve como tool_result');
  chk(r.herramientas.join() === 'ver_caja', 'registra qué consultó: ' + r.herramientas.join());
  chk(/\$\d+/.test(r.respuesta), 'respuesta con números reales: ' + r.respuesta);
  chk(r.uso.input === 1400 && r.uso.cacheRead === 400, 'uso de tokens acumulado');

  console.log('\n— Refusal —');
  const rechaza = { beta: { messages: { create: async () => ({ stop_reason: 'refusal', content: [], usage: {} }) } } };
  const r2 = await preguntar({ mensaje: 'x', ejecutor, cliente: rechaza });
  chk(r2.respuesta.length > 0, 'un refusal devuelve un texto y no revienta');

  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
