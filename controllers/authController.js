const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");
const { validarRut, formatearRut } = require("../utils/rut");

const calcularEdad = (fecha) => {
  const hoy = new Date();
  let edad = hoy.getFullYear() - fecha.getUTCFullYear();
  const mes = hoy.getMonth() - fecha.getUTCMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < fecha.getUTCDate())) edad--;
  return edad;
};

const generarToken = (usuario) =>
  jwt.sign(
    { userId: usuario._id, rol: usuario.rol, email: usuario.email },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );

// POST /api/auth/register
const registrar = async (req, res) => {
  try {
    const {
      nombre, email, password, confirmPassword, rol, rut,
      tipoCuenta = "persona", fechaNacimiento, telefono, comuna,
      intereses = [], aceptaTerminos,
    } = req.body;

    if (!nombre || !email || !password || !rol || !rut) {
      return res.status(400).json({ mensaje: "Faltan campos obligatorios" });
    }
    if (!["participante", "organizador"].includes(rol)) {
      return res.status(400).json({ mensaje: "Rol inválido" });
    }
    if (!["persona", "organizacion"].includes(tipoCuenta)) {
      return res.status(400).json({ mensaje: "Tipo de cuenta inválido" });
    }
    if (tipoCuenta === "organizacion" && rol !== "organizador") {
      return res.status(400).json({ mensaje: "Solo los organizadores pueden registrarse como organización" });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ mensaje: "Las contraseñas no coinciden" });
    }
    if (!/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
      return res.status(400).json({
        mensaje: "La contraseña debe tener mínimo 8 caracteres, 1 mayúscula y 1 número",
      });
    }
    if (!validarRut(rut)) {
      return res.status(400).json({ mensaje: "El RUT ingresado no es válido" });
    }
    if (aceptaTerminos !== true) {
      return res.status(400).json({ mensaje: "Debes aceptar el tratamiento de datos personales" });
    }
    if (!Array.isArray(intereses)) {
      return res.status(400).json({ mensaje: "Intereses inválidos" });
    }

    let fecha;
    if (tipoCuenta === "persona") {
      if (!fechaNacimiento) {
        return res.status(400).json({ mensaje: "La fecha de nacimiento es obligatoria" });
      }
      fecha = new Date(fechaNacimiento);
      if (isNaN(fecha.getTime())) {
        return res.status(400).json({ mensaje: "Fecha de nacimiento inválida" });
      }
      if (calcularEdad(fecha) < 18) {
        return res.status(400).json({ mensaje: "Debes ser mayor de 18 años para registrarte" });
      }
    }

    let telefonoLimpio;
    if (telefono) {
      telefonoLimpio = String(telefono).replace(/[\s-]/g, "");
      if (!/^\+?\d{8,12}$/.test(telefonoLimpio)) {
        return res.status(400).json({ mensaje: "Teléfono inválido" });
      }
    }

    const emailNorm = String(email).toLowerCase().trim();
    const rutNorm = formatearRut(rut);

    const existente = await Usuario.findOne({ $or: [{ email: emailNorm }, { rut: rutNorm }] });
    if (existente) {
      const mensaje = existente.email === emailNorm
        ? "Este correo ya está registrado"
        : "Ya existe una cuenta con este RUT";
      return res.status(409).json({ mensaje });
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const nuevoUsuario = await Usuario.create({
      nombre: String(nombre).trim(),
      email: emailNorm,
      passwordHash,
      rol,
      tipoCuenta,
      rut: rutNorm,
      fechaNacimiento: fecha,
      telefono: telefonoLimpio,
      comuna: comuna ? String(comuna).trim() : undefined,
      intereses,
      consentimientoLey19628: { aceptado: true, fecha: new Date(), ipAddress: req.ip },
    });

    res.status(201).json({
      mensaje: "Usuario registrado exitosamente",
      token: generarToken(nuevoUsuario),
      usuario: {
        id: nuevoUsuario._id,
        nombre: nuevoUsuario.nombre,
        email: nuevoUsuario.email,
        rol: nuevoUsuario.rol,
        tipoCuenta: nuevoUsuario.tipoCuenta,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ mensaje: "Ya existe una cuenta con esos datos" });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ mensaje: Object.values(error.errors)[0].message });
    }
    console.error("Error en registro:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ mensaje: "Email y contraseña son obligatorios" });
    }

    const usuario = await Usuario.findOne({ email: String(email).toLowerCase().trim() });
    if (!usuario) {
      return res.status(401).json({ mensaje: "Credenciales inválidas" });
    }

    const passwordCorrecta = await bcrypt.compare(password, usuario.passwordHash);
    if (!passwordCorrecta) {
      return res.status(401).json({ mensaje: "Credenciales inválidas" });
    }

    res.status(200).json({
      mensaje: "Login exitoso",
      token: generarToken(usuario),
      usuario: {
        id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        tipoCuenta: usuario.tipoCuenta,
      },
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

module.exports = { registrar, login };