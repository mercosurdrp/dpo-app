"use client"

import { useMemo, useState } from "react"
import { FileSignature, Handshake, CircleAlert, CircleCheck, CircleDashed } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  SLA_ESTADO_LABELS,
  SLA_PILAR_LABELS,
  SLA_PILAR_ORDEN,
  type SlaConAutor,
  type UserRole,
} from "@/types/database"
import type { CumplimientoRuteoMes } from "@/lib/sla-cumplimiento"
import { SlaDetalleDialog } from "@/components/sla/sla-detalle-dialog"
import { SlaCumplimientos } from "@/components/sla/sla-cumplimientos"

function fechaCorta(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

/** Estado efectivo para mostrar (vencido tiene prioridad sobre el guardado). */
function estadoBadge(sla: SlaConAutor) {
  if (sla.estado === "no_aplica") {
    return { label: "No aplica", className: "bg-slate-100 text-slate-600" }
  }
  if (sla.vencido) {
    return { label: "Vencido", className: "bg-red-100 text-red-700" }
  }
  if (sla.estado === "firmado") {
    return { label: "Firmado", className: "bg-emerald-100 text-emerald-700" }
  }
  return { label: SLA_ESTADO_LABELS.pendiente, className: "bg-amber-100 text-amber-700" }
}

export function SlaClient({
  slas,
  currentRole,
  cumplimiento,
}: {
  slas: SlaConAutor[]
  currentRole: UserRole
  /** Cumplimiento del SLA de ruteo del mes actual (null en Misiones o si falla). */
  cumplimiento?: CumplimientoRuteoMes | null
}) {
  const [detalleId, setDetalleId] = useState<string | null>(null)

  const canGestionar = currentRole === "admin" || currentRole === "supervisor"

  const resumen = useMemo(() => {
    let firmados = 0
    let pendientes = 0
    let vencidos = 0
    let noAplica = 0
    for (const s of slas) {
      if (s.estado === "no_aplica") noAplica++
      else if (s.vencido) vencidos++
      else if (s.estado === "firmado") firmados++
      else pendientes++
    }
    return { firmados, pendientes, vencidos, noAplica, total: slas.length }
  }, [slas])

  const slaSeleccionado = slas.find((s) => s.id === detalleId) ?? null

  const acuerdos = (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ResumenCard
          icon={<CircleCheck className="size-4 text-emerald-600" />}
          label="Firmados"
          value={resumen.firmados}
        />
        <ResumenCard
          icon={<CircleDashed className="size-4 text-amber-600" />}
          label="Pendientes"
          value={resumen.pendientes}
        />
        <ResumenCard
          icon={<CircleAlert className="size-4 text-red-600" />}
          label="Vencidos"
          value={resumen.vencidos}
        />
        <ResumenCard
          icon={<FileSignature className="size-4 text-slate-500" />}
          label="Total"
          value={resumen.total}
        />
      </div>

      {/* Tablas por pilar */}
      <div className="space-y-8">
        {SLA_PILAR_ORDEN.map((pilar) => {
          const delPilar = slas.filter((s) => s.pilar === pilar)
          if (delPilar.length === 0) return null
          return (
            <section key={pilar} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                {SLA_PILAR_LABELS[pilar]}
              </h2>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>SLA</TableHead>
                      <TableHead className="hidden md:table-cell">Partes</TableHead>
                      <TableHead className="hidden sm:table-cell">Requisito</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="hidden lg:table-cell">Vence</TableHead>
                      <TableHead className="text-right">Acuerdos</TableHead>
                      <TableHead className="w-[1%]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {delPilar.map((s) => {
                      const badge = estadoBadge(s)
                      return (
                        <TableRow
                          key={s.id}
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={() => setDetalleId(s.id)}
                        >
                          <TableCell className="font-medium text-slate-900">
                            {s.nombre}
                          </TableCell>
                          <TableCell className="hidden text-sm text-slate-600 md:table-cell">
                            {s.parte_cliente || "—"}
                            {" ↔ "}
                            {s.parte_proveedor || "—"}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                              {s.requisito_manual || "—"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge className={badge.className}>{badge.label}</Badge>
                          </TableCell>
                          <TableCell className="hidden text-sm text-slate-600 lg:table-cell">
                            {fechaCorta(s.fecha_vencimiento)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-slate-600">
                            {s.adjuntos.length}
                          </TableCell>
                          <TableCell
                            className="text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDetalleId(s.id)}
                            >
                              {canGestionar ? "Gestionar" : "Ver"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <Handshake className="size-6 text-pink-600" />
          SLA — Acuerdos de Nivel de Servicio
        </h1>
        <p className="text-sm text-slate-500">
          Los 15 SLA que exige el manual DPO. Subí acá el acuerdo firmado por
          ambas partes para cada uno.
        </p>
      </div>

      {cumplimiento ? (
        <Tabs defaultValue="acuerdos">
          <TabsList variant="line">
            <TabsTrigger value="acuerdos">Acuerdos</TabsTrigger>
            <TabsTrigger value="cumplimientos">Cumplimientos</TabsTrigger>
          </TabsList>
          <TabsContent value="acuerdos" className="pt-2">
            {acuerdos}
          </TabsContent>
          <TabsContent value="cumplimientos" className="pt-2">
            <SlaCumplimientos inicial={cumplimiento} />
          </TabsContent>
        </Tabs>
      ) : (
        acuerdos
      )}

      <SlaDetalleDialog
        sla={slaSeleccionado}
        canGestionar={canGestionar}
        open={detalleId !== null}
        onOpenChange={(o) => !o && setDetalleId(null)}
      />
    </div>
  )
}

function ResumenCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      {icon}
      <div>
        <div className="text-lg font-bold leading-none text-slate-900">
          {value}
        </div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  )
}
