const express = require("express");
const router = express.Router();
const { buscarActividades, obtenerActividad, crearActividad, misActividades } = require("../controllers/actividadController");
const { verificarToken, soloOrganizador } = require("../middleware/auth");

router.get("/", buscarActividades);
router.get("/mis-actividades", verificarToken, soloOrganizador, misActividades); // antes de "/:id"
router.get("/:id", obtenerActividad);
router.post("/", verificarToken, soloOrganizador, crearActividad);

module.exports = router;