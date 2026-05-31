const express    = require('express');
const router     = express.Router();
const ClubConfig = require('../models/ClubConfig');

const DEFAULTS = {
  nombre: 'New Face Padel Club',
  direccion: 'Buenos Aires, Argentina',
  horarios: {
    lunesViernes: '15:00 a 23:00',
    sabados: '09:00 a 23:00',
    domingos: '09:00 a 23:00',
    feriados: '09:00 a 23:00'
  },
  canchas: [
    { numero: 1, tipo: 'Cubierta', techada: true },
    { numero: 2, tipo: 'Cubierta', techada: true },
    { numero: 3, tipo: 'Al aire libre', techada: false },
    { numero: 4, tipo: 'Al aire libre', techada: false }
  ],
  servicios: ['Estacionamiento', 'Vestuarios', 'Buffet'],
  metodosPago: ['Efectivo', 'MercadoPago', 'Transferencia bancaria'],
  sistemaPuntos: {
    puntosPorReserva: 10,
    descripcion: 'Ganás puntos por cada reserva y los canjeás por premios.'
  }
};

async function getOrCreate() {
  const config = await ClubConfig.findOneAndUpdate(
    {},
    { $setOnInsert: DEFAULTS },
    { upsert: true, new: true, lean: true }
  );
  return config;
}

router.get('/api/club/info', async (_req, res) => {
  try {
    const config = await getOrCreate();
    res.json(config);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/admin/club/info', async (req, res) => {
  try {
    const fields = [
      'nombre','direccion','telefono','whatsapp','email',
      'redes','horarios','canchas','precios','servicios',
      'metodosPago','reglas','sistemaPuntos'
    ];
    const update = {};
    fields.forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });

    const config = await ClubConfig.findOneAndUpdate(
      {},
      { $set: update, $setOnInsert: DEFAULTS },
      { upsert: true, new: true, lean: true }
    );
    res.json(config);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.getOrCreate = getOrCreate;
