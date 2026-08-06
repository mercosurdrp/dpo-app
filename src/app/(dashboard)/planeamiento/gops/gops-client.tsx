"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ClipboardCheck, FileSpreadsheet, ListChecks, Target } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import type { GopPendiente, GopTemaResumen, ImportacionLog, GopPeriodo } from "@/actions/gops"
import type { GopPlan } from "@/actions/gops-planes"
import { PendientesTab } from "./_components/pendientes-tab"
import { TemasTab } from "./_components/temas-tab"
import { PlanesTab } from "./_components/planes-tab"
import { ImportarDialog } from "./_components/importar-dialog"
import { MES_NOMBRE, pct } from "./_components/formato"

interface Props {
  periodo: { anio: number; mes: number }
  periodos: GopPeriodo[]
  resumen: GopTemaResumen[]
  pendientes: GopPendiente[]
  planes: GopPlan[]
  responsables: Array<{ id: string; nombre: string }>
  importaciones: ImportacionLog[]
  canEdit: boolean
  mesEnCurso: { anio: number; mes: number }
}

export function GopsClient({
  periodo,
  periodos,
  resumen,
  pendientes,
  planes,
  responsables,
  importaciones,
  canEdit,
  mesEnCurso,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState("pendientes")
  const [importarAbierto, setImportarAbierto] = useState(false)

  const hayDatos = resumen.some((t) => t.puntaje !== null)

  const kpis = useMemo(() => {
    const conDato = resumen.filter((t) => t.puntaje !== null)
    return {
      enTarget: conDato.filter((t) => (t.puntaje ?? 0) >= t.target).length,
      total: conDato.length,
      nos: resumen.reduce((a, t) => a + t.no, 0),
      sinDecidir: pendientes.filter((p) => p.motivo_pendiente === "sin_decidir").length,
      aRevisar: pendientes.filter((p) => p.motivo_pendiente === "revision").length,
    }
  }, [resumen, pendientes])

  function cambiarPeriodo(valor: string) {
    router.push(`/planeamiento/gops?periodo=${valor}`)
  }

  // Los meses ya importados, más el mes en curso si todavía no se cargó: sirve para
  // pararse en el mes que se está por importar.
  const opcionesPeriodo = useMemo(() => {
    const ops = periodos.map((p) => ({ ...p, valor: `${p.anio}-${p.mes}` }))
    const actual = `${mesEnCurso.anio}-${mesEnCurso.mes}`
    if (!ops.some((o) => o.valor === actual)) {
      ops.unshift({ ...mesEnCurso, respuestas: 0, valor: actual })
    }
    return ops
  }, [periodos, mesEnCurso])

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">GOPs y Toolkits</h1>
          <p className="text-[15px] text-muted-foreground">
            Buenas prácticas operativas — DPO Gestión 4.5. Se completan una vez por mes en el
            consolidado y se importan acá para trabajar los puntos en &ldquo;No&rdquo;.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={`${periodo.anio}-${periodo.mes}`}
            onChange={(e) => cambiarPeriodo(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900"
          >
            {opcionesPeriodo.map((p) => (
              <option key={p.valor} value={p.valor}>
                {MES_NOMBRE[p.mes]} {p.anio}
                {p.respuestas === 0 ? " (sin carga)" : ""}
              </option>
            ))}
          </select>

          {canEdit && (
            <button
              onClick={() => setImportarAbierto(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Importar Excel
            </button>
          )}
        </div>
      </div>

      {!hayDatos ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FileSpreadsheet className="h-10 w-10 text-slate-300" />
            <div>
              <p className="font-semibold text-slate-900">
                No hay carga para {MES_NOMBRE[periodo.mes]} {periodo.anio}
              </p>
              <p className="text-sm text-muted-foreground">
                Subí el Consolidado de GOPs y Toolkits del mes y la app arma sola el puntaje de
                cada tema y la lista de puntos a trabajar.
              </p>
            </div>
            {canEdit && (
              <button
                onClick={() => setImportarAbierto(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <FileSpreadsheet className="h-4 w-4" /> Importar Excel
              </button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={<Target className="h-4 w-4" />}
              label="En target"
              valor={`${kpis.enTarget}/${kpis.total}`}
              detalle={`GOPs con ${pct(resumen[0]?.target ?? 0.85, 0)} o más`}
              tono={kpis.enTarget === kpis.total ? "ok" : "alerta"}
            />
            <Kpi
              icon={<ListChecks className="h-4 w-4" />}
              label="Puntos en No"
              valor={String(kpis.nos)}
              detalle="del mes seleccionado"
              tono={kpis.nos === 0 ? "ok" : "neutro"}
            />
            <Kpi
              icon={<ClipboardCheck className="h-4 w-4" />}
              label="Sin decisión"
              valor={String(kpis.sinDecidir)}
              detalle="no tienen plan ni motivo"
              tono={kpis.sinDecidir === 0 ? "ok" : "alerta"}
            />
            <Kpi
              icon={<ClipboardCheck className="h-4 w-4" />}
              label="A revisar"
              valor={String(kpis.aRevisar)}
              detalle="venció la fecha de revisión"
              tono={kpis.aRevisar === 0 ? "ok" : "aviso"}
            />
          </div>

          <Tabs value={tab} onValueChange={(v) => v && setTab(v)}>
            <TabsList className="grid w-full max-w-xl grid-cols-3">
              <TabsTrigger value="pendientes">
                A decidir
                {pendientes.length > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {pendientes.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="temas">Puntaje por GOP</TabsTrigger>
              <TabsTrigger value="planes">
                Planes
                {planes.length > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {planes.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pendientes" className="mt-4">
              <PendientesTab
                pendientes={pendientes}
                resumen={resumen}
                planes={planes}
                responsables={responsables}
                canEdit={canEdit}
              />
            </TabsContent>

            <TabsContent value="temas" className="mt-4">
              <TemasTab
                resumen={resumen}
                periodo={periodo}
                planes={planes}
                responsables={responsables}
                canEdit={canEdit}
              />
            </TabsContent>

            <TabsContent value="planes" className="mt-4">
              <PlanesTab planes={planes} responsables={responsables} canEdit={canEdit} />
            </TabsContent>
          </Tabs>
        </>
      )}

      {importaciones.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Última importación: {importaciones[0].archivo_nombre} ·{" "}
          {new Date(importaciones[0].created_at).toLocaleDateString("es-AR")} ·{" "}
          {importaciones[0].resumen?.respuestas ?? 0} respuestas
          {importaciones[0].importado_por_nombre
            ? ` · ${importaciones[0].importado_por_nombre}`
            : ""}
        </p>
      )}

      <ImportarDialog
        open={importarAbierto}
        onOpenChange={setImportarAbierto}
        anioSugerido={periodo.anio}
        mesSugerido={periodo.anio === mesEnCurso.anio ? mesEnCurso.mes : 12}
      />
    </div>
  )
}

function Kpi({
  icon,
  label,
  valor,
  detalle,
  tono,
}: {
  icon: React.ReactNode
  label: string
  valor: string
  detalle: string
  tono: "ok" | "alerta" | "aviso" | "neutro"
}) {
  const color =
    tono === "ok"
      ? "text-emerald-600"
      : tono === "alerta"
        ? "text-red-600"
        : tono === "aviso"
          ? "text-amber-600"
          : "text-slate-900"

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {icon}
          {label}
        </div>
        <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{valor}</p>
        <p className="text-xs text-muted-foreground">{detalle}</p>
      </CardContent>
    </Card>
  )
}
