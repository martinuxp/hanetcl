// Builds hosting/terminos.html from docs/legal/terminos-y-condiciones.md, so
// the Markdown file stays the single source of the terms.
// Run from the project root: node scripts/build-legal.js
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'docs/legal/terminos-y-condiciones.md'), 'utf8');

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Inline pieces the terms use: bold and email addresses.
function inline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, email => `<a href="mailto:${email}">${email}</a>`);
}

const blocks = [];
let paragraph = [];
let list = null;

function flushParagraph() {
  if (paragraph.length === 0) return;
  const text = paragraph.join(' ');
  // A paragraph that is only bold text is a small heading.
  const heading = text.match(/^\*\*(.+)\*\*$/);
  blocks.push(heading ? `<h3>${inline(heading[1])}</h3>` : `<p>${inline(text)}</p>`);
  paragraph = [];
}

function flushList() {
  if (!list) return;
  blocks.push(`<ul>\n${list.map(item => `  <li>${inline(item)}</li>`).join('\n')}\n</ul>`);
  list = null;
}

for (const raw of source.split(/\r?\n/)) {
  const line = raw.trimEnd();

  if (!line.trim()) {
    flushParagraph();
    flushList();
  } else if (line.startsWith('# ')) {
    flushParagraph();
    flushList();
    blocks.push(`<h1>${inline(line.slice(2))}</h1>`);
  } else if (line.startsWith('## ')) {
    flushParagraph();
    flushList();
    blocks.push(`<h2>${inline(line.slice(3))}</h2>`);
  } else if (line.startsWith('- ')) {
    flushParagraph();
    (list ||= []).push(line.slice(2));
  } else if (list && /^\s+\S/.test(raw)) {
    // Indented line: the previous bullet continues.
    list[list.length - 1] += ` ${line.trim()}`;
  } else {
    flushList();
    paragraph.push(line.trim());
  }
}
flushParagraph();
flushList();

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Términos y condiciones · HaNet</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #282829; color: #dddde2; font: 16px/1.55 'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; }
  main { max-width: 680px; margin: 0 auto; padding: 32px 20px 64px; }
  header img { display: block; margin-bottom: 32px; }
  h1 { margin: 0 0 8px; font-size: 32px; line-height: 1.15; letter-spacing: -0.02em; color: #f9f9fa; }
  h1 + p { margin-top: 0; color: #c7c6cf; }
  h2 { margin: 40px 0 12px; font-size: 22px; line-height: 1.25; letter-spacing: -0.015em; color: #f9f9fa; }
  h3 { margin: 24px 0 8px; font-size: 16px; color: #f9f9fa; }
  p { margin: 0 0 14px; }
  ul { margin: 0 0 14px; padding-left: 22px; }
  li { margin-bottom: 6px; }
  a { color: #ff7fb0; }
  strong { color: #f9f9fa; }
</style>
</head>
<body>
<main>
<header><img src="/email/hanet-logo-blanco.png" alt="HaNet" width="147" height="40"></header>
${blocks.join('\n')}
</main>
</body>
</html>
`;

fs.writeFileSync(path.join(root, 'hosting/terminos.html'), html);
console.log(`hosting/terminos.html: ${blocks.length} bloques`);
