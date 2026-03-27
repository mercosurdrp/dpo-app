const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

// ── Config ──────────────────────────────────────────────────────────────────
const EXCEL_PATH = path.join(__dirname, "..", "2025_DPO2.0_Checklist_ES_Final_-_Score_V2.xlsx");
const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");
const SUMMARY_PATH = path.join(__dirname, "seed-summary.json");

const PILARES = [
  { sheet: "Seguridad OK", nombre: "Seguridad", orden: 1, color: "#EF4444", icono: "ShieldAlert" },
  { sheet: "Gente OK", nombre: "Gente", orden: 2, color: "#3B82F6", icono: "Users" },
  { sheet: "Gestión OK", nombre: "Gestión", orden: 3, color: "#8B5CF6", icono: "Target" },
  { sheet: "Entrega OK", nombre: "Entrega", orden: 4, color: "#F59E0B", icono: "Truck" },
  { sheet: "Flota OK", nombre: "Flota", orden: 5, color: "#10B981", icono: "Wrench" },
  { sheet: "Almacén OK", nombre: "Almacén", orden: 6, color: "#6366F1", icono: "Warehouse" },
  { sheet: "Planeamiento OK", nombre: "Planeamiento", orden: 7, color: "#EC4899", icono: "CalendarClock" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function esc(s: string): string {
  return s.replace(/'/g, "''");
}

function isMandatorio(val: string): boolean {
  const v = val.trim().toUpperCase();
  return v === "SÍ" || v === "SI" || v === "Sí" || v === "SÌ";
}

/**
 * Parse scoring text into { "0": "...", "1": "...", "3": "...", "5": "..." }
 * Patterns found:
 *   "Nivel 5 - ...", "Nivel 3 - ...", "Nivel 1 - ...", "Nivel 0 - ..."
 *   "5 - ...", "3 - ...", "1 - ...", "0 - ..."
 */
function parseScoring(raw: string): Record<string, string> {
  if (!raw || !raw.trim()) return { "5": "", "3": "", "1": "", "0": "" };

  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  // Try splitting on "Nivel N -" or standalone "N -" at start of line or after whitespace
  // We match: optional whitespace, optional "Nivel ", then digit, then " - "
  const pattern = /(?:^|\n)\s*(?:Nivel\s+)?([0135])\s*-\s*/gi;
  const matches: Array<{ level: string; start: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    matches.push({ level: m[1], start: m.index + m[0].length });
  }

  if (matches.length === 0) {
    // Can't parse - put entire text under "5"
    return { "5": text, "3": "", "1": "", "0": "" };
  }

  const result: Record<string, string> = { "0": "", "1": "", "3": "", "5": "" };
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].start;
    const end = i + 1 < matches.length ? matches[i + 1].start - (text.substring(0, matches[i + 1].start).match(/\s*(?:Nivel\s+)?[0135]\s*-\s*$/)?.[0]?.length || matches[i + 1].start - matches[i + 1].start) : text.length;
    // Simpler: just grab from start to the beginning of next match's full pattern
    const nextMatchFullStart = i + 1 < matches.length
      ? text.lastIndexOf("\n", matches[i + 1].start) !== -1
        ? (() => {
            // Find where the next match's line starts
            let idx = matches[i + 1].start;
            while (idx > 0 && text[idx - 1] !== "\n") idx--;
            return idx;
          })()
        : matches[i + 1].start
      : text.length;
    const desc = text.substring(start, nextMatchFullStart).trim();
    result[matches[i].level] = desc;
  }

  return result;
}

// ── Main ────────────────────────────────────────────────────────────────────
const wb = XLSX.readFile(EXCEL_PATH);

interface QuestionRow {
  key: string;
  bloque: string;
  numero: string;
  pregunta: string;
  mandatorio: boolean;
  peso: number;
  guia: string;
  requerimiento: string;
  puntaje: Record<string, string>;
  comoVerificar: string;
}

interface PilarData {
  nombre: string;
  orden: number;
  color: string;
  icono: string;
  bloques: string[];
  preguntas: QuestionRow[];
}

const allData: PilarData[] = [];
const summary: Record<string, { questions: number; blocks: number; mandatory: number }> = {};

for (const pilar of PILARES) {
  const ws = wb.Sheets[pilar.sheet];
  if (!ws) {
    console.error(`Sheet "${pilar.sheet}" not found!`);
    continue;
  }

  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const bloques: string[] = [];
  const blockSet = new Set<string>();
  const preguntas: QuestionRow[] = [];

  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    const colA = (row[0] || "").toString().trim(); // KEY
    const colB = (row[1] || "").toString().trim(); // Block
    const colC = (row[2] || "").toString().trim(); // Quest No
    const colD = (row[3] || "").toString().trim(); // Question
    const colE = (row[4] || "").toString().trim(); // Mandatory
    const colF = row[5]; // Weight
    const colG = (row[6] || "").toString().trim(); // Guidance
    const colH = (row[7] || "").toString().trim(); // Requirement
    const colI = (row[8] || "").toString().trim(); // Scoring
    const colJ = (row[9] || "").toString().trim(); // How to check

    // Skip empty rows
    if (!colB && !colC && !colD) continue;

    // Block header row: has block name but no question number and no question text
    if (colB && !colC && !colD) {
      if (colB !== "FUNDAMENTALES" && colB !== "FUNDAMENTALS" && !blockSet.has(colB)) {
        blockSet.add(colB);
        bloques.push(colB);
      }
      continue;
    }

    // Question row: has question number and question text
    if (colC && colD) {
      const key = colA || `${pilar.nombre.toLowerCase()}_${colC.replace(/[,\.]/g, "_")}`;
      preguntas.push({
        key,
        bloque: colB,
        numero: colC,
        pregunta: colD,
        mandatorio: isMandatorio(colE),
        peso: typeof colF === "number" ? colF : parseInt(colF) || 1,
        guia: colG,
        requerimiento: colH,
        puntaje: parseScoring(colI),
        comoVerificar: colJ,
      });
    }
  }

  allData.push({
    nombre: pilar.nombre,
    orden: pilar.orden,
    color: pilar.color,
    icono: pilar.icono,
    bloques,
    preguntas,
  });

  summary[pilar.nombre] = {
    questions: preguntas.length,
    blocks: bloques.length,
    mandatory: preguntas.filter((q) => q.mandatorio).length,
  };
}

