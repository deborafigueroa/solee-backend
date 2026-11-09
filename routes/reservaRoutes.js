const express = require("express");
const router = express.Router();
const {
  crearReserva, misReservas, cancelarReserva, reservasDeActividad, marcarAsistencia,
} = require("../controllers/reservaController");
const { verificarToken, soloParticipante, soloOrganizador } = require("../middleware/auth");

router.post("/", verificarToken, soloParticipante, crearReserva);
router.get("/mis-reservas", verificarToken, soloParticipante, misReservas);
router.get("/actividad/:id", verificarToken, soloOrganizador, reservasDeActividad);
router.put("/:id/asistencia", verificarToken, soloOrganizador, marcarAsistencia);
router.put("/:id/cancelar", verificarToken, soloParticipante, cancelarReserva);

module.exports = router;