"use client"

// Cumplimiento de los ANS con proveedores de flota (DPO Flota 2.3 · R2.3.1a /
// R2.3.2a; se revisa en la reunión semanal de flota, R3.1.4).
//
// Una tarjeta por proveedor con ANS: los indicadores de la cláusula 5 de su
// acuerdo con la meta, los últimos 6 meses, el detalle de cada incumplimiento y
// el plan de acción que exige la cláusula 6 cuando el mes no llega al 100 %.
// El botón «Copiar resultado» arma el mensaje para mandárselo al proveedor
// (cláusula 5: «Mercosur calcula los indicadores el primer día hábil de cada mes
// y le envía el resultado al proveedor»).

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  FileText,
  Flame,
  Plus,
  Trash2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
  cerrarPlanAns,
  crearPlanAns,
  eliminarPlanAns,
  eliminarRecargaMatafuegos,
  getCumplimientoAns,
  guardarRecargaMatafuegos,
  type CumplimientoAnsRespuesta,
  type PlanAns,
  type RecargaMatafuegos,
} from "@/actions/ans-proveedores"
import {
  ANS_TIPO_LABEL,
  DIAS_HABILES_RECARGA,
  MESES_REVISION,
  sumarDiasHabiles,
  textoResumenProveedor,
  ymSumar,
  type AnsProveedorCumplimiento,
  type AnsResultado,
  type AnsSemaforo,
} from "@/lib/flota/ans-cumplimiento"
import { DpoSeccionCinta } from "./dpo-badge"

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

function mesLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return `${MESES[m - 1]} ${y}`
}

function mesCorto(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return `${MESES[m - 1].slice(0, 3)} ${String(y).slice(2)}`
}

function fmtPct(v: number | null): string {
  if (v == null) return "—"
  return `${(Math.round(v * 10) / 10).toLocaleString("es-AR")} %`
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

function hoyLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date())
}

function sumarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const TONO: Record<AnsSemaforo, { chip: string; num: string; celda: string; texto: string }> = {
  verde: {
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    num: "text-emerald-700 dark:text-emerald-400",
    celda: "bg-emerald-500 text-white",
    texto: "Cumple",
  },
  ambar: {
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    num: "text-amber-700 dark:text-amber-400",
    celda: "bg-amber-400 text-amber-950",
    texto: "Cumple la meta, pide plan",
  },
  rojo: {
    chip: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    num: "text-red-700 dark:text-red-400",
    celda: "bg-red-600 text-white",
    texto: "Bajo la meta",
  },
  sin_dato: {
    chip: "bg-muted text-muted-foreground",
    num: "text-muted-foreground",
    celda: "bg-muted text-muted-foreground",
    texto: "Sin datos",
  },
}

