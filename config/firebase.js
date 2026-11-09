const fs = require("fs");
const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

let messaging = null;

const rutaClave = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
  : path.join(__dirname, "..", "firebase-service-account.json");

try {
  if (fs.existsSync(rutaClave)) {
    const credenciales = JSON.parse(fs.readFileSync(rutaClave, "utf8"));
    initializeApp({ credential: cert(credenciales) });
    messaging = getMessaging();
    console.log("✅ Firebase listo para enviar notificaciones");
  } else {
    console.warn("⚠️ No se encontró firebase-service-account.json: las notificaciones push quedan desactivadas");
  }
} catch (error) {
  console.error("❌ No se pudo iniciar Firebase:", error.message);
}

module.exports = { obtenerMessaging: () => messaging };