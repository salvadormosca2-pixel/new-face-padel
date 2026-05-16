const mongoose = require('mongoose');

const torneoSchema = new mongoose.Schema({
  nombre:            { type: String, required: true },
  fecha:             { type: String, required: true },
  descripcion:       { type: String, default: '' },
  imagen:            { type: String, default: '' },
  estado:            { type: String, default: 'inscripcion' },
  inscripciones:     { type: mongoose.Schema.Types.Mixed, default: [] },
  grupos:            { type: mongoose.Schema.Types.Mixed, default: {} },
  bracket:           { type: mongoose.Schema.Types.Mixed, default: [] },
  campeon:           { type: String, default: null },
  cantidadJugadores: { type: Number, default: 0 },
}, { timestamps: true, minimize: false });

module.exports = mongoose.model('Torneo', torneoSchema);