export function AnsProveedoresPanel({ puedeEditar }: { puedeEditar: boolean }) {
  const [ym, setYm] = useState(() => hoyLocal().slice(0, 7))
  const [res, setRes] = useState<CumplimientoAnsRespuesta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [plan, setPlan] = useState<{ c: AnsProveedorCumplimiento; r: AnsResultado } | null>(null)
  const [cerrar, setCerrar] = useState<PlanAns | null>(null)
  const [recarga, setRecarga] = useState<RecargaMatafuegos | "nueva" | null>(null)

  // Recarga: el effect corre de nuevo al cambiar el mes o la versión.
  const [version, setVersion] = useState(0)
  const recargar = useCallback(() => {
    setCargando(true)
    setVersion((v) => v + 1)
  }, [])
  const irAMes = (delta: number) => {
    setCargando(true)
    setYm((m) => ymSumar(m, delta))
  }

  useEffect(() => {
    let vivo = true
    getCumplimientoAns(ym).then((r) => {
      if (!vivo) return
      setCargando(false)
      if ("error" in r) {
        setError(r.error)
        return
      }
      setError(null)
      setRes(r.data)
    })
    return () => {
      vivo = false
    }
  }, [ym, version])

  const mesActual = hoyLocal().slice(0, 7)
  const resumen = useMemo(() => {
    if (!res) return null
    const todos = res.cumplimientos.flatMap((c) => c.mes.resultados)
    return {
      firmados: res.cumplimientos.filter((c) => c.proveedor.fechaFirma).length,
      total: res.cumplimientos.length,
      rojos: todos.filter((r) => r.semaforo === "rojo").length,
      verdes: todos.filter((r) => r.semaforo === "verde").length,
      sinDato: todos.filter((r) => r.semaforo === "sin_dato").length,
      planesFaltantes: res.cumplimientos.reduce((a, c) => a + c.planesFaltantes.length, 0),
      planesAbiertos: res.planes.filter((p) => p.estado === "abierto").length,
      revisar: res.cumplimientos.filter((c) => c.revisarAcuerdo.length > 0).length,
    }
  }, [res])

  return (
    <div className="space-y-4">
      <DpoSeccionCinta seccionId="ans-proveedores" />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl space-y-1">
          <h3 className="text-base font-semibold text-foreground">Cumplimiento de los ANS con proveedores</h3>
          <p className="text-sm text-muted-foreground">
            Los indicadores de la cláusula 5 de cada acuerdo, calculados con las OT y los pedidos de repuestos. Si un
            indicador del mes no llega al 100 %, el acuerdo pide un plan de acción por escrito dentro de los 7 días
            (cláusula 6); {MESES_REVISION} meses seguidos bajo la meta obligan a revisar el acuerdo.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => irAMes(-1)} aria-label="Mes anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium capitalize">
            {mesLabel(ym)}
            {ym === mesActual && <span className="block text-[11px] font-normal text-muted-foreground">en curso</span>}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => irAMes(1)}
            disabled={ym >= mesActual}
            aria-label="Mes siguiente"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">Error: {error}</p>}
      {res?.sqlPendiente && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Falta aplicar <code>APLICAR_EN_PAMPEANA_ANS_PROVEEDORES.sql</code> en la base.
        </p>
      )}

      {resumen && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile titulo="ANS firmados" valor={`${resumen.firmados} de ${resumen.total}`} />
          <Tile
            titulo="Indicadores del mes"
            valor={`${resumen.verdes} ✓ · ${resumen.rojos} bajo meta`}
            detalle={resumen.sinDato > 0 ? `${resumen.sinDato} sin datos para medir` : undefined}
            tono={resumen.rojos > 0 ? "rojo" : undefined}
          />
          <Tile
            titulo="Planes de acción"
            valor={`${resumen.planesAbiertos} abiertos`}
            detalle={resumen.planesFaltantes > 0 ? `${resumen.planesFaltantes} indicadores piden plan y no lo tienen` : "Ninguno pendiente de cargar"}
            tono={resumen.planesFaltantes > 0 ? "ambar" : undefined}
          />
          <Tile
            titulo="Acuerdos a revisar"
            valor={String(resumen.revisar)}
            detalle={`${MESES_REVISION} meses seguidos bajo la meta`}
            tono={resumen.revisar > 0 ? "rojo" : undefined}
          />
        </div>
      )}

      {cargando && !res && <p className="text-sm text-muted-foreground">Calculando…</p>}

      <div className={cn("space-y-3", cargando && "opacity-60")}>
        {res?.cumplimientos.map((c) => (
          <TarjetaProveedor
            key={c.proveedor.ansId}
            c={c}
            ym={res.ym}
            planes={res.planes.filter((p) => p.ansId === c.proveedor.ansId)}
            recargas={c.proveedor.tipo === "matafuegos" ? res.recargas : []}
            hoy={res.hoy}
            puedeEditar={puedeEditar}
            onPlan={(r) => setPlan({ c, r })}
            onCerrar={setCerrar}
            onBorrarPlan={async (p) => {
              const r = await eliminarPlanAns(p.id)
              if ("error" in r) return toast.error(r.error)
              toast.success("Plan eliminado")
              recargar()
            }}
            onRecarga={setRecarga}
          />
        ))}
      </div>

      {plan && (
        <PlanDialog
          c={plan.c}
          r={plan.r}
          ym={res?.ym ?? ym}
          onClose={() => setPlan(null)}
          onSaved={() => {
            setPlan(null)
            recargar()
          }}
        />
      )}
      {cerrar && (
        <CerrarPlanDialog
          plan={cerrar}
          onClose={() => setCerrar(null)}
          onSaved={() => {
            setCerrar(null)
            recargar()
          }}
        />
      )}
      {recarga && (
        <RecargaDialog
          recarga={recarga === "nueva" ? null : recarga}
          proveedor={res?.cumplimientos.find((c) => c.proveedor.tipo === "matafuegos")?.proveedor.nombre ?? null}
          onClose={() => setRecarga(null)}
          onSaved={() => {
            setRecarga(null)
            recargar()
          }}
        />
      )}
    </div>
  )
}

