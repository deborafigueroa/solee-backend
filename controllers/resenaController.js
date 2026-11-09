const mongoose = require("mongoose");
const Actividad = require("../models/Actividad");
const Reserva = require("../models/Reserva");
const Resena = require("../models/Resena");

const recalcularCalificacion = async (actividadId) => {
  const [resumen] = await Resena.aggregate([
    { $match: { actividadId: new mongoose.Types.ObjectId(String(actividadId)) } },
    { $group: { _id: null, promedio: { $avg: "$calificacion" }, total: { $sum: 1 } } },
  ]);

  await Actividad.updateOne(
    { _id: actividadId },
    {
      calificacionPromedio: resumen ? Math.round(resumen.promedio * 10) / 10 : 0,
      totalResenas: resumen ? resumen.total : 0,
    }
  );
};

const validarDatos = (calificacion, comentario) => {
  const nota = Number(calificacion);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return { error: "La calificación debe ser un número entero de 1 a 5" };
  }
  const texto = comentario === undefined || comentario === null ? "" : String(comentario).trim();
  if (texto.length > 500) {
    return { error: "El comentario no puede superar los 500 caracteres" };
  }
  return { nota, texto };
};

// GET /api/resenas/actividad/:id (pública; con sesión de participante agrega su estado)
const listarResenas = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ mensaje: "Actividad no encontrada" });
    }

    const actividad = await Actividad.findById(id).select("estado calificacionPromedio totalResenas");
    if (!actividad || actividad.estado === "eliminada" || actividad.estado === "borrador") {
      return res.status(404).json({ mensaje: "Actividad no encontrada" });
    }

    const resenas = await Resena.find({ actividadId: id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("participanteId", "nombre");

    const respuesta = {
      promedio: actividad.calificacionPromedio || 0,
      total: actividad.totalResenas || 0,
      resenas: resenas.map((r) => ({
        _id: r._id,
        calificacion: r.calificacion,
        comentario: r.comentario,
        creadoEn: r.createdAt,
        autor: r.participanteId ? String(r.participanteId.nombre).split(" ")[0] : "Participante",
      })),
      puedeResenar: false,
      miResena: null,
    };

    if (req.usuario?.rol === "participante") {
      const asistio = await Reserva.exists({
        participanteId: req.usuario.userId,
        actividadId: id,
        estado: "asistió",
      });
      respuesta.puedeResenar = Boolean(asistio);

      const mia = await Resena.findOne({ participanteId: req.usuario.userId, actividadId: id });
      if (mia) {
        respuesta.miResena = { _id: mia._id, calificacion: mia.calificacion, comentario: mia.comentario };
      }
    }

    res.status(200).json(respuesta);
  } catch (error) {
    console.error("Error listando reseñas:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// POST /api/resenas (participante que asistió)
const crearResena = async (req, res) => {
  try {
    const { actividadId, calificacion, comentario } = req.body;
    if (!mongoose.isValidObjectId(actividadId)) {
      return res.status(400).json({ mensaje: "Actividad inválida" });
    }

    const { error, nota, texto } = validarDatos(calificacion, comentario);
    if (error) return res.status(400).json({ mensaje: error });

    const asistio = await Reserva.exists({
      participanteId: req.usuario.userId,
      actividadId,
      estado: "asistió",
    });
    if (!asistio) {
      return res.status(403).json({ mensaje: "Solo puedes reseñar actividades a las que asististe" });
    }

    let resena;
    try {
      resena = await Resena.create({
        participanteId: req.usuario.userId,
        actividadId,
        calificacion: nota,
        comentario: texto,
      });
    } catch (e) {
      if (e.code === 11000) {
        return res.status(409).json({ mensaje: "Ya reseñaste esta actividad. Puedes editar tu reseña." });
      }
      throw e;
    }

    await recalcularCalificacion(actividadId);
    res.status(201).json({
      _id: resena._id,
      calificacion: resena.calificacion,
      comentario: resena.comentario,
    });
  } catch (error) {
    console.error("Error creando reseña:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// PUT /api/resenas/:id (solo la autora)
const editarResena = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ mensaje: "Reseña no encontrada" });
    }

    const { error, nota, texto } = validarDatos(req.body.calificacion, req.body.comentario);
    if (error) return res.status(400).json({ mensaje: error });

    // Una reseña ajena responde 404, para no revelar que existe
    const resena = await Resena.findOne({ _id: id, participanteId: req.usuario.userId });
    if (!resena) {
      return res.status(404).json({ mensaje: "Reseña no encontrada" });
    }

    resena.calificacion = nota;
    resena.comentario = texto;
    await resena.save();

    await recalcularCalificacion(resena.actividadId);
    res.status(200).json({
      _id: resena._id,
      calificacion: resena.calificacion,
      comentario: resena.comentario,
    });
  } catch (error) {
    console.error("Error editando reseña:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

module.exports = { listarResenas, crearResena, editarResena };