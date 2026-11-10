const mongoose = require("mongoose");

const eventoSchema = new mongoose.Schema(
  {
    tipo: {
      type: String,
      enum: ["búsqueda", "vista_actividad", "reserva", "cancelación"],
      required: true,
    },
    usuarioHash: { type: String, required: true },
    actividadId: { type: mongoose.Schema.Types.ObjectId, ref: "Actividad" },
    dispositivoTipo: { type: String, enum: ["móvil", "escritorio"], default: "escritorio" },
    timestamp: { type: Date, default: Date.now },
  },
  { collection: "eventos_analytics" }
);

eventoSchema.index({ tipo: 1, actividadId: 1, timestamp: -1 });
eventoSchema.index({ usuarioHash: 1, actividadId: 1, timestamp: -1 });

module.exports = mongoose.model("EventoAnalytics", eventoSchema);