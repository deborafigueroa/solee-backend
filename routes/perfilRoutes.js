const express = require("express");
const router = express.Router();
const { obtenerPerfil, actualizarPerfil, cambiarContrasena } = require("../controllers/perfilController");
const { verificarToken } = require("../middleware/auth");

router.use(verificarToken);
router.get("/", obtenerPerfil);
router.put("/", actualizarPerfil);
router.put("/contrasena", cambiarContrasena);

module.exports = router;