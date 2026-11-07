const mongoose = require("mongoose");
const Actividad = require("../models/Actividad");

const CAMPOS_EDITABLES = [
  "titulo", "descripcion", "disciplina", "nivel", "modalidad", "precio",
  "cupoMaximo", "direccionTexto", "ubicacion", "fechaInicio", "fechaFin",
  "horario", "imagenUrl",
];

const coordenadasValidas = (ubicacion) => {
  if (!Array.isArray(ubicacion?.coordinates) || ubicacion.coordinates.length !== 2) return false;
  const [lng, lat] = ubicacion.coordinates.map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
};

const responderError = (res, error, contexto) => {
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ mensaje: error.message });
  }
  console.error(`Error en ${contexto}:`, error);
  res.status(500).json({ mensaje: "Error interno del servidor" });
};

// GET /api/actividades
const buscarActividades = async (req, res) => {
  try {
    const { disciplina, nivel, precioMin, precioMax, modalidad, horario, lat, lng, radioKm } = req.query;

    const filtros = { estado: "activa" };
    if (disciplina) filtros.disciplina = String(disciplina);
    if (nivel) filtros.nivel = String(nivel);
    if (modalidad) filtros.modalidad = String(modalidad);
    if (horario) filtros.horario = String(horario);

    if (precioMin || precioMax) {
      filtros.precio = {};
      if (precioMin) filtros.precio.$gte = Number(precioMin);
      if (precioMax) filtros.precio.$lte = Number(precioMax);
    }

    const hayUbicacion = lat !== undefined && lat !== "" && lng !== undefined && lng !== "";

    if (hayUbicacion) {
      const latitud = Number(lat);
      const longitud = Number(lng);

      if (
        !Number.isFinite(latitud) || !Number.isFinite(longitud) ||
        Math.abs(latitud) > 90 || Math.abs(longitud) > 180
      ) {
        return res.status(400).json({ mensaje: "Ubicación inválida" });
      }

      const radio = Math.min(Math.max(Number(radioKm) || 5, 1), 50);

      const actividades = await Actividad.aggregate([
        {
          $geoNear: {
            near: { type: "Point", coordinates: [longitud, latitud] },
            distanceField: "distanciaMetros",
            maxDistance: radio * 1000,
            spherical: true,
            query: filtros,
          },
        },
        { $limit: 50 },
      ]);

      return res.status(200).json({ total: actividades.length, actividades });
    }

    const actividades = await Actividad.find(filtros).limit(20).sort({ fechaInicio: 1 });
    res.status(200).json({ total: actividades.length, actividades });
  } catch (error) {
    console.error("Error en búsqueda de actividades:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// GET /api/actividades/:id
const obtenerActividad = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ mensaje: "Actividad no encontrada" });
    }
    const actividad = await Actividad.findById(req.params.id);
    if (!actividad || actividad.estado === "eliminada") {
      return res.status(404).json({ mensaje: "Actividad no encontrada" });
    }
    res.status(200).json(actividad);
  } catch (error) {
    console.error("Error obteniendo actividad:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// POST /api/actividades
const crearActividad = async (req, res) => {
  try {
    const datos = {};
    CAMPOS_EDITABLES.forEach((campo) => {
      if (req.body[campo] !== undefined) datos[campo] = req.body[campo];
    });
    datos.organizadorId = req.usuario.userId;
    datos.cuposDisponibles = datos.cupoMaximo;

    if (!coordenadasValidas(datos.ubicacion)) delete datos.ubicacion;
    if (datos.modalidad === "presencial" && !datos.ubicacion) {
      return res.status(400).json({ mensaje: "Las actividades presenciales requieren ubicación" });
    }

    const nuevaActividad = await Actividad.create(datos);
    res.status(201).json(nuevaActividad);
  } catch (error) {
    responderError(res, error, "creación de actividad");
  }
};

// GET /api/actividades/mis-actividades
const misActividades = async (req, res) => {
  try {
    const actividades = await Actividad.find({
      organizadorId: req.usuario.userId,
      estado: { $ne: "eliminada" },
    }).sort({ createdAt: -1 });
    res.status(200).json({ total: actividades.length, actividades });
  } catch (error) {
    console.error("Error obteniendo mis actividades:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// PUT /api/actividades/:id (US-11)
const actualizarActividad = async (req, res) => {
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
      return res.status(403).json({ mensaje: "No puedes modificar una actividad que no es tuya" });
    }

    const cambios = {};
    CAMPOS_EDITABLES.forEach((campo) => {
      if (req.body[campo] !== undefined) cambios[campo] = req.body[campo];
    });

    if (req.body.estado !== undefined) {
      if (!["activa", "pausada"].includes(req.body.estado)) {
        return res.status(400).json({ mensaje: "Estado inválido" });
      }
      cambios.estado = req.body.estado;
    }

    if (cambios.cupoMaximo !== undefined) {
      const nuevoMaximo = Number(cambios.cupoMaximo);
      const reservados = actividad.cupoMaximo - actividad.cuposDisponibles;
      if (!Number.isInteger(nuevoMaximo) || nuevoMaximo < 1) {
        return res.status(400).json({ mensaje: "El cupo máximo debe ser un entero mayor a 0" });
      }
      if (nuevoMaximo < reservados) {
        return res.status(400).json({
          mensaje: `Ya hay ${reservados} cupos reservados, el cupo máximo no puede ser menor`,
        });
      }
      cambios.cupoMaximo = nuevoMaximo;
      cambios.cuposDisponibles = nuevoMaximo - reservados;
    }

    if (cambios.ubicacion !== undefined && !coordenadasValidas(cambios.ubicacion)) {
      cambios.ubicacion = undefined;
    }

    actividad.set(cambios);

    if (actividad.modalidad === "presencial" && !coordenadasValidas(actividad.ubicacion)) {
      return res.status(400).json({ mensaje: "Las actividades presenciales requieren ubicación" });
    }
    if (actividad.fechaFin < actividad.fechaInicio) {
      return res.status(400).json({ mensaje: "La fecha de término no puede ser anterior al inicio" });
    }

    await actividad.save();
    res.status(200).json(actividad);
  } catch (error) {
    responderError(res, error, "actualización de actividad");
  }
};

// DELETE /api/actividades/:id (US-11, eliminación lógica)
const eliminarActividad = async (req, res) => {
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
      return res.status(403).json({ mensaje: "No puedes eliminar una actividad que no es tuya" });
    }

    actividad.estado = "eliminada";
    await actividad.save();
    res.status(200).json({ mensaje: "Actividad eliminada" });
  } catch (error) {
    responderError(res, error, "eliminación de actividad");
  }
};

module.exports = {
  buscarActividades,
  obtenerActividad,
  crearActividad,
  misActividades,
  actualizarActividad,
  eliminarActividad,
};