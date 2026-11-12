"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { useRefrescarConScroll } from "@/lib/use-refrescar-con-scroll"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Loader2, Plus } from "lucide-react"
import type { TiRegistro } from "@/types/database"
import { crearPlanTiDesvio, type TiPlanDesvio } from "@/actions/tiempo-interno"
import {
  TI_META,
  TI_REINCIDENCIA_DIAS,
  TI_REINCIDENCIA_MINUTOS,
  detectarDesvios,
  efectoPlan,
  registrosValidos,
  type DesvioTi,
  type EfectoPlan,
} from "@/lib/tiempo-interno-analisis"

const SEMANAS_DEFAULT = 8

const REGLA_LABEL: Record<DesvioTi["regla"], string> = {
  semana_sobre_meta: `Promedio > ${TI_META} min`,
  reincidencia: `${TI_REINCIDENCIA_DIAS}+ días > ${TI_REINCIDENCIA_MINUTOS} min`,
}

const ESTADO_CLASE: Record<string, string> = {
  pendiente: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  en_progreso: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  completado: "bg-green-100 text-green-700 hover:bg-green-100",
}
const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
}

type Filtro = "sin_plan" | "con_plan" | "todos"

function enDias(n: number): string {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
}

function Efecto({ e }: { e: EfectoPlan }) {
  if (e.veredicto === "sin_datos") {
    return (
      <span className="text-xs text-muted-foreground">
        {e.antes ? `${e.antes.promedio} min antes · todavía sin datos después` : "Sin datos"}
      </span>
    )
  }
  const Icono = e.veredicto === "mejoro" ? ArrowDownRight : e.veredicto === "empeoro" ? ArrowUpRight : ArrowRight
  const clase =
    e.veredicto === "mejoro" ? "text-green-700" : e.veredicto === "empeoro" ? "text-red-700" : "text-slate-600"
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${clase}`}>
      <Icono className="h-3.5 w-3.5" />
      {e.antes!.promedio} → {e.despues!.promedio} min
      <span className="font-normal text-muted-foreground">(n={e.despues!.n})</span>
    </span>
  )
}

export function TiDesviosSection({
  registros,
  planes,
}: {
  registros: TiRegistro[]
  planes: TiPlanDesvio[]
}) {
  const refrescar = useRefrescarConScroll()
  const [filtro, setFiltro] = useState<Filtro>("sin_plan")
  const [verTodas, setVerTodas] = useState(false)
  const [abrirPara, setAbrirPara] = useState<DesvioTi | null>(null)

  const validos = useMemo(() => registrosValidos(registros), [registros])
  const desvios = useMemo(() => detectarDesvios(validos), [validos])
  const planPorClave = useMemo(() => new Map(planes.map((p) => [p.clave, p])), [planes])

  const semanasRecientes = useMemo(() => {
    const orden = [...new Set(desvios.map((d) => d.semana))].sort((a, b) => {
      const [ya, sa] = a.split("-").map(Number)
      const [yb, sb] = b.split("-").map(Number)
      return yb - ya || sb - sa
    })
    return new Set(orden.slice(0, SEMANAS_DEFAULT))
  }, [desvios])

  const visibles = desvios.filter((d) => {
    if (!verTodas && !semanasRecientes.has(d.semana)) return false
    const tiene = planPorClave.has(d.clave)
    if (filtro === "sin_plan") return !tiene
    if (filtro === "con_plan") return tiene
    return true
  })
  const sinPlanN = desvios.filter(
    (d) => (verTodas || semanasRecientes.has(d.semana)) && !planPorClave.has(d.clave),
  ).length

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Desvíos por chofer y planes de acción
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Se marca un desvío cuando el chofer promedia más de {TI_META} min en la semana o pasa los{" "}
              {TI_REINCIDENCIA_MINUTOS} min {TI_REINCIDENCIA_DIAS} o más días. Los planes quedan en el punto 1.3 de
              Entrega: con responsable, evidencia y en Mis tareas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-slate-300">
              {(
                [
                  ["sin_plan", `Sin plan (${sinPlanN})`],
                  ["con_plan", `Con plan (${planes.length})`],
                  ["todos", "Todos"],
                ] as const
              ).map(([valor, label]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setFiltro(valor)}
                  className={`h-9 px-3 text-sm transition-colors ${
                    filtro === valor ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={verTodas} onChange={(e) => setVerTodas(e.target.checked)} />
              Todas las semanas
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {visibles.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {filtro === "sin_plan"
              ? "No hay desvíos sin plan en las semanas mostradas."
              : filtro === "con_plan"
                ? "Todavía no hay planes abiertos desde un desvío."
                : "Sin desvíos en las semanas mostradas."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Semana</TableHead>
                  <TableHead>Chofer</TableHead>
                  <TableHead>Desvío</TableHead>
                  <TableHead className="text-right">Promedio</TableHead>
                  <TableHead className="text-right">Días &gt; {TI_REINCIDENCIA_MINUTOS}</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Seguimiento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((d) => {
                  const plan = planPorClave.get(d.clave)
                  return (
                    <TableRow key={d.clave}>
                      <TableCell className="whitespace-nowrap text-sm">
                        S{d.semanaNum}
                        <span className="block text-xs text-muted-foreground">{d.rango}</span>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{d.chofer}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {d.reglas.map((rg) => (
                            <Badge
                              key={rg}
                              className={
                                rg === "reincidencia"
                                  ? "bg-red-100 text-red-700 hover:bg-red-100"
                                  : "bg-amber-100 text-amber-700 hover:bg-amber-100"
                              }
                            >
                              {REGLA_LABEL[rg]}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {d.promedio} min
                        <span className="block text-xs text-muted-foreground">{d.retornos} retornos</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{d.diasMalos}</TableCell>
                      <TableCell>
                        {plan ? (
                          <Link href={`/planes/${plan.id}`} className="inline-flex flex-col gap-1">
                            <Badge className={ESTADO_CLASE[plan.estado] ?? ESTADO_CLASE.pendiente}>
                              {ESTADO_LABEL[plan.estado] ?? plan.estado}
                            </Badge>
                            <span className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                              {plan.responsable}
                              {plan.fecha_limite ? ` · vence ${plan.fecha_limite.slice(8, 10)}/${plan.fecha_limite.slice(5, 7)}` : ""}
                            </span>
                          </Link>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setAbrirPara(d)}>
                            <Plus className="mr-1 h-3.5 w-3.5" /> Abrir plan
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        {plan ? (
                          <Efecto e={efectoPlan(validos, plan.chofer, plan.created_at)} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              Seguimiento: TI del chofer en las 4 semanas anteriores al plan contra las 4 siguientes. Verde si bajó 3
              minutos o más.
            </p>
          </div>
        )}
      </CardContent>

      {abrirPara && (
        <AbrirPlanDialog
          desvio={abrirPara}
          onClose={() => setAbrirPara(null)}
          onCreated={() => {
            setAbrirPara(null)
            refrescar()
          }}
        />
      )}
    </Card>
  )
}

function AbrirPlanDialog({
  desvio,
  onClose,
  onCreated,
}: {
  desvio: DesvioTi
  onClose: () => void
  onCreated: () => void
}) {
  const detalle = [
    `promedio de ${desvio.promedio} min (meta ${TI_META})`,
    desvio.reglas.includes("reincidencia")
      ? `${desvio.diasMalos} días con más de ${TI_REINCIDENCIA_MINUTOS} min`
      : null,
  ]
    .filter(Boolean)
    .join(" y ")
  const [accion, setAccion] = useState(
    `Bajar el tiempo de rendición de ${desvio.chofer}: semana ${desvio.semanaNum} (${desvio.rango}) con ${detalle}.`,
  )
  const [causa, setCausa] = useState("")
  const [responsable, setResponsable] = useState("Supervisor de distribución")
  const [fechaLimite, setFechaLimite] = useState(enDias(7))
  const [prioridad, setPrioridad] = useState<"alta" | "media" | "baja">(
    desvio.regla === "reincidencia" ? "alta" : "media",
  )
  const [saving, setSaving] = useState(false)

  async function guardar() {
    setSaving(true)
    const res = await crearPlanTiDesvio({
      clave: desvio.clave,
      descripcion: accion,
      causa,
      responsable,
      fecha_limite: fechaLimite || undefined,
      prioridad,
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success(`Plan abierto para ${desvio.chofer}`)
    onCreated()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Plan de acción · {desvio.chofer}</DialogTitle>
          <DialogDescription>
            Semana {desvio.semanaNum} ({desvio.rango}) · {desvio.reglas.map((r) => REGLA_LABEL[r]).join(" y ")} ·{" "}
            {desvio.retornos} retornos,
            promedio {desvio.promedio} min.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ti-causa">Causa (¿por qué tardó?)</Label>
            <Textarea
              id="ti-causa"
              value={causa}
              onChange={(e) => setCausa(e.target.value)}
              placeholder="Ej.: llega con la caja sin ordenar, espera al cajero, diferencias de dinero, devoluciones sin controlar…"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ti-accion">Acción</Label>
            <Textarea id="ti-accion" value={accion} onChange={(e) => setAccion(e.target.value)} rows={3} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="ti-resp">Responsable</Label>
              <Input id="ti-resp" value={responsable} onChange={(e) => setResponsable(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ti-fecha">Fecha límite</Label>
              <Input id="ti-fecha" type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ti-prio">Prioridad</Label>
              <select
                id="ti-prio"
                value={prioridad}
                onChange={(e) => setPrioridad(e.target.value as "alta" | "media" | "baja")}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Abrir plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
