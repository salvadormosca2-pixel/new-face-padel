const mongoose = require('mongoose');

const clubConfigSchema = new mongoose.Schema({
  nombre:    { type: String, default: 'New Face Padel Club' },
  direccion: { type: String, default: '' },
  telefono:  { type: String, default: '' },
  whatsapp:  { type: String, default: '' },
  email:     { type: String, default: '' },
  redes: {
    instagram: { type: String, default: '' },
    facebook:  { type: String, default: '' },
    tiktok:    { type: String, default: '' }
  },
  horarios: {
    lunesViernes: { type: String, default: '15:00 a 23:00' },
    sabados:      { type: String, default: '09:00 a 23:00' },
    domingos:     { type: String, default: '09:00 a 23:00' },
    feriados:     { type: String, default: '09:00 a 23:00' }
  },
  canchas: [{
    numero: Number,
    tipo:   String,
    techada: Boolean
  }],
  precios: [{
    tipo:        String,
    franjaHoraria: String,
    precio:      Number,
    moneda:      { type: String, default: 'ARS' }
  }],
  servicios: [String],
  metodosPago: [String],
  reglas: {
    cancelacion:     { type: String, default: '' },
    anticipoMinimo:  { type: String, default: '' },
    vestimenta:      { type: String, default: '' },
    llegada:         { type: String, default: '' }
  },
  sistemaPuntos: {
    puntosPorReserva:  { type: Number, default: 10 },
    descripcion:       { type: String, default: 'Ganás puntos por cada reserva y los canjeás por premios.' }
  }
}, { timestamps: true });

module.exports = mongoose.model('ClubConfig', clubConfigSchema);
