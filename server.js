const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Configuración ────────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY  = process.env.GEMINI_API_KEY;

if (!TELEGRAM_TOKEN || !GEMINI_API_KEY) {
  console.error("❌ Faltan variables de entorno: TELEGRAM_BOT_TOKEN o GEMINI_API_KEY");
  process.exit(1);
}

// ── Inicializar Gemini ───────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  systemInstruction:
    "Eres un asistente útil, amigable y conciso. Responde siempre en el mismo idioma que el usuario.",
});

// ── Inicializar Bot de Telegram (polling) ────────────────────────────────────
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
console.log("🤖 Bot de Telegram con Gemini iniciado...");

// Historial de conversación por usuario (memoria en sesión)
const userChats = {};

// Helper: crear una nueva sesión de chat para un usuario
function nuevaSesion() {
  return model.startChat({
    history: [],
    generationConfig: { maxOutputTokens: 1024, temperature: 0.9 },
  });
}

// ── /start ───────────────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const nombre = msg.from.first_name || "amigo";
  userChats[chatId] = nuevaSesion();

  bot.sendMessage(
    chatId,
    `¡Hola, ${nombre}! 👋\n\n` +
    `Soy un asistente potenciado con *Gemini AI*. Escríbeme lo que quieras y haré mi mejor esfuerzo para ayudarte.\n\n` +
    `📌 *Comandos:*\n` +
    `/start – Reiniciar conversación\n` +
    `/ayuda – Ver ayuda`,
    { parse_mode: "Markdown" }
  );
});

// ── /ayuda ───────────────────────────────────────────────────────────────────
bot.onText(/\/ayuda/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `🆘 *Ayuda*\n\n` +
    `Simplemente escríbeme cualquier pregunta y te responderé con IA.\n\n` +
    `📌 *Comandos:*\n` +
    `/start – Iniciar o reiniciar la conversación\n` +
    `/ayuda – Mostrar este mensaje\n\n` +
    `_Tengo memoria de nuestra conversación actual. Usa /start para borrarla._`,
    { parse_mode: "Markdown" }
  );
});

// ── Mensajes de texto ────────────────────────────────────────────────────────
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  // Solo procesar mensajes de texto que no sean comandos
  if (!msg.text || msg.text.startsWith("/")) return;

  // Indicador "escribiendo..."
  bot.sendChatAction(chatId, "typing");

  try {
    // Crear sesión si no existe
    if (!userChats[chatId]) userChats[chatId] = nuevaSesion();

    const result   = await userChats[chatId].sendMessage(msg.text);
    const respuesta = result.response.text();

    await bot.sendMessage(chatId, respuesta, { parse_mode: "Markdown" });
  } catch (error) {
    console.error(`[Error Gemini] chat=${chatId}:`, error.message);

    // Reiniciar sesión corrupta y avisar al usuario
    userChats[chatId] = nuevaSesion();
    bot.sendMessage(
      chatId,
      "😕 Ocurrió un error al procesar tu mensaje. Ya reinicié la sesión, intenta de nuevo."
    );
  }
});

// ── Errores de polling ───────────────────────────────────────────────────────
bot.on("polling_error", (err) => {
  console.error("[Polling Error]", err.code, err.message);
});

// ── Servidor Express — health check para Render ──────────────────────────────
app.get("/", (_req, res) => {
  res.json({ status: "ok", bot: "Telegram + Gemini AI ✅" });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor Express en puerto ${PORT}`);
});