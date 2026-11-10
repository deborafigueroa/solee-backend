const express = require("express");
const router = express.Router();
const { registrarVista, resumenOrganizador } = require("../controllers/analiticaController");
const { verificarToken, soloParticipante, soloOrganizador } = require("../middleware/auth");

router.post("/vistas", verificarToken, soloParticipante, registrarVista);
router.get("/organizador", verificarToken, soloOrganizador, resumenOrganizador);

module.exports = router;