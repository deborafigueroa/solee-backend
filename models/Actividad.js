const mongoose = require("mongoose");

const actividadSchema = new mongoose.Schema({
  titulo: {
    type: String,
    required: true,
    maxlength: 120,
  },
  descripcion: {
    type: String,
    required: true,
    maxlength: 1000,
  },
  disciplina: {
    type: String,
    enum: ["música", "danza", "teatro", "artes visuales", "escritura", "fotografía", "cerámica", "tejido", "otros"],
    required: true,
  },
  nivel: {
    type: String,
    enum: ["principiante", "intermedio", "avanzado", "todos los niveles"],
    required: true,
  },
  modalidad: {
    type: String,
    enum: ["presencial", "virtual", "híbrida"],
    required: true,
  },
  precio: {
    type: Number,
    required: true,
    min: 0,
  },
  cupoMaximo: {
    type: Number,
    required: true,
    min: 1,
  },
  cuposDisponibles: {
    type: Number,
    required: true,
    min: 0,
  },
  ubicacion: {
    type: {
      type: String,
      enum: ["Point"],
    },
    coordinates: {
      type: [Number], // [longitud, latitud]
    },
  },
  direccionTexto: {
    type: String,
  },
  fechaInicio: {
    type: Date,
    required: true,
  },
  fechaFin: {
    type: Date,
    required: true,
  },
  horario: {
    type: String,
    enum: ["mañana", "tarde", "noche", "fin de semana"],
    required: true,
  },
  imagenUrl: {
    type: String,
  },
  organizadorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Usuario",
    required: true,
  },
  estado: {
    type: String,
    enum: ["activa", "pausada", "finalizada", "eliminada"],
    default: "activa",
  },
}, {
  timestamps: true,
});

// Índice geoespacial para búsquedas por ubicación (US-05)
actividadSchema.index({ ubicacion: "2dsphere" });

// Índices adicionales para optimizar búsquedas frecuentes
actividadSchema.index({ disciplina: 1, estado: 1 });
actividadSchema.index({ fechaInicio: 1 });

module.exports = mongoose.model("Actividad", actividadSchema);