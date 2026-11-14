'use strict';
/*
 * Envio de emails con Brevo (API por HTTPS).
 * Variables: BREVO_API_KEY y EMAIL_REMITENTE.
 * Sin esas variables (pruebas en la computadora) el mensaje se muestra en la consola.
 */
const API_KEY = process.env.BREVO_API_KEY || '';
const REMITENTE = process.env.EMAIL_REMITENTE || '';

const configurado = !!(API_KEY && REMITENTE);

function escapar(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function enviar(para, asunto, texto, html) {
  if (!configurado) {
    console.log('\n[EMAIL de prueba, no se envió] Para: ' + para + '\nAsunto: ' + asunto + '\n' + texto + '\n');
    return;
  }
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 15000);
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'FutSal Camisetas', email: REMITENTE },
        to: [{ email: para }],
        subject: asunto,
        textContent: texto,
        htmlContent: html,
      }),
      signal: control.signal,
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      throw new Error('Brevo respondió ' + res.status + ': ' + detalle.slice(0, 300));
    }
  } finally {
    clearTimeout(reloj);
  }
}

function enviarCodigo(para, nombre, codigo, tipo) {
  const esAlta = tipo === 'verificacion';
  const asunto = (esAlta ? 'Tu código para confirmar la cuenta: ' : 'Tu código para cambiar la contraseña: ') + codigo;
  const intro = esAlta
    ? 'Usá este código para confirmar tu email y terminar de crear tu cuenta en FutSal Camisetas:'
    : 'Usá este código para elegir una contraseña nueva en FutSal Camisetas:';
  const pie = 'El código vence en 15 minutos. Si no fuiste vos, ignorá este mensaje.';
  const texto = 'Hola ' + nombre + ',\n\n' + intro + '\n\n' + codigo + '\n\n' + pie + '\n\nFutSal Camisetas';
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#161616">' +
    '<div style="background:#0d0d0d;color:#fff;padding:18px 24px;font-weight:bold;font-style:italic;letter-spacing:1px">FUTSAL CAMISETAS</div>' +
    '<div style="padding:24px;border:1px solid #e4e4e4;border-top:0">' +
    '<p style="margin:0 0 12px">Hola ' + escapar(nombre) + ',</p>' +
    '<p style="margin:0 0 20px">' + intro + '</p>' +
    '<p style="margin:0 0 20px;font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;background:#f3f3f3;padding:16px">' + codigo + '</p>' +
    '<p style="margin:0;color:#6b6b6b;font-size:13px">' + pie + '</p>' +
    '</div></div>';
  return enviar(para, asunto, texto, html);
}

module.exports = { configurado, enviarCodigo };
