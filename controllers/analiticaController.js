const crypto = require("crypto");
const mongoose = require("mongoose");
const Actividad = require("../models/Actividad");
const EventoAnalytics = require("../models/EventoAnalytics");

const VENTANA_MS = 30 * 60 * 1000;

// Código derivado de la persona con una clave secreta: no es su identificador
const hashUsuario = (userId) =>
  crypto
    .createHmac("sha256", process.env.ANALYTICS_SALT || process.env.JWT_SECRET)
    .update(String(userId))
    .digest("hex");

const tipoDispositivo = (req) =>
  /Mobi|Android|iPhone|iPad/i.test(req.headers["user-agent"] || "") ? "móvil" : "escritorio";

// POST /api/analiticas/vistas (solo participantes)
const registrarVista = async (req, res) => {
  try {
    const { actividadId } = req.body;
    if (!mongoose.isValidObjectId(actividadId)) {
      return res.status(400).json({ mensaje: "Actividad inválida" });
    }

    const actividad = await Actividad.findById(actividadId).select("estado");
    // Los borradores y las eliminadas no cuentan, y no se revela por qué
    if (!actividad || ["eliminada", "borrador"].includes(actividad.estado)) {
      return res.status(204).end();
    }

    const usuarioHash = hashUsuario(req.usuario.userId);
    const reciente = await EventoAnalytics.exists({
      tipo: "vista_actividad",
      actividadId,
      usuarioHash,
      timestamp: { $gte: new Date(Date.now() - VENTANA_MS) },
    });

    if (!reciente) {
      await EventoAnalytics.create({
        tipo: "vista_actividad",
        usuarioHash,
        actividadId,
        dispositivoTipo: tipoDispositivo(req),
      });
    }

    res.status(204).end();
  } catch (error) {
    console.error("Error registrando vista:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// GET /api/analiticas/organizador (solo organizadores, solo sus actividades)
const resumenOrganizador = async (req, res) => {
  try {
    const actividades = await Actividad.find({
      organizadorId: req.usuario.userId,
      estado: { $ne: "eliminada" },
    }).select("_id");
    const ids = actividades.map((a) => a._id);

    const filas = await EventoAnalytics.aggregate([
      { $match: { tipo: "vista_actividad", actividadId: { $in: ids } } },
      { $group: { _id: "$actividadId", vistas: { $sum: 1 } } },
    ]);

    const porActividad = {};
    let vistasTotales = 0;
    filas.forEach((f) => {
      porActividad[f._id.toString()] = f.vistas;
      vistasTotales += f.vistas;
    });

    res.status(200).json({ vistasTotales, porActividad });
  } catch (error) {
    console.error("Error obteniendo estadísticas:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

module.exports = { registrarVista, resumenOrganizador };