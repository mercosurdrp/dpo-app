// Tipos y helpers de la parte "humana" de la pirámide de flota (DPO 4.2):
// planes sobre un foco y lecturas mensuales. Separado de la acción porque un
// archivo "use server" no puede exportar constantes ni funciones síncronas.

import type { MantenimientoSistema } from "@/types/database"
import type { ConteoNiveles, KpisPiramide, BalancePiramide } from "./piramide-flota"
import { labelSistema } from "./sistemas-ot"
import { esDelProveedor } from "./ans-cumplimiento"

/** Los planes de la pirámide son `flota_plan_accion` con este prefijo en `kpi`. */
export const KPI_PIRAMIDE_PREFIJO = "piramide:"

export type TipoFoco = "sistema" | "unidad" | "taller" | "nivel"

export interface FocoPiramide {
  tipo: TipoFoco
  /** sistema: id del catálogo · unidad: dominio · taller: nombre · nivel: rotura|correctivo|… */
  valor: string
}

export function kpiDeFoco(f: FocoPiramide): string {
  return `${KPI_PIRAMIDE_PREFIJO}${f.tipo}:${f.valor}`
}

export function esKpiPiramide(kpi: string | null | undefined): boolean {
  return !!kpi && kpi.startsWith(KPI_PIRAMIDE_PREFIJO)
}

export function focoDeKpi(kpi: string): FocoPiramide | null {
  if (!esKpiPiramide(kpi)) return null
  const resto = kpi.slice(KPI_PIRAMIDE_PREFIJO.length)
  const i = resto.indexOf(":")
  if (i < 0) return null
  return { tipo: resto.slice(0, i) as TipoFoco, valor: resto.slice(i + 1) }
}

const LABEL_NIVEL: Record<string, string> = {
  rotura: "Roturas",
  correctivo: "Correctivos",
  deteccion: "Detección por checklist / CIL",
  preventivo: "Preventivo",
  balance: "Balance de la pirámide",
}

/** «Pirámide · Sistema: Carrocería y lona». Sirve también para la lista de Indicadores. */
export function labelFocoKpi(kpi: string): string {
  const f = focoDeKpi(kpi)
  if (!f) return kpi
  switch (f.tipo) {
    case "sistema":
      return `Pirámide · Sistema: ${labelSistema(f.valor as MantenimientoSistema)}`
    case "unidad":
      return `Pirámide · Unidad ${f.valor}`
    case "taller":
      return `Pirámide · Taller ${f.valor}`
    default:
      return `Pirámide · ${LABEL_NIVEL[f.valor] ?? f.valor}`
  }
}

export interface PlanPiramideItem {
  id: string
  plan_id: string
  accion: string
  responsable: string
  fecha_compromiso: string
  estado: "pendiente" | "en_progreso" | "completado"
  fecha_completado: string | null
  observaciones: string | null
  orden: number
}

export interface PlanPiramide {
  id: string
  kpi: string
  mes: number
  year: number
  valorMes: number | null
  causaRaiz: string
  estado: "abierto" | "en_progreso" | "cerrado"
  fechaCierre: string | null
  resultadoCierre: string | null
  createdAt: string
  items: PlanPiramideItem[]
  /** Tipos de herramienta aplicados: cinco_porques | causa_efecto | pdca. */
  herramientas: string[]
}

/** Foto que se guarda con cada lectura mensual. */
export interface SnapshotRevision {
  mes: Pick<ConteoNiveles, "preventivo" | "deteccion" | "correctivo" | "rotura"> & {
    costoPreventivo: number
    costoFallas: number
  }
  acumulado: Pick<ConteoNiveles, "preventivo" | "deteccion" | "correctivo" | "rotura">
  kpis: Pick<KpisPiramide, "pctPreventivoCant" | "pctPreventivoCosto" | "mtbfDias" | "mttrHoras" | "pctConAviso">
  balance: Pick<BalancePiramide, "balanceada">
}

export interface RevisionPiramide {
  id: string
  anio: number
  mes: number
  snapshot: SnapshotRevision
  lectura: string
  decision: string | null
  revisadoPor: string | null
  revisadoAt: string
}

export interface SlaTaller {
  nombre: string
  parteProveedor: string | null
  estado: "pendiente" | "firmado" | "no_aplica"
  /** ANS por proveedor (flota_ans): se cruza por el nombre del maestro, no por palabras sueltas. */
  exacto?: boolean
}

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** ¿Algún ANS de flota nombra a este taller? Mismo criterio que Proveedores (2.3). */
export function slaDeTaller(slas: SlaTaller[], taller: string): SlaTaller | null {
  const exacto = slas.find((s) => s.exacto && esDelProveedor(taller, s.parteProveedor ?? s.nombre))
  if (exacto) return exacto
  const claves = norm(taller)
    .split(" ")
    .filter((w) => w.length >= 4)
  if (claves.length === 0) return null
  return (
    slas.find((s) => {
      if (s.exacto) return false
      const texto = `${norm(s.parteProveedor)} ${norm(s.nombre)}`
      return claves.some((k) => texto.includes(k))
    }) ?? null
  )
}
