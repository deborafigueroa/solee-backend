const Usuario = require("../models/Usuario");
const Reserva = require("../models/Reserva");
const { obtenerMessaging } = require("../config/firebase");

const TZ = "America/Santiago";
const TOKENS_INVALIDOS = [
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
];

const fechaHora = (fecha) =>
  new Date(fecha).toLocaleString("es-CL", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

const enSegundoPlano = (tarea, contexto) => {
  Promise.resolve()
    .then(tarea)
    .catch((error) => console.error(`Error enviando notificaciones (${contexto}):`, error.message));
};

const tokensDe = (usuarios) => usuarios.flatMap((u) => u.fcmTokens || []);

const fcmDisponible = () => Boolean(obtenerMessaging());

const enviar = async (tokens, { titulo, cuerpo, url, tipo }) => {
  const messaging = obtenerMessaging();
  const unicos = [...new Set(tokens)];
  if (!messaging || unicos.length === 0) return { enviados: 0 };

  let enviados = 0;
  for (let i = 0; i < unicos.length; i += 500) {
    const lote = unicos.slice(i, i + 500);
    const respuesta = await messaging.sendEachForMulticast({
      tokens: lote,
      data: { titulo, cuerpo, url: url || "/home", tipo: tipo || "general" },
      webpush: { headers: { TTL: "86400" } },
    });
    enviados += respuesta.successCount;

    const invalidos = [];
    respuesta.responses.forEach((r, idx) => {
      if (!r.success && TOKENS_INVALIDOS.includes(r.error?.code)) invalidos.push(lote[idx]);
    });
    if (invalidos.length > 0) {
      await Usuario.updateMany(
        { fcmTokens: { $in: invalidos } },
        { $pull: { fcmTokens: { $in: invalidos } } }
      );
    }
  }
  console.log(`Notificación "${tipo}": ${enviados} de ${unicos.length} dispositivos`);
  return { enviados };
};

// Actividad nueva: participantes que marcaron esa disciplina
const notificarNuevaActividad = (actividad, cantidadFechas = 1) =>
  enSegundoPlano(async () => {
    const interesados = await Usuario.find({
      rol: "participante",
      activo: true,
      intereses: actividad.disciplina,
      "fcmTokens.0": { $exists: true },
    }).select("fcmTokens");

    const adicionales = cantidadFechas - 1;
    const extra =
      adicionales > 0 ? ` y ${adicionales} ${adicionales === 1 ? "fecha más" : "fechas más"}` : "";

    await enviar(tokensDe(interesados), {
      titulo: `Nueva actividad de ${actividad.disciplina}`,
      cuerpo: `${actividad.titulo}, ${fechaHora(actividad.fechaInicio)} h${extra}`,
      url: `/evento/${actividad._id}`,
      tipo: "nueva-actividad",
    });
  }, "nueva actividad");

// Reserva: confirmación al participante
const notificarReservaConfirmada = (participanteId, actividad) =>
  enSegundoPlano(async () => {
    const usuario = await Usuario.findById(participanteId).select("fcmTokens");
    await enviar(usuario?.fcmTokens || [], {
      titulo: "Reserva confirmada",
      cuerpo: `${actividad.titulo}, ${fechaHora(actividad.fechaInicio)} h`,
      url: "/mis-reservas",
      tipo: "reserva-confirmada",
    });
  }, "reserva confirmada");

// Reserva: aviso al organizador, sin datos personales del participante
const notificarNuevaReserva = (organizadorId, actividad) =>
  enSegundoPlano(async () => {
    const organizador = await Usuario.findById(organizadorId).select("fcmTokens");
    const cupos = actividad.cuposDisponibles;
    await enviar(organizador?.fcmTokens || [], {
      titulo: "Nueva reserva",
      cuerpo: `${actividad.titulo}: ${
        cupos === 0 ? "ya no quedan cupos" : `quedan ${cupos} ${cupos === 1 ? "cupo" : "cupos"}`
      }`,
      url: `/actividad/${actividad._id}/inscritos`,
      tipo: "nueva-reserva",
    });
  }, "nueva reserva");

// Cambios de fecha, hora o lugar: inscritos confirmados
const notificarCambioActividad = (actividad, queCambio) =>
  enSegundoPlano(async () => {
    const ids = await Reserva.distinct("participanteId", { actividadId: actividad._id, estado: "confirmada" });
    const inscritos = await Usuario.find({ _id: { $in: ids } }).select("fcmTokens");
    await enviar(tokensDe(inscritos), {
      titulo: "Cambios en tu actividad",
      cuerpo: `${actividad.titulo}: cambió ${queCambio}. Revisa los detalles.`,
      url: `/evento/${actividad._id}`,
      tipo: "cambio-actividad",
    });
  }, "cambio de actividad");

// Eliminación: se recibe la lista de inscritos de antes de cancelar sus reservas
const notificarEliminacion = (actividad, inscritosIds) =>
  enSegundoPlano(async () => {
    if (!inscritosIds || inscritosIds.length === 0) return;
    const inscritos = await Usuario.find({ _id: { $in: inscritosIds } }).select("fcmTokens");
    await enviar(tokensDe(inscritos), {
      titulo: "Actividad cancelada",
      cuerpo: `${actividad.titulo} fue eliminada por su organizador y tu reserva se canceló.`,
      url: "/mis-reservas",
      tipo: "actividad-eliminada",
    });
  }, "actividad eliminada");

// Prueba desde la pantalla de notificaciones
const enviarPrueba = async (usuarioId) => {
  const usuario = await Usuario.findById(usuarioId).select("fcmTokens");
  const tokens = usuario?.fcmTokens || [];
  const resultado = await enviar(tokens, {
    titulo: "Solee",
    cuerpo: "Las notificaciones funcionan en este dispositivo.",
    url: "/notificaciones",
    tipo: "prueba",
  });
  return { dispositivos: tokens.length, ...resultado };
};

module.exports = {
  fcmDisponible,
  notificarNuevaActividad,
  notificarReservaConfirmada,
  notificarNuevaReserva,
  notificarCambioActividad,
  notificarEliminacion,
  enviarPrueba,
};