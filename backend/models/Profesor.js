const mongoose = require('mongoose');

const profesorSchema = new mongoose.Schema({
  nombre:      { type: String, required: true, trim: true },
  especialidad:{ type: String, required: true },
  experiencia: { type: String, required: true },
  horarios:    { type: String, required: true },
  whatsapp:    { type: String, required: true },
  imagen:      { type: String, default: '' },
  alumnos:     { type: Number, default: 0 },
  rating:      { type: Number, default: 5.0, min: 0, max: 5 },
  gruposEdad:  [String],
  niveles:     [String]
}, { timestamps: true });

module.exports = mongoose.model('Profesor', profesorSchema);
