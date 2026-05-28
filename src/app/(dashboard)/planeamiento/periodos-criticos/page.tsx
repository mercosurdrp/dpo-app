import Link from "next/link"
import { ArrowLeft, AlertTriangle } from "lucide-react"
import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { createClient } from "@/lib/supabase/server"
import { PeriodosCriticosClient, type DiaCalendario, type CfgPC } from "./_components/client"

export const dynamic = "force-dynamic"

export default async function PeriodosCriticosPage() {
  if (!IS_MISIONES) notFound()
  await requireAuth()

  const supabase = await createClient()

  const [{ data: cfgRow, error: cfgErr }, { data: dias, error: diasErr }] = await Promise.all([
    supabase.from("pc_config").select("*").eq("id", 1).single(),
    supabase.from("v_pc_calendario_dia").select("*").order("fecha", { ascending: true }),
  ])

  if (cfgErr || !cfgRow) {
    return (
      <div className="space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver
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

  return (
    <div className="space-y-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver
      </Link>
      <PeriodosCriticosClient
        cfg={cfg}
        dias={(dias ?? []) as DiaCalendario[]}
        errorDias={diasErr?.message ?? null}
      />
    </div>
  )
}
