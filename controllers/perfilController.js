const bcrypt = require("bcryptjs");
const Usuario = require("../models/Usuario");

const enmascararRut = (rut) => {
  if (!rut) return null;
  const [cuerpo, dv] = String(rut).split("-");
  if (!cuerpo || !dv) return null;
  const visibles = Math.max(cuerpo.length - 6, 1);
  return `${cuerpo.slice(0, visibles)}.***.***-${dv}`;
};

const construirPerfil = (u) => ({
  nombre: u.nombre,
  email: u.email,
  rol: u.rol,
  tipoCuenta: u.tipoCuenta || "persona",
  rut: enmascararRut(u.rut),
  fechaNacimiento: u.tipoCuenta === "organizacion" ? null : u.fechaNacimiento || null,
  telefono: u.telefono || "",
  comuna: u.comuna || "",
  intereses: u.intereses || [],
  consentimiento: u.consentimientoLey19628?.fecha || null,
  miembroDesde: u.createdAt,
});

// GET /api/perfil
const obtenerPerfil = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.userId);
    if (!usuario || !usuario.activo) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }
    res.status(200).json(construirPerfil(usuario));
  } catch (error) {
    console.error("Error obteniendo perfil:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// PUT /api/perfil (solo nombre, teléfono y comuna)
const actualizarPerfil = async (req, res) => {
  try {
    const { nombre, telefono, comuna } = req.body;
    const cambios = {};

    if (nombre !== undefined) {
      const limpio = String(nombre).trim();
      if (!limpio || limpio.length > 100) {
        return res.status(400).json({ mensaje: "El nombre es obligatorio y no puede superar los 100 caracteres" });
      }
      cambios.nombre = limpio;
    }

    if (telefono !== undefined) {
      const limpio = String(telefono).replace(/[\s-]/g, "");
      if (limpio && !/^\+?\d{8,12}$/.test(limpio)) {
        return res.status(400).json({ mensaje: "Teléfono inválido" });
      }
      cambios.telefono = limpio;
    }

    if (comuna !== undefined) {
      const limpio = String(comuna).trim();
      if (limpio.length > 60) {
        return res.status(400).json({ mensaje: "La comuna no puede superar los 60 caracteres" });
      }
      cambios.comuna = limpio;
    }

    if (Object.keys(cambios).length === 0) {
      return res.status(400).json({ mensaje: "No hay cambios para guardar" });
    }

    const usuario = await Usuario.findByIdAndUpdate(
      req.usuario.userId,
      { $set: cambios },
      { new: true, runValidators: true }
    );
    if (!usuario) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    res.status(200).json(construirPerfil(usuario));
  } catch (error) {
    console.error("Error actualizando perfil:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// PUT /api/perfil/contrasena
const cambiarContrasena = async (req, res) => {
  try {
    const { actual, nueva, confirmar } = req.body;

    if (!actual || !nueva || !confirmar) {
      return res.status(400).json({ mensaje: "Completa los tres campos" });
    }
    if (nueva !== confirmar) {
      return res.status(400).json({ mensaje: "Las contraseñas nuevas no coinciden" });
    }
    if (!/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(nueva)) {
      return res.status(400).json({
        mensaje: "La contraseña debe tener mínimo 8 caracteres, 1 mayúscula y 1 número",
      });
    }

    const usuario = await Usuario.findById(req.usuario.userId);
    if (!usuario) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    const correcta = await bcrypt.compare(actual, usuario.passwordHash);
    if (!correcta) {
      return res.status(400).json({ mensaje: "La contraseña actual no es correcta" });
    }
    if (await bcrypt.compare(nueva, usuario.passwordHash)) {
      return res.status(400).json({ mensaje: "La contraseña nueva debe ser distinta a la actual" });
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(nueva, salt);
    await Usuario.updateOne({ _id: usuario._id }, { $set: { passwordHash } });

    res.status(200).json({ mensaje: "Contraseña actualizada" });
  } catch (error) {
    console.error("Error cambiando contraseña:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

module.exports = { obtenerPerfil, actualizarPerfil, cambiarContrasena };