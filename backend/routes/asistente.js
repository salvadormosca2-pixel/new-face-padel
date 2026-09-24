const express = require('express');
const router  = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { preguntar, crearEjecutor, MODELO } = require('../lib/asistente');

/* Sin clave el asistente no arranca: mejor decirlo claro que fallar por dentro */
function hayClave() { return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN); }

router.get('/api/admin/asistente/estado', (_req, res) => {
  res.json({ disponible: hayClave(), modelo: MODELO });
});

/*
  POST { mensaje, historial: [{role, content}] }
  El asistente consulta el propio backend con el token de quien pregunta.
*/
router.post('/api/admin/asistente', async (req, res) => {
  const mensaje = String(req.body?.mensaje || '').trim().slice(0, 1000);
  if (!mensaje) return res.status(400).json({ error: 'Escribí una pregunta' });
  if (!hayClave()) return res.status(503).json({ error: 'El asistente no está configurado: falta ANTHROPIC_API_KEY en el servidor' });

  const historial = Array.isArray(req.body?.historial) ? req.body.historial : [];
  const puerto  = process.env.PORT || process.env.DEMO_PORT || 3000;
  const baseUrl = process.env.ASISTENTE_BASE_URL || `http://127.0.0.1:${puerto}`;

  try {
    const salida = await preguntar({
      mensaje, historial,
      ejecutor: crearEjecutor({ baseUrl, authorization: req.headers.authorization || '' })
    });
    res.json(salida);
  } catch (err) {
    /* Del más específico al más general, como pide el SDK */
    if (err instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: 'La clave de la API no es válida' });
    if (err instanceof Anthropic.RateLimitError)      return res.status(429).json({ error: 'Muchas consultas seguidas, esperá un momento' });
    if (err instanceof Anthropic.APIError)            return res.status(502).json({ error: `Error del asistente (${err.status})` });
    console.error('Asistente:', err);
    res.status(500).json({ error: 'No pude responder' });
  }
});

module.exports = router;
