const { Buffer } = require("node:buffer");

// Reads a specification table (tabla de especificaciones, T.E.) into a draft
// the teacher reviews before saving: name, date, exigency, objectives, the
// skill columns and each content with its points.
//
// Tables vary a lot between teachers, so the reader works from the position
// of each word, not from a fixed template: it finds the row of column
// headers, the columns where the numbers line up and the text to their left.
// What it cannot tell is left empty for the teacher.

const MONTHS = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const MAX_SKILLS = 8;
const MAX_CONTENTS = 12;

// Check marks and symbol-font glyphs some tables use as bullets.
function clean(value) {
  return String(value || "").replace(/[\uf000-\uf8ff✓✔]/g, " ").replace(/\s+/g, " ").trim();
}

function plain(value) {
  return clean(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const isNumber = (value) => /^\d{1,3}$/.test(value);

// ---------------------------------------------------------------- words

/** Words of a PDF with their position (PDFs exported from Docs or Word carry their text). */
async function pdfWords(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: false }).promise;
  const words = [];
  let offset = 0;
  for (let number = 1; number <= Math.min(document.numPages, 4); number += 1) {
    const page = await document.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    for (const item of content.items) {
      const text = item.str || "";
      if (!text.trim()) continue;
      const [, , , , x, y] = item.transform;
      const height = Math.abs(item.transform[3]) || item.height || 10;
      const top = viewport.height - y - height + offset;
      // Items can hold several words; split them so numbers stand alone.
      const pieces = text.split(/(\s+)/);
      const unit = item.width / Math.max(text.length, 1);
      let cursor = x;
      for (const piece of pieces) {
        const width = piece.length * unit;
        if (piece.trim()) words.push({ text: piece.trim(), x0: cursor, x1: cursor + width, top, height });
        cursor += width;
      }
    }
    offset += viewport.height;
  }
  return words;
}

