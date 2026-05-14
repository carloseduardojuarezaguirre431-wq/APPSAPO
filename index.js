const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();
app.use(express.json());

const TOKEN = '8668269684:AAHES_9m1QGAXEkAg8KR1TfTLKwgKMiien0';
const CHAT_ID = '6837082259';
const bot = new TelegramBot(TOKEN, { polling: true });

// Escuchar botones
bot.on('callback_query', async (query) => {
  const data = query.data;
  const msgId = query.message.message_id;
  const parts = data.split('_');
  const accion = parts[0];
  const uid = parts[1];
  const monto = parts[2];

  if (accion === 'ACEPTAR') {
    await bot.answerCallbackQuery(query.id, { text: '✅ Retiro aceptado' });
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: CHAT_ID, message_id: msgId });
    await bot.sendMessage(CHAT_ID, `✅ Retiro de $${monto} MXN ACEPTADO para usuario ${uid}`);
  } else if (accion === 'DENEGAR') {
    await bot.answerCallbackQuery(query.id, { text: '❌ Retiro denegado' });
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: CHAT_ID, message_id: msgId });
    await bot.sendMessage(CHAT_ID, `❌ Retiro de $${monto} MXN DENEGADO para usuario ${uid}`);
  }
});

app.get('/', (req, res) => res.send('🐸 SapoMaya Bot activo'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot corriendo en puerto ${PORT}`));
