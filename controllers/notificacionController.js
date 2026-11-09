const Usuario = require("../models/Usuario");
const { enviarPrueba, fcmDisponible } = require("../services/notificaciones");

const DISCIPLINAS = ["música", "danza", "teatro", "artes visuales", "escritura", "fotografía", "cerámica", "tejido", "otros"];

const tokenValido = (token) => typeof token === "string" && token.length >= 50 && token.length <= 4096;

// POST /api/notificaciones/suscribir
const registrarDispositivo = async (req, res) => {
  try {
    const { token } = req.body;
    if (!tokenValido(token)) {
      return res.status(400).json({ mensaje: "Identificador de dispositivo inválido" });
    }
    const usuarioId = req.usuario.userId;

    await Usuario.updateMany({ fcmTokens: token, _id: { $ne: usuarioId } }, { $pull: { fcmTokens: token } });
    await Usuario.updateOne({ _id: usuarioId }, { $pull: { fcmTokens: token } });
    await Usuario.updateOne({ _id: usuarioId }, { $push: { fcmTokens: { $each: [token], $slice: -10 } } });

    res.status(200).json({ mensaje: "Dispositivo registrado" });
  } catch (error) {
    console.error("Error registrando dispositivo:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// POST /api/notificaciones/desuscribir
const quitarDispositivo = async (req, res) => {
  try {
    const { token } = req.body;
    if (!tokenValido(token)) {
      return res.status(400).json({ mensaje: "Identificador de dispositivo inválido" });
    }
    await Usuario.updateOne({ _id: req.usuario.userId }, { $pull: { fcmTokens: token } });
    res.status(200).json({ mensaje: "Dispositivo eliminado" });
  } catch (error) {
    console.error("Error quitando dispositivo:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// POST /api/notificaciones/estado
const estadoDispositivo = async (req, res) => {
  try {
    const { token } = req.body;
    if (!tokenValido(token)) {
      return res.status(400).json({ mensaje: "Identificador de dispositivo inválido" });
    }
    const existe = await Usuario.exists({ _id: req.usuario.userId, fcmTokens: token });
    res.status(200).json({ registrado: Boolean(existe) });
  } catch (error) {
    console.error("Error consultando dispositivo:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// GET /api/notificaciones/preferencias
const obtenerPreferencias = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.userId).select("intereses rol");
    res.status(200).json({
      rol: usuario?.rol,
      intereses: usuario?.intereses || [],
      servicioActivo: fcmDisponible(),
    });
  } catch (error) {
    console.error("Error obteniendo preferencias:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// PUT /api/notificaciones/intereses (solo participantes)
const actualizarIntereses = async (req, res) => {
  try {
    const { intereses } = req.body;
    if (!Array.isArray(intereses) || intereses.some((i) => !DISCIPLINAS.includes(i))) {
      return res.status(400).json({ mensaje: "Disciplinas inválidas" });
    }
    const unicos = [...new Set(intereses)];
    await Usuario.updateOne({ _id: req.usuario.userId }, { $set: { intereses: unicos } });
    res.status(200).json({ intereses: unicos });
  } catch (error) {
    console.error("Error actualizando intereses:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// POST /api/notificaciones/prueba
const probarNotificacion = async (req, res) => {
  try {
    if (!fcmDisponible()) {
      return res.status(503).json({ mensaje: "El servicio de notificaciones no está disponible en el servidor" });
    }
    const resultado = await enviarPrueba(req.usuario.userId);
    if (resultado.dispositivos === 0) {
      return res.status(409).json({ mensaje: "No tienes dispositivos con notificaciones activadas" });
    }
    res.status(200).json({ mensaje: "Notificación de prueba enviada", ...resultado });
  } catch (error) {
    console.error("Error enviando notificación de prueba:", error);
    res.status(500).json({ mensaje: "No se pudo enviar la notificación de prueba" });
  }
};

module.exports = {
  registrarDispositivo,
  quitarDispositivo,
  estadoDispositivo,
  obtenerPreferencias,
  actualizarIntereses,
  probarNotificacion,
};