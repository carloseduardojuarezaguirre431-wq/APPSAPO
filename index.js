const express = require('express');
const fetch = require('node-fetch');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const app = express();
app.use(express.json());

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const TOKEN   = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BASE_URL = `https://api.telegram.org/bot${TOKEN}`;

async function sendMessage(chat_id, text) {
  await fetch(`${BASE_URL}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'Markdown' })
  });
}

async function answerCallback(callback_query_id, text) {
  await fetch(`${BASE_URL}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id, text, show_alert: false })
  });
}

async function editMessage(chat_id, message_id, text) {
  await fetch(`${BASE_URL}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, message_id, text, parse_mode: 'Markdown' })
  });
}

async function editCaption(chat_id, message_id, caption) {
  await fetch(`${BASE_URL}/editMessageCaption`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, message_id, caption, parse_mode: 'Markdown' })
  });
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const update = req.body;
  if (!update.callback_query) return;

  const cq         = update.callback_query;
  const data       = cq.data;
  const chat_id    = cq.message.chat.id;
  const message_id = cq.message.message_id;
  const parts      = data.split(':');
  const accion     = parts[0];

  await answerCallback(cq.id, 'Procesando...');

  try {
    // RETIROS
    if (accion === 'aprobar_retiro' || accion === 'rechazar_retiro') {
      const retiroId  = parts[1];
      const retiroRef = db.collection('retiros_pendientes').doc(retiroId);
      const snap      = await retiroRef.get();

      if (!snap.exists) { await sendMessage(chat_id, `No se encontro el retiro ${retiroId}`); return; }
      const retiro = snap.data();
      if (retiro.estado !== 'pendiente') { await sendMessage(chat_id, `Este retiro ya fue procesado: ${retiro.estado}`); return; }

      if (accion === 'aprobar_retiro') {
        await retiroRef.update({ estado: 'aprobado', procesadoEn: FieldValue.serverTimestamp() });
        await db.collection('usuarios').doc(retiro.uid).collection('historial').add({
          tipo: 'retiro_aprobado', monto: retiro.monto, fecha: FieldValue.serverTimestamp()
        });
        await editMessage(chat_id, message_id,
          `*RETIRO APROBADO*\n\nUsuario: ${retiro.usuario}\nMonto: $${retiro.monto.toFixed(2)} MXN\nA pagar: $${retiro.recibe.toFixed(2)} MXN\nCuenta: ${retiro.cuenta}\nTitular: ${retiro.nombre}\n\nAprobado por admin`
        );
      } else {
        await db.collection('usuarios').doc(retiro.uid).update({ saldo: FieldValue.increment(retiro.monto) });
        await retiroRef.update({ estado: 'rechazado', procesadoEn: FieldValue.serverTimestamp() });
        await db.collection('usuarios').doc(retiro.uid).collection('historial').add({
          tipo: 'retiro_rechazado', monto: retiro.monto, fecha: FieldValue.serverTimestamp()
        });
        await editMessage(chat_id, message_id,
          `*RETIRO RECHAZADO*\n\nUsuario: ${retiro.usuario}\nMonto: $${retiro.monto.toFixed(2)} MXN\nSaldo devuelto al usuario\n\nRechazado por admin`
        );
      }
    }

    // RECARGAS
    if (accion === 'aprobar_recarga' || accion === 'rechazar_recarga') {
      const recargaId  = parts[1];
      const monto      = parseFloat(parts[2]);
      const uid        = parts[3];
      const recargaRef = db.collection('recargas_pendientes').doc(recargaId);
      const snap       = await recargaRef.get();

      if (!snap.exists) { await sendMessage(chat_id, `No se encontro la recarga ${recargaId}`); return; }
      const recarga = snap.data();
      if (recarga.estado !== 'pendiente') { await sendMessage(chat_id, `Esta recarga ya fue procesada: ${recarga.estado}`); return; }

      if (accion === 'aprobar_recarga') {
        await db.collection('usuarios').doc(uid).update({ saldo: FieldValue.increment(monto) });
        await recargaRef.update({ estado: 'aprobado', procesadoEn: FieldValue.serverTimestamp() });
        await db.collection('usuarios').doc(uid).collection('historial').add({
          tipo: 'recarga', monto, fecha: FieldValue.serverTimestamp()
        });
        await editCaption(chat_id, message_id,
          `*RECARGA APROBADA*\n\nUsuario: ${recarga.usuario}\nMonto acreditado: $${monto.toFixed(2)} MXN\n\nAprobado por admin`
        );
      } else {
        await recargaRef.update({ estado: 'rechazado', procesadoEn: FieldValue.serverTimestamp() });
        await db.collection('usuarios').doc(uid).collection('historial').add({
          tipo: 'recarga_rechazada', monto, fecha: FieldValue.serverTimestamp()
        });
        await editCaption(chat_id, message_id,
          `*RECARGA RECHAZADA*\n\nUsuario: ${recarga.usuario}\nMonto: $${monto.toFixed(2)} MXN\n\nRechazado por admin`
        );
      }
    }

  } catch (err) {
    console.error('Error:', err);
    await sendMessage(chat_id, `Error interno: ${err.message}`);
  }
});

app.get('/', (req, res) => res.send('SapoMaya Bot activo'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot corriendo en puerto ${PORT}`));
