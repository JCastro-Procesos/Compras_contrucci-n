'use strict';
// Envia correos por SMTP (variables de entorno SMTP_*). Si no hay SMTP configurado,
// guarda el correo en la tabla "correos" (se ve en Administracion > Correos) y no falla.
const { db, now } = require('./db');
let transport = null;
function getTransport() {
  if (transport !== null) return transport;
  if (!process.env.SMTP_HOST) return (transport = false);
  try { const nm = require('nodemailer'); transport = nm.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === '1', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined }); }
  catch { console.warn('nodemailer no esta instalado: los correos solo se guardan en la tabla'); transport = false; }
  return transport;
}
function enviarCorreo(para, asunto, html, adjuntos) {
  const r = db.prepare('INSERT INTO correos(para,asunto,cuerpo,ts) VALUES(?,?,?,?)').run(para, asunto, html, now()); const id = Number(r.lastInsertRowid);
  const t = getTransport(); if (!t) return;
  const intento = (n) => t.sendMail({ from: process.env.SMTP_FROM || 'compras-itm@localhost', to: para, subject: asunto, html, attachments: adjuntos || [] })
    .then(() => db.prepare('UPDATE correos SET enviado=1, error=NULL WHERE id=?').run(id))
    .catch(e => { db.prepare('UPDATE correos SET error=? WHERE id=?').run(String(e.message).slice(0, 300), id); if (n < 3) setTimeout(() => intento(n + 1), 30000 * n); });
  intento(1);
}
module.exports = { enviarCorreo };
