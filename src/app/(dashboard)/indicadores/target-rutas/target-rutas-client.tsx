"use client"
/**
 * Target de CEq por camión según ruta. Tres bloques:
 *  1) Config: target editable por ruta + mapeo localidad→ruta.
 *  2) Valores del día: cada camión contra el target de SU ruta.
 *  3) Histórico del rango: distribución de CEq por ruta (p50/p80/máx).
 */
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { Check, MapPin, Route, Target, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  asignarLocalidad,
  setTargetRuta,
  type TargetRutasData,
} from "@/actions/target-rutas"

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)
const fmt1 = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n)

function colorPct(pct: number): string {
  if (pct >= 100) return "text-emerald-700"
  if (pct >= 80) return "text-amber-600"
  return "text-red-600"
}

export function TargetRutasClient({
  data,
  puedeEditar,
}: {
  data: TargetRutasData
  puedeEditar: boolean
}) {
  const fechasConDatos = useMemo(
    () => [...new Set(data.dias.map((d) => d.fecha))].sort().reverse(),
    [data.dias],
  )
  const [fechaSel, setFechaSel] = useState<string>(fechasConDatos[0] ?? data.hasta)
  const [guardando, startGuardar] = useTransition()

  const rowsDia = useMemo(
    () => data.dias.filter((d) => d.fecha === fechaSel),
    [data.dias, fechaSel],
  )

  const totalCamionDias = data.dias.length
  const conRuta = data.dias.filter((d) => d.ruta_id != null)
  const enTarget = data.dias.filter((d) => d.pct >= 100).length

  const guardarTarget = (rutaId: string, valor: string) => {
    const target = valor.trim() === "" ? null : Number(valor.replace(",", "."))
    if (target != null && (!Number.isFinite(target) || target <= 0)) {
      toast.error("El target tiene que ser un número positivo.")
      return
    }
    startGuardar(async () => {
      const res = await setTargetRuta(rutaId, target)
      if ("error" in res) toast.error(res.error)
      else toast.success("Target guardado.")
    })
  }

  const moverLocalidad = (localidad: string, rutaId: string | null) => {
    startGuardar(async () => {
      const res = await asignarLocalidad(localidad, rutaId)
      if ("error" in res) toast.error(res.error)
      else toast.success(`${localidad} ${rutaId ? "asignada" : "quitada"}.`)
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Route className="size-6 text-indigo-600" />
          Target por ruta
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada camión se compara contra el target de CEq de la ruta que hizo ese
          día (derivada de las localidades de su carga). Sin target de ruta se
          usa el global de {data.target_global} CEq. Rango analizado:{" "}
          {data.desde} → {data.hasta}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Camión-días analizados" value={fmt(totalCamionDias)} />
        <Kpi
          label="Con ruta identificada"
          value={fmt(conRuta.length)}
          sub={
            totalCamionDias > 0
              ? `${fmt1((conRuta.length / totalCamionDias) * 100)}%`
              : undefined
          }
        />
        <Kpi
          label="Días en target"
          value={fmt(enTarget)}
          sub={
            totalCamionDias > 0
              ? `${fmt1((enTarget / totalCamionDias) * 100)}% del total`
              : undefined
          }
        />
        <Kpi
          label="Rutas con target propio"
          value={`${data.rutas.filter((r) => r.target_ceq != null).length} / ${data.rutas.length}`}
        />
      </div>

      {/* ---------- Config por ruta ---------- */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Target className="size-4 text-indigo-600" />
              Targets y localidades por ruta
            </h2>
            <span className="text-xs text-muted-foreground">
              La sugerencia es el p80 del rango: el camión “bien cargado” de esa
              ruta.
            </span>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ruta</TableHead>
                  <TableHead className="w-40">Target CEq</TableHead>
                  <TableHead className="w-28 text-right">Sugerencia</TableHead>
                  <TableHead className="w-24 text-right">Camión-días</TableHead>
                  <TableHead className="w-28 text-right">% en target</TableHead>
                  <TableHead>Localidades</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.stats.map((s) => {
                  const ruta = data.rutas.find((r) => r.id === s.ruta_id)
                  return (
                    <TableRow key={s.ruta_id}>
                      <TableCell className="font-medium">{s.ruta}</TableCell>
                      <TableCell>
                        {puedeEditar ? (
                          <TargetInput
                            inicial={s.target_ceq}
                            disabled={guardando}
                            onGuardar={(v) => guardarTarget(s.ruta_id, v)}
                          />
                        ) : (
                          <span className="tabular-nums">
                            {s.target_ceq != null ? fmt(s.target_ceq) : "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.camion_dias > 0 ? (
                          puedeEditar ? (
                            <button
                              type="button"
                              disabled={guardando}
                              onClick={() =>
                                guardarTarget(s.ruta_id, String(s.sugerencia))
                              }
                              className="tabular-nums text-indigo-700 underline-offset-2 hover:underline disabled:opacity-50"
                              title="Usar la sugerencia como target"
                            >
                              {fmt(s.sugerencia)}
                            </button>
                          ) : (
                            <span className="tabular-nums">{fmt(s.sugerencia)}</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(s.camion_dias)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.pct_en_target != null ? (
                          <span className={colorPct(s.pct_en_target)}>
                            {fmt1(s.pct_en_target)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">sin target</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-[420px] flex-wrap gap-1">
                          {(ruta?.localidades ?? []).map((loc) => (
                            <span
                              key={loc}
                              className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700"
                            >
                              {loc}
                              {puedeEditar && (
                                <button
                                  type="button"
                                  disabled={guardando}
                                  onClick={() => moverLocalidad(loc, null)}
                                  className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                                  title={`Quitar ${loc} de ${s.ruta}`}
                                >
                                  <X className="size-3" />
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {data.localidades_sin_ruta.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-800">
                <MapPin className="size-3.5" />
                Localidades sin ruta asignada (su CEq no se cuenta para derivar
                la ruta del camión)
              </div>
              <div className="flex flex-wrap gap-2">
                {data.localidades_sin_ruta.map((loc) => (
                  <div key={loc} className="flex items-center gap-1">
                    <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-700 ring-1 ring-amber-200">
                      {loc}
                    </span>
                    {puedeEditar && (
                      <Select
                        value=""
                        onValueChange={(v) => v && moverLocalidad(loc, v)}
                      >
                        <SelectTrigger className="h-7 w-36 text-xs">
                          <SelectValue placeholder="Asignar a…" />
                        </SelectTrigger>
                        <SelectContent>
                          {data.rutas.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Valores del día ---------- */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              Valores del día
            </h2>
            <Select value={fechaSel} onValueChange={(v) => v && setFechaSel(v)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fechasConDatos.map((f) => (
                  <SelectItem key={f} value={f}>
                    {formatFechaCorta(f)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {rowsDia.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin viajes para la fecha.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Camión</TableHead>
                  <TableHead>Ruta del día</TableHead>
                  <TableHead className="w-24 text-right">CEq</TableHead>
                  <TableHead className="w-24 text-right">Bultos</TableHead>
                  <TableHead className="w-24 text-right">Target</TableHead>
                  <TableHead className="w-32 text-right">% del target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsDia.map((d) => (
                  <TableRow key={`${d.fecha}|${d.patente}`}>
                    <TableCell className="font-mono text-xs">{d.patente}</TableCell>
                    <TableCell>
                      {d.ruta ?? (
                        <span
                          className="italic text-muted-foreground"
                          title="Sin detalle por localidad (viaje 100% Gestión o dato sin desglose)"
                        >
                          sin ruta identificada
                        </span>
                      )}
                      {d.ruta != null && !d.target_es_de_ruta && (
                        <span
                          className="ml-1 text-[10px] text-amber-600"
                          title="La ruta no tiene target propio: se compara contra el global"
                        >
                          (target global)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmt1(d.ceq_total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(d.bultos_total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fmt(d.target)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold tabular-nums",
                        colorPct(d.pct),
                      )}
                    >
                      {fmt1(d.pct)}%
                      {d.pct >= 100 && (
                        <Check className="ml-1 inline size-3.5 align-[-2px]" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---------- Histórico ---------- */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Distribución histórica por ruta
            </h2>
            <span className="text-xs text-muted-foreground">
              CEq por camión-día · últimos {data.dias.length > 0 ? "60" : "—"} días
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ruta</TableHead>
                <TableHead className="w-28 text-right">Camión-días</TableHead>
                <TableHead className="w-24 text-right">Promedio</TableHead>
                <TableHead className="w-24 text-right">Mediana</TableHead>
                <TableHead className="w-24 text-right">p80</TableHead>
                <TableHead className="w-24 text-right">Máximo</TableHead>
                <TableHead className="w-24 text-right">Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.stats.map((s) => (
                <TableRow key={s.ruta_id}>
                  <TableCell className="font-medium">{s.ruta}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(s.camion_dias)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt1(s.ceq_prom)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt1(s.ceq_p50)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {fmt1(s.ceq_p80)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt1(s.ceq_max)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.target_ceq != null ? (
                      fmt(s.target_ceq)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

/** Input de target con guardado explícito (Enter o botón). */
function TargetInput({
  inicial,
  disabled,
  onGuardar,
}: {
  inicial: number | null
  disabled: boolean
  onGuardar: (valor: string) => void
}) {
  const [valor, setValor] = useState(inicial != null ? String(inicial) : "")
  const cambiado = valor !== (inicial != null ? String(inicial) : "")
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        min={0}
        step={5}
        value={valor}
        disabled={disabled}
        placeholder="—"
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && cambiado) onGuardar(valor)
        }}
        className="h-8 w-24 text-right tabular-nums"
      />
      {cambiado && (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onGuardar(valor)}
          className="h-8 px-2 text-xs"
        >
          Guardar
        </Button>
      )}
    </div>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

function formatFechaCorta(iso: string): string {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10))
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]
  return `${dias[dt.getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`
}
