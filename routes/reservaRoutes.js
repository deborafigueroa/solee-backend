const express = require("express");
const router = express.Router();
const { crearReserva, misReservas, cancelarReserva } = require("../controllers/reservaController");
const { verificarToken, soloParticipante } = require("../middleware/auth");

router.post("/", verificarToken, soloParticipante, crearReserva);
router.get("/mis-reservas", verificarToken, soloParticipante, misReservas);
router.put("/:id/cancelar", verificarToken, soloParticipante, cancelarReserva);

module.exports = router;