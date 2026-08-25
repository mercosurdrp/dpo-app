import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { DiasPicoClient, type DiaReal, type MesProyectado, type Feriado } from "./_components/client"

export const dynamic = "force-dynamic"

const ANIO = 2026
const ANIO_BASE = ANIO - 1

/**
 * Días Pico — modelo de dimensionamiento por CAPACIDAD (banco de pruebas).
 *
 * Vive aparte de /planeamiento/periodos-criticos a propósito: aquel módulo es
 * el que se audita en DPO R3.4 y usa detección retrospectiva por 4 triggers.
 * Éste es el enfoque forward —presupuesto repartido por día vs capacidad de
 * distribución— para poder comparar los dos sin tocar el que está en uso.
 *
 * Nada de esto se persiste: los parámetros viven en el cliente.
 */
export default async function DiasPicoPage() {
  await requireAuth()
  const supabase = await createClient()

  const [{ data: proyectado }, { data: real }, { data: base }, { data: feriados }] =
    await Promise.all([
      supabase
        .from("dim_volumen_proyectado")
        .select("mes, hl")
        .eq("anio", ANIO)
        .order("mes", { ascending: true }),
      supabase
        .from("pc_volumen_diario")
        .select("fecha, bultos_distribuidos")
        .gte("fecha", `${ANIO}-01-01`)
        .lte("fecha", `${ANIO}-12-31`)
        .order("fecha", { ascending: true }),
      // Año anterior: de acá sale el peso de cada día dentro de su mes.
      supabase
        .from("pc_volumen_diario")
        .select("fecha, bultos_distribuidos")
        .gte("fecha", `${ANIO_BASE}-01-01`)
        .lte("fecha", `${ANIO_BASE}-12-31`)
        .order("fecha", { ascending: true }),
      supabase.from("pc_feriados").select("fecha, nombre").gte("fecha", `${ANIO}-01-01`),
    ])

  const aDias = (rows: { fecha: string; bultos_distribuidos: number | null }[] | null): DiaReal[] =>
    (rows ?? [])
      .map((r) => ({ fecha: r.fecha, hl: Number(r.bultos_distribuidos ?? 0) }))
      .filter((d) => d.hl > 0)

  return (
    <div className="space-y-4">
      <Link
        href="/planeamiento/periodos-criticos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Períodos Críticos
      </Link>
      <DiasPicoClient
        anio={ANIO}
        anioBase={ANIO_BASE}
        proyectado={(proyectado ?? []).map((p) => ({ mes: p.mes, hl: Number(p.hl) })) as MesProyectado[]}
        real={aDias(real)}
        base={aDias(base)}
        feriados={(feriados ?? []) as Feriado[]}
      />
    </div>
  )
}
