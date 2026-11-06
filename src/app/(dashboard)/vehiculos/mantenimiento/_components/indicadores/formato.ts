// Formatos y calendario compartidos por el tablero de Indicadores.
//
// 🚨 El "mes en curso" sale del reloj de Argentina, igual que en el servidor
// (`meses3Argentina` en flota-indicadores). Antes el cliente usaba la hora
// local del navegador y entre las 21 y las 24 del último día del mes los dos
// lados hablaban de meses distintos.

import { hoyISO } from "../filtro-periodo"

export const MESES_CORTO = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
]
export const MESES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

export const pad = (n: number) => String(n).padStart(2, "0")

/** Hoy en Argentina, `YYYY-MM-DD`. */
export const hoyAR = () => hoyISO()

export const fmtMesCorto = (ym: string) => MESES_CORTO[Number(ym.slice(5, 7)) - 1] ?? ym
export const fmtMesLargo = (ym: string) =>
  `${MESES_LARGO[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`
/** "octubre" (sin año), para frases. */
export const fmtMesNombre = (ym: string) =>
  (MESES_LARGO[Number(ym.slice(5, 7)) - 1] ?? ym).toLowerCase()

export const fmtMoney = (v: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(v)

/** Últimos `n` meses terminando en el de `hoy` (incluido), en orden. */
export function ultimosMeses(hoy: string, n: number): string[] {
  const [y, m] = [Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7))]
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`)
  }
  return out
}

export const diasDelMes = (ym: string) =>
  new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate()

/** `YYYY-MM-DD` → `dd/mm`. */
export const fmtDiaMes = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}`
}

/** `YYYY-MM-DD` → `dd/mm/aaaa`. */
export const fmtFecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/")
