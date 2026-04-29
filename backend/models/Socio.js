const mongoose = require('mongoose');

const socioSchema = new mongoose.Schema({
  nombre:        { type: String, required: true, trim: true },
  email:         { type: String, default: '', trim: true },
  telefono:      { type: String, required: true, unique: true, trim: true },
  puntos:        { type: Number, default: 0 },
  ultimaReserva: { type: Date, default: null },
  metodoPago:    { type: String, default: null },
  totalGastado:  { type: Number, default: 0 },
  activo:        { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Socio', socioSchema);
