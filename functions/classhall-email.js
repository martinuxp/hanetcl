const { escapeHtml, LOGO_BASE, TAGLINE, TERMS_URL, CONTACT, STATUS_URL } = require("./email");

// ClassHall notification emails (Figma "✉️ email new … Template"): new
// material, new task, task due tomorrow and new announcement. Same frame for
// all: HaNet × the institution's shield, the institution's banner with an
// icon and a title, the message, a "Ver detalles" button and the footer.
// Tables and inline styles because email clients ignore most modern CSS.

const SITE = "https://hanet-edu.web.app";
const TIME_ZONE = "America/Santiago";

const INK = "#241c15";
const DARK = "#282829";
const LIGHT = "#f9f9fa";
const CARD = "#3c3b3e";
const CARD_TEXT = "#dddde2";
const ACCENT = "#ef2274";
const SECONDARY = "#4c5a6f";
const PAPER = "#efeeea";
const SANS = "'DM Sans',Arial,sans-serif";
const INTER = "Inter,Arial,sans-serif";

const DOCUMENT_LABELS = {
  pdf: "Documento PDF",
  word: "Documento Microsoft Word",
  powerpoint: "Presentación de PowerPoint",
  excel: "Planilla de Excel",
  image: "Imagen",
  file: "Archivo",
};

function capitalize(text) {
  return text.charAt(0).toLocaleUpperCase("es") + text.slice(1);
}

// Parts of a date in Chile's time zone, whatever the server's.
function dateParts(ms) {
  const parts = {};
  for (const part of new Intl.DateTimeFormat("es-CL", {
    timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "longOffset",
  }).formatToParts(new Date(ms))) {
    parts[part.type] = part.value;
  }
  const clock = new Intl.DateTimeFormat("es-CL", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));
  return { ...parts, clock };
}

/** "24 de Abril, 6:44 p.m., (GMT-03:00)", as the designs write the upload time. */
function uploadedAt(ms) {
  const p = dateParts(ms);
  const period = String(p.dayPeriod || "").replace(/\s/g, "").replace(/\.?$/, ".");
  return `${p.day} de ${capitalize(p.month)}, ${p.hour}:${p.minute} ${period}, (${p.timeZoneName})`;
}

/** "Lunes, 27 de Abril del 2026, 23:59". */
function deadline(ms) {
  const p = dateParts(ms);
  return `${capitalize(p.weekday)}, ${p.day} de ${capitalize(p.month)} del ${p.year}, ${p.clock}`;
}

/** "24 Abril", the date under the teacher's name. */
function shortDay(ms) {
  const p = dateParts(ms);
  return `${p.day} ${capitalize(p.month)}`;
}

function initials(name) {
  return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toLocaleUpperCase("es")).join("");
}

// "Monica Jeannette Campos Veloso" → "Monica Campos", as the Hall shows it.
function shortName(name) {
  const parts = String(name || "").split(/\s+/).filter(Boolean);
  return parts.length >= 4 ? `${parts[0]} ${parts[2]}` : parts.slice(0, 2).join(" ");
}

