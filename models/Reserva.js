const mongoose = require("mongoose");
const crypto = require("crypto");

const reservaSchema = new mongoose.Schema({
  participanteId: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  actividadId: { type: mongoose.Schema.Types.ObjectId, ref: "Actividad", required: true },
  estado: {
    type: String,
    enum: ["confirmada", "cancelada", "asistió", "no asistió"],
    default: "confirmada",
  },
  codigoQR: { type: String, default: () => crypto.randomUUID(), unique: true },
}, {
  timestamps: true,
});

// Una sola reserva confirmada por persona y actividad (se puede reservar de nuevo tras cancelar)
reservaSchema.index(
  { participanteId: 1, actividadId: 1 },
  { unique: true, partialFilterExpression: { estado: "confirmada" } }
);
reservaSchema.index({ actividadId: 1 });

module.exports = mongoose.model("Reserva", reservaSchema);