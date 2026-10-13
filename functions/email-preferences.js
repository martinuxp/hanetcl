const { Buffer } = require("node:buffer");
const { timingSafeEqual } = require("node:crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { escapeHtml, LOGO_BASE, CONTACT } = require("./email");

// "Configurar notificaciones" in ClassHall's emails: a page where a student
// turns those emails off or back on, without signing in. The link carries
// the account's uid and the random token saved with it the first time it got
// one of these emails (accounts/{uid}.emailToken). Mail apps' one-click
// unsubscribe (List-Unsubscribe-Post) lands here too.

function sameToken(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function page({ title, body, form }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · HaNet</title>
<style>
  body { margin: 0; background: #efeeea; color: #241c15; font-family: Inter, Arial, sans-serif; }
  header { background: #282829; padding: 24px; text-align: center; }
  main { max-width: 480px; margin: 0 auto; padding: 40px 24px; }
  h1 { margin: 0 0 16px; font-family: 'DM Sans', Arial, sans-serif; font-size: 32px; line-height: 38px; letter-spacing: -1px; color: #000; }
  p { font-size: 16px; line-height: 24px; margin: 0 0 16px; }
  button { width: 100%; margin-top: 16px; padding: 22px; border: 0; border-radius: 60px; background: #ef2274; color: #282829; font: 700 16px Inter, Arial, sans-serif; cursor: pointer; }
  small { display: block; margin-top: 24px; font-size: 12px; line-height: 18px; }
</style>
</head>
<body>
<header><img src="${LOGO_BASE}/hanet-logo-blanco.png" width="147" height="40" alt="HaNet"></header>
<main>
<h1>${escapeHtml(title)}</h1>
${body}
${form || ""}
<small>¿Dudas? Escríbenos a ${CONTACT}.</small>
</main>
</body>
</html>`;
}

function build(getAdminApp) {
  const emailPreferences = onRequest({ invoker: "public" }, async (request, response) => {
    response.set("Cache-Control", "no-store");
    const uid = String(request.query.u || request.body?.u || "");
    const token = String(request.query.t || request.body?.t || "");
    const ref = uid && !uid.includes("/") ? getFirestore(getAdminApp(), "hn-enrollmentdata").collection("accounts").doc(uid) : null;
    const account = ref ? (await ref.get()).data() : null;
    if (!account || !account.emailToken || !sameToken(account.emailToken, token)) {
      response.status(404).send(page({
        title: "Enlace no válido",
        body: "<p>Este enlace no funciona. Abre el último correo de ClassHall que recibiste y vuelve a tocar «Configurar notificaciones».</p>",
      }));
      return;
    }

    if (request.method === "POST") {
      // A mail app's one-click unsubscribe, or the button on this page.
      const turnOn = request.body?.activar === "1";
      await ref.set({ emailNotifications: { classhall: turnOn }, emailNotificationsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (request.query.salir === "1") {
        response.status(200).send("ok");
        return;
      }
    }

    const fresh = (await ref.get()).data();
    const on = fresh.emailNotifications?.classhall !== false;
    const hidden = `<input type="hidden" name="u" value="${escapeHtml(uid)}"><input type="hidden" name="t" value="${escapeHtml(token)}">`;
    response.status(200).send(page({
      title: "Correos de ClassHall",
      body: on
        ? "<p>Te enviamos un correo cuando tu docente publica un anuncio, una tarea o material nuevo, y un recordatorio el día antes de entregar una tarea.</p><p>Lo verás todo igual en la app aunque los desactives.</p>"
        : "<p>Los correos de ClassHall están <b>desactivados</b>. Vas a seguir viendo los anuncios, tareas y materiales en la app.</p>",
      form: `<form method="post" action="/notificaciones">${hidden}<input type="hidden" name="activar" value="${on ? "0" : "1"}"><button type="submit">${on ? "Desactivar correos de ClassHall" : "Volver a activarlos"}</button></form>`,
    }));
  });

  return { emailPreferences };
}

module.exports = { build };
