import Link from "next/link"
import { ArrowLeft, AlertTriangle } from "lucide-react"
import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { createClient } from "@/lib/supabase/server"
import { PeriodosCriticosClient, type DiaCalendario, type CfgPC, type UmbralesPC } from "./_components/client"

export const dynamic = "force-dynamic"

// Pagina manual la vista multi-año (PostgREST trunca a 1000 filas y la vista
// devuelve ~1100 con 3 años). Cada página es 1000 filas; se itera hasta que
// vuelva una página incompleta o vacía.
async function fetchMultianio(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ data: DiaCalendario[]; error: { message: string } | null }> {
  const PAGE = 1000
  const all: DiaCalendario[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from("v_pc_calendario_dia_multianio")
      .select("*")
      .order("fecha", { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return { data: [], error: { message: error.message } }
    if (!data || data.length === 0) break
    all.push(...(data as DiaCalendario[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return { data: all, error: null }
}

export default async function PeriodosCriticosPage() {
  if (!IS_MISIONES) notFound()
  await requireAuth()

  const supabase = await createClient()

  const [
    { data: cfgRow, error: cfgErr },
    { data: umbralesRow },
    diasResult,
    { data: planes },
  ] = await Promise.all([
    supabase.from("pc_config").select("*").eq("id", 1).single(),
    supabase.from("pc_umbrales").select("*").eq("id", 1).single(),
    // Vista multi-año: trae 2024..año+1 con columna `anio`. PostgREST trunca a
    // 1000 filas por default y la vista devuelve ~1095 (3 años × 365), por eso
    // paginamos manual con .range() hasta agotar.
    fetchMultianio(supabase),
    supabase.from("pc_planes_accion").select("codigo,descripcion,plan_texto"),
  ])
  const dias = diasResult.data
  const diasErr = diasResult.error

  if (cfgErr || !cfgRow) {
    return (
      <div className="space-y-4">
        <Link
          href="/indicadores/5eb1b041-6a1b-4c71-9067-0daf4f5e381a"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Planeamiento
        </Link>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-900 font-semibold">
            <AlertTriangle className="h-4 w-4" /> Configuración no inicializada
          </div>
          <p className="mt-1 text-sm text-amber-800">
            Falta aplicar la migración <code>083_periodos_criticos.sql</code> en la Supabase de Misiones.
          </p>
        </div>
      </div>
    )
  }

  const cfg: CfgPC = {
    anio: cfgRow.anio_vigente,
    w_vol: Number(cfgRow.w_vol),
    w_otif: Number(cfgRow.w_otif),
    w_aus: Number(cfgRow.w_aus),
    umbral_alto: Number(cfgRow.umbral_alto),
    umbral_medio: Number(cfgRow.umbral_medio),
    hl_p90_2025: cfgRow.hl_p90_2025 != null ? Number(cfgRow.hl_p90_2025) : null,
  }

  const umbrales: UmbralesPC = umbralesRow
    ? {
        vol_pico: Number(umbralesRow.vol_pico),
        vol_alto: Number(umbralesRow.vol_alto),
        vol_medio: Number(umbralesRow.vol_medio),
        clientes: Number(umbralesRow.clientes),
        otif_min: Number(umbralesRow.otif_min),
        ausentismo_max: Number(umbralesRow.ausentismo_max),
        min_triggers: Number(umbralesRow.min_triggers),
      }
    : { vol_pico: 900, vol_alto: 650, vol_medio: 450, clientes: 300, otif_min: 0.92, ausentismo_max: 0.075, min_triggers: 2 }

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores/5eb1b041-6a1b-4c71-9067-0daf4f5e381a"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Planeamiento
      </Link>
      <PeriodosCriticosClient
        cfg={cfg}
        umbrales={umbrales}
        dias={dias}
        planes={(planes ?? []) as { codigo: string; descripcion: string; plan_texto: string }[]}
        errorDias={diasErr?.message ?? null}
      />
    </div>
  )
}
