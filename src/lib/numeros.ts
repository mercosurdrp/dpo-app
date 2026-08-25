/**
 * Lectura de números tipeados a mano, en formato argentino.
 *
 * 🚨 Por qué existe: los campos de odómetro/horómetro se parseaban con
 * `Number(v.replace(",", "."))` o directamente `parseInt(v)`, y ninguno de los
 * dos entiende el punto de miles —que es como todo el mundo escribe un
 * kilometraje acá—:
 *
 *   Number("58.853")   → 58.853   (cincuenta y ocho km con 853)
 *   parseInt("143.098") → 143      (corta en el punto)
 *
 * El 25/08/2026 eso dejó dos veces sin cerrar la OT del AF664NY: al tipear
 * 58.853 la validación lo leía como 58,853 km y lo rechazaba por "menor al
 * último cargado: la unidad marcaba 58.853 km" —el mismo número que se había
 * escrito—, así que el mensaje no había forma de entenderlo.
 *
 * Reglas, en orden:
 *   1.234.567,89 / 58.853  → formato es-AR: el punto es separador de miles.
 *   1234,56                → la coma es el decimal.
 *   1234.567               → punto seguido de exactamente 3 dígitos con parte
 *                            entera larga: se toma como miles. Un odómetro no
 *                            se escribe con milésimas.
 *   el resto               → `Number` tal cual (incluye "1234.5" decimal real).
 */
export function parseNumeroEsAR(valor: string | number | null | undefined): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null
  const s = String(valor ?? "")
    .trim()
    .replace(/\s/g, "")
  if (!s) return null

  let normalizado: string
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    normalizado = s.replace(/\./g, "").replace(",", ".")
  } else if (/^-?\d+(,\d+)?$/.test(s)) {
    normalizado = s.replace(",", ".")
  } else if (/^-?\d+\.\d{3}$/.test(s)) {
    normalizado = s.replace(".", "")
  } else {
    normalizado = s
  }

  const n = Number(normalizado)
  return Number.isFinite(n) ? n : null
}

/**
 * Igual que `parseNumeroEsAR` pero redondeado a entero, para odómetros y
 * horómetros: la fracción de km no aporta y arrastra ruido a los cálculos.
 */
export function parseEnteroEsAR(valor: string | number | null | undefined): number | null {
  const n = parseNumeroEsAR(valor)
  return n == null ? null : Math.round(n)
}
