const express    = require('express');
const router     = express.Router();
const ClubConfig = require('../models/ClubConfig');

const DEFAULTS = {
  nombre: 'New Face Pádel Club',
  direccion: 'Av. Ocampo 2100 (esq. Ojo de Agua), San Fernando del Valle de Catamarca',
  telefono: '5493834406990',
  whatsapp: '5493834406990',
  email: '',
  redes: { instagram: '@newface.ok', facebook: '', tiktok: '' },
  horarios: { lunesViernes: 'Consultar', sabados: 'Consultar', domingos: 'Consultar', feriados: 'Consultar' },
  canchas: [
    { numero: 1, tipo: 'Pádel', techada: false },
    { numero: 2, tipo: 'Pádel', techada: false },
    { numero: 3, tipo: 'Pádel', techada: false }
  ],
  servicios: ['Academia de pádel', 'Buffet', 'Clínicas', 'Tenis de mesa'],
  metodosPago: ['Efectivo', 'MercadoPago', 'Transferencia bancaria'],
  sistemaPuntos: { puntosPorReserva: 10, descripcion: 'Ganás puntos por cada reserva y los canjeás por premios.' }
};

async function getOrCreate() {
  let config = await ClubConfig.findOne({ raw: true });
  if (!config) {
    config = await ClubConfig.create(DEFAULTS);
    config = config.toJSON();
  }
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
    let config = await ClubConfig.findOne();
    if (!config) {
      config = await ClubConfig.create({ ...DEFAULTS, ...req.body });
    } else {
      const fields = [
        'nombre','direccion','telefono','whatsapp','email',
        'redes','horarios','canchas','precios','servicios',
        'metodosPago','reglas','sistemaPuntos'
      ];
      const update = {};
      fields.forEach(f => {
        if (req.body[f] !== undefined) update[f] = req.body[f];
      });
      await config.update(update);
    }
    res.json(config);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.getOrCreate = getOrCreate;
