const { defineSecret } = require("firebase-functions/params");

// Set with: firebase functions:secrets:set RESEND_API_KEY
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

const FROM = "HaNet <no-responder@hanet.muxp.art>";
// Email clients only load images from a public URL (served by Firebase Hosting).
const LOGO_BASE = "https://hanet-edu.web.app/email";
const TAGLINE = "La herramienta más moderna para estar conectad@ con tu institución.";
const TERMS_URL = "https://hanet-edu.web.app/terminos";
const CONTACT = "muxp@muxp.art";

const STATUS_URL = "https://status.hanet.muxp.art";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendEmail({ to, subject, html, text }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      // A secret loaded from a file can carry a trailing newline.
      Authorization: `Bearer ${RESEND_API_KEY.value().trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
  });

  if (!response.ok) {
    // The body can echo the recipient; log only the status.
    throw new Error(`Resend rejected the email with status ${response.status}`);
  }
}

// Several emails in one request (Resend takes up to 100 per call). Each
// message is { to, subject, html, text, headers }.
async function sendEmailBatch(messages) {
  for (let start = 0; start < messages.length; start += 100) {
    const chunk = messages.slice(start, start + 100).map(message => ({
      from: FROM,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.headers ? { headers: message.headers } : {}),
    }));
    const response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY.value().trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    });
    if (!response.ok) {
      // The body can echo recipients; log only the status.
      throw new Error(`Resend rejected the batch with status ${response.status}`);
    }
  }
}

// Shared frame for every HaNet email: dark header with the wordmark, light
// body and a footer. Tables and inline styles because email clients ignore
// most modern CSS.
function layout(bodyRows) {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:#efeeea;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efeeea;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
<tr><td align="center" style="background:#282829;padding:32px 16px;">
<img src="${LOGO_BASE}/hanet-logo-blanco.png" width="147" height="40" alt="HaNet" style="display:block;border:0;font-family:'DM Sans',Arial,sans-serif;font-size:28px;font-weight:700;color:#f9f9fa;">
</td></tr>
${bodyRows}
<tr><td style="padding:24px 0;"><div style="height:2px;background:#000000;font-size:0;line-height:0;">&nbsp;</div></td></tr>
<tr><td style="padding:16px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="bottom" style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;line-height:18px;color:#241c15;">
<img src="${LOGO_BASE}/hanet-logo-negro.png" width="147" height="40" alt="HaNet" style="display:block;border:0;font-size:24px;font-weight:700;color:#282829;">
<br>&copy;${year} HaNet Chile<br><br>${escapeHtml(TAGLINE)}
</td>
<td valign="bottom" align="right" style="font-family:Inter,Arial,sans-serif;font-size:13px;line-height:20px;color:#241c15;">
<a href="${TERMS_URL}" style="color:#241c15;text-decoration:underline;white-space:nowrap;">Términos y Condiciones</a><br>
<a href="mailto:${CONTACT}" style="color:#241c15;text-decoration:underline;">Contacto</a>
</td>
</tr></table>
</td></tr>
<tr><td style="padding:8px 32px 32px;font-family:Inter,Arial,sans-serif;font-size:11px;line-height:15px;color:#241c15;">
¿No reconoces este correo?<br>Puedes ignorarlo: nadie podrá usar tu correo sin este mensaje. Si te preocupa, escríbenos a <b>${CONTACT}</b>.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function codeBoxes(code) {
  const cells = String(code).split("").map(digit =>
    `<td align="center" width="63" height="83" style="width:63px;height:83px;background:#282829;border:2px solid #3c3b3e;font-family:'DM Sans',Arial,sans-serif;font-size:24px;font-weight:700;color:#dddde2;">${escapeHtml(digit)}</td>`
  ).join('<td width="4" style="width:4px;font-size:0;">&nbsp;</td>');
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>${cells}</tr></table>`;
}

function verificationCodeEmail({ fullName, username, code, minutes }) {
  const firstName = String(fullName || "").trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `Hola ${escapeHtml(firstName)}, te` : "Te";
  const handle = username ? ` @${escapeHtml(username)}` : "";
  const nameLine = fullName ? `<p style="margin:8px 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:20px;line-height:24px;font-style:italic;color:#000000;">¡Un placer, ${escapeHtml(fullName)}${handle}!</p>` : "";

  const html = layout(`
<tr><td style="padding:44px 32px;font-family:Inter,Arial,sans-serif;font-size:16px;line-height:24px;color:#241c15;">
<p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:40px;line-height:48px;font-weight:700;color:#000000;">Bienvenido a HaNet</p>
${nameLine}
<p style="margin:22px 0 0;">${greeting} damos la bienvenida a HaNet, la herramienta más moderna para estar conectad@ con tu institución.</p>
<p style="margin:0;">Te enviamos este correo para verificar que eres tú quien está usando este correo para registrar tu nuevo HaNet ID. Para esto necesitas introducir el siguiente código:</p>
</td></tr>
<tr><td align="center" style="padding:0 32px;">${codeBoxes(code)}</td></tr>
<tr><td style="padding:44px 32px;font-family:Inter,Arial,sans-serif;font-size:16px;line-height:24px;color:#241c15;">
<p style="margin:0;">Introdúcelo en tu aplicación durante los próximos ${minutes} minutos y verifica que eres tú.</p>
<p style="margin:0;">¡Gracias por usar HaNet${firstName ? `, ${escapeHtml(firstName)}` : ""}!</p>
</td></tr>`);

  const text = [
    "Bienvenido a HaNet",
    "",
    `Tu código de verificación es: ${code}`,
    `Introdúcelo en la aplicación durante los próximos ${minutes} minutos.`,
    "",
    "¿No reconoces este correo? Puedes ignorarlo.",
  ].join("\n");

  return { subject: `${code} es tu código de HaNet`, html, text };
}