function truncate(text, max) {
  const value = String(text || "").trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/** Plain text with its line breaks, safe for HTML. */
function paragraphHtml(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

/**
 * How the email names the Hall's kind: "Plan Común" on the banner and "de tu
 * Plan Común" in the text; dominios carry their area when the catalog has it.
 */
function planWords(plan, area) {
  if (plan === "dominio") {
    const label = area ? `Dominio (Área ${area})` : "Dominio";
    return { label, phrase: area ? `de tus Dominios (Área ${area})` : "de tus Dominios" };
  }
  if (plan === "electivo") return { label: "Electivo", phrase: "de tus Electivos" };
  return { label: "Plan Común", phrase: "de tu Plan Común" };
}

function header(logoUrl) {
  const shield = logoUrl
    ? `<td style="padding:0 8px;font-family:${SANS};font-size:14px;line-height:14px;font-weight:700;color:${LIGHT};">&times;</td>
<td><img src="${escapeHtml(logoUrl)}" height="41" alt="" style="display:block;border:0;height:41px;width:auto;max-width:60px;"></td>`
    : "";
  return `<tr><td align="center" height="75" bgcolor="${DARK}" style="background:${DARK};height:75px;padding:0 16px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td><img src="${LOGO_BASE}/hanet-icon.png" width="28" height="41" alt="HaNet" style="display:block;border:0;width:28px;height:41px;"></td>${shield}
</tr></table>
</td></tr>`;
}

function hero({ bannerUrl, icon, titleHtml, subtitleHtml }) {
  const background = bannerUrl
    ? ` background="${escapeHtml(bannerUrl)}" style="background-color:${DARK};background-image:url('${escapeHtml(bannerUrl)}');background-size:cover;background-position:center;"`
    : ` style="background-color:${DARK};"`;
  const shadow = "text-shadow:0 4px 4px rgba(0,0,0,0.25);";
  return `<tr><td height="186" bgcolor="${DARK}"${background}>
<table role="presentation" width="100%" height="186" cellpadding="0" cellspacing="0" style="background-color:rgba(0,0,0,0.5);"><tr><td align="center" valign="middle" height="186" style="padding:16px 24px;">
<img src="${LOGO_BASE}/${icon}" width="43" height="43" alt="" style="display:block;border:0;width:43px;height:43px;margin:0 auto 8px;">
<p style="margin:0;font-family:${SANS};font-size:32px;line-height:38px;font-weight:600;letter-spacing:-1.5px;color:${LIGHT};${shadow}">${titleHtml}</p>
<p style="margin:8px 0 0;font-family:${SANS};font-size:16px;line-height:19px;letter-spacing:-0.5px;color:${LIGHT};${shadow}">${subtitleHtml}</p>
</td></tr></table>
</td></tr>`;
}

// Full-width band: the pink "added to your calendar" one or the dark deadline one.
function band({ color, textColor, icon, iconWidth, iconHeight, text, height }) {
  return `<tr><td align="center" height="${height}" bgcolor="${color}" style="background:${color};height:${height}px;padding:0 24px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:16px;"><img src="${LOGO_BASE}/${icon}" width="${iconWidth}" height="${iconHeight}" alt="" style="display:block;border:0;width:${iconWidth}px;height:${iconHeight}px;"></td>
<td style="font-family:${SANS};font-size:16px;line-height:20px;font-weight:700;letter-spacing:-0.4px;color:${textColor};">${text}</td>
</tr></table>
</td></tr>`;
}

function intro({ headingHtml, hello, messageHtml }) {
  return `<tr><td bgcolor="${PAPER}" style="background:${PAPER};padding:44px 32px 24px;">
<p style="margin:0;font-family:${SANS};font-size:36px;line-height:44px;font-weight:700;letter-spacing:-1.5px;color:#000000;">${headingHtml}</p>
<p style="margin:22px 0 0;font-family:${INTER};font-size:16px;line-height:24px;color:${INK};">${hello}</p>
<p style="margin:24px 0 0;font-family:${INTER};font-size:16px;line-height:24px;color:${INK};">${messageHtml}</p>
</td></tr>`;
}

// The file tile inside a card: icon, what it is and its name.
function fileTile({ background, textColor, icon, title, name, width, arrow, maxName }) {
  const corner = arrow
    ? `<td width="24" valign="top" style="padding:12px 16px 0 0;"><img src="${LOGO_BASE}/icon-abrir.png" width="24" height="24" alt="" style="display:block;border:0;"></td>`
    : "";
  const spacer = arrow ? `<td width="40" style="font-size:0;">&nbsp;</td>` : "";
  return `<table role="presentation" width="${width}" cellpadding="0" cellspacing="0" align="center" style="width:${width}px;max-width:100%;"><tr>
<td bgcolor="${background}" style="background:${background};border-radius:24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${spacer}
<td align="center" style="padding:18px 16px 16px;">
<img src="${LOGO_BASE}/${icon}" width="15" height="18" alt="" style="display:block;border:0;width:15px;height:18px;margin:0 auto 12px;">
<p style="margin:0;font-family:${SANS};font-size:16px;line-height:18px;font-weight:600;letter-spacing:-0.4px;color:${textColor};">${escapeHtml(title)}</p>
<p style="margin:0;font-family:${SANS};font-size:16px;line-height:18px;font-weight:500;letter-spacing:-0.4px;color:${textColor};opacity:0.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(truncate(name, maxName))}</p>
</td>${corner}
</tr></table>
</td></tr></table>`;
}

// "Message classhall": the teacher with the verified mark, the date and the text.
function messageCard({ teacherName, teacherAvatarUrl, dateMs, bodyHtml, attachment }) {
  // The teacher's blob on its tile; initials when there is none.
  const avatar = teacherAvatarUrl
    ? `<img src="${escapeHtml(teacherAvatarUrl)}" width="33" height="40" alt="" style="display:block;border:0;width:33px;height:40px;">`
    : escapeHtml(initials(teacherName));
  return `<tr><td align="center" bgcolor="${PAPER}" style="background:${PAPER};padding:26px 32px 0;">
<table role="presentation" width="369" cellpadding="0" cellspacing="0" style="width:369px;max-width:100%;"><tr>
<td bgcolor="${CARD}" style="background:${CARD};border-radius:32px;padding:32px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="33" height="40" align="center" bgcolor="${SECONDARY}" style="width:33px;height:40px;background:${SECONDARY};border-radius:12px;font-family:${SANS};font-size:13px;font-weight:600;color:${LIGHT};">${avatar}</td>
<td style="padding-left:10px;">
<p style="margin:0;font-family:${SANS};font-size:18px;line-height:22px;font-weight:500;letter-spacing:-0.6px;color:${CARD_TEXT};">${escapeHtml(shortName(teacherName))} <img src="${LOGO_BASE}/icon-verificado.png" width="13" height="13" alt="Docente verificado" style="border:0;width:13px;height:13px;vertical-align:middle;"></p>
<p style="margin:0;font-family:${SANS};font-size:14px;line-height:20px;font-weight:500;letter-spacing:-0.35px;color:${CARD_TEXT};">${escapeHtml(shortDay(dateMs))}</p>
</td>
</tr></table>
<p style="margin:16px 0 0;font-family:${SANS};font-size:14px;line-height:21px;letter-spacing:-0.35px;color:${CARD_TEXT};">${bodyHtml}</p>
${attachment ? `<div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>${fileTile({ background: ACCENT, textColor: DARK, icon: "icon-archivo-oscuro.png", title: "Tarea adjunta", name: attachment, width: 305, maxName: 28 })}` : ""}
</td></tr></table>
</td></tr>`;
}

function uploadedLine(dateMs, teacherName) {
  return `<tr><td align="center" bgcolor="${PAPER}" style="background:${PAPER};padding:8px 32px 0;font-family:${INTER};font-size:12px;line-height:18px;color:${INK};">
Subido el ${escapeHtml(uploadedAt(dateMs))} por ${escapeHtml(shortName(teacherName))}.
</td></tr>`;
}

function actions(detailsUrl, preferencesUrl) {
  return `<tr><td bgcolor="${PAPER}" style="background:${PAPER};padding:26px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td align="center" bgcolor="${ACCENT}" style="border-radius:60px;">
<a href="${escapeHtml(detailsUrl)}" style="display:block;padding:29px 22px;border-radius:60px;font-family:${INTER};font-size:16px;line-height:20px;font-weight:700;color:${DARK};text-decoration:none;text-align:center;">Ver detalles</a>
</td>
</tr></table>
</td></tr>
<tr><td align="center" bgcolor="${PAPER}" style="background:${PAPER};padding:13px 32px 44px;">
<a href="${escapeHtml(preferencesUrl)}" style="font-family:${INTER};font-size:14px;line-height:17px;font-weight:700;color:${INK};text-decoration:underline;">Configurar notificaciones</a>
</td></tr>`;
}

function footer() {
  const year = new Date().getFullYear();
  const link = `font-family:${INTER};font-size:13px;line-height:20px;color:${INK};text-decoration:underline;white-space:nowrap;`;
  return `<tr><td bgcolor="${PAPER}" style="background:${PAPER};padding:24px 0;"><div style="height:2px;background:#000000;font-size:0;line-height:0;">&nbsp;</div></td></tr>
<tr><td bgcolor="${PAPER}" style="background:${PAPER};padding:16px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="bottom" style="font-family:${SANS};font-size:13px;line-height:16px;color:${INK};">
<img src="${LOGO_BASE}/hanet-logo-negro.png" width="147" height="40" alt="HaNet" style="display:block;border:0;font-size:24px;font-weight:700;color:${DARK};">
<br>&copy;${year} HaNet Chile<br><br>${escapeHtml(TAGLINE)}
</td>
<td valign="bottom" align="right">
<a href="${TERMS_URL}" style="${link}">Términos y Condiciones</a><br>
<a href="mailto:${CONTACT}" style="${link}">Contacto</a><br>
<a href="${STATUS_URL}" style="${link}">Estado del servicio</a>
</td>
</tr></table>
</td></tr>
<tr><td bgcolor="${PAPER}" style="background:${PAPER};padding:8px 32px 32px;font-family:${INTER};font-size:11px;line-height:15px;color:${INK};">
Si no quieres recibir notificaciones de ClassHall por correo electrónico como esta, puedes desactivarlas o cambiar la configuración en tus ajustes de HaNet.<br>¡Gracias por usar HaNet!
</td></tr>`;
}

function frame(rows) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
${rows}
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Where "Ver detalles" goes: a page that opens the app on that screen. */
function appLink(route) {
  return `${SITE}/abrir?r=${encodeURIComponent(route)}`;
}

function preferencesLink(uid, token) {
  return `${SITE}/notificaciones?u=${encodeURIComponent(uid)}&t=${encodeURIComponent(token)}`;
}

/**
 * One ClassHall email for one student.
 *   kind: "material" | "task" | "taskTomorrow" | "announcement"
 *   hall: { id, subject, plan, area, teacherName }
 *   institution: { logoUrl, bannerUrl }
 *   recipient: { uid, fullName, username, token }
 *   item: material { name, kind, createdAt } · task { id, title, instructions, dueAt, createdAt, attachment }
 *         · announcement { body, createdAt }
 */
function classhallEmail({ kind, hall, institution, recipient, item }) {
  const subject = escapeHtml(hall.subject);
  const plan = planWords(hall.plan, hall.area);
  const firstName = String(recipient.fullName || "").trim().split(/\s+/)[0] || "";
  const hello = firstName
    ? `Hola, ${escapeHtml(firstName)}${recipient.username ? ` (@${escapeHtml(recipient.username)})` : ""}.`
    : "Hola.";
  const preferencesUrl = preferencesLink(recipient.uid, recipient.token);
  const rows = [header(institution.logoUrl)];
  let mailSubject;
  let text;

  if (kind === "material") {
    rows.push(hero({
      bannerUrl: institution.bannerUrl,
      icon: "icon-material.png",
      titleHtml: "Se ha subido material nuevo",
      subtitleHtml: `${subject} - ${plan.label} | <i style="font-weight:300;">${escapeHtml(truncate(item.name, 48))}</i>`,
    }));
    rows.push(intro({
      headingHtml: `Se ha subido material nuevo a ${subject}, ${plan.phrase}.`,
      hello,
      messageHtml: `Tu Profesor/a ha subido material nuevo al ClassHall de ${subject}, ${plan.phrase}. Puedes revisarlo en cualquier momento.`,
    }));
    rows.push(`<tr><td align="center" bgcolor="${PAPER}" style="background:${PAPER};padding:0 32px;">${fileTile({
      background: SECONDARY, textColor: CARD_TEXT, icon: "icon-archivo-material.png",
      title: DOCUMENT_LABELS[item.kind] || DOCUMENT_LABELS.file, name: item.name, width: 378, arrow: true, maxName: 34,
    })}</td></tr>`);
    rows.push(uploadedLine(item.createdAt, hall.teacherName));
    rows.push(actions(appLink(`classhall/hall?id=${hall.id}`), preferencesUrl));
    mailSubject = `Material nuevo en ${hall.subject}: ${truncate(item.name, 60)}`;
    text = [`Se ha subido material nuevo a ${hall.subject}, ${plan.phrase}.`, "", `Archivo: ${item.name}`, "Ábrelo en ClassHall, en la app HaNet."];
  } else if (kind === "task" || kind === "taskTomorrow") {
    const title = escapeHtml(truncate(item.title, 60));
    const tomorrow = kind === "taskTomorrow";
    rows.push(hero({
      bannerUrl: institution.bannerUrl,
      icon: tomorrow ? "icon-tarea-manana.png" : "icon-tarea.png",
      titleHtml: tomorrow ? `Se entrega mañana:<br>“${title}”` : `Tarea nueva: “${title}”`,
      subtitleHtml: `${subject} - ${plan.label}`,
    }));
    if (!tomorrow) {
      rows.push(band({ color: ACCENT, textColor: DARK, icon: "icon-calendario.png", iconWidth: 24, iconHeight: 23, text: "Se añadió automáticamente a tu Calendario.", height: 50 }));
    }
    rows.push(intro({
      headingHtml: tomorrow
        ? `Mañana se entrega una tarea de ${subject}, ${plan.phrase}.`
        : `Se ha subido una tarea nueva a ${subject}, ${plan.phrase}.`,
      hello,
      messageHtml: tomorrow
        ? `Mañana se entrega una tarea del ClassHall de ${subject}, ${plan.phrase}, y todavía no la entregas. Revísala pronto.`
        : `Tu Profesor/a ha subido una tarea nueva al ClassHall de ${subject}, ${plan.phrase}. Puedes revisarla y entregarla desde la app.`,
    }));
    rows.push(band({ color: CARD, textColor: CARD_TEXT, icon: "icon-advertencia.png", iconWidth: 26, iconHeight: 26, text: `Fecha límite: ${escapeHtml(deadline(item.dueAt))}.`, height: 66 }));
    const instructions = item.instructions ? `<br>${paragraphHtml(truncate(item.instructions, 400))}` : "";
    rows.push(messageCard({
      teacherName: hall.teacherName,
      teacherAvatarUrl: hall.teacherAvatarUrl,
      dateMs: item.createdAt,
      bodyHtml: `${escapeHtml(item.title)}${instructions}`,
      attachment: item.attachment || null,
    }));
    rows.push(uploadedLine(item.createdAt, hall.teacherName));
    rows.push(actions(appLink(`classhall/task?hallId=${hall.id}&id=${item.id}`), preferencesUrl));
    mailSubject = tomorrow ? `Mañana se entrega: ${truncate(item.title, 60)}` : `Tarea nueva en ${hall.subject}: ${truncate(item.title, 60)}`;
    text = [
      tomorrow ? `Mañana se entrega una tarea de ${hall.subject}.` : `Tarea nueva en ${hall.subject}, ${plan.phrase}.`,
      "",
      item.title,
      `Fecha límite: ${deadline(item.dueAt)}.`,
      "Entrégala en ClassHall, en la app HaNet.",
    ];
  } else {
    rows.push(hero({
      bannerUrl: institution.bannerUrl,
      icon: "icon-anuncio.png",
      titleHtml: "Anuncio nuevo",
      subtitleHtml: `${subject} - ${plan.label}`,
    }));
    rows.push(intro({
      headingHtml: `Se ha subido un anuncio nuevo a ${subject}, ${plan.phrase}.`,
      hello,
      messageHtml: `Tu Profesor/a ha subido un anuncio nuevo al ClassHall de ${subject}, ${plan.phrase}. Puedes revisarlo en cualquier momento.`,
    }));
    rows.push(messageCard({ teacherName: hall.teacherName, teacherAvatarUrl: hall.teacherAvatarUrl, dateMs: item.createdAt, bodyHtml: paragraphHtml(truncate(item.body, 600)) }));
    rows.push(uploadedLine(item.createdAt, hall.teacherName));
    rows.push(actions(appLink(`classhall/hall?id=${hall.id}`), preferencesUrl));
    mailSubject = `Anuncio nuevo en ${hall.subject}`;
    text = [`Anuncio nuevo en ${hall.subject}, ${plan.phrase}:`, "", truncate(item.body, 600)];
  }

  rows.push(footer());
  text.push("", `Configurar notificaciones: ${preferencesUrl}`);
  return {
    subject: mailSubject,
    html: frame(rows.join("\n")),
    text: text.join("\n"),
    headers: {
      "List-Unsubscribe": `<${preferencesUrl}&salir=1>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

module.exports = { classhallEmail, uploadedAt, deadline };
