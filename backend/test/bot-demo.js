/*
  Simulación completa del bot de WhatsApp: corre el mismo system message y las
  mismas tools que el flujo de n8n (n8n-workflow.json), contra el backend que se
  indique (por defecto la demo local en :4000). Imprime la charla como se vería
  en WhatsApp y la guarda en JSON para armar la demo.

  Uso:  ANTHROPIC_API_KEY=... node test/bot-demo.js [BASE_URL] [salida.json]
*/
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const BASE   = process.argv[2] || 'http://localhost:4000';
const SALIDA = process.argv[3] || '';
const raiz   = path.join(__dirname, '..', '..');
const hoy    = new Date().toLocaleDateString('en-CA', { timeZone: process.env.CLUB_TZ || 'America/Argentina/Catamarca' });

const system = fs.readFileSync(path.join(raiz, 'n8n-system-message.md'), 'utf8')
  .replace("{{ $now.format('yyyy-MM-dd') }}", hoy)
  + '\n\nEl cliente escribe desde el telefono 5493834123456 y en WhatsApp figura como "Juan". Si necesitas su telefono para puntos, reservas o perfil, usa ese numero sin pedirlo de nuevo.';

/* Las tools salen del workflow: misma descripción, misma URL, mismos parámetros */
const wf = JSON.parse(fs.readFileSync(path.join(raiz, 'n8n-workflow.json'), 'utf8'));
const defs = wf.nodes.filter(n => n.type.endsWith('toolHttpRequest')).map(n => {
  const ph = (n.parameters.placeholderDefinitions?.values || []);
  return {
    name: n.name, description: n.parameters.toolDescription,
    url: n.parameters.url.replace(/^https?:\/\/[^/]+/, BASE),
    method: n.parameters.method || 'GET', jsonBody: n.parameters.jsonBody || '',
    input_schema: { type: 'object', properties: Object.fromEntries(ph.map(p => [p.name, { type: p.type === 'number' ? 'number' : 'string', description: p.description }])), required: ph.map(p => p.name) }
  };
});

async function ejecutar(def, args) {
  const rellenar = s => s.replace(/\{(\w+)\}/g, (_, k) => args[k] === undefined ? '' : String(args[k]));
  const url = rellenar(def.url);
  const opts = { method: def.method, headers: { 'Content-Type': 'application/json' } };
  if (def.method === 'POST') opts.body = rellenar(def.jsonBody);
  const r = await fetch(url, opts);
  const txt = await r.text();
  return txt.slice(0, 6000);
}

const GUION = [
  'Hola!',
  'Quiero reservar una cancha',
  'Pádel',
  '1 hora y media',
  'Mañana',
  'Dale, el primer horario que me mostraste',
  'Juan Pérez, 3834123456, pago en efectivo',
  'Qué profes hay para tomar clases?',
  'Hay torneos próximamente? Cómo me anoto?',
  'Cuántos puntos tengo? Mi teléfono es 1145678901',
  'Dónde queda el club y cómo se puede pagar?',
  'Y para pickleball, hay algo mañana a la tarde? 1 hora',
];

(async () => {
  const client = new Anthropic();
  const historial = [];
  const charla = [];
  const tools = defs.map(d => ({ name: d.name, description: d.description, input_schema: d.input_schema }));

  for (const texto of GUION) {
    historial.push({ role: 'user', content: texto });
    charla.push({ de: 'cliente', texto });
    const usadas = [];
    let res = await client.messages.create({ model: 'claude-sonnet-5', max_tokens: 700, system, tools, messages: historial });
    while (res.stop_reason === 'tool_use') {
      historial.push({ role: 'assistant', content: res.content });
      const resultados = [];
      for (const b of res.content.filter(c => c.type === 'tool_use')) {
        const def = defs.find(d => d.name === b.name);
        const out = def ? await ejecutar(def, b.input) : '{"error":"tool desconocida"}';
        usadas.push({ tool: b.name, args: b.input });
        resultados.push({ type: 'tool_result', tool_use_id: b.id, content: out });
      }
      historial.push({ role: 'user', content: resultados });
      res = await client.messages.create({ model: 'claude-sonnet-5', max_tokens: 700, system, tools, messages: historial });
    }
    const respuesta = res.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    historial.push({ role: 'assistant', content: res.content });
    charla.push({ de: 'bot', texto: respuesta, tools: usadas });
    console.log('\n👤 ' + texto);
    if (usadas.length) console.log('   ⚙️  ' + usadas.map(u => u.tool + ' ' + JSON.stringify(u.args)).join(' · '));
    console.log('🤖 ' + respuesta.replace(/\n/g, '\n   '));
  }
  if (SALIDA) fs.writeFileSync(SALIDA, JSON.stringify({ fecha: hoy, base: BASE, charla }, null, 2));
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
