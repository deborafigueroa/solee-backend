const express = require("express");
const router = express.Router();
const {
  registrarDispositivo, quitarDispositivo, estadoDispositivo,
  obtenerPreferencias, actualizarIntereses, probarNotificacion,
} = require("../controllers/notificacionController");
const { verificarToken, soloParticipante } = require("../middleware/auth");

router.use(verificarToken);
router.post("/suscribir", registrarDispositivo);
router.post("/desuscribir", quitarDispositivo);
router.post("/estado", estadoDispositivo);
router.get("/preferencias", obtenerPreferencias);
router.put("/intereses", soloParticipante, actualizarIntereses);
router.post("/prueba", probarNotificacion);

module.exports = router;