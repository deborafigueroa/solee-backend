const limpiarRut = (rut) => String(rut).replace(/[^0-9kK]/g, "").toUpperCase();

const validarRut = (rut) => {
  const limpio = limpiarRut(rut);
  if (limpio.length < 8 || limpio.length > 9) return false;

  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;

  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dv === esperado;
};

const formatearRut = (rut) => {
  const limpio = limpiarRut(rut);
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
};

module.exports = { validarRut, formatearRut };