// Figma "✉️ email verify Template": the institution's banner with HaNet's
// mark × its shield (both 112 px tall), then the invitation and a full-width button. Without a
// banner the band is dark; without a shield only HaNet's mark shows.
function institutionHero(bannerUrl, logoUrl) {
  const background = bannerUrl
    ? ` background="${escapeHtml(bannerUrl)}" style="background-color:#282829;background-image:url('${escapeHtml(bannerUrl)}');background-size:cover;background-position:center;"`
    : ` style="background-color:#282829;"`;
  const shield = logoUrl
    ? `<td style="padding:0 20px;font-family:'DM Sans',Arial,sans-serif;font-size:24px;line-height:29px;font-weight:900;color:#f9f9fa;text-shadow:0 0 4px rgba(0,0,0,0.7);">X</td>
<td><img src="${escapeHtml(logoUrl)}" height="112" alt="" style="display:block;border:0;height:112px;width:auto;max-width:140px;"></td>`
    : "";
  return `
<tr><td height="300" bgcolor="#282829"${background}>
<table role="presentation" width="100%" height="300" cellpadding="0" cellspacing="0" style="background-color:rgba(0,0,0,0.2);"><tr><td align="center" valign="middle" height="300">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td><img src="${LOGO_BASE}/hanet-icon.png" width="75" height="112" alt="HaNet" style="display:block;border:0;width:75px;height:112px;"></td>${shield}
</tr></table>
</td></tr></table>
</td></tr>`;
}

function magicLinkEmail({ fullName, username, institutionName, institutionLogoUrl, institutionBannerUrl, institutionalEmail, url, minutes }) {
  const firstName = String(fullName || "").trim().split(/\s+/)[0] || "";
  const name = escapeHtml(institutionName);
  const hello = firstName
    ? `Hola, ${escapeHtml(firstName)}${username ? ` (@${escapeHtml(username)})` : ""}.`
    : "Hola.";
  const body = "font-family:Inter,Arial,sans-serif;font-size:16px;line-height:24px;color:#241c15;";
  const small = "font-family:Inter,Arial,sans-serif;font-size:13px;line-height:20px;color:#241c15;";

  const html = layout(`${institutionHero(institutionBannerUrl, institutionLogoUrl)}
<tr><td style="padding:44px 32px;background:#efeeea;">
<p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:40px;line-height:48px;font-weight:700;color:#000000;">¡Conectemos tu HaNet ID!</p>
<p style="margin:8px 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:20px;line-height:24px;font-style:italic;color:#000000;">Es hora de enlazar tus credenciales y unirte a ${name}</p>
<p style="margin:22px 0 0;${body}">${hello}</p>
<p style="margin:24px 0 0;${body}">Para entrar a tu institución “${name}”, necesitas enlazar tu correo institucional con tu HaNet ID.</p>
<p style="margin:24px 0 0;${body}">Al hacerlo, tomaremos tus datos de la lista de tu institución y los completaremos en tu HaNet ID, para que puedas entrar a tu institución en la aplicación.</p>
<p style="margin:20px 0 0;${small}font-weight:300;">El enlace funciona durante ${minutes} minutos. Si el botón no funciona, copia y pega la siguiente dirección en el navegador del teléfono que estás usando para enlazar tu cuenta:</p>
<p style="margin:0;${small}font-weight:600;word-break:break-all;">${escapeHtml(url)}</p>
<p style="margin:20px 0 0;${small}font-weight:300;">Al enlazar, aceptas los <a href="${TERMS_URL}" style="color:#241c15;">Términos y Condiciones</a>.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:26px;"><tr>
<td align="center" bgcolor="#ef2274" style="border-radius:60px;">
<a href="${escapeHtml(url)}" style="display:block;padding:29px 22px;border-radius:60px;font-family:Inter,Arial,sans-serif;font-size:16px;line-height:20px;font-weight:700;color:#282829;text-decoration:none;text-align:center;">Conectar HaNet ID${institutionalEmail ? ` a ${escapeHtml(institutionalEmail)}` : ""}</a>
</td>
</tr></table>
</td></tr>`);

  const text = [
    "¡Conectemos tu HaNet ID!",
    "",
    `Para entrar a ${institutionName}, enlaza tu correo institucional con tu HaNet ID:`,
    url,
    "",
    `El enlace funciona durante ${minutes} minutos.`,
    "¿No reconoces este correo? Puedes ignorarlo.",
  ].join("\n");

  return { subject: `Conecta tu HaNet ID a ${institutionName}`, html, text };
}

module.exports = {
  RESEND_API_KEY, sendEmail, sendEmailBatch, verificationCodeEmail, magicLinkEmail, escapeHtml,
  FROM, LOGO_BASE, TAGLINE, TERMS_URL, CONTACT, STATUS_URL,
};
