# CONFIGURACION DE TOOLS EN N8N
Base URL: https://new-face-padel-production.up.railway.app

## Tool 1: disponibilidad
GET /api/disponibilidad/{{fecha}}?duracion={{duracion}}
Parametros:
- fecha (string): formato YYYY-MM-DD
- duracion (number): 60, 90 o 120
Respuesta: array de slots con hora_inicio, hora_fin, canchas_disponibles, canchas[], precio_total

## Tool 2: reservar
POST /api/reservar
Body JSON:
{
  "nombre": "string",
  "telefono": "string",
  "metodoPago": "efectivo|mercadopago|transferencia",
  "fecha": "YYYY-MM-DD",
  "hora_inicio": "HH:MM",
  "duracion_minutos": 60|90|120
}
Respuesta: claveUnica, cancha, tipo, hora_inicio, hora_fin, precio_total

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
Respuesta: club, torneos_activos, profesores, premios, ranking, canchas,
  horarios_hoy {turnos_1h, turnos_1_5h, turnos_2h},
  horarios_manana {turnos_1h, turnos_1_5h, turnos_2h}
NOTA: Solo usar cuando se necesiten multiples datos. Para consultas individuales usar la tool especifica.

## Tool 11: perfil_socio
GET /api/socios/{{telefono}}
Parametro: telefono (string)
Respuesta: nombre, puntos, totalGastado, reservasTotales, proximaReserva, premiosCanjeables[]
