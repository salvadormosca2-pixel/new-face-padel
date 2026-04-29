const mongoose = require('mongoose');

const jugadorGrupoSchema = new mongoose.Schema({
  jugador:   { type: String, required: true },
  victorias: { type: Number, default: 0 },
  derrotas:  { type: Number, default: 0 },
  puntos:    { type: Number, default: 0 }
}, { _id: false });

const partidoSchema = new mongoose.Schema({
  jugador1:  String,
  jugador2:  String,
  resultado: { type: String, default: null },
  ganador:   { type: String, default: null },
  fase:      { type: String, default: 'grupo' }, // grupo | octavos | cuartos | semifinal | final
  grupo:     { type: String, default: null }
});

const torneoSchema = new mongoose.Schema({
  nombre:            { type: String, required: true },
  fecha:             { type: String, required: true },
  cantidadJugadores: { type: Number, default: 0 },
  estado:            { type: String, default: 'inscripcion', enum: ['inscripcion', 'grupos', 'eliminatoria', 'finalizado'] },
  grupos: {
    A: [jugadorGrupoSchema],
    B: [jugadorGrupoSchema],
    C: [jugadorGrupoSchema],
    D: [jugadorGrupoSchema]
  },
  partidos: [partidoSchema],
  campeon:  { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Torneo', torneoSchema);
