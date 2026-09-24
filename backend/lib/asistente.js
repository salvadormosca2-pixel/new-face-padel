/*
  Asistente del dueño.

  Responde en castellano preguntas sobre el negocio consultando el sistema:
  la caja, la deuda, las ventas, la auditoría, el salón y la cocina.

  Es de SOLO LECTURA. No cobra, no anula, no libera turnos. Cada herramienta
  pega a un endpoint que ya existe, con el mismo token de admin con el que
  entró la persona, así no hay un segundo camino a los datos que saltee los
  permisos. El modelo elige qué mirar; el sistema decide qué puede ver.
*/
const Anthropic = require('@anthropic-ai/sdk');
const { hoyClub, diasDesdeHoy } = require('./fechas');

/* Claude Opus 5.5: el recomendado en la documentación y más barato que Opus 5 ($4/$20 por MTok) */
const MODELO = process.env.ASISTENTE_MODELO || 'claude-opus-5-5';
const MAX_VUELTAS = 8;

/*
  Fecha en formato YYYY-MM-DD. Se valida a mano porque el modelo la arma
  a partir de "el mes pasado" o "esta semana" y puede equivocarse.
*/
function fechaValida(f) { return typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f); }

/* Las herramientas: pocas, específicas y solo de lectura */
const HERRAMIENTAS = [
  {
    name: 'ver_caja',
    description: 'Caja de un día o de un rango: total cobrado, efectivo vs transferencia vs otros, quién cobró cuánto, cuánto queda sin cobrar, turnos por origen y faltas. Usar para preguntas de plata del día o de un período.',
    input_schema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'Fecha inicial YYYY-MM-DD' },
        hasta: { type: 'string', description: 'Fecha final YYYY-MM-DD. Igual a desde para un solo día.' }
      },
      required: ['desde', 'hasta'], additionalProperties: false
    }
  },
  {
    name: 'ver_sin_cobrar',
    description: 'Lo que se jugó y no se cobró en un período: faltas (no vinieron, no pagaron), turnos jugados con saldo, y ranking de clientes que deben. Usar para "quién debe", "faltas", "plata en la calle".',
    input_schema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD' },
        hasta: { type: 'string', description: 'YYYY-MM-DD' }
      },
      required: ['desde', 'hasta'], additionalProperties: false
    }
  },
  {
    name: 'ver_ventas_productos',
    description: 'Consumiciones vendidas en un período, producto por producto: unidades, vendido, costo, ganancia, margen, stock actual, por rubro, quién cargó y qué anuló. Usar para "qué se vendió", "cuánto ganamos con", "stock", "anulaciones".',
    input_schema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD' },
        hasta: { type: 'string', description: 'YYYY-MM-DD' }
      },
      required: ['desde', 'hasta'], additionalProperties: false
    }
  },
  {
    name: 'ver_auditoria',
    description: 'Quién hizo qué: turnos cargados, cobros, anulaciones, consumiciones, faltas marcadas, cierres de caja. Se puede filtrar por persona (usuarioId) y por tipo de acción. Trae también un resumen por persona. Usar para "qué hizo Lucas", "quién anuló", "cuántos turnos cargó cada uno".',
    input_schema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD' },
        hasta: { type: 'string', description: 'YYYY-MM-DD' },
        accion: {
          type: 'string',
          description: 'Opcional. Una de: reserva.crear, reserva.liberar, reserva.asistencia, cobro.registrar, cobro.anular, consumicion.crear, consumicion.anular, caja.cerrar, mesa.abrir, mesa.cerrar, mesa.cerrar_con_saldo'
        }
      },
      required: ['desde', 'hasta'], additionalProperties: false
    }
  },
  {
    name: 'ver_salon_y_cocina',
    description: 'Estado en este momento: mesas ocupadas con su consumo y saldo, comida lista o en cocina por mesa, y el tablero de cocina (comandas nuevas, en preparación, listas, demoradas). Usar para "cómo está el salón ahora", "qué hay en cocina", "qué mesa debe".',
    input_schema: { type: 'object', properties: {}, additionalProperties: false }
  }
];

