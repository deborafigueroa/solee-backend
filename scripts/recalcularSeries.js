require("dotenv").config();
const mongoose = require("mongoose");
const Actividad = require("../models/Actividad");
const Resena = require("../models/Resena");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const series = await Actividad.distinct("serieId", { serieId: { $ne: null } });
  for (const serieId of series) {
    const ids = await Actividad.distinct("_id", { serieId });
    const [resumen] = await Resena.aggregate([
      { $match: { actividadId: { $in: ids } } },
      { $group: { _id: null, promedio: { $avg: "$calificacion" }, total: { $sum: 1 } } },
    ]);
    const promedio = resumen ? Math.round(resumen.promedio * 10) / 10 : 0;
    const total = resumen ? resumen.total : 0;

    await Actividad.updateMany({ _id: { $in: ids } }, { calificacionPromedio: promedio, totalResenas: total });
    console.log(`Serie ${serieId}: ${ids.length} fechas, promedio ${promedio}, ${total} reseñas`);
  }

  await mongoose.disconnect();
  console.log("Listo");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});