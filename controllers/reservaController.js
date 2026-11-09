const mongoose = require("mongoose");
const Actividad = require("../models/Actividad");
const Reserva = require("../models/Reserva");
const { notificarReservaConfirmada, notificarNuevaReserva } = require("../services/notificaciones");
const Resena = require("../models/Resena");

// POST /api/reservas
const crearReserva = async (req, res) => {
  try {
    const { actividadId } = req.body;
    if (!mongoose.isValidObjectId(actividadId)) {
      return res.status(400).json({ mensaje: "Actividad inválida" });
    }

    const yaReservada = await Reserva.findOne({
      participanteId: req.usuario.userId,
      actividadId,
      estado: "confirmada",
    });
    if (yaReservada) {
      return res.status(409).json({ mensaje: "Ya tienes una reserva para esta actividad" });
    }

    // Descuento atómico: solo ocurre si la actividad sigue activa, no empezó y quedan cupos
    const actividad = await Actividad.findOneAndUpdate(
      {
        _id: actividadId,
        estado: "activa",
        cuposDisponibles: { $gt: 0 },
        fechaInicio: { $gt: new Date() },
      },
      { $inc: { cuposDisponibles: -1 } },
      { new: true }
    );

    if (!actividad) {
      const existente = await Actividad.findById(actividadId);
      if (!existente || existente.estado === "eliminada") {
        return res.status(404).json({ mensaje: "Actividad no encontrada" });
      }
      if (existente.estado !== "activa") {
        return res.status(409).json({ mensaje: "La actividad no está disponible" });
      }
      if (existente.fechaInicio <= new Date()) {
        return res.status(409).json({ mensaje: "La actividad ya comenzó" });
      }
      return res.status(409).json({ mensaje: "Actividad sin cupos disponibles" });
    }

    try {
      const reserva = await Reserva.create({
        participanteId: req.usuario.userId,
        actividadId,
      });
      notificarReservaConfirmada(req.usuario.userId, actividad);
      notificarNuevaReserva(actividad.organizadorId, actividad);
      return res.status(201).json({
        mensaje: "Reserva confirmada",
        reserva: {
          id: reserva._id,
          estado: reserva.estado,
          codigoQR: reserva.codigoQR,
          creadoEn: reserva.createdAt,
        },
        actividad: {
          id: actividad._id,
          titulo: actividad.titulo,
          fechaInicio: actividad.fechaInicio,
          fechaFin: actividad.fechaFin,
          direccionTexto: actividad.direccionTexto,
          precio: actividad.precio,
          cuposDisponibles: actividad.cuposDisponibles,
        },
      });
    } catch (error) {
      // Si no se pudo guardar la reserva, se devuelve el cupo descontado
      await Actividad.updateOne({ _id: actividadId }, { $inc: { cuposDisponibles: 1 } });
      if (error.code === 11000) {
        return res.status(409).json({ mensaje: "Ya tienes una reserva para esta actividad" });
      }
      throw error;
    }
  } catch (error) {
    console.error("Error creando reserva:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// GET /api/reservas/mis-reservas
const misReservas = async (req, res) => {
  try {
    const reservas = await Reserva.find({ participanteId: req.usuario.userId })
      .sort({ createdAt: -1 })
      .populate("actividadId", "titulo disciplina fechaInicio fechaFin direccionTexto modalidad precio estado");

    const idsActividad = reservas.map((r) => r.actividadId?._id).filter(Boolean);
    const resenas = await Resena.find({
      participanteId: req.usuario.userId,
      actividadId: { $in: idsActividad },
    }).select("actividadId calificacion comentario");
    const porActividad = new Map(resenas.map((r) => [r.actividadId.toString(), r]));

    res.status(200).json({
      total: reservas.length,
      reservas: reservas.map((r) => {
        const mia = r.actividadId ? porActividad.get(r.actividadId._id.toString()) : null;
        return {
          _id: r._id,
          estado: r.estado,
          codigoQR: r.codigoQR,
          creadoEn: r.createdAt,
          actividad: r.actividadId,
          miResena: mia ? { _id: mia._id, calificacion: mia.calificacion, comentario: mia.comentario } : null,
        };
      }),
    });
  } catch (error) {
    console.error("Error obteniendo mis reservas:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// PUT /api/reservas/:id/cancelar
const cancelarReserva = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ mensaje: "Reserva no encontrada" });
    }

    // Una reserva ajena responde 404, para no revelar que existe
    const reserva = await Reserva.findOne({ _id: id, participanteId: req.usuario.userId });
    if (!reserva) {
      return res.status(404).json({ mensaje: "Reserva no encontrada" });
    }
    if (reserva.estado !== "confirmada") {
      return res.status(409).json({ mensaje: "Esta reserva no se puede cancelar" });
    }

    const actividad = await Actividad.findById(reserva.actividadId);
    if (actividad && actividad.fechaInicio <= new Date()) {
      return res.status(409).json({ mensaje: "No puedes cancelar una actividad que ya comenzó" });
    }

    // El cambio de estado es atómico: dos cancelaciones simultáneas no devuelven dos cupos
    const cancelada = await Reserva.findOneAndUpdate(
      { _id: id, estado: "confirmada" },
      { estado: "cancelada" },
      { new: true }
    );
    if (!cancelada) {
      return res.status(409).json({ mensaje: "Esta reserva no se puede cancelar" });
    }

    await Actividad.updateOne({ _id: reserva.actividadId }, { $inc: { cuposDisponibles: 1 } });

    res.status(200).json({ mensaje: "Reserva cancelada", estado: cancelada.estado });
  } catch (error) {
    console.error("Error cancelando reserva:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// GET /api/reservas/actividad/:id (organizador dueña de la actividad)
const reservasDeActividad = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ mensaje: "Actividad no encontrada" });
    }

    const actividad = await Actividad.findById(id);
    if (!actividad || actividad.estado === "eliminada") {
      return res.status(404).json({ mensaje: "Actividad no encontrada" });
    }
    if (actividad.organizadorId.toString() !== req.usuario.userId) {
      return res.status(403).json({ mensaje: "No puedes ver las reservas de una actividad que no es tuya" });
    }

    // Solo se expone nombre y correo, lo mínimo para coordinar la actividad
    const reservas = await Reserva.find({ actividadId: id })
      .sort({ createdAt: -1 })
      .populate("participanteId", "nombre email");

    res.status(200).json({
      actividad: {
        id: actividad._id,
        titulo: actividad.titulo,
        estado: actividad.estado,
        fechaInicio: actividad.fechaInicio,
        cupoMaximo: actividad.cupoMaximo,
        cuposDisponibles: actividad.cuposDisponibles,
      },
      confirmadas: reservas.filter((r) => r.estado === "confirmada").length,
      reservas: reservas.map((r) => ({
        _id: r._id,
        estado: r.estado,
        creadoEn: r.createdAt,
        participante: r.participanteId
          ? { nombre: r.participanteId.nombre, email: r.participanteId.email }
          : null,
      })),
    });
  } catch (error) {
    console.error("Error obteniendo reservas de la actividad:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// PUT /api/reservas/:id/asistencia (organizador dueña de la actividad)
const marcarAsistencia = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!["asistió", "no asistió"].includes(estado)) {
      return res.status(400).json({ mensaje: "Estado inválido" });
    }
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ mensaje: "Reserva no encontrada" });
    }

    const reserva = await Reserva.findById(id);
    if (!reserva) {
      return res.status(404).json({ mensaje: "Reserva no encontrada" });
    }

    const actividad = await Actividad.findById(reserva.actividadId);
    if (!actividad || actividad.organizadorId.toString() !== req.usuario.userId) {
      return res.status(403).json({ mensaje: "No puedes modificar reservas de una actividad que no es tuya" });
    }
    if (actividad.fechaInicio > new Date()) {
      return res.status(409).json({ mensaje: "La asistencia se puede marcar cuando la actividad ya comenzó" });
    }
    if (!["confirmada", "asistió", "no asistió"].includes(reserva.estado)) {
      return res.status(409).json({ mensaje: "Esta reserva está cancelada" });
    }

    reserva.estado = estado;
    await reserva.save();

    res.status(200).json({ mensaje: "Asistencia registrada", estado: reserva.estado });
  } catch (error) {
    console.error("Error marcando asistencia:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

module.exports = { crearReserva, misReservas, cancelarReserva, reservasDeActividad, marcarAsistencia };
