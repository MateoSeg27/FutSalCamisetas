/*
 * FutSal Camisetas - envío de emails con Gmail (Google Apps Script)
 *
 * Cómo instalarlo:
 * 1. Entrá a https://script.google.com con la cuenta de Gmail que va a enviar los emails.
 * 2. "Nuevo proyecto", borrá lo que haya y pegá todo este archivo.
 * 3. Reemplazá PEGAR_CLAVE_ACA por la misma clave que pusiste en Render (GMAIL_SCRIPT_CLAVE).
 * 4. "Implementar" -> "Nueva implementación" -> tipo "Aplicación web".
 *    Ejecutar como: "Yo".  Quién tiene acceso: "Cualquier usuario".
 * 5. Autorizá los permisos y copiá la URL que termina en /exec: va en Render como GMAIL_SCRIPT_URL.
 *
 * Límite de Google para cuentas de Gmail gratis: 100 destinatarios por día.
 */
var CLAVE = 'PEGAR_CLAVE_ACA';

function doPost(e) {
  var r;
  try {
    var d = JSON.parse(e.postData.contents);
    if (!d || d.clave !== CLAVE || CLAVE === 'PEGAR_CLAVE_ACA') {
      r = { ok: false, error: 'clave incorrecta' };
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.para || ''))) {
      r = { ok: false, error: 'destinatario inválido' };
    } else if (MailApp.getRemainingDailyQuota() < 1) {
      r = { ok: false, error: 'se alcanzó el límite diario de Gmail' };
    } else {
      MailApp.sendEmail({
        to: d.para,
        subject: String(d.asunto || '').slice(0, 200),
        body: String(d.texto || ''),
        htmlBody: String(d.html || ''),
        name: 'FutSal Camisetas'
      });
      r = { ok: true, quedan: MailApp.getRemainingDailyQuota() };
    }
  } catch (err) {
    r = { ok: false, error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON);
}

// Para probar desde el editor: elegí "probar" y tocá Ejecutar (te llega un email a vos)
function probar() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(), 'Prueba FutSal Camisetas', 'Si te llegó esto, el envío funciona.');
}