/*
  Cada herramienta pega al backend por HTTP con el token de la persona.
  Reusar las rutas evita duplicar la lógica de negocio acá y garantiza que el
  asistente ve exactamente lo mismo que el panel.
*/
function crearEjecutor({ baseUrl, authorization }) {
  async function get(ruta) {
    const res = await fetch(baseUrl + ruta, { headers: { Authorization: authorization } });
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || `HTTP ${res.status} en ${ruta}`);
    return cuerpo;
  }

  const rango = (i) => {
    if (!fechaValida(i.desde) || !fechaValida(i.hasta)) throw new Error('desde y hasta tienen que ser YYYY-MM-DD');
    return `desde=${i.desde}&hasta=${i.hasta}`;
  };

  return {
    ver_caja:             async (i) => get(`/api/admin/caja?${rango(i)}`),
    ver_sin_cobrar:       async (i) => get(`/api/admin/sin-cobrar?${rango(i)}`),
    ver_ventas_productos: async (i) => get(`/api/admin/buffet/ventas?${rango(i)}`),
    ver_auditoria:        async (i) => {
      const q = rango(i) + (i.accion ? `&accion=${encodeURIComponent(i.accion)}` : '') + '&limit=150';
      const [registros, resumen] = await Promise.all([
        get(`/api/admin/auditoria?${q}`),
        get(`/api/admin/auditoria/resumen?${rango(i)}`)
      ]);
      /* Al modelo le alcanza con lo esencial de cada registro */
      return {
        resumenPorPersona: resumen.personas,
        registros: registros.map(r => ({
          fecha: r.fecha, hora: r.createdAt, quien: r.usuarioNombre, rol: r.usuarioRol,
          accion: r.accionNombre || r.accion, descripcion: r.descripcion, monto: r.monto
        }))
      };
    },
    ver_salon_y_cocina:   async () => {
      const [mesas, cocina] = await Promise.all([get('/api/admin/mesas'), get('/api/admin/cocina')]);
      return {
        mesas: mesas.map(m => ({
          mesa: m.nombre, zona: m.zona, ocupada: m.ocupada,
          ...(m.cuenta ? {
            abiertaPor: m.cuenta.abiertaPor, minutosAbierta: m.cuenta.minutosAbierta,
            items: m.cuenta.items, total: m.cuenta.total, pagado: m.cuenta.pagado, saldo: m.cuenta.saldo,
            comidaLista: m.cuenta.comidaLista, enCocina: m.cuenta.enCocina
          } : {})
        })),
        cocina: cocina.resumen,
        comandas: cocina.comandas.map(c => ({
          numero: c.numero, lugar: c.lugar, estado: c.estadoNombre, minutos: c.minutos, urgencia: c.urgencia,
          mozo: c.mozo, platos: c.items.map(i => `${i.cantidad}x ${i.nombre}${i.detalle ? ' (' + i.detalle + ')' : ''}`)
        }))
      };
    }
  };
}

/*
  El sistema es estable a propósito: no lleva la fecha ni nada que cambie
  por pedido, para que la caché de prompt funcione. La fecha va en el mensaje.
*/
const SISTEMA = `Sos el asistente del dueño de New Face, un club de pádel con restaurante en Argentina.
Respondés preguntas sobre el negocio consultando el sistema con las herramientas. Sos de solo lectura: no podés cobrar, anular ni modificar nada, y si te lo piden decís que eso se hace desde el panel con el PIN de la persona.

Cómo respondés:
- En castellano rioplatense, directo, sin relleno. El dueño está en el celular.
- Con números concretos y en pesos con separador de miles ($12.500). Nunca inventes un número: si una herramienta no lo trae, decilo.
- Primero el dato que pidió, después el detalle si suma. Listas cortas, no tablas largas.
- Si la pregunta es de un período, elegí las fechas vos con la fecha de hoy que viene en el mensaje: "hoy" es un solo día, "esta semana" va del lunes a hoy, "este mes" del 1 a hoy, "ayer" es un día.
- Si algo llama la atención (anulaciones de una sola persona, mesas cerradas sin cobrar, faltas repetidas de un cliente, stock en cero), mencionalo aunque no te lo hayan preguntado. Sos los ojos del dueño.
- No expliques qué herramienta usaste.`;

/*
  Una pregunta, una respuesta. El historial viene del panel para que la
  conversación tenga memoria dentro de la sesión.
*/
async function preguntar({ mensaje, historial = [], ejecutor, cliente }) {
  const client = cliente || new Anthropic();
  const hoy = hoyClub();

  const contexto = `Hoy es ${hoy} (${new Date(hoy + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long' })}). Hace 7 días fue ${diasDesdeHoy(-7)}, hace 30 días fue ${diasDesdeHoy(-30)}.`;

  const messages = [
    ...historial.slice(-12).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') })),
    { role: 'user', content: `${contexto}\n\n${mensaje}` }
  ];

  const usadas = [];
  let uso = { input: 0, output: 0, cacheRead: 0 };

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const res = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
      tools: HERRAMIENTAS,
      output_config: { effort: 'medium' },
      messages
    });

    uso.input     += res.usage?.input_tokens || 0;
    uso.output    += res.usage?.output_tokens || 0;
    uso.cacheRead += res.usage?.cache_read_input_tokens || 0;

    if (res.stop_reason === 'refusal') {
      return { respuesta: 'No puedo responder eso.', herramientas: usadas, uso };
    }

    const pedidos = res.content.filter(b => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || pedidos.length === 0) {
      const texto = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return { respuesta: texto || 'No encontré nada para responder.', herramientas: usadas, uso };
    }

    messages.push({ role: 'assistant', content: res.content });

    /* Todos los resultados vuelven en un solo mensaje, aunque sean varios */
    const resultados = await Promise.all(pedidos.map(async p => {
      usadas.push(p.name);
      const fn = ejecutor[p.name];
      try {
        if (!fn) throw new Error(`Herramienta desconocida: ${p.name}`);
        const datos = await fn(p.input || {});
        return { type: 'tool_result', tool_use_id: p.id, content: JSON.stringify(datos) };
      } catch (err) {
        return { type: 'tool_result', tool_use_id: p.id, content: err.message, is_error: true };
      }
    }));
    messages.push({ role: 'user', content: resultados });
  }

  return { respuesta: 'Necesité demasiadas consultas para esa pregunta. Probá con algo más acotado.', herramientas: usadas, uso };
}

module.exports = { preguntar, crearEjecutor, HERRAMIENTAS, MODELO, SISTEMA };
