const mongoose = require("mongoose");

const DISCIPLINAS = ["música", "danza", "teatro", "artes visuales", "escritura", "fotografía", "cerámica", "tejido", "otros"];

const usuarioSchema = new mongoose.Schema({
  nombre: { type: String, required: true, maxlength: 100 },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  rol: { type: String, enum: ["participante", "organizador"], required: true },
  tipoCuenta: { type: String, enum: ["persona", "organizacion"], default: "persona" },
  rut: { type: String, unique: true, sparse: true },
  fechaNacimiento: { type: Date },
  telefono: { type: String, maxlength: 15 },
  comuna: { type: String, maxlength: 60 },
  intereses: [{ type: String, enum: DISCIPLINAS }],
  consentimientoLey19628: {
    aceptado: { type: Boolean },
    fecha: { type: Date },
    ipAddress: { type: String },
  },
  resetPasswordHash: { type: String },
  resetPasswordExpira: { type: Date },
  activo: { type: Boolean, default: true },
}, {
  timestamps: true,
});

module.exports = mongoose.model("Usuario", usuarioSchema);