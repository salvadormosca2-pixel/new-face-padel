const mongoose = require('mongoose');

const canjeSchema = new mongoose.Schema({
  socioTelefono: { type: String, required: true },
  socioNombre:   { type: String, default: '' },
  premioId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Premio', required: true },
  premioNombre:  { type: String, required: true },
  puntosUsados:  { type: Number, required: true },
  estado:        { type: String, default: 'pendiente', enum: ['pendiente', 'entregado', 'cancelado'] }
}, { timestamps: true });

canjeSchema.index({ socioTelefono: 1, createdAt: -1 });

module.exports = mongoose.model('Canje', canjeSchema);
