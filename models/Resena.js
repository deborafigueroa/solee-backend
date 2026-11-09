const mongoose = require("mongoose");

const resenaSchema = new mongoose.Schema(
  {
    participanteId: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
    actividadId: { type: mongoose.Schema.Types.ObjectId, ref: "Actividad", required: true },
    calificacion: { type: Number, required: true, min: 1, max: 5 },
    comentario: { type: String, maxlength: 500, default: "" },
  },
  { timestamps: true, collection: "reseñas" }
);

// Una sola reseña por persona y actividad
resenaSchema.index({ participanteId: 1, actividadId: 1 }, { unique: true });
resenaSchema.index({ actividadId: 1, createdAt: -1 });

module.exports = mongoose.model("Resena", resenaSchema);