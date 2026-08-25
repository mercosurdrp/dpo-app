"use client"

// Planes de acción de neumáticos (DPO Flota 3.4).
//
// Dos planes, no uno, y a propósito NINGUNO se dispara por la tasa de desgaste:
//
//   1. REPOSICIÓN — se dispara por la profundidad MEDIDA. Es una medición
//      directa: si una cubierta está en 2,4 mm está para cambio hoy, no importa
//      a qué velocidad llegó ahí. Con una sola ronda ya alcanza.
//
//   2. MEDICIÓN — se dispara por las unidades que quedaron sin medir en el mes.
//      Es el cuello de botella real: agosto/2026 midió 5 unidades de 16 (35
//      cubiertas contra 79 en julio), y sin rondas COMPLETAS no hay serie con
//      qué calcular desgaste, se espere los meses que se esperen.
//
// 🚨 La tasa de mm/1.000 km NO dispara ningún plan todavía. Verificado el
// 25/08/2026: el punto de arranque de las 33 cubiertas con tasa es el nominal
// del alta y no una medición, y entre las dos rondas reales (julio y agosto) la
// mitad de los deltas dan negativo porque la dispersión del calibre (±1–2 mm) es
// más grande que el desgaste del mes (~0,3 mm). Un plan colgado de ese número
// manda a actuar sobre ruido. Cuando la serie por unidad+eje dé, se engancha acá
// sin rehacer nada.
//
// Los dos planes se guardan en `flota_plan_accion`, la MISMA tabla y el mismo
// ciclo de vida (causa raíz, acciones con responsable y fecha, cierre) que los
// planes de Indicadores de flota. No hay un circuito nuevo que mantener: estos
// botones sólo llegan con las acciones ya escritas, que es el trabajo que hoy
// hay que hacer a mano mirando la grilla cubierta por cubierta.

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, ClipboardList, Ruler } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  createFlotaPlan,
  type FlotaKpi,
  type FlotaPlanConItems,
} from "@/actions/flota-indicadores"
import {
  PROF_ALERTA_MM,
  PROF_MIN_MM,
  TIPOS_NEUMATICOS_OBLIGATORIOS,
} from "@/lib/flota/neumaticos-control"
import type { Neumatico } from "@/lib/vehiculos/neumaticos-tipos"
import type { UnidadFlota } from "@/lib/vehiculos/disponibilidad-flota"

const fmtMm = (mm: number) => `${mm.toFixed(1).replace(".", ",")} mm`

const hoyIso = () => new Date().toISOString().slice(0, 10)

function sumarDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Último día del mes en curso: es la fecha natural para cerrar la ronda. */
function finDeMes(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

function fmtMesLargo(ym: string): string {
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ]
  return `${meses[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
}

interface ItemForm {
  accion: string
  responsable: string
  fecha: string
}

/** Una unidad con sus cubiertas fuera de norma. */
interface UnidadConCriticas {
  dominio: string
  criticas: Neumatico[]
  enAlerta: Neumatico[]
}

/** Cómo quedó una unidad en la ronda del mes. */
interface UnidadRonda {
  dominio: string
  instaladas: number
  medidas: number
}

const posicionDe = (n: Neumatico) => n.posicion ?? n.eje ?? "sin posición"

export function PlanesNeumaticos({
  neumaticos,
  unidades,
  planes,
  puedeEditar,
  onPlanCreado,
}: {
  neumaticos: Neumatico[]
  unidades: UnidadFlota[]
  /** Planes ya cargados: sirve para no armar dos veces el mismo mes. */
  planes: FlotaPlanConItems[]
  puedeEditar: boolean
  /** Recarga la pantalla: el plan recién creado tiene que aparecer acá. */
  onPlanCreado: () => void
}) {
  const ym = hoyIso().slice(0, 7)
  const [armando, setArmando] = useState<"reposicion" | "medicion" | null>(null)

  const instaladas = useMemo(
    () => neumaticos.filter((n) => n.estado === "instalado" && n.dominio),
    [neumaticos],
  )

  // ---- Reposición: la profundidad medida de cada cubierta instalada ----
  const porUnidad = useMemo<UnidadConCriticas[]>(() => {
    const map = new Map<string, UnidadConCriticas>()
    for (const n of instaladas) {
      const mm = n.profundidad_actual_mm
      if (mm == null) continue
      const critica = mm < PROF_MIN_MM
      const alerta = !critica && mm <= PROF_ALERTA_MM
      if (!critica && !alerta) continue
      const dom = n.dominio as string
      if (!map.has(dom)) map.set(dom, { dominio: dom, criticas: [], enAlerta: [] })
      const u = map.get(dom)!
      if (critica) u.criticas.push(n)
      else u.enAlerta.push(n)
    }
    const orden = (n: Neumatico) => n.profundidad_actual_mm ?? Infinity
    return [...map.values()]
      .map((u) => ({
        ...u,
        criticas: [...u.criticas].sort((a, b) => orden(a) - orden(b)),
        enAlerta: [...u.enAlerta].sort((a, b) => orden(a) - orden(b)),
      }))
      // Primero la unidad con la cubierta más gastada de todas.
      .sort((a, b) => {
        const pa = a.criticas[0]?.profundidad_actual_mm ?? a.enAlerta[0]?.profundidad_actual_mm ?? Infinity
        const pb = b.criticas[0]?.profundidad_actual_mm ?? b.enAlerta[0]?.profundidad_actual_mm ?? Infinity
        return pa - pb
      })
  }, [instaladas])

  const totalCriticas = porUnidad.reduce((a, u) => a + u.criticas.length, 0)
  const totalAlerta = porUnidad.reduce((a, u) => a + u.enAlerta.length, 0)

  // ---- Medición: qué unidad cerró su ronda este mes y cuál no ----
  const ronda = useMemo<UnidadRonda[]>(() => {
    const obligatorias = unidades.filter(
      (u) => u.tipo != null && (TIPOS_NEUMATICOS_OBLIGATORIOS as readonly string[]).includes(u.tipo),
    )
    return obligatorias
      .map((u) => {
        const suyas = instaladas.filter((n) => n.dominio === u.dominio)
        const medidas = suyas.filter((n) =>
          (n.mediciones ?? []).some((m) => m.fecha.slice(0, 7) === ym),
        ).length
        return { dominio: u.dominio, instaladas: suyas.length, medidas }
      })
      .sort((a, b) => a.medidas - b.medidas || a.dominio.localeCompare(b.dominio, "es"))
  }, [unidades, instaladas, ym])

  const sinMedir = ronda.filter((u) => u.medidas === 0)
  const aMedias = ronda.filter((u) => u.medidas > 0 && u.medidas < u.instaladas)
  const completas = ronda.filter((u) => u.instaladas > 0 && u.medidas === u.instaladas)

  /** Plan de este mes para ese KPI, si ya lo armaron. */
  const planDelMes = (kpi: FlotaKpi) =>
    planes.find(
      (p) =>
        p.kpi === kpi &&
        p.year === Number(ym.slice(0, 4)) &&
        p.mes === Number(ym.slice(5, 7)),
    ) ?? null

  const planReposicion = planDelMes("neumaticos_conformidad")
  const planMedicion = planDelMes("neumaticos_medicion")

  // Una acción por UNIDAD, no por cubierta: el camión va a la gomería una vez y
  // le cambian las que haya que cambiarle.
  const itemsReposicion = (): ItemForm[] =>
    porUnidad
      .filter((u) => u.criticas.length > 0)
      .map((u) => ({
        accion: `${u.dominio} — reponer ${u.criticas
          .map((n) => `${posicionDe(n)} (${fmtMm(n.profundidad_actual_mm as number)})`)
          .join(", ")}${
          u.enAlerta.length > 0
            ? ` · mirar de paso ${u.enAlerta.map((n) => posicionDe(n)).join(", ")}`
            : ""
        }`,
        responsable: "",
        fecha: sumarDias(7),
      }))

  const itemsMedicion = (): ItemForm[] => [
    ...sinMedir.map((u) => ({
      accion: `Medir las ${u.instaladas} cubiertas de ${u.dominio} — no entró en la ronda de ${fmtMesLargo(ym)}`,
      responsable: "",
      fecha: finDeMes(),
    })),
    ...aMedias.map((u) => ({
      accion: `Completar ${u.dominio}: quedan ${u.instaladas - u.medidas} de ${u.instaladas} cubiertas sin medir`,
      responsable: "",
      fecha: finDeMes(),
    })),
  ]

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="size-4 text-muted-foreground" /> Planes de acción de
            neumáticos
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Los dos salen de mediciones directas, no de la tasa de desgaste: esa todavía no
            da un número confiable y un plan colgado de ella manda a actuar sobre ruido del
            calibre. Se guardan junto a los planes de Indicadores de flota.
          </p>
        </CardHeader>

        <CardContent className="grid gap-4 lg:grid-cols-2">
          {/* ===== 1. Reposición por profundidad ===== */}
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <AlertTriangle className="size-3.5 text-muted-foreground" /> Reposición por
                  profundidad
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Debajo de {PROF_MIN_MM} mm la cubierta está para cambio; entre{" "}
                  {PROF_MIN_MM} y {PROF_ALERTA_MM} mm hay que programarlo.
                </p>
              </div>
              <div className="flex gap-1.5">
                <Badge
                  variant="outline"
                  className="border-destructive/30 bg-destructive/10 text-destructive"
                >
                  {totalCriticas} para cambio
                </Badge>
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                >
                  {totalAlerta} en alerta
                </Badge>
              </div>
            </div>

            {porUnidad.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">
                Ninguna cubierta instalada está por debajo de {PROF_ALERTA_MM} mm.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border">
                {porUnidad.map((u) => (
                  <li key={u.dominio} className="space-y-1 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{u.dominio}</span>
                      {u.criticas.length > 0 && (
                        <Badge
                          variant="outline"
                          className="ml-auto border-destructive/30 bg-destructive/10 text-destructive"
                        >
                          {u.criticas.length} para cambio
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[...u.criticas, ...u.enAlerta].map((n) => {
                        const mm = n.profundidad_actual_mm as number
                        const critica = mm < PROF_MIN_MM
                        return (
                          <span
                            key={n.id}
                            className={cn(
                              "rounded-md border px-1.5 py-0.5 text-[11px]",
                              critica
                                ? "border-destructive/30 bg-destructive/10 text-destructive"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                            )}
                          >
                            {posicionDe(n)} · {fmtMm(mm)}
                          </span>
                        )
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <PieDelBloque
              plan={planReposicion}
              habilitado={puedeEditar && totalCriticas > 0}
              motivoDeshabilitado={
                totalCriticas === 0
                  ? `Sin cubiertas por debajo de ${PROF_MIN_MM} mm: no hay nada que reponer.`
                  : null
              }
              onArmar={() => setArmando("reposicion")}
              texto="Armar el plan de reposición"
            />
          </div>

          {/* ===== 2. Cobertura de la ronda de medición ===== */}
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Ruler className="size-3.5 text-muted-foreground" /> Ronda de{" "}
                  {fmtMesLargo(ym)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Camiones y autoelevadores. Sin la ronda completa no hay serie con qué
                  calcular el desgaste.
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  sinMedir.length === 0 && aMedias.length === 0
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }
              >
                {completas.length} de {ronda.length} unidades
              </Badge>
            </div>

            {ronda.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">
                No hay camiones ni autoelevadores con cubiertas instaladas.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border">
                {ronda.map((u) => {
                  const estado =
                    u.instaladas === 0
                      ? "sin_cubiertas"
                      : u.medidas === 0
                        ? "sin_medir"
                        : u.medidas < u.instaladas
                          ? "a_medias"
                          : "completa"
                  return (
                    <li
                      key={u.dominio}
                      className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm"
                    >
                      <span className="w-20 shrink-0 font-medium text-foreground">
                        {u.dominio}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {u.medidas} de {u.instaladas} cubiertas
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "ml-auto shrink-0",
                          estado === "completa"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : estado === "a_medias"
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                              : "border-destructive/30 bg-destructive/10 text-destructive",
                        )}
                      >
                        {estado === "completa"
                          ? "Medida"
                          : estado === "a_medias"
                            ? "A medias"
                            : estado === "sin_medir"
                              ? "Sin medir"
                              : "Sin cubiertas"}
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            )}

            <PieDelBloque
              plan={planMedicion}
              habilitado={puedeEditar && sinMedir.length + aMedias.length > 0}
              motivoDeshabilitado={
                sinMedir.length + aMedias.length === 0
                  ? "La ronda del mes está completa: no hay nada que reclamar."
                  : null
              }
              onArmar={() => setArmando("medicion")}
              texto="Armar el plan de medición"
            />
          </div>
        </CardContent>
      </Card>

      {armando === "reposicion" && (
        <ArmarPlanDialog
          titulo={`Plan de reposición — ${fmtMesLargo(ym)}`}
          descripcion={`${totalCriticas} cubiertas por debajo de ${PROF_MIN_MM} mm en ${
            porUnidad.filter((u) => u.criticas.length > 0).length
          } unidades. Una acción por unidad: revisá el responsable y la fecha antes de guardar.`}
          kpi="neumaticos_conformidad"
          ym={ym}
          valorMes={totalCriticas}
          causaSugerida={`${totalCriticas} cubiertas quedaron por debajo del mínimo de ${PROF_MIN_MM} mm en la ronda de ${fmtMesLargo(
            ym,
          )}.`}
          itemsIniciales={itemsReposicion()}
          onClose={() => setArmando(null)}
          onCreado={onPlanCreado}
        />
      )}

      {armando === "medicion" && (
        <ArmarPlanDialog
          titulo={`Plan de medición — ${fmtMesLargo(ym)}`}
          descripcion={`${sinMedir.length} unidades sin medir y ${aMedias.length} a medias. Sin la ronda completa el desgaste por km no va a dar nunca.`}
          kpi="neumaticos_medicion"
          ym={ym}
          valorMes={completas.length}
          metaMes={ronda.length}
          causaSugerida={`La ronda de ${fmtMesLargo(ym)} cerró con ${completas.length} de ${
            ronda.length
          } unidades medidas.`}
          itemsIniciales={itemsMedicion()}
          onClose={() => setArmando(null)}
          onCreado={onPlanCreado}
        />
      )}
    </>
  )
}

/** El pie de cada bloque: el plan que ya existe, o el botón para armarlo. */
function PieDelBloque({
  plan,
  habilitado,
  motivoDeshabilitado,
  onArmar,
  texto,
}: {
  plan: FlotaPlanConItems | null
  habilitado: boolean
  motivoDeshabilitado: string | null
  onArmar: () => void
  texto: string
}) {
  return (
    <div className="space-y-1.5">
      {plan && (
        <p className="rounded-md border border-sky-500/30 bg-sky-500/5 px-2.5 py-1.5 text-xs text-sky-700 dark:text-sky-400">
          Ya hay un plan de este mes con {plan.items.length}{" "}
          {plan.items.length === 1 ? "acción" : "acciones"} ({plan.estado.replace("_", " ")}).
          El seguimiento se hace en Indicadores de flota; armar otro no lo reemplaza.
        </p>
      )}
      {motivoDeshabilitado ? (
        <p className="text-xs text-muted-foreground">{motivoDeshabilitado}</p>
      ) : (
        <Button size="sm" className="w-full" disabled={!habilitado} onClick={onArmar}>
          {texto}
        </Button>
      )}
    </div>
  )
}

/**
 * El plan, con las acciones ya escritas.
 *
 * Cada renglón se edita y se borra: lo que llega es un borrador armado con lo
 * medido, no algo cerrado. Lo único que se pide sí o sí es el responsable, que
 * es el dato que la app no puede adivinar y sin el cual el plan no se cumple.
 */
function ArmarPlanDialog({
  titulo,
  descripcion,
  kpi,
  ym,
  valorMes,
  metaMes = null,
  causaSugerida,
  itemsIniciales,
  onClose,
  onCreado,
}: {
  titulo: string
  descripcion: string
  kpi: FlotaKpi
  ym: string
  valorMes: number | null
  metaMes?: number | null
  causaSugerida: string
  itemsIniciales: ItemForm[]
  onClose: () => void
  onCreado: () => void
}) {
  const [causa, setCausa] = useState(causaSugerida)
  const [items, setItems] = useState<ItemForm[]>(itemsIniciales)
  const [responsableTodos, setResponsableTodos] = useState("")
  const [saving, setSaving] = useState(false)

  const set = (i: number, patch: Partial<ItemForm>) =>
    setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))

  const guardar = async () => {
    if (!causa.trim()) {
      toast.error("Cargá la causa raíz")
      return
    }
    const completos = items.filter((i) => i.accion.trim() && i.responsable.trim() && i.fecha)
    if (completos.length === 0) {
      toast.error("Cada acción necesita responsable y fecha de compromiso")
      return
    }
    setSaving(true)
    const res = await createFlotaPlan({
      kpi,
      mes: Number(ym.slice(5, 7)),
      year: Number(ym.slice(0, 4)),
      valorMes,
      metaMes,
      causaRaiz: causa,
      items: completos.map((i) => ({
        accion: i.accion,
        responsable: i.responsable,
        fechaCompromiso: i.fecha,
      })),
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    const quedaron = items.length - completos.length
    toast.success(
      quedaron > 0
        ? `Plan creado con ${completos.length} acciones (${quedaron} quedaron sin responsable y no entraron)`
        : "Plan de acción creado",
    )
    onCreado()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o: boolean) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Causa raíz</Label>
            <Textarea rows={2} value={causa} onChange={(e) => setCausa(e.target.value)} />
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-2.5">
            <div className="min-w-48 flex-1 space-y-1">
              <Label className="text-xs">Responsable de todas</Label>
              <Input
                value={responsableTodos}
                onChange={(e) => setResponsableTodos(e.target.value)}
                placeholder="Nombre y apellido"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!responsableTodos.trim()) {
                  toast.error("Escribí el nombre primero")
                  return
                }
                setItems(items.map((i) => ({ ...i, responsable: responsableTodos.trim() })))
              }}
            >
              Poner en todas
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Acciones — armadas con lo medido. Editá lo que haga falta y borrá lo que no
              corresponda.
            </Label>
            {items.map((it, i) => (
              <div key={i} className="space-y-1.5 rounded-md border p-2.5">
                <Textarea
                  rows={2}
                  value={it.accion}
                  onChange={(e) => set(i, { accion: e.target.value })}
                />
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-40 flex-1 space-y-1">
                    <Label className="text-xs">Responsable</Label>
                    <Input
                      value={it.responsable}
                      onChange={(e) => set(i, { responsable: e.target.value })}
                      placeholder="Quién lo hace"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fecha de compromiso</Label>
                    <Input
                      type="date"
                      value={it.fecha}
                      onChange={(e) => set(i, { fecha: e.target.value })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setItems(items.filter((_, j) => j !== i))}
                  >
                    Quitar
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setItems([...items, { accion: "", responsable: "", fecha: sumarDias(7) }])
              }
            >
              Agregar una acción
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Crear el plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