function Tile({
  titulo,
  valor,
  detalle,
  tono,
}: {
  titulo: string
  valor: string
  detalle?: string
  tono?: "rojo" | "ambar"
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3",
        tono === "rojo" && "border-red-200 dark:border-red-900",
        tono === "ambar" && "border-amber-200 dark:border-amber-900"
      )}
    >
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{titulo}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tono === "rojo" && "text-red-700 dark:text-red-400",
          tono === "ambar" && "text-amber-700 dark:text-amber-400"
        )}
      >
        {valor}
      </p>
      {detalle && <p className="text-[11px] text-muted-foreground">{detalle}</p>}
    </div>
  )
}

function TarjetaProveedor({
  c,
  ym,
  planes,
  recargas,
  hoy,
  puedeEditar,
  onPlan,
  onCerrar,
  onBorrarPlan,
  onRecarga,
}: {
  c: AnsProveedorCumplimiento
  ym: string
  planes: PlanAns[]
  recargas: RecargaMatafuegos[]
  hoy: string
  puedeEditar: boolean
  onPlan: (r: AnsResultado) => void
  onCerrar: (p: PlanAns) => void
  onBorrarPlan: (p: PlanAns) => void
  onRecarga: (r: RecargaMatafuegos | "nueva") => void
}) {
  const p = c.proveedor
  const [y, m] = ym.split("-").map(Number)
  const planesMes = planes.filter((x) => x.year === y && x.mes === m)
  const abiertosOtros = planes.filter((x) => x.estado === "abierto" && !(x.year === y && x.mes === m))
  const vencido = !!p.fechaVencimiento && p.fechaVencimiento < hoy

  async function copiar() {
    const texto = textoResumenProveedor(c, mesLabel(ym))
    try {
      await navigator.clipboard.writeText(texto)
      toast.success("Resultado copiado: pegalo en el WhatsApp o mail del proveedor")
    } catch {
      toast.error("No se pudo copiar")
    }
  }
  const telefono = (p.telefono ?? "").replace(/\D/g, "")
  const waHref = telefono
    ? `https://wa.me/${telefono.startsWith("54") ? telefono : `549${telefono}`}?text=${encodeURIComponent(textoResumenProveedor(c, mesLabel(ym)))}`
    : null

  return (
    <Card className={cn(!p.fechaFirma && "border-dashed")}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold text-foreground">{p.nombre}</h4>
              <Badge variant="outline">{ANS_TIPO_LABEL[p.tipo]}</Badge>
              {c.revisarAcuerdo.length > 0 && (
                <Badge className="bg-red-600 text-white">
                  <AlertTriangle className="mr-1 size-3" /> Revisar acuerdo
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {p.fechaFirma ? (
                <>
                  ANS firmado el {fmtFecha(p.fechaFirma)} · vence {fmtFecha(p.fechaVencimiento)}
                  {vencido && <span className="font-medium text-red-700"> (vencido)</span>}
                  {ym < p.fechaFirma.slice(0, 7) && (
                    <span className="font-medium text-sky-700 dark:text-sky-400">
                      {" "}
                      · {mesLabel(ym)} es previo a la firma: línea de base, no pide plan.
                    </span>
                  )}
                </>
              ) : (
                <span className="font-medium text-amber-700">ANS sin firmar: se mide igual, como línea de base.</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {p.adjuntoUrl && (
              <a
                href={p.adjuntoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted"
              >
                <FileText className="size-3.5" /> Acuerdo firmado
              </a>
            )}
            <Button variant="outline" size="sm" onClick={copiar}>
              <ClipboardCopy className="mr-1 size-3.5" /> Copiar resultado
            </Button>
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center rounded-md border px-2 text-xs hover:bg-muted"
              >
                WhatsApp
              </a>
            )}
          </div>
        </div>

        <div className="divide-y rounded-md border">
          {c.mes.resultados.map((r, i) => (
            <FilaIndicador
              key={r.key}
              r={r}
              historia={c.historia.map((h) => ({ ym: h.ym, r: h.resultados[i] }))}
              planes={planesMes.filter((x) => x.indicador === r.key)}
              faltaPlan={c.planesFaltantes.includes(r.key)}
              puedeEditar={puedeEditar}
              onPlan={() => onPlan(r)}
              onCerrar={onCerrar}
              onBorrarPlan={onBorrarPlan}
            />
          ))}
        </div>

        {abiertosOtros.length > 0 && (
          <div className="rounded-md bg-muted/50 p-2 text-xs">
            <p className="mb-1 font-medium">Planes abiertos de meses anteriores</p>
            {abiertosOtros.map((x) => (
              <PlanLinea key={x.id} plan={x} puedeEditar={puedeEditar} onCerrar={onCerrar} onBorrar={onBorrarPlan} mostrarMes />
            ))}
          </div>
        )}

        {p.tipo === "matafuegos" && (
          <RecargasLista recargas={recargas} ym={ym} hoy={hoy} puedeEditar={puedeEditar} onEditar={onRecarga} />
        )}
      </CardContent>
    </Card>
  )
}

function FilaIndicador({
  r,
  historia,
  planes,
  faltaPlan,
  puedeEditar,
  onPlan,
  onCerrar,
  onBorrarPlan,
}: {
  r: AnsResultado
  historia: Array<{ ym: string; r: AnsResultado }>
  planes: PlanAns[]
  faltaPlan: boolean
  puedeEditar: boolean
  onPlan: () => void
  onCerrar: (p: PlanAns) => void
  onBorrarPlan: (p: PlanAns) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const t = TONO[r.semaforo]
  const hayDetalle = r.detalle.length > 0
  return (
    <div className="p-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{r.nombre}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", t.chip)}>{t.texto}</span>
          </div>
          <p className="text-[11px] text-muted-foreground" title={r.calculo}>
            Meta {r.sentido === "min" ? "≥" : "≤"} {r.meta} % · {r.num} de {r.den}
            {r.nota && <> · {r.nota}</>}
          </p>
        </div>
        <div className={cn("text-2xl font-semibold tabular-nums md:text-right", t.num)}>{fmtPct(r.valor)}</div>
        <div className="flex gap-0.5" aria-label="Últimos 6 meses">
          {historia.map((h) => (
            <div
              key={h.ym}
              title={`${mesLabel(h.ym)}: ${fmtPct(h.r.valor)} (${h.r.num}/${h.r.den})`}
              className={cn(
                "flex h-9 w-11 flex-col items-center justify-center rounded text-[10px] leading-tight tabular-nums",
                TONO[h.r.semaforo].celda
              )}
            >
              <span className="opacity-80">{mesCorto(h.ym)}</span>
              <span className="font-semibold">{h.r.valor == null ? "—" : Math.round(h.r.valor)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {hayDetalle && (
          <button
            type="button"
            onClick={() => setAbierto((a) => !a)}
            className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline dark:text-sky-400"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", abierto && "rotate-180")} />
            {abierto ? "Ocultar" : "Ver"} detalle ({r.detalle.length})
          </button>
        )}
        {faltaPlan && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
            <AlertTriangle className="size-3.5" /> Pide plan de acción (cláusula 6)
          </span>
        )}
        {puedeEditar && r.requierePlan && (
          <Button variant={faltaPlan ? "default" : "outline"} size="xs" onClick={onPlan}>
            <Plus className="mr-1 size-3" /> Plan de acción
          </Button>
        )}
      </div>

      {abierto && hayDetalle && (
        <ul className="mt-2 space-y-1 rounded-md bg-muted/40 p-2 text-xs">
          {r.detalle.map((d) => (
            <li key={d.id} className="flex gap-2">
              <span
                className={cn(
                  "mt-1 size-2 shrink-0 rounded-full",
                  d.ok === true ? "bg-emerald-500" : d.ok === false ? "bg-red-500" : "bg-muted-foreground"
                )}
              />
              <span>
                <span className="font-medium">{d.titulo}</span>{" "}
                <span className="text-muted-foreground">· {fmtFecha(d.fecha)} · {d.detalle}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {planes.length > 0 && (
        <div className="mt-2 space-y-1">
          {planes.map((p) => (
            <PlanLinea key={p.id} plan={p} puedeEditar={puedeEditar} onCerrar={onCerrar} onBorrar={onBorrarPlan} />
          ))}
        </div>
      )}
    </div>
  )
}

function PlanLinea({
  plan,
  puedeEditar,
  onCerrar,
  onBorrar,
  mostrarMes,
}: {
  plan: PlanAns
  puedeEditar: boolean
  onCerrar: (p: PlanAns) => void
  onBorrar: (p: PlanAns) => void
  mostrarMes?: boolean
}) {
  const vencido = plan.estado === "abierto" && !!plan.fechaCompromiso && plan.fechaCompromiso < hoyLocal()
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-2 rounded-md border px-2 py-1.5 text-xs",
        plan.estado === "cerrado" ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20" : "bg-background"
      )}
    >
      <div className="min-w-0 flex-1">
        <p>
          {plan.estado === "cerrado" && <CheckCircle2 className="mr-1 inline size-3.5 text-emerald-600" />}
          {mostrarMes && <span className="text-muted-foreground capitalize">{mesLabel(`${plan.year}-${String(plan.mes).padStart(2, "0")}`)} · </span>}
          <span className="font-medium">{plan.accion}</span>
        </p>
        <p className="text-muted-foreground">
          {plan.causa && <>Causa: {plan.causa} · </>}
          {plan.responsable || "sin responsable"} · compromiso {fmtFecha(plan.fechaCompromiso)}
          {vencido && <span className="font-medium text-red-700"> (vencido)</span>}
          {plan.estado === "cerrado" && (
            <>
              {" "}
              · cerrado {fmtFecha(plan.fechaCierre)}
              {plan.resultado && <>: {plan.resultado}</>}
            </>
          )}
        </p>
      </div>
      {puedeEditar && (
        <div className="flex gap-1">
          {plan.estado === "abierto" && (
            <Button variant="outline" size="xs" onClick={() => onCerrar(plan)}>
              Cerrar
            </Button>
          )}
          <Button variant="ghost" size="xs" onClick={() => onBorrar(plan)} aria-label="Eliminar plan">
            <Trash2 className="size-3" />
          </Button>
        </div>
      )}
    </div>
  )
}

function RecargasLista({
  recargas,
  ym,
  hoy,
  puedeEditar,
  onEditar,
}: {
  recargas: RecargaMatafuegos[]
  ym: string
  hoy: string
  puedeEditar: boolean
  onEditar: (r: RecargaMatafuegos | "nueva") => void
}) {
  const lista = recargas.filter((r) => r.fechaRetiro.slice(0, 7) <= ym).slice(0, 8)
  return (
    <div className="space-y-2 rounded-md border border-orange-200 bg-orange-50/40 p-3 dark:border-orange-900 dark:bg-orange-950/20">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-orange-900 dark:text-orange-300">
          <Flame className="size-3.5" /> Retiros para recarga (plazo {DIAS_HABILES_RECARGA} días hábiles = 72 h)
        </p>
        {puedeEditar && (
          <Button variant="outline" size="xs" onClick={() => onEditar("nueva")}>
            <Plus className="mr-1 size-3" /> Registrar retiro
          </Button>
        )}
      </div>
      {lista.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Todavía no hay retiros registrados. Cada vez que Costanzi se lleva equipos para recargar, cargá el retiro y
          después la devolución: así se mide la puntualidad de recargas.
        </p>
      ) : (
        <ul className="space-y-1 text-xs">
          {lista.map((r) => {
            const limite = sumarDiasHabiles(r.fechaRetiro, DIAS_HABILES_RECARGA)
            const tarde = r.fechaDevolucion ? r.fechaDevolucion > limite : limite < hoy
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">
                    {r.cantidad} equipo{r.cantidad === 1 ? "" : "s"}
                  </span>{" "}
                  · retiro {fmtFecha(r.fechaRetiro)} ·{" "}
                  {r.fechaDevolucion ? `devuelto ${fmtFecha(r.fechaDevolucion)}` : "sin devolver"}{" "}
                  <span className={cn(tarde ? "font-medium text-red-700" : "text-muted-foreground")}>
                    (límite {fmtFecha(limite)})
                  </span>
                  {r.reemplazoDejado === false && <span className="text-red-700"> · no dejó reemplazo</span>}
                </span>
                {puedeEditar && (
                  <Button variant="ghost" size="xs" onClick={() => onEditar(r)}>
                    {r.fechaDevolucion ? "Editar" : "Cargar devolución"}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function PlanDialog({
  c,
  r,
  ym,
  onClose,
  onSaved,
}: {
  c: AnsProveedorCumplimiento
  r: AnsResultado
  ym: string
  onClose: () => void
  onSaved: () => void
}) {
  const [causa, setCausa] = useState("")
  const [accion, setAccion] = useState("")
  const [responsable, setResponsable] = useState("")
  const [fecha, setFecha] = useState(() => sumarDias(hoyLocal(), 7))
  const [saving, setSaving] = useState(false)
  const [y, m] = ym.split("-").map(Number)

  async function guardar() {
    setSaving(true)
    const res = await crearPlanAns({
      ansId: c.proveedor.ansId,
      year: y,
      mes: m,
      indicador: r.key,
      valor: r.valor,
      meta: r.meta,
      causa,
      accion,
      responsable,
      fechaCompromiso: fecha || null,
    })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success("Plan de acción cargado")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Plan de acción · {c.proveedor.nombre}</DialogTitle>
          <DialogDescription>
            {r.nombre} de {mesLabel(ym)}: {fmtPct(r.valor)} (meta {r.sentido === "min" ? "≥" : "≤"} {r.meta} %). La
            causa y la acción se acuerdan con el proveedor; el acuerdo da 7 días para tenerlas por escrito.
          </DialogDescription>
        </DialogHeader>
        {r.detalle.filter((d) => d.ok === false).length > 0 && (
          <ul className="max-h-28 space-y-0.5 overflow-y-auto rounded-md bg-muted/50 p-2 text-[11px]">
            {r.detalle
              .filter((d) => d.ok === false)
              .map((d) => (
                <li key={d.id}>
                  <span className="font-medium">{d.titulo}</span> · {d.detalle}
                </li>
              ))}
          </ul>
        )}
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Causa (qué pasó)</Label>
            <Textarea rows={2} value={causa} onChange={(e) => setCausa(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Acción acordada</Label>
            <Textarea
              rows={2}
              value={accion}
              onChange={(e) => setAccion(e.target.value)}
              placeholder="Ej.: el taller confirma por WhatsApp la fecha de entrega al diagnosticar y avisa antes de que venza si cambia"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Responsable</Label>
              <Input value={responsable} onChange={(e) => setResponsable(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Fecha compromiso</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving || !accion.trim()}>
            {saving ? "Guardando…" : "Guardar plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CerrarPlanDialog({ plan, onClose, onSaved }: { plan: PlanAns; onClose: () => void; onSaved: () => void }) {
  const [resultado, setResultado] = useState("")
  const [saving, setSaving] = useState(false)
  async function guardar() {
    setSaving(true)
    const r = await cerrarPlanAns(plan.id, resultado)
    setSaving(false)
    if ("error" in r) return toast.error(r.error)
    toast.success("Plan cerrado")
    onSaved()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cerrar plan de acción</DialogTitle>
          <DialogDescription>{plan.accion}</DialogDescription>
        </DialogHeader>
        <div>
          <Label className="text-xs text-muted-foreground">Resultado (qué se hizo y si funcionó)</Label>
          <Textarea rows={3} value={resultado} onChange={(e) => setResultado(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Cerrar plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RecargaDialog({
  recarga,
  proveedor,
  onClose,
  onSaved,
}: {
  recarga: RecargaMatafuegos | null
  proveedor: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [fechaRetiro, setFechaRetiro] = useState(recarga?.fechaRetiro ?? hoyLocal())
  const [fechaDevolucion, setFechaDevolucion] = useState(recarga?.fechaDevolucion ?? "")
  const [cantidad, setCantidad] = useState(String(recarga?.cantidad ?? 1))
  const [reemplazo, setReemplazo] = useState<"si" | "no" | "nd">(
    recarga?.reemplazoDejado == null ? "nd" : recarga.reemplazoDejado ? "si" : "no"
  )
  const [obs, setObs] = useState(recarga?.observaciones ?? "")
  const [saving, setSaving] = useState(false)

  async function guardar() {
    setSaving(true)
    const r = await guardarRecargaMatafuegos({
      id: recarga?.id,
      proveedor: recarga?.proveedor ?? proveedor,
      fechaRetiro,
      fechaDevolucion: fechaDevolucion || null,
      cantidad: Number(cantidad) || 1,
      reemplazoDejado: reemplazo === "nd" ? null : reemplazo === "si",
      observaciones: obs,
    })
    setSaving(false)
    if ("error" in r) return toast.error(r.error)
    toast.success("Retiro guardado")
    onSaved()
  }

  async function borrar() {
    if (!recarga) return
    setSaving(true)
    const r = await eliminarRecargaMatafuegos(recarga.id)
    setSaving(false)
    if ("error" in r) return toast.error(r.error)
    toast.success("Retiro eliminado")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{recarga ? "Retiro de matafuegos" : "Registrar retiro de matafuegos"}</DialogTitle>
          <DialogDescription>
            El ANS de Costanzi pide devolverlos recargados en ≤ 72 h hábiles y dejar equipos de reemplazo mientras tanto.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Se retiraron</Label>
            <Input type="date" value={fechaRetiro} onChange={(e) => setFechaRetiro(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Cantidad de equipos</Label>
            <Input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Se devolvieron</Label>
            <Input type="date" value={fechaDevolucion} onChange={(e) => setFechaDevolucion(e.target.value)} />
            {fechaRetiro && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Límite: {fmtFecha(sumarDiasHabiles(fechaRetiro, DIAS_HABILES_RECARGA))}
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">¿Dejó reemplazo?</Label>
            <select
              value={reemplazo}
              onChange={(e) => setReemplazo(e.target.value as "si" | "no" | "nd")}
              className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
            >
              <option value="nd">Sin dato</option>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">Observaciones</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Qué equipos (número / unidad / sector)" />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {recarga ? (
            <Button variant="ghost" onClick={borrar} disabled={saving} className="text-destructive">
              <Trash2 className="mr-1 size-3.5" /> Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={saving || !fechaRetiro}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
