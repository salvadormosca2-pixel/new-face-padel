# AUTOMATIZACION DEL BOT DE WHATSAPP (n8n)

El flujo completo esta en `n8n-workflow.json`, listo para importar:
n8n → Workflows → ⋯ → Import from File → elegir el archivo.

Que trae: WhatsApp Trigger → filtro (solo texto) → Mensaje (texto, telefono, nombre)
→ Asistente New Face (AI Agent con el system message de `n8n-system-message.md`,
memoria por telefono, 13 tools HTTP) → Responder por WhatsApp.

Despues de importar, hay que conectar 3 credenciales (quedan marcadas REEMPLAZAR):
1. WhatsApp Trigger  → WhatsApp OAuth (App ID + App Secret de Meta for Developers)
2. Claude            → Anthropic API key  (console.anthropic.com/settings/keys)
3. Responder         → WhatsApp Cloud API (Access Token + Business Account ID de Meta)

Y si el backend cambia de dominio (Railway nuevo), en el JSON reemplazar
`https://backend-production-143ea.up.railway.app` por el nuevo antes de importar.
El modelo es claude-sonnet-5 (rapido y barato para WhatsApp); se cambia en el nodo Claude.

# CONFIGURACION DE TOOLS EN N8N
Base URL: https://backend-production-143ea.up.railway.app

## Tool 1: disponibilidad
GET /api/disponibilidad/{{fecha}}?duracion={{duracion}}&deporte={{deporte}}
Parametros:
- fecha (string): formato YYYY-MM-DD
- duracion (number): padel/pickleball/beach 60, 90 o 120 · tenis de mesa 30, 60 o 90
- deporte (string, opcional): padel (default) | tenis_mesa | pickleball | beach_volley
Respuesta: array de slots con hora_inicio, hora_fin, canchas_disponibles, canchas[], deporte, precio_total

## Tool 2: reservar
POST /api/reservar
Body JSON:
{
  "nombre": "string",
  "telefono": "string",
  "metodoPago": "efectivo|mercadopago|transferencia",
  "fecha": "YYYY-MM-DD",
  "hora_inicio": "HH:MM",
  "duracion_minutos": 60|90|120,
  "deporte": "padel|tenis_mesa|pickleball|beach_volley",
  "origen": "whatsapp",
  "cancha_id": 3
}
IMPORTANTE: mandá siempre "origen": "whatsapp". Asi el turno sale con el color de
WhatsApp en el panel del club y se sabe que entro por el bot. Sin ese campo queda
marcado como reserva web (online).
"deporte" por defecto es padel. "cancha_id" es opcional: si la piden puntual y esta
libre se respeta, si no el sistema elige una.
Respuesta: claveUnica, cancha, cancha_nombre, tipo, deporte, deporte_nombre, origen,
hora_inicio, hora_fin, precio_total

## Tool 2b: que deportes y canchas hay
GET /api/deportes
Respuesta: lista de deportes activos con nombre, emoji, duraciones validas y sus espacios
GET /api/espacios?deporte={{deporte}}
Respuesta: canchas/mesas con id, nombre, tipo, precioHora, duracionMinima

## Tool 2c: precios del buffet
GET /api/buffet
Respuesta: productos activos con nombre, categoria, precio y si hay disponible

## Tool 3: puntos
GET /api/puntos/{{telefono}}
Parametro: telefono (string, solo numeros)
Respuesta: nombre, telefono, puntos, totalGastado, activo

## Tool 4: ranking
GET /api/ranking
Sin parametros
Respuesta: array de {posicion, nombre, telefono, puntos, totalGastado}

## Tool 5: premios
GET /api/premios
Sin parametros
Respuesta: array de {id, nombre, descripcion, puntos, stock, activo}

## Tool 6: canjear
POST /api/premios/canjear
Body JSON:
{
  "telefono": "string",
  "premioId": number
}
Respuesta: ok, canje {premio, puntosUsados, puntosRestantes}

## Tool 7: mis_reservas
GET /api/mis-reservas/{{telefono}}
Parametro: telefono (string)
Respuesta: array de reservas futuras con fecha, hora_inicio, hora_fin, cancha, tipo, estado

## Tool 8: torneos
GET /api/torneos/proximos
Sin parametros
Respuesta: array de {id, nombre, fecha, estado, parejasInscriptas}

## Tool 9: inscribir_torneo
POST /api/torneos/inscripcion
Body JSON:
{
  "torneoId": number,
  "jugador1": {"nombre": "string", "telefono": "string"},
  "jugador2": {"nombre": "string", "telefono": "string"}
}
Respuesta: ok, inscripcion {nombrePareja, estadoInscripcion}
NOTA: El torneoId va en el body, NO en la URL.

## Tool 10: contexto_bot
GET /api/bot/contexto
Sin parametros
Respuesta: club, torneos_activos, profesores, premios, ranking,
  deportes[] (cada uno con sus espacios y duraciones validas),
  canchas[] (todas, con deporte y precio),
  origenes[] (de donde puede venir un turno) + origen_del_bot: "whatsapp",
  metodos_pago[],
  buffet[] (productos con precio y si hay stock),
  horarios_hoy    { padel:{turnos_60min,...}, tenis_mesa:{...}, pickleball:{...}, beach_volley:{...} },
  horarios_manana { igual }
NOTA: Solo usar cuando se necesiten multiples datos. Para consultas individuales usar la tool especifica.

## Tool 11: perfil_socio
GET /api/socios/{{telefono}}
Parametro: telefono (string)
Respuesta: nombre, puntos, totalGastado, reservasTotales, proximaReserva, premiosCanjeables[]
