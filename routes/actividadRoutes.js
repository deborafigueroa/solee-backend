const express = require("express");
const router = express.Router();
const { buscarActividades, obtenerActividad, crearActividad } = require("../controllers/actividadController");

router.get("/", buscarActividades);
router.get("/:id", obtenerActividad);
router.post("/", crearActividad);

module.exports = router;