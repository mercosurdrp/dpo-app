"use client"

// Vista de EQUIPO (supervisor/admin/admin_rrhh/auditor): HHEE al 50%/100% y
// bultos del mes por empleado. En mobile colapsa a cards.

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  VisibilidadEquipoData,
  VisibilidadEquipoRow,
} from "@/actions/visibilidad-resultados"

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

function nombreMesLargo(mes: string): string {
  const [a, m] = mes.split("-")
  return `${NOMBRES_MES[Number(m) - 1]} ${a}`
}

const fmtHs = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })
const fmtInt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 })

type OrdenCol = "nombre" | "hhee_total" | "bultos_mes" | "dias_trabajados"

export function VisibilidadEquipoClient({ data }: { data: VisibilidadEquipoData }) {
  const router = useRouter()
  const { mes, meses_disponibles, filas, sectores, sin_mapeo } = data
  const idx = meses_disponibles.indexOf(mes)
  const [sector, setSector] = useState<string>("todos")
  const [orden, setOrden] = useState<OrdenCol>("hhee_total")
  const [asc, setAsc] = useState(false)

  const irA = (m: string) => router.push(`/visibilidad-resultados?mes=${m}`)

  const visibles = useMemo(() => {
    const filtradas = sector === "todos" ? filas : filas.filter((f) => f.sector === sector)
    const dir = asc ? 1 : -1
    return [...filtradas].sort((a, b) => {
      if (orden === "nombre") return dir * a.nombre.localeCompare(b.nombre)
      const va = orden === "bultos_mes" ? (a.bultos_mes ?? -1) : a[orden]
      const vb = orden === "bultos_mes" ? (b.bultos_mes ?? -1) : b[orden]
      return dir * (va - vb)
    })
  }, [filas, sector, orden, asc])

  const totales = useMemo(() => {
    let hs50 = 0
    let hs100 = 0
    let bultos = 0
    for (const f of visibles) {
      hs50 += f.hs_50
      hs100 += f.hs_100
      bultos += f.bultos_mes ?? 0
    }
    return { hs50, hs100, bultos }
  }, [visibles])

  const clickOrden = (col: OrdenCol) => {
    if (orden === col) setAsc(!asc)
    else {
      setOrden(col)
      setAsc(col === "nombre")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Visibilidad de Resultados</h1>
          <p className="text-sm text-muted-foreground">
            Horas extras y bultos por empleado · pilar Entrega 2.1
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sector} onValueChange={(v) => setSector(v ?? "todos")}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Sector" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los sectores</SelectItem>
              {sectores.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center rounded-lg border bg-white px-1 py-0.5">
            <button
              onClick={() => idx > 0 && irA(meses_disponibles[idx - 1])}
              disabled={idx <= 0}
              className="rounded-md p-1.5 text-slate-600 disabled:opacity-30"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-28 text-center text-sm font-semibold text-slate-800">
              {nombreMesLargo(mes)}
            </span>
            <button
              onClick={() => idx >= 0 && idx < meses_disponibles.length - 1 && irA(meses_disponibles[idx + 1])}
              disabled={idx < 0 || idx >= meses_disponibles.length - 1}
              className="rounded-md p-1.5 text-slate-600 disabled:opacity-30"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Resumen label="Hs extras al 50%" valor={`${fmtHs(totales.hs50)} hs`} />
        <Resumen label="Hs extras al 100%" valor={`${fmtHs(totales.hs100)} hs`} />
        <Resumen label="Bultos distribuidos" valor={fmtInt(totales.bultos)} />
        <Resumen label="Empleados" valor={String(visibles.length)} />
      </div>

      {sin_mapeo > 0 && (
        <p className="text-xs text-muted-foreground">
          {sin_mapeo} empleado{sin_mapeo === 1 ? "" : "s"} sin vincular a camión (bultos “—”) —{" "}
          <Link href="/admin/mapeo-empleados" className="text-blue-600 underline underline-offset-2">
            vincular acá
          </Link>
          . Chofer y ayudante del mismo camión comparten los bultos.
        </p>
      )}

      {/* Tabla desktop */}
      <div className="hidden overflow-x-auto rounded-lg border bg-white md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <Th onClick={() => clickOrden("nombre")}>Empleado</Th>
              <th className="px-3 py-2">Sector</th>
              <Th onClick={() => clickOrden("dias_trabajados")} right>
                Días trab.
              </Th>
              <th className="px-3 py-2 text-right">Hs al 50%</th>
              <th className="px-3 py-2 text-right">Hs al 100%</th>
              <Th onClick={() => clickOrden("hhee_total")} right>
                Total HHEE
              </Th>
              <Th onClick={() => clickOrden("bultos_mes")} right>
                Bultos mes
              </Th>
              <th className="px-3 py-2 text-right">Días reparto</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.empleado_id} className="border-b last:border-0 hover:bg-slate-50/60">
                <td className="px-3 py-2">
                  <span className="font-medium text-slate-800">{f.nombre}</span>
                  <span className="ml-1 text-xs text-slate-400">#{f.legajo}</span>
                  <Flags fila={f} />
                </td>
                <td className="px-3 py-2 text-slate-500">{f.sector ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{f.dias_trabajados}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtHs(f.hs_50)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtHs(f.hs_100)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {fmtHs(f.hhee_total)}
                </td>
                <td
                  className="px-3 py-2 text-right tabular-nums"
                  title={f.bultos_mes === null ? "Sin vincular a camión" : undefined}
                >
                  {f.bultos_mes === null ? "—" : fmtInt(f.bultos_mes)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                  {f.bultos_mes === null ? "—" : f.dias_con_entrega}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards mobile */}
      <div className="space-y-2 md:hidden">
        {visibles.map((f) => (
          <Card key={f.empleado_id}>
            <CardContent className="space-y-1 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-800">
                  {f.nombre} <span className="text-xs text-slate-400">#{f.legajo}</span>
                </p>
                <Flags fila={f} />
              </div>
              <p className="text-xs text-muted-foreground">
                {f.sector ?? "Sin sector"} · {f.dias_trabajados} días
              </p>
              <p className="text-sm">
                <span className="font-semibold">{fmtHs(f.hhee_total)} hs extras</span>
                <span className="text-muted-foreground">
                  {" "}
                  ({fmtHs(f.hs_50)} al 50% · {fmtHs(f.hs_100)} al 100%)
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {f.bultos_mes === null ? "Sin vincular a camión" : `${fmtInt(f.bultos_mes)} bultos en ${f.dias_con_entrega} días`}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function Resumen({ label, valor }: { label: string; valor: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-lg font-bold tabular-nums text-slate-900">{valor}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}

function Th({
  children,
  onClick,
  right,
}: {
  children: React.ReactNode
  onClick: () => void
  right?: boolean
}) {
  return (
    <th className={`px-3 py-2 ${right ? "text-right" : "text-left"}`}>
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-800"
      >
        {children}
        <ArrowUpDown className="size-3" />
      </button>
    </th>
  )
}

function Flags({ fila }: { fila: VisibilidadEquipoRow }) {
  return (
    <span className="ml-1 inline-flex gap-1">
      {fila.dias_sin_salida > 0 && (
        <Badge className="bg-amber-100 text-[10px] text-amber-800 hover:bg-amber-100">
          {fila.dias_sin_salida} sin salida
        </Badge>
      )}
      {fila.dias_revisar > 0 && (
        <Badge className="bg-red-100 text-[10px] text-red-800 hover:bg-red-100">
          {fila.dias_revisar} revisar
        </Badge>
      )}
    </span>
  )
}
