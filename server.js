const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const Groq = require("groq-sdk");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Configuración ────────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROQ_API_KEY  = process.env.GROQ_API_KEY;

if (!TELEGRAM_TOKEN || !GROQ_API_KEY) {
  console.error("❌ Faltan variables de entorno: TELEGRAM_BOT_TOKEN o GROQ_API_KEY");
  process.exit(1);
}

// ── Inicializar Groq ─────────────────────────────────────────────────────────
const groq = new Groq({ apiKey: GROQ_API_KEY });
const SYSTEM_PROMPT = "Eres un asistente útil, amigable y conciso. Responde siempre en el mismo idioma que el usuario.";

// ── Inicializar Bot de Telegram (polling) ────────────────────────────────────
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
console.log("🤖 Bot de Telegram con Groq iniciado...");

// Historial de conversación por usuario (memoria en sesión)
const userChats = {};

// Helper: crear una nueva sesión de chat para un usuario
function nuevaSesion() {
  return [
    { role: "system", content: SYSTEM_PROMPT }
  ];
}

// ── /start ───────────────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const nombre = msg.from.first_name || "amigo";
  
  console.log(`[BOT] Comando /start recibido de ${nombre} (${chatId})`);
  
  userChats[chatId] = nuevaSesion();

  bot.sendMessage(
    chatId,
    `¡Hola, ${nombre}! 👋\n\n` +
    `Soy un asistente potenciado con Groq AI. Escríbeme lo que quieras y haré mi mejor esfuerzo para ayudarte.\n\n` +
    `📌 Comandos:\n` +
    `/start – Reiniciar conversación\n` +
    `/ayuda – Ver ayuda`
  ).catch(err => console.error("[Error Envío /start]", err.message));
});

// ── /ayuda ───────────────────────────────────────────────────────────────────
bot.onText(/\/ayuda/, (msg) => {
  console.log(`[BOT] Comando /ayuda recibido`);
  bot.sendMessage(
    msg.chat.id,
    `🆘 Ayuda\n\n` +
    `Simplemente escríbeme cualquier pregunta y te responderé con IA.\n\n` +
    `📌 Comandos:\n` +
    `/start – Iniciar o reiniciar la conversación\n` +
    `/ayuda – Mostrar este mensaje\n\n` +
    `Tengo memoria de nuestra conversación actual. Usa /start para borrarla.`
  ).catch(err => console.error("[Error Envío /ayuda]", err.message));
});

// ── Mensajes de texto ────────────────────────────────────────────────────────
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  // Solo procesar mensajes de texto que no sean comandos
  if (!msg.text || msg.text.startsWith("/")) return;

  console.log(`[BOT] Mensaje recibido de ${chatId}: ${msg.text}`);

  // Indicador "escribiendo..."
  bot.sendChatAction(chatId, "typing").catch(() => {});

  try {
    // Crear sesión si no existe
    if (!userChats[chatId]) userChats[chatId] = nuevaSesion();

    // Agregar el mensaje del usuario al historial
    userChats[chatId].push({ role: "user", content: msg.text });

    // Llamar a Groq
    const result = await groq.chat.completions.create({
      messages: userChats[chatId],
      model: "llama3-8b-8192",
      temperature: 0.9,
      max_tokens: 1024,
    });

    const respuesta = result.choices[0]?.message?.content || "No tengo respuesta para eso.";

    // Guardar la respuesta del asistente en el historial
    userChats[chatId].push({ role: "assistant", content: respuesta });

    // Limitar el historial a los últimos 15 mensajes para no exceder tokens
    if (userChats[chatId].length > 15) {
      userChats[chatId] = [
        userChats[chatId][0], // Mantener el system prompt
        ...userChats[chatId].slice(-14)
      ];
    }

    await bot.sendMessage(chatId, respuesta);
  } catch (error) {
    console.error(`[Error Groq] chat=${chatId}:`, error.message);

    // Reiniciar sesión corrupta y avisar al usuario
    userChats[chatId] = nuevaSesion();
    bot.sendMessage(
      chatId,
      "😕 Ocurrió un error al procesar tu mensaje con Groq. Ya reinicié la sesión, intenta de nuevo."
    ).catch(() => {});
  }
});

// ── Errores de polling ───────────────────────────────────────────────────────
bot.on("polling_error", (err) => {
  console.error("[Polling Error]", err.code, err.message);
});

// ── Servidor Express — health check para Render ──────────────────────────────
app.get("/", (_req, res) => {
  res.json({ status: "ok", bot: "Telegram + Groq AI ✅" });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor Express en puerto ${PORT}`);
});