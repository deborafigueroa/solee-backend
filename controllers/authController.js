const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");

// POST /api/auth/register
const registrar = async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body;

    // Validaciones básicas
    if (!nombre || !email || !password || !rol) {
      return res.status(400).json({ mensaje: "Todos los campos son obligatorios" });
    }

    if (!["participante", "organizador"].includes(rol)) {
      return res.status(400).json({ mensaje: "Rol inválido" });
    }

    // Validar fuerza de contraseña (mínimo 8 caracteres, 1 mayúscula, 1 número)
    const passwordValida = /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
    if (!passwordValida) {
      return res.status(400).json({
        mensaje: "La contraseña debe tener mínimo 8 caracteres, 1 mayúscula y 1 número",
      });
    }

    // Verificar si el email ya existe
    const existeUsuario = await Usuario.findOne({ email });
    if (existeUsuario) {
      return res.status(409).json({ mensaje: "Este correo ya está registrado" });
    }

    // Hash de la contraseña
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    // Crear usuario
    const nuevoUsuario = await Usuario.create({
      nombre,
      email,
      passwordHash,
      rol,
    });

    // Generar JWT
    const token = jwt.sign(
      { userId: nuevoUsuario._id, rol: nuevoUsuario.rol, email: nuevoUsuario.email },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.status(201).json({
      mensaje: "Usuario registrado exitosamente",
      token,
      usuario: {
        id: nuevoUsuario._id,
        nombre: nuevoUsuario.nombre,
        email: nuevoUsuario.email,
        rol: nuevoUsuario.rol,
      },
    });
  } catch (error) {
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

    // Buscar usuario
    const usuario = await Usuario.findOne({ email });
    if (!usuario) {
      return res.status(401).json({ mensaje: "Credenciales inválidas" });
    }

    // Comparar contraseña
    const passwordCorrecta = await bcrypt.compare(password, usuario.passwordHash);
    if (!passwordCorrecta) {
      return res.status(401).json({ mensaje: "Credenciales inválidas" });
    }

    // Generar JWT
    const token = jwt.sign(
      { userId: usuario._id, rol: usuario.rol, email: usuario.email },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.status(200).json({
      mensaje: "Login exitoso",
      token,
      usuario: {
        id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
      },
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

module.exports = { registrar, login };