/** Words of a photo, read by Cloud Vision (free up to 1,000 a month). */
async function photoWords(buffer, accessToken) {
  const response = await fetch("https://vision.googleapis.com/v1/images:annotate", {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{
        image: { content: Buffer.from(buffer).toString("base64") },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: { languageHints: ["es", "en"] },
      }],
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body?.error?.message || `Vision ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const words = [];
  for (const page of body.responses?.[0]?.fullTextAnnotation?.pages || []) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const word of paragraph.words || []) {
          const text = (word.symbols || []).map(symbol => symbol.text).join("");
          const xs = word.boundingBox.vertices.map(vertex => vertex.x || 0);
          const ys = word.boundingBox.vertices.map(vertex => vertex.y || 0);
          if (text.trim()) {
            words.push({
              text,
              x0: Math.min(...xs),
              x1: Math.max(...xs),
              top: Math.min(...ys),
              height: Math.max(...ys) - Math.min(...ys),
            });
          }
        }
      }
    }
  }
  return words;
}

// ---------------------------------------------------------------- lines

/** Groups words into lines, top to bottom, each sorted left to right. */
function toLines(words) {
  const heights = words.map(word => word.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] || 10;
  const sorted = [...words].sort((a, b) => a.top - b.top || a.x0 - b.x0);
  const lines = [];
  for (const word of sorted) {
    const center = word.top + word.height / 2;
    const line = lines.find(candidate => Math.abs(candidate.center - center) < median * 0.55);
    if (line) {
      line.words.push(word);
      line.center = (line.center * (line.words.length - 1) + center) / line.words.length;
    } else {
      lines.push({ center, words: [word] });
    }
  }
  for (const line of lines) {
    line.words.sort((a, b) => a.x0 - b.x0);
    // PDFs often cut a word into pieces ("pre g untas"); pieces that touch are one word.
    const merged = [];
    for (const word of line.words) {
      const last = merged[merged.length - 1];
      if (last && word.x0 - last.x1 < median * 0.12) {
        last.text += word.text;
        last.x1 = Math.max(last.x1, word.x1);
      } else {
        merged.push({ ...word });
      }
    }
    line.words = merged;
    line.text = clean(merged.map(word => word.text).join(" "));
  }
  return { lines: lines.sort((a, b) => a.center - b.center), median };
}

// ---------------------------------------------------------------- details

function parseDate(text) {
  const value = plain(text);
  let match = value.match(/(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})/);
  if (match) return makeDate(match[1], match[2], match[3]);
  match = value.match(/(\d{1,2})\s*(?:de\s+|\/\s*|-\s*)?([a-z]{3,10})\s*(?:de\s+|\/\s*|-\s*)?(\d{4})/);
  if (match) {
    const month = Object.entries(MONTHS).find(([name]) => name.startsWith(match[2].slice(0, 3)))?.[1];
    if (month) return makeDate(match[1], month, match[3]);
  }
  return null;
}

// The day as "YYYY-MM-DD": the app sets the time in the teacher's own time zone.
function makeDate(day, month, year) {
  const fullYear = Number(year) < 100 ? 2000 + Number(year) : Number(year);
  const date = new Date(Date.UTC(fullYear, Number(month) - 1, Number(day)));
  if (date.getUTCDate() !== Number(day) || fullYear < 2020 || fullYear > 2100) return null;
  return date.toISOString().slice(0, 10);
}

function findTitle(lines) {
  for (const line of lines) {
    const match = line.text.match(/^(?:[a-z]\.\s*)?(?:actividad|instrumento|evaluaci[oó]n)\s*:\s*(.+)$/i);
    if (match) return titleCase(match[1]);
  }
  for (const line of lines) {
    const value = line.text.replace(/tabla\s+de\s+especificaci[oó]n(es)?\.?/i, "").trim();
    const match = value.match(/((?:evaluaci[oó]n\s+)?(?:sumativa|formativa|prueba|control)\s*(?:n\s*[°º]?\s*\d+|\d+)?)/i);
    if (match) return titleCase(match[1]);
  }
  return "";
}

function titleCase(value) {
  const text = clean(value).replace(/\s*n\s*[°º]\s*/i, " N°").replace(/\.$/, "");
  return text.charAt(0).toLocaleUpperCase("es") + text.slice(1).toLocaleLowerCase("es").replace(/ n°/, " N°");
}

function findExigency(text) {
  const match = plain(text).match(/exigencia[^0-9]{0,30}(\d{2,3})\s*%/);
  const value = match ? Number(match[1]) : null;
  return value && value >= 1 && value <= 100 ? value : null;
}

/** "OA 03. Analizar…" lines, and the bulleted objectives some teachers write without a code. */
function findObjectives(lines, tableTop) {
  const objectives = [];
  let current = null;
  let underHeading = false;
  for (const line of lines) {
    if (line.center >= tableTop) break;
    const text = line.text;
    const coded = text.match(/^(OA\s*\d+)\s*[:.\-–]?\s*(.*)$/i);
    if (/^objetivos?\b/i.test(text)) {
      underHeading = true;
      const rest = text.replace(/^objetivos?\s*((de\s+)?aprendizajes?)?\s*:?\s*/i, "");
      if (rest) current = pushObjective(objectives, rest);
      continue;
    }
    if (coded) {
      current = { code: coded[1].replace(/\s+/g, " ").toUpperCase(), text: coded[2] };
      objectives.push(current);
    } else if (underHeading && /^[●•\-–*]/.test(text) && !(current && current.code)) {
      current = pushObjective(objectives, text.replace(/^[●•\-–*]\s*/, ""));
    } else if (current && text && !/^[A-ZÁÉÍÓÚÑ\s]{4,}$/.test(text)) {
      current.text = clean(`${current.text} ${text}`);
    } else if (current) {
      current = null;
    }
  }
  return objectives
    .map(objective => ({ code: objective.code.slice(0, 40), text: objective.text.slice(0, 600) }))
    .slice(0, 6);
}

function pushObjective(list, text) {
  const objective = { code: "", text };
  list.push(objective);
  return objective;
}

function findPrep(lines, tableBottom) {
  const start = lines.findIndex(line => line.center > tableBottom && /c[oó]mo\s+prepar|para\s+estudiar|material(es)?\s+de\s+estudio/i.test(line.text));
  if (start < 0) return "";
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (/^(prof\.?|profesor|docente|teacher|p[aá]gina|departamento|i+\s+semestre)/i.test(line.text)) break;
    items.push(line.text.replace(/^[●•o\-–*]\s*/, "- "));
  }
  return items.join("\n").slice(0, 1500);
}

// ---------------------------------------------------------------- table

const TOTAL_HEADER = /^(total(es)?|puntaje|pts|\(pts\))$/i;
const SKIP_ROW = /^(total(es)?|puntaje( total)?|n[uú]mero de preguntas|subtotal)\b/i;
const CONTENT_HEADER = /^(contenidos?|contents|[aá]rea|unidad(es)?|tem[aá]tica|ejes?)$/i;
// Header words some tables break in two lines ("CONOCI / MIENTO").
const KNOWN_WORDS = ["conocimiento", "aplicacion", "comprension", "puntaje", "analisis", "sintesis", "evaluacion", "identificacion", "habilidades", "preguntas", "investigacion"];

function joinLabel(upper, lower) {
  if (!upper) return lower;
  if (!lower) return upper;
  const joined = plain(`${upper}${lower}`).replace(/[^a-z]/g, "");
  return KNOWN_WORDS.includes(joined) ? `${upper}${lower}` : `${upper} ${lower}`;
}

function prettyLabel(label) {
  const text = clean(label).replace(/\s*\.$/, "");
  if (text.length > 4 && text === text.toLocaleUpperCase("es")) {
    return text.charAt(0) + text.slice(1).toLocaleLowerCase("es");
  }
  return text;
}

/**
 * Header cells: words of the header lines grouped by column, bottom line
 * first, then the words above added on top of the cell they sit over. A word
 * over several short cells (SM over A B C D) labels each of them.
 */
function headerCells(headerLines, median) {
  const cells = [];
  const middle = item => (item.x0 + item.x1) / 2;
  for (const line of [...headerLines].reverse()) {
    // Words of a line that sit together form one piece ("Observar y").
    const pieces = [];
    for (const word of line.words) {
      const last = pieces[pieces.length - 1];
      if (last && word.x0 - last.x1 < median * 0.9) {
        last.text += ` ${word.text}`;
        last.x1 = word.x1;
      } else {
        pieces.push({ text: word.text, x0: word.x0, x1: word.x1 });
      }
    }
    // A row of short group names (SM VF PD CR) over single letters (A B C D):
    // each letter takes the nearest group name.
    const letters = cells.filter(cell => cell.text.length === 1);
    const groups = pieces.filter(piece => piece.text.length <= 3 && /^[A-ZÁÉÍÓÚÑ]+$/.test(piece.text));
    if (groups.length >= 2 && letters.length >= 2) {
      for (const cell of letters) {
        const nearest = groups.reduce((best, piece) => (Math.abs(middle(piece) - middle(cell)) < Math.abs(middle(best) - middle(cell)) ? piece : best));
        cell.group = nearest.text;
      }
    }
    for (const piece of pieces) {
      if (groups.length >= 2 && letters.length >= 2 && groups.includes(piece)) continue;
      const over = cells.filter(cell => piece.x1 > cell.x0 - median * 0.3 && piece.x0 < cell.x1 + median * 0.3);
      if (over.length === 0) {
        cells.push({ ...piece });
      } else if (over.length === 1) {
        over[0].text = joinLabel(piece.text, over[0].text);
        over[0].x0 = Math.min(over[0].x0, piece.x0);
        over[0].x1 = Math.max(over[0].x1, piece.x1);
      }
      // A wide title over several named cells ("HABILIDADES DEL PENSAMIENTO") is left out.
    }
  }
  for (const cell of cells) {
    if (cell.group) cell.text = `${cell.group} ${cell.text}`;
  }
  return cells.sort((a, b) => a.x0 - b.x0);
}

function readTable(lines, median) {
  // The header: the line that names the total column (Total, Puntaje, Pts).
  // (A header line has no numbers; the totals row also says "Total".)
  const noNumbers = line => !line.words.some(word => isNumber(word.text));
  let start = lines.findIndex(line => line.words.length >= 2 && noNumbers(line) && line.words.some(word => TOTAL_HEADER.test(word.text.replace(/[.:]/g, ""))));
  if (start < 0) start = lines.findIndex(line => noNumbers(line) && /\b(contenidos?|habilidades|[aá]rea tem[aá]tica|contents)\b/i.test(line.text));
  if (start < 0) return null;

  const firstDataIndex = lines.findIndex((line, index) => index > start && line.words.some(word => isNumber(word.text)));
  if (firstDataIndex < 0) return null;
  // Header lines: the one with the total, a line just above it, and those down to the first numbers.
  const headerLines = lines.slice(start, firstDataIndex)
    .concat(start > 0 && lines[start].center - lines[start - 1].center < median * 1.8 ? [lines[start - 1]] : [])
    .sort((a, b) => a.center - b.center);
  // Text that ends before the first numbers is a content name, not a header.
  const firstNumberX = Math.min(...lines[firstDataIndex].words.filter(word => isNumber(word.text)).map(word => word.x0));
  const keptHeader = headerLines.filter(line => line === lines[start] || Math.max(...line.words.map(word => word.x1)) > firstNumberX - median);
  let cells = headerCells(keptHeader, median);

  // The content column is the leftmost one (Contenidos, Área temática…); the rest hold points.
  const contentCell = cells.find(cell => CONTENT_HEADER.test(plain(cell.text).split(" ")[0])) || cells[0];
  cells = cells.filter(cell => cell !== contentCell && cell.x0 > contentCell.x0);
  if (cells.length === 0) return null;

  // The body starts right after the header (content names can start above the first numbers).
  const body = lines.slice(Math.max(...keptHeader.map(line => lines.indexOf(line))) + 1);
  const center = cell => (cell.x0 + cell.x1) / 2;
  const leftLimit = cells[0].x0 - median * 0.5;
  const columnOf = (word) => {
    const middle = (word.x0 + word.x1) / 2;
    const inside = cells.findIndex(cell => middle >= cell.x0 - median && middle <= cell.x1 + median);
    if (inside >= 0) return inside;
    let best = -1;
    let distance = Infinity;
    cells.forEach((cell, index) => {
      const gap = Math.abs(center(cell) - middle);
      if (gap < distance) { distance = gap; best = index; }
    });
    return distance < median * 6 ? best : -1;
  };

  // Rows: text lines on the left grouped into blocks (a wider gap starts a
  // new row), each with the numbers that line up beside it, whether the
  // numbers sit at the top, middle or bottom of the cell.
  const items = [];
  for (const line of body) {
    const left = clean(line.words.filter(word => word.x1 <= leftLimit && !isNumber(word.text)).map(word => word.text).join(" "));
    if (/^(item\b|conducta|c[oó]mo preparar|prof\.|profesor|teacher)/i.test(left)) break;
    // Page footers and headers between pages.
    if (/p[aá]gina\s*\d+|^departamento\b|\d\s*\|\s*p[aá]gina/i.test(line.text)) continue;
    const values = cells.map(() => null);
    for (const word of line.words) {
      if (!isNumber(word.text) || word.x1 <= leftLimit) continue;
      const column = columnOf(word);
      // Several numbers in one cell (questions per skill) add up.
      if (column >= 0) values[column] = (values[column] ?? 0) + Number(word.text);
    }
    items.push({ center: line.center, left, values, numeric: values.some(value => value !== null) });
  }
  if (!items.some(item => item.numeric)) return null;

  const textCenters = items.filter(item => item.left).map(item => item.center);
  const steps = textCenters.slice(1).map((value, index) => value - textCenters[index]).sort((a, b) => a - b);
  const pitch = steps.length ? steps[Math.floor(steps.length / 3)] : median * 1.4;
  const blocks = [];
  for (const item of items) {
    const last = blocks[blocks.length - 1];
    const startsRow = !last || (item.left && last.lastText !== null && item.center - last.lastText > pitch * 1.45)
      || (item.left && SKIP_ROW.test(item.left));
    if (startsRow && (item.left || !last)) {
      blocks.push({ parts: [], items: [], values: cells.map(() => null), lastText: null, top: item.center, bottom: item.center });
    }
    const block = blocks[blocks.length - 1];
    block.items.push(item);
    if (item.left) {
      block.parts.push(item.left);
      block.lastText = item.center;
    }
    item.values.forEach((value, index) => {
      if (value !== null) block.values[index] = (block.values[index] ?? 0) + value;
    });
    block.bottom = item.center;
  }
  // A cell holds one row: a block with two lines of numbers that each fill
  // the total column (or, without a total column, the same columns) is two
  // rows, split where the text has its widest gap.
  const totalIndex = cells.length - 1;
  const totalNamed = /total|puntaje|pts/.test(plain(cells[totalIndex].text));
  const splitBlocks = [];
  for (const block of blocks) {
    const numericLines = block.items.filter(item => item.numeric);
    const separate = totalNamed
      ? numericLines.filter(item => item.values[totalIndex] !== null)
      : numericLines;
    if (separate.length < 2) {
      splitBlocks.push(block.items);
      continue;
    }
    let rest = block.items;
    for (let index = 1; index < separate.length; index += 1) {
      const from = rest.indexOf(separate[index - 1]);
      const to = rest.indexOf(separate[index]);
      let cut = to;
      let widest = -1;
      for (let at = from + 1; at <= to; at += 1) {
        const gap = rest[at].center - rest[at - 1].center;
        if (gap > widest) { widest = gap; cut = at; }
      }
      splitBlocks.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    splitBlocks.push(rest);
  }
  const merged = splitBlocks
    .map(group => ({
      text: clean(group.filter(item => item.left).map(item => item.left).join(" ")),
      values: cells.map((_, index) => group.reduce((sum, item) => (item.values[index] === null ? sum : (sum ?? 0) + item.values[index]), null)),
    }))
    .filter(row => row.values.some(value => value !== null));
  const lastNumeric = [...items].reverse().find(item => item.numeric);

  // Columns no row uses are dropped (types of question a table did not use).
  const used = cells.map((_, index) => merged.some(row => row.values[index] !== null));
  const labels = cells.map(cell => prettyLabel(cell.text));
  const lastUsed = used.lastIndexOf(true);
  const hasTotal = lastUsed > 0 && /total|puntaje|pts/.test(plain(labels[lastUsed]));
  // Question counts and extra totals are not skills.
  const notSkill = label => /^(total|puntaje|pts|\(pts\)|numero|n° de preguntas|cantidad de preguntas)/.test(plain(label));
  let skillColumns = used.map((isUsed, index) => (isUsed && !(hasTotal && index === lastUsed) && !notSkill(labels[index]) ? index : -1)).filter(index => index >= 0);
  // A table without skill columns keeps its points in one column.
  const onlyTotal = skillColumns.length === 0 && hasTotal;
  if (onlyTotal) skillColumns = [lastUsed];

  let totals = null;
  const contents = [];
  for (const row of merged) {
    if (SKIP_ROW.test(row.text)) {
      if (/^total|^puntaje/i.test(row.text)) totals = row.values;
      continue;
    }
    const { name, detail } = splitName(row.text);
    contents.push({
      name,
      detail,
      points: skillColumns.map(index => row.values[index] ?? 0),
      total: hasTotal && !onlyTotal ? row.values[lastUsed] : null,
    });
  }

  return {
    skills: onlyTotal ? ["Puntaje"] : skillColumns.map((index, at) => labels[index] || `Habilidad ${at + 1}`).slice(0, MAX_SKILLS),
    contents: contents.slice(0, MAX_CONTENTS).map(content => ({ ...content, points: content.points.slice(0, MAX_SKILLS) })),
    totals,
    hasTotal,
    top: lines[start].center - median,
    bottom: lastNumeric.center,
  };
}

/** The first short part is the content's name; bullets and the rest are its detail. */
function splitName(text) {
  const parts = clean(text).split(/\s+(?=[-–•●✓]\s)/);
  let name = parts.shift() || "";
  let detail = parts.map(part => part.replace(/^[-–•●✓]\s*/, "")).join(", ");
  if (name.length > 60) {
    const cut = name.lastIndexOf(" ", 55);
    detail = clean(`${name.slice(cut)} ${detail}`);
    name = name.slice(0, cut);
  }
  return { name: name.replace(/[:.]$/, "").slice(0, 80), detail: detail.slice(0, 160) };
}

// ---------------------------------------------------------------- draft

/** Turns the words of a T.E. into a draft for the evaluation form, with warnings for the teacher. */
function parseSpecTable(words) {
  const { lines, median } = toLines(words);
  const fullText = lines.map(line => line.text).join("\n");
  const table = readTable(lines, median);
  const warnings = [];

  const draft = {
    title: findTitle(lines).slice(0, 80),
    date: parseDate(fullText),
    exigency: findExigency(fullText),
    objectives: findObjectives(lines, table ? table.top : Infinity),
    skills: table ? table.skills : [],
    contents: table ? table.contents.map(({ name, detail, points }) => ({ name, detail, points })) : [],
    prep: findPrep(lines, table ? table.bottom : 0),
    warnings,
  };

  if (!table || table.contents.length === 0) {
    warnings.push("No encontramos la tabla de puntajes. Completa los contenidos a mano.");
  } else {
    table.contents.forEach((content, index) => {
      const sum = content.points.reduce((a, b) => a + b, 0);
      if (content.total !== null && content.total !== undefined && sum !== content.total) {
        warnings.push(`Revisa "${content.name || `Contenido ${index + 1}`}": sus puntos suman ${sum} y la tabla dice ${content.total}.`);
      }
    });
    if (table.skills.some(skill => /^Habilidad \d+$/.test(skill))) {
      warnings.push("Algunas columnas no tenían nombre. Revisa las habilidades.");
    }
  }
  if (!draft.date) warnings.push("No encontramos la fecha de la evaluación.");
  return draft;
}

module.exports = { pdfWords, photoWords, parseSpecTable };
