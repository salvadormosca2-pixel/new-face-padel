const mongoose = require('mongoose');

const reservaSchema = new mongoose.Schema({
  fecha:       { type: String, required: true },
  hora:        { type: String, required: true },
  cancha:      { type: Number, required: true, min: 1, max: 4 },
  nombre:      { type: String, required: true, trim: true },
  telefono:    { type: String, default: '', trim: true },
  metodoPago:  { type: String, required: true, enum: ['efectivo', 'mercadopago', 'transferencia'] },
  estado:      { type: String, default: 'pendiente', enum: ['pendiente', 'pagado'] },
  metodoCobro: { type: String, default: null },
  monto:       { type: Number, default: 0 },
  claveUnica:  { type: String, unique: true, required: true }
}, { timestamps: true });

reservaSchema.index({ fecha: 1, cancha: 1, hora: 1 }, { unique: true });
reservaSchema.index({ estado: 1, fecha: 1 });

module.exports = mongoose.model('Reserva', reservaSchema);
