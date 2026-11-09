const jwt = require("jsonwebtoken");

const verificarToken = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ mensaje: "Token no proporcionado" });
  }

  try {
    const token = header.split(" ")[1];
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ mensaje: "Token inválido o expirado" });
  }
};

const tokenOpcional = (req, res, next) => {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      req.usuario = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    } catch (error) {
      // Token inválido: se trata como visitante
    }
  }
  next();
};

const soloOrganizador = (req, res, next) => {
  if (req.usuario.rol !== "organizador") {
    return res.status(403).json({ mensaje: "Solo los organizadores pueden realizar esta acción" });
  }
  next();
};

const soloParticipante = (req, res, next) => {
  if (req.usuario.rol !== "participante") {
    return res.status(403).json({ mensaje: "Solo los participantes pueden realizar esta acción" });
  }
  next();
};

module.exports = { verificarToken, tokenOpcional, soloOrganizador, soloParticipante };