const mongoose = require('mongoose');

const premioSchema = new mongoose.Schema({
  nombre:      { type: String, required: true, trim: true },
  descripcion: { type: String, default: '' },
  icono:       { type: String, default: '' },
  puntos:      { type: Number, required: true, min: 1 },
  stock:       { type: Number, default: -1 },
  activo:      { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Premio', premioSchema);