// ── Generate 002_seed_pilares_bloques.sql ───────────────────────────────────
let sql002 = `-- Auto-generated by seed-from-excel.ts
-- Seed pilares and bloques
-- Generated: ${new Date().toISOString()}

`;

for (const pilar of allData) {
  const varName = `v_pilar_${pilar.nombre.toLowerCase().replace(/[áéíóú]/g, (c: string) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u" } as any)[c])}`;

  sql002 += `DO $$
DECLARE
  ${varName} uuid;
BEGIN
  INSERT INTO pilares (id, nombre, orden, color, icono)
  VALUES (gen_random_uuid(), '${esc(pilar.nombre)}', ${pilar.orden}, '${pilar.color}', '${pilar.icono}')
  RETURNING id INTO ${varName};

`;

  for (let i = 0; i < pilar.bloques.length; i++) {
    const bloque = pilar.bloques[i];
    sql002 += `  INSERT INTO bloques (id, pilar_id, nombre, orden)
  VALUES (gen_random_uuid(), ${varName}, '${esc(bloque)}', ${i + 1});
`;
  }

  sql002 += `END $$;\n\n`;
}

fs.writeFileSync(path.join(MIGRATIONS_DIR, "002_seed_pilares_bloques.sql"), sql002);
console.log("Generated 002_seed_pilares_bloques.sql");

// ── Generate 003_seed_preguntas.sql ─────────────────────────────────────────
let sql003 = `-- Auto-generated by seed-from-excel.ts
-- Seed preguntas
-- Generated: ${new Date().toISOString()}

`;

for (const pilar of allData) {
  const pilarVar = `v_pilar_id`;
  const bloqueVar = `v_bloque_id`;

  sql003 += `-- ═══════════════════════════════════════════════════════════════════════════
-- Pilar: ${pilar.nombre}
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  ${pilarVar} uuid;
  ${bloqueVar} uuid;
BEGIN
  SELECT id INTO ${pilarVar} FROM pilares WHERE nombre = '${esc(pilar.nombre)}';

`;

  let currentBloque = "";

  for (const q of pilar.preguntas) {
    // Get bloque ID if changed
    if (q.bloque !== currentBloque) {
      currentBloque = q.bloque;
      sql003 += `  SELECT id INTO ${bloqueVar} FROM bloques WHERE pilar_id = ${pilarVar} AND nombre = '${esc(currentBloque)}';
`;
    }

    const puntajeJson = JSON.stringify(q.puntaje);

    sql003 += `
  INSERT INTO preguntas (id, pilar_id, bloque_id, key, numero, pregunta, mandatorio, peso, guia, requerimiento, puntaje, como_verificar)
  VALUES (
    gen_random_uuid(),
    ${pilarVar},
    ${bloqueVar},
    '${esc(q.key)}',
    '${esc(q.numero)}',
    '${esc(q.pregunta)}',
    ${q.mandatorio},
    ${q.peso},
    '${esc(q.guia)}',
    '${esc(q.requerimiento)}',
    '${esc(puntajeJson)}'::jsonb,
    '${esc(q.comoVerificar)}'
  );
`;
  }

  sql003 += `END $$;\n\n`;
}

fs.writeFileSync(path.join(MIGRATIONS_DIR, "003_seed_preguntas.sql"), sql003);
console.log("Generated 003_seed_preguntas.sql");

// ── Generate summary ────────────────────────────────────────────────────────
const totalQuestions = Object.values(summary).reduce((s: number, p: any) => s + p.questions, 0);
const totalBlocks = Object.values(summary).reduce((s: number, p: any) => s + p.blocks, 0);
const totalMandatory = Object.values(summary).reduce((s: number, p: any) => s + p.mandatory, 0);

const fullSummary = {
  generated: new Date().toISOString(),
  totals: { questions: totalQuestions, blocks: totalBlocks, mandatory: totalMandatory },
  pilares: summary,
};

fs.writeFileSync(SUMMARY_PATH, JSON.stringify(fullSummary, null, 2));
console.log("Generated seed-summary.json");
console.log("\n═══ Summary ═══");
console.log(`Total: ${totalQuestions} questions, ${totalBlocks} blocks, ${totalMandatory} mandatory`);
console.log("");

for (const [name, data] of Object.entries(summary) as [string, any][]) {
  console.log(`  ${name}: ${data.questions} questions, ${data.blocks} blocks, ${data.mandatory} mandatory`);
}
