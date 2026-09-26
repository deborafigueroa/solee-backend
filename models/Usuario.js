const mongoose = require("mongoose");

const usuarioSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    maxlength: 100,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  rol: {
    type: String,
    enum: ["participante", "organizador"],
    required: true,
  },
  activo: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true, // agrega createdAt y updatedAt automáticamente
});

module.exports = mongoose.model("Usuario", usuarioSchema);