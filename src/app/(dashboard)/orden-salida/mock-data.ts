// Catálogos de UI usados por el cliente del módulo /orden-salida.
// Los datos (empleados, camiones, asignaciones, no-sale) vienen del backend
// vía server actions; este archivo solo expone metadata para etiquetar/colorear.

import type { EstadoCamion, MotivoNoSale } from "./types"

export const ESTADOS_CAMION: { value: EstadoCamion; label: string; color: string; bg: string }[] = [
  { value: "operativo",      label: "Operativo",         color: "text-emerald-700", bg: "bg-emerald-100" },
  { value: "sin_asignar",    label: "Sin asignar",       color: "text-slate-500",   bg: "bg-slate-100" },
  { value: "sin_carga",      label: "Sin carga",         color: "text-cyan-700",    bg: "bg-cyan-100" },
  { value: "fuera_servicio", label: "Fuera de servicio", color: "text-rose-700",    bg: "bg-rose-100" },
  { value: "taller",         label: "Taller",            color: "text-amber-700",   bg: "bg-amber-100" },
]

export const MOTIVOS_NO_SALE: { value: MotivoNoSale; label: string; color: string; bg: string }[] = [
  { value: "deposito",   label: "Depósito",   color: "text-blue-700",    bg: "bg-blue-100" },
  { value: "vacaciones", label: "Vacaciones", color: "text-amber-700",   bg: "bg-amber-100" },
  { value: "licencia",   label: "Licencia",   color: "text-rose-700",    bg: "bg-rose-100" },
  { value: "ausente",    label: "Ausente",    color: "text-red-700",     bg: "bg-red-100" },
  { value: "suspendido", label: "Suspendido", color: "text-fuchsia-700", bg: "bg-fuchsia-100" },
  { value: "franco",     label: "Franco",     color: "text-slate-700",   bg: "bg-slate-200" },
  { value: "otro",       label: "Otro",       color: "text-zinc-700",    bg: "bg-zinc-200" },
]

export const ZONAS_SUGERIDAS: string[] = [
  "ELDORADO", "MONTECARLO", "PIRAY", "LIBERTAD", "ESPERANZA", "WANDA", "MADO",
  "9 DE JULIO", "CARAGUATAY", "IGUAZU",
  "ANDRESITO", "SAN ANTONIO", "BERNARDO DE IRIGOYEN", "SAN PEDRO",
  "POZO AZUL / DOS HNAS.",
  "ELDORADO-MCARLO", "ELDORADO-PIRAY", "ELDORADO-WANDA", "WANDA - ESPERANZA",
  "MADO - ELDORADO", "ESPE - WANDA - MADO", "MADO - ESPE - LIBERTAD",
]
