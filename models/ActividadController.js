const Actividad = require("../models/Actividad");

// GET /api/actividades - búsqueda con filtros combinables
const buscarActividades = async (req, res) => {
  try {
    const { disciplina, nivel, precioMin, precioMax, modalidad, horario, lat, lng, radioKm } = req.query;

    const query = { estado: "activa" };

    if (disciplina) query.disciplina = disciplina;
    if (nivel) query.nivel = nivel;
    if (modalidad) query.modalidad = modalidad;
    if (horario) query.horario = horario;

    if (precioMin || precioMax) {
      query.precio = {};
      if (precioMin) query.precio.$gte = Number(precioMin);
      if (precioMax) query.precio.$lte = Number(precioMax);
    }

    // Filtro geoespacial (US-05): si vienen lat/lng, usamos $near
    if (lat && lng) {
      const radioMetros = (Number(radioKm) || 5) * 1000; // default 5km
      query.ubicacion = {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [Number(lng), Number(lat)],
          },
          $maxDistance: radioMetros,
        },
      };
    }

    const actividades = await Actividad.find(query).limit(20).sort({ fechaInicio: 1 });

    res.status(200).json({
      total: actividades.length,
      actividades,
    });
  } catch (error) {
    console.error("Error en búsqueda de actividades:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// GET /api/actividades/:id - detalle de una actividad
const obtenerActividad = async (req, res) => {
  try {
    const actividad = await Actividad.findById(req.params.id);
    if (!actividad) {
      return res.status(404).json({ mensaje: "Actividad no encontrada" });
    }
    res.status(200).json(actividad);
  } catch (error) {
    console.error("Error obteniendo actividad:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// POST /api/actividades - publicar nueva actividad (US-10, básico por ahora)
const crearActividad = async (req, res) => {
  try {
    const nuevaActividad = await Actividad.create({
      ...req.body,
      cuposDisponibles: req.body.cupoMaximo,
    });
    res.status(201).json(nuevaActividad);
  } catch (error) {
    console.error("Error creando actividad:", error);
    res.status(400).json({ mensaje: error.message });
  }
};

module.exports = { buscarActividades, obtenerActividad, crearActividad };