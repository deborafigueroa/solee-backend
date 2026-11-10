const mongoose = require("mongoose");
const Actividad = require("../models/Actividad");
const Reserva = require("../models/Reserva");
const {notificarNuevaActividad, notificarCambioActividad, notificarEliminacion} = require("../services/notificaciones");

const CAMPOS_EDITABLES = [
  "titulo", "descripcion", "disciplina", "nivel", "modalidad", "precio",
  "cupoMaximo", "direccionTexto", "instrucciones", "ubicacion", "fechaInicio", "fechaFin",
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
    const {
      disciplina, nivel, precioMin, precioMax, modalidad, horario,
      lat, lng, radioKm, calificacionMin,
    } = req.query;

    const filtros = { estado: "activa", fechaFin: { $gte: new Date() } };
    if (disciplina) filtros.disciplina = String(disciplina);
    if (nivel) filtros.nivel = String(nivel);
    if (modalidad) filtros.modalidad = String(modalidad);
    if (horario) filtros.horario = String(horario);

    if (precioMin || precioMax) {
      filtros.precio = {};
      if (precioMin) filtros.precio.$gte = Number(precioMin);
      if (precioMax) filtros.precio.$lte = Number(precioMax);
    }

    // US-19: calificación mínima (solo actividades que tienen reseñas)
    if (calificacionMin !== undefined && calificacionMin !== "") {
      const minimo = Number(calificacionMin);
      if (!Number.isFinite(minimo) || minimo < 0 || minimo > 5) {
        return res.status(400).json({ mensaje: "Calificación mínima inválida" });
      }
      if (minimo > 0) {
        filtros.calificacionPromedio = { $gte: minimo };
        filtros.totalResenas = { $gt: 0 };
      }
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

      // Con radioKm se limita la distancia. Sin radioKm solo se ordena por cercanía.
      const hayRadio = radioKm !== undefined && radioKm !== "";
      const radio = hayRadio ? Math.min(Math.max(Number(radioKm) || 5, 1), 50) : null;

      const etapaGeo = {
        near: { type: "Point", coordinates: [longitud, latitud] },
        distanceField: "distanciaMetros",
        spherical: true,
        query: filtros,
      };
      if (radio) etapaGeo.maxDistance = radio * 1000;

      const cercanas = await Actividad.aggregate([{ $geoNear: etapaGeo }, { $limit: 50 }]);

      let actividades = cercanas;
      if (!radio) {
        // Las actividades sin ubicación (virtuales) van al final de la lista
        const sinUbicacion = await Actividad.find({
          ...filtros,
          "ubicacion.coordinates": { $exists: false },
        })
          .sort({ fechaInicio: 1 })
          .limit(20);
        actividades = [...cercanas, ...sinUbicacion];
      }

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

    // Un borrador solo lo ve su dueña
    if (actividad.estado === "borrador") {
      const esDuena = req.usuario && actividad.organizadorId.toString() === req.usuario.userId;
      if (!esDuena) {
        return res.status(404).json({ mensaje: "Actividad no encontrada" });
      }
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
    datos.estado = req.body.estado === "borrador" ? "borrador" : "activa";

    if (!coordenadasValidas(datos.ubicacion)) delete datos.ubicacion;
    if (datos.modalidad === "virtual") delete datos.ubicacion;
    if (datos.modalidad === "presencial" && !datos.ubicacion) {
      return res.status(400).json({ mensaje: "Las actividades presenciales requieren ubicación" });
    }
    if (new Date(datos.fechaFin) < new Date(datos.fechaInicio)) {
      return res.status(400).json({ mensaje: "La fecha de término no puede ser anterior al inicio" });
    }

    const nuevaActividad = await Actividad.create(datos);
    if (nuevaActividad.estado === "activa") notificarNuevaActividad(nuevaActividad);

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

    const estadoAnterior = actividad.estado;
    const antes = {
      inicio: actividad.fechaInicio.getTime(),
      fin: actividad.fechaFin.getTime(),
      direccion: actividad.direccionTexto || "",
      coords: JSON.stringify(actividad.ubicacion?.coordinates || []),
    };

    const cambios = {};
    CAMPOS_EDITABLES.forEach((campo) => {
      if (req.body[campo] !== undefined) cambios[campo] = req.body[campo];
    });

    // La ubicación se maneja aparte, para no dejar el campo a medias
    const llegaUbicacion = req.body.ubicacion !== undefined;
    delete cambios.ubicacion;

    if (req.body.estado !== undefined) {
      const nuevo = req.body.estado;
      if (!["activa", "pausada"].includes(nuevo)) {
        return res.status(400).json({ mensaje: "Estado inválido" });
      }
      if (estadoAnterior === "borrador" && nuevo === "pausada") {
        return res.status(400).json({ mensaje: "Un borrador no se puede pausar, publícalo primero" });
      }
      cambios.estado = nuevo;
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

    actividad.set(cambios);

    let quitarUbicacion = false;
    if (actividad.modalidad === "virtual") {
      quitarUbicacion = true;
    } else if (llegaUbicacion) {
      if (coordenadasValidas(req.body.ubicacion)) {
        actividad.ubicacion = {
          type: "Point",
          coordinates: req.body.ubicacion.coordinates.map(Number),
        };
      } else {
        quitarUbicacion = true;
      }
    }

    const quedaConUbicacion = !quitarUbicacion && coordenadasValidas(actividad.ubicacion);
    if (actividad.modalidad === "presencial" && !quedaConUbicacion) {
      return res.status(400).json({ mensaje: "Las actividades presenciales requieren ubicación" });
    }
    if (actividad.fechaFin < actividad.fechaInicio) {
      return res.status(400).json({ mensaje: "La fecha de término no puede ser anterior al inicio" });
    }

    const publicando = estadoAnterior === "borrador" && actividad.estado === "activa";
    if (publicando && actividad.fechaFin < new Date()) {
      return res.status(400).json({ mensaje: "La fecha de término ya pasó, edítala antes de publicar" });
    }

    await actividad.save();

    if (quitarUbicacion) {
      await Actividad.updateOne({ _id: id }, { $unset: { ubicacion: "" } });
    }

    const actualizada = await Actividad.findById(id);

    // Avisos: publicación de un borrador, o cambio de fecha, hora o lugar
    if (publicando) {
      notificarNuevaActividad(actualizada);
    } else if (estadoAnterior !== "borrador") {
      const cambioFecha =
        antes.inicio !== actualizada.fechaInicio.getTime() || antes.fin !== actualizada.fechaFin.getTime();
      const cambioLugar =
        antes.direccion !== (actualizada.direccionTexto || "") ||
        antes.coords !== JSON.stringify(actualizada.ubicacion?.coordinates || []);

      if (cambioFecha || cambioLugar) {
        const partes = [];
        if (cambioFecha) partes.push("la fecha u horario");
        if (cambioLugar) partes.push("el lugar");
        notificarCambioActividad(actualizada, partes.join(" y "));
      }
    }

    res.status(200).json(actualizada);
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

    // Se guardan los inscritos antes de cancelar sus reservas, para poder avisarles
    const inscritosIds = await Reserva.distinct("participanteId", {
      actividadId: id,
      estado: "confirmada",
    });

    actividad.estado = "eliminada";
    await actividad.save();

    const resultado = await Reserva.updateMany(
      { actividadId: id, estado: "confirmada" },
      { estado: "cancelada" }
    );

    notificarEliminacion(actividad, inscritosIds);

    res.status(200).json({
      mensaje: "Actividad eliminada",
      reservasCanceladas: resultado.modifiedCount,
    });
  } catch (error) {
    responderError(res, error, "eliminación de actividad");
  }
};

const MAX_FECHAS = 12;

// POST /api/actividades/multiples (crear varias fechas o duplicar una actividad)
const crearActividadesMultiples = async (req, res) => {
  try {
    const { fechas, origenId, mismaSerie } = req.body;

    if (!Array.isArray(fechas) || fechas.length < 1 || fechas.length > MAX_FECHAS) {
      return res.status(400).json({ mensaje: `Indica entre 1 y ${MAX_FECHAS} fechas` });
    }

    const base = {};
    CAMPOS_EDITABLES.forEach((campo) => {
      if (campo !== "fechaInicio" && campo !== "fechaFin" && req.body[campo] !== undefined) {
        base[campo] = req.body[campo];
      }
    });
    base.organizadorId = req.usuario.userId;
    base.cuposDisponibles = base.cupoMaximo;
    base.estado = req.body.estado === "borrador" ? "borrador" : "activa";

    if (!coordenadasValidas(base.ubicacion)) delete base.ubicacion;
    if (base.modalidad === "virtual") delete base.ubicacion;
    if (base.modalidad === "presencial" && !base.ubicacion) {
      return res.status(400).json({ mensaje: "Las actividades presenciales requieren ubicación" });
    }

    // Validación de las fechas
    const ahora = new Date();
    const vistas = new Set();
    const periodos = [];
    for (const f of fechas) {
      const inicio = new Date(f?.fechaInicio);
      const fin = new Date(f?.fechaFin);
      if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
        return res.status(400).json({ mensaje: "Hay una fecha inválida" });
      }
      if (fin < inicio) {
        return res.status(400).json({ mensaje: "En una de las fechas el término es anterior al inicio" });
      }
      if (base.estado === "activa" && fin < ahora) {
        return res.status(400).json({ mensaje: "No se pueden publicar fechas que ya pasaron" });
      }
      if (vistas.has(inicio.getTime())) {
        return res.status(400).json({ mensaje: "Hay fechas repetidas" });
      }
      vistas.add(inicio.getTime());
      periodos.push({ fechaInicio: inicio, fechaFin: fin });
    }
    periodos.sort((a, b) => a.fechaInicio - b.fechaInicio);

    // Serie: se hereda la de la actividad original, o se crea una nueva si hay varias fechas
    let origen = null;
    let serieId = null;
    const hayOrigen = origenId !== undefined && origenId !== null && origenId !== "";

    if (hayOrigen) {
      if (!mongoose.isValidObjectId(origenId)) {
        return res.status(400).json({ mensaje: "Actividad de origen inválida" });
      }
      origen = await Actividad.findById(origenId);
      if (!origen || origen.estado === "eliminada" || origen.organizadorId.toString() !== req.usuario.userId) {
        return res.status(404).json({ mensaje: "Actividad de origen no encontrada" });
      }
      if (mismaSerie !== false) serieId = origen.serieId || origen._id;
    } else if (periodos.length > 1) {
      serieId = new mongoose.Types.ObjectId();
    }
    if (serieId) base.serieId = serieId;

    // Se valida todo antes de guardar, para no crear solo una parte
    const documentos = periodos.map((p) => new Actividad({ ...base, ...p }));
    await Promise.all(documentos.map((d) => d.validate()));
    const creadas = await Actividad.insertMany(documentos);

    // Si la original no tenía serie, se le asigna ahora para enlazarla con las copias
    if (origen && serieId && !origen.serieId) {
      await Actividad.updateOne({ _id: origen._id }, { serieId });
    }

    if (creadas[0].estado === "activa") notificarNuevaActividad(creadas[0], creadas.length);

    res.status(201).json({ total: creadas.length, actividades: creadas });
  } catch (error) {
    responderError(res, error, "creación de varias fechas");
  }
};

module.exports = {
  buscarActividades,
  obtenerActividad,
  crearActividad,
  misActividades,
  actualizarActividad,
  eliminarActividad,
  crearActividadesMultiples
};