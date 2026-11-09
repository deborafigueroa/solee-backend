const express = require("express");
const router = express.Router();
const { listarResenas, crearResena, editarResena } = require("../controllers/resenaController");
const { verificarToken, tokenOpcional, soloParticipante } = require("../middleware/auth");

router.get("/actividad/:id", tokenOpcional, listarResenas);
router.post("/", verificarToken, soloParticipante, crearResena);
router.put("/:id", verificarToken, soloParticipante, editarResena);

module.exports = router;