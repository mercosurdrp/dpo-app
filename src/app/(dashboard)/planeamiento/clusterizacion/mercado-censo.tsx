"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Info, Plus, Check, Download, Flag, ClipboardList } from "lucide-react"
import {
  CUBO_META,
  DOMINIO_META,
  FRENTE_META,
  type CuboId,
  type DominioId,
  type FrenteId,
  type ClienteClusterizado,
  type ClusterizacionData,
} from "@/actions/clusterizacion-tipos"
import { guardarPlanFrente, type ClusterPlanFrente } from "@/actions/clusterizacion-planes"

const CUBOS_ORDEN: CuboId[] = [
  "estrella", "rentable", "motor", "pesado",
  "promesa", "hormiga", "dilema", "critico",
]
const DOMINIOS_ORDEN: DominioId[] = ["dominado", "compartido", "invadido"]
// Frentes con plan global propio (sin_frente hereda el plan de su cubo).
const FRENTES_ORDEN: FrenteId[] = ["casa_propia", "muro", "gigantes", "veredicto"]
const MAX_FILAS = 300

const fmtNum = (n: number, dec = 0) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(n)
const fmtPct0 = (n: number) => `${fmtNum(n * 100)}%`

function selectFiltro(
  value: string,
  onChange: (v: string) => void,
  opciones: string[],
  todos: string,
) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-input bg-white px-2 text-sm"
    >
      <option value="todos">{todos}</option>
      {opciones.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

/**
 * Solapa "Mercado (Censo)": cruza los 8 cubos de la clusterización con el Censo
 * Thomas (SOM vs competencia por PDV). Matriz cubo × dominio, frentes
 * estratégicos con plan global, ranking de ataque puntual y lista de conquista.
 */
export function SolapaMercado({
  data,
  planesFrente,
  onChangeFrente,
  onCrearPlanCliente,
}: {
  data: ClusterizacionData
  planesFrente: ClusterPlanFrente[]
  onChangeFrente: () => void | Promise<void>
  onCrearPlanCliente: (c: ClienteClusterizado) => void
}) {
  const { clientes, censo_nombre, umbral_potencial, conquista } = data
  const [fCubo, setFCubo] = useState<CuboId | "todos">("todos")
  const [fDominio, setFDominio] = useState<DominioId | "todos">("todos")
  const [fFrente, setFFrente] = useState<FrenteId | "todos">("todos")
  const [fPromotor, setFPromotor] = useState("todos")
  const [fSupervisor, setFSupervisor] = useState("todos")
  const [busqueda, setBusqueda] = useState("")
  const [planFrenteTarget, setPlanFrenteTarget] = useState<FrenteId | null>(null)

  // Universo del cruce: clientes con cubo Y censados con volumen.
  const cruzados = useMemo(
    () => clientes.filter((c) => c.cubo && c.censo_hl_mercado != null),
    [clientes],
  )

  const kpis = useMemo(() => {
    const hlComp = cruzados.reduce((s, c) => s + (c.censo_hl_comp ?? 0), 0)
    const hlCompEstrella = cruzados
      .filter((c) => c.cubo === "estrella")
      .reduce((s, c) => s + (c.censo_hl_comp ?? 0), 0)
    const hlMerc = cruzados.reduce((s, c) => s + (c.censo_hl_mercado ?? 0), 0)
    const hlConquista = conquista.reduce((s, c) => s + c.hl_total, 0)
    return { hlComp, hlCompEstrella, hlMerc, hlConquista }
  }, [cruzados, conquista])

  const opciones = useMemo(() => {
    const prom = new Set<string>(), sup = new Set<string>()
    for (const c of cruzados) {
      if (c.promotor) prom.add(c.promotor)
      if (c.supervisor) sup.add(c.supervisor)
    }
    const ord = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b))
    return { promotores: ord(prom), supervisores: ord(sup) }
  }, [cruzados])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return cruzados
      .filter((c) => fCubo === "todos" || c.cubo === fCubo)
      .filter((c) => fDominio === "todos" || c.dominio === fDominio)
      .filter((c) => fFrente === "todos" || c.frente === fFrente)
      .filter((c) => fPromotor === "todos" || c.promotor === fPromotor)
      .filter((c) => fSupervisor === "todos" || c.supervisor === fSupervisor)
      .filter(
        (c) =>
          q === "" ||
          (c.nombre ?? "").toLowerCase().includes(q) ||
          String(c.id_cliente).includes(q) ||
          (c.localidad ?? "").toLowerCase().includes(q) ||
          (c.promotor ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => (b.score_ataque ?? 0) - (a.score_ataque ?? 0))
  }, [cruzados, fCubo, fDominio, fFrente, fPromotor, fSupervisor, busqueda])

  const visibles = filtrados.slice(0, MAX_FILAS)

  // Sin censo cargado (o base del dashboard caída): la solapa avisa y no rompe.
  if (!censo_nombre) {
    return (
      <Card className="border-l-4 border-l-amber-400 bg-amber-50/40">
        <CardContent className="flex gap-3 pt-5 text-sm text-slate-700">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <p>
            No hay Censo Thomas disponible para cruzar. Cargá un censo desde el
            dashboard Mercosur (Censo Thomas — Análisis) y volvé a esta solapa.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Celda de la matriz cubo × dominio (clickeable = filtra la tabla).
  const celdaMatriz = (cubo: CuboId, dom: DominioId) => {
    const grupo = cruzados.filter((c) => c.cubo === cubo && c.dominio === dom)
    const hl = grupo.reduce((s, c) => s + (c.censo_hl_comp ?? 0), 0)
    const activo = fCubo === cubo && fDominio === dom
    return (
      <button
        key={dom}
        onClick={() => {
          if (activo) {
            setFCubo("todos")
            setFDominio("todos")
          } else {
            setFCubo(cubo)
            setFDominio(dom)
            setFFrente("todos")
          }
        }}
        className={`rounded-md border p-2 text-center transition-all hover:shadow ${
          activo ? "ring-2 ring-indigo-500" : ""
        }`}
        style={{ backgroundColor: `${DOMINIO_META[dom].color}${grupo.length > 0 ? "18" : "08"}` }}
      >
        <div className="text-lg font-bold" style={{ color: DOMINIO_META[dom].color }}>
          {grupo.length}
        </div>
        <div className="text-[10px] text-muted-foreground">{fmtNum(hl, 0)} HL comp</div>
      </button>
    )
  }

  // Tarjeta de un frente estratégico (clickeable = filtra; botón +/✓ = plan global).
  const tarjetaFrente = (fr: FrenteId) => {
    const meta = FRENTE_META[fr]
    const grupo = cruzados.filter((c) => c.frente === fr)
    const hl = grupo.reduce((s, c) => s + (c.censo_hl_comp ?? 0), 0)
    const plan = planesFrente.find((p) => p.frente === fr)
    const activo = fFrente === fr
    return (
      <Card
        key={fr}
        className={`relative cursor-pointer transition-all hover:shadow-md ${activo ? "ring-2" : ""}`}
        style={{
          // @ts-expect-error ring color via CSS var
          "--tw-ring-color": meta.color,
        }}
        onClick={() => {
          setFFrente(activo ? "todos" : fr)
          setFCubo("todos")
          setFDominio("todos")
        }}
      >
        <CardContent className="space-y-2 pt-5">
          <div className="flex items-center justify-between">
            <span className="text-xl">{meta.icon}</span>
            <span className="text-2xl font-bold" style={{ color: meta.color }}>
              {grupo.length}
            </span>
          </div>
          <div>
            <p className="font-semibold text-slate-900">{meta.label}</p>
            <p className="text-xs font-medium" style={{ color: meta.color }}>
              {fmtNum(hl, 0)} HL/mes de competencia
            </p>
          </div>
          <p className="text-xs leading-snug text-muted-foreground">{meta.jugada}</p>
          <Button
            size="sm"
            variant={plan ? "secondary" : "outline"}
            className="absolute bottom-3 right-3 h-7 px-2"
            onClick={(e) => {
              e.stopPropagation()
              setPlanFrenteTarget(fr)
            }}
            title={plan ? "Editar plan del frente" : "Cargar plan del frente"}
          >
            {plan ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </Button>
        </CardContent>
      </Card>
    )
  }

  const urlExcel = () => {
    const p = new URLSearchParams()
    if (fFrente !== "todos") p.set("frente", fFrente)
    else if (fCubo !== "todos") p.set("cubo", fCubo)
    else p.set("total", "1")
    return `/api/planeamiento/clusterizacion/cubo-xlsx?${p.toString()}`
  }

  return (
    <div className="space-y-5">
      {/* Metodología */}
      <Card className="border-l-4 border-l-indigo-400 bg-indigo-50/40">
        <CardContent className="flex gap-3 pt-5 text-sm text-slate-700">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
          <div className="space-y-1">
            <p>
              Cruce de los <strong>8 cubos</strong> (cómo nos va a nosotros) con el{" "}
              <strong>Censo Thomas {censo_nombre}</strong> (cuánto mueve el PDV en TODO el
              mercado). <strong>Dominio</strong> = share CMQ en el PDV (Dominado ≥ 70% ·
              Compartido 40–70% · Invadido &lt; 40%). <strong>Potencial alto</strong> = el PDV le
              compra a la competencia ≥ {fmtNum(umbral_potencial, 1)} HL/mes (p75).{" "}
              <strong>Score de ataque</strong> = HL de competencia × facilidad del cubo (el mismo
              HL vale más donde servir es barato y el cliente crece).
            </p>
            <p className="text-xs text-muted-foreground">
              Universo: {fmtNum(cruzados.length)} PDV de la cartera activa censados con volumen.
              La <strong>batalla</strong> sugiere la marca CMQ espejo contra la marca de
              competencia más vendida del PDV.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Competencia DENTRO de la cartera</p>
            <p className="text-2xl font-bold text-red-600">{fmtNum(kpis.hlComp, 0)} HL/mes</p>
            <p className="text-xs text-muted-foreground">
              sobre {fmtNum(kpis.hlMerc, 0)} HL de mercado total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">En nuestras Estrellas</p>
            <p className="text-2xl font-bold text-amber-600">
              {fmtNum(kpis.hlCompEstrella, 0)} HL/mes
            </p>
            <p className="text-xs text-muted-foreground">
              {kpis.hlComp > 0 ? fmtPct0(kpis.hlCompEstrella / kpis.hlComp) : "—"} del total en
              juego
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">PDV cruzados</p>
            <p className="text-2xl font-bold text-indigo-600">{fmtNum(cruzados.length)}</p>
            <p className="text-xs text-muted-foreground">cartera activa + censo con volumen</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Conquista (sin venta nuestra)</p>
            <p className="text-2xl font-bold text-purple-600">{fmtNum(conquista.length)} PDV</p>
            <p className="text-xs text-muted-foreground">
              {fmtNum(kpis.hlConquista, 0)} HL/mes de mercado
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Frentes estratégicos */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Flag className="h-4 w-4 text-indigo-500" /> Frentes estratégicos (planes globales)
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {FRENTES_ORDEN.map((fr) => tarjetaFrente(fr))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Los PDV sin frente diferencial ({fmtNum(cruzados.filter((c) => c.frente === "sin_frente").length)})
          siguen el plan genérico de su cubo (solapa Diagrama).
        </p>
      </div>

      {/* Matriz cubo × dominio */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Matriz cubo × dominio (SOM)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[110px_1fr_1fr_1fr] items-center gap-2">
            <div />
            {DOMINIOS_ORDEN.map((d) => (
              <div key={d} className="text-center">
                <span
                  className="text-xs font-semibold"
                  style={{ color: DOMINIO_META[d].color }}
                >
                  {DOMINIO_META[d].label}
                </span>
                <p className="text-[10px] text-muted-foreground">{DOMINIO_META[d].desc}</p>
              </div>
            ))}
            {CUBOS_ORDEN.map((cubo) => (
              <div key={cubo} className="contents">
                <div
                  className="text-right text-xs font-semibold"
                  style={{ color: CUBO_META[cubo].color }}
                >
                  {CUBO_META[cubo].label}
                </div>
                {DOMINIOS_ORDEN.map((d) => celdaMatriz(cubo, d))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Ranking de ataque */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            Ranking de ataque ({fmtNum(filtrados.length)})
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente…"
              className="h-9 w-44"
            />
            {selectFiltro(
              fFrente,
              (v) => setFFrente(v as FrenteId | "todos"),
              [...FRENTES_ORDEN, "sin_frente"],
              "Frente: todos",
            )}
            {selectFiltro(fSupervisor, setFSupervisor, opciones.supervisores, "Supervisor: todos")}
            {selectFiltro(fPromotor, setFPromotor, opciones.promotores, "Promotor: todos")}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.href = urlExcel()
              }}
            >
              <Download className="h-4 w-4" /> Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Cubo</TableHead>
                  <TableHead className="text-right">SOM</TableHead>
                  <TableHead>Dominio</TableHead>
                  <TableHead className="text-right">HL mercado</TableHead>
                  <TableHead className="text-right">HL comp.</TableHead>
                  <TableHead>Batalla sugerida</TableHead>
                  <TableHead>Frente</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((c) => (
                  <TableRow key={c.id_cliente}>
                    <TableCell>
                      <div className="font-medium text-slate-900">
                        {c.nombre ?? `Cliente ${c.id_cliente}`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        #{c.id_cliente} · {c.localidad ?? "—"} · {c.promotor ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.cubo && (
                        <span
                          className="text-xs font-semibold"
                          style={{ color: CUBO_META[c.cubo].color }}
                        >
                          {CUBO_META[c.cubo].label}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {c.censo_som != null ? fmtPct0(c.censo_som) : "—"}
                    </TableCell>
                    <TableCell>
                      {c.dominio && (
                        <Badge
                          variant="secondary"
                          className="text-[10px]"
                          style={{
                            backgroundColor: `${DOMINIO_META[c.dominio].color}22`,
                            color: DOMINIO_META[c.dominio].color,
                          }}
                        >
                          {DOMINIO_META[c.dominio].label}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {c.censo_hl_mercado != null ? fmtNum(c.censo_hl_mercado, 1) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold text-red-600">
                      {c.censo_hl_comp != null ? fmtNum(c.censo_hl_comp, 1) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">{c.batalla ?? "—"}</TableCell>
                    <TableCell>
                      {c.frente && c.frente !== "sin_frente" && (
                        <span className="text-xs" title={FRENTE_META[c.frente].label}>
                          {FRENTE_META[c.frente].icon} {FRENTE_META[c.frente].label}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {c.score_ataque != null ? fmtNum(c.score_ataque, 1) : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        title="Crear plan puntual"
                        onClick={() => onCrearPlanCliente(c)}
                      >
                        <ClipboardList className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {visibles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      Sin PDV para los filtros aplicados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {filtrados.length > MAX_FILAS && (
            <p className="mt-3 text-xs text-muted-foreground">
              Mostrando los {MAX_FILAS} de mayor score de {fmtNum(filtrados.length)}. Refiná con
              la búsqueda o los filtros.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Conquista */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            🚩 Conquista — censados con volumen, sin venta nuestra este año (
            {fmtNum(conquista.length)})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            El censo los relevó moviendo volumen, pero no registran compras nuestras en el año:
            son invisibles para la clusterización. Lista de apertura priorizada por tamaño de
            mercado (SOM = lo que el censo relevó de CMQ, probablemente vía terceros).
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PDV</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Promotor (censo)</TableHead>
                  <TableHead className="text-right">HL mercado</TableHead>
                  <TableHead className="text-right">SOM censo</TableHead>
                  <TableHead>Marca comp. top</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conquista.slice(0, 50).map((c) => (
                  <TableRow key={c.id_cliente}>
                    <TableCell className="font-medium text-slate-900">#{c.id_cliente}</TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {c.canal ?? "—"}
                      {c.subcanal ? ` · ${c.subcanal}` : ""}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {c.promotor_censo ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      {fmtNum(c.hl_total, 1)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {c.som != null ? fmtPct0(c.som) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {c.comp_marca ? `${c.comp_marca} (${fmtNum(c.comp_marca_hl, 1)} HL)` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {conquista.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No hay PDV censados con volumen fuera de la cartera activa.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {conquista.length > 50 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Mostrando los 50 de mayor volumen de {fmtNum(conquista.length)}.
            </p>
          )}
        </CardContent>
      </Card>

      <CrearPlanFrenteDialog
        frente={planFrenteTarget}
        planActual={
          planFrenteTarget
            ? planesFrente.find((p) => p.frente === planFrenteTarget) ?? null
            : null
        }
        cantidad={
          planFrenteTarget ? cruzados.filter((c) => c.frente === planFrenteTarget).length : 0
        }
        onClose={() => setPlanFrenteTarget(null)}
        onSaved={async () => {
          setPlanFrenteTarget(null)
          await onChangeFrente()
        }}
      />
    </div>
  )
}

/** Diálogo para cargar/editar el plan de acción AGRUPADO de un frente (uno por frente). */
function CrearPlanFrenteDialog({
  frente, planActual, cantidad, onClose, onSaved,
}: {
  frente: FrenteId | null
  planActual: ClusterPlanFrente | null
  cantidad: number
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [descripcion, setDescripcion] = useState("")
  const [responsable, setResponsable] = useState("")
  const [fechaLimite, setFechaLimite] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reinicio/precargo el form cuando cambia el frente objetivo.
  const [lastFrente, setLastFrente] = useState<FrenteId | null>(null)
  if (frente !== lastFrente) {
    setLastFrente(frente)
    setDescripcion(planActual?.descripcion ?? "")
    setResponsable(planActual?.responsable ?? "")
    setFechaLimite(planActual?.fecha_limite ?? "")
    setError(null)
  }

  async function guardar() {
    if (!frente) return
    if (!descripcion.trim()) {
      setError("Escribí la acción a tomar.")
      return
    }
    setSaving(true)
    setError(null)
    const res = await guardarPlanFrente({
      frente,
      descripcion,
      responsable,
      fecha_limite: fechaLimite || null,
    })
    setSaving(false)
    if ("error" in res) {
      setError(res.error)
      return
    }
    await onSaved()
  }

  const meta = frente ? FRENTE_META[frente] : null

  return (
    <Dialog open={frente !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Plan de acción del frente</DialogTitle>
        </DialogHeader>
        {meta && (
          <div className="space-y-3">
            <div className="rounded-md bg-slate-50 p-3 text-sm">
              <div className="font-medium" style={{ color: meta.color }}>
                {meta.icon} {meta.label}
              </div>
              <div className="text-xs text-muted-foreground">{fmtNum(cantidad)} PDV</div>
              <div className="mt-1 text-xs text-slate-600">{meta.jugada}</div>
            </div>
            <p className="text-xs text-muted-foreground">
              Esta acción aplica a <strong>todos</strong> los PDV del frente.
            </p>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Acción a tomar *</label>
              <Textarea
                rows={4}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej.: atacar con la marca espejo condicionando exhibición y frío…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Responsable</label>
                <Input
                  value={responsable}
                  onChange={(e) => setResponsable(e.target.value)}
                  placeholder="Nombre"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Fecha límite</label>
                <Input
                  type="date"
                  value={fechaLimite}
                  onChange={(e) => setFechaLimite(e.target.value)}
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            <Plus className="h-4 w-4" /> {saving ? "Guardando…" : planActual ? "Guardar cambios" : "Crear plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
