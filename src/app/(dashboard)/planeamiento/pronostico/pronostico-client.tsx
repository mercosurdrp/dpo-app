"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  type PronosticoData, type CoberturaItem, type ReunionAsistente,
  guardarPolitica, guardarSnapshotMensual, crearSkuCambio, toggleSkuCambio,
  eliminarSkuCambio, crearReunionPronostico, eliminarReunionPronostico,
  crearOosPlan, actualizarOosPlanEstado, eliminarOosPlan,
} from "@/actions/pronostico"

const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

function fmtPct(v: number) {
  return `${v.toFixed(1).replace(".", ",")}%`
}

function hoyIso() {
  return new Date().toISOString().slice(0, 10)
}

// ─── TOR (reuniones_tor tipo=pronostico, API de planeamiento) ────────────────

interface TorData {
  tor: {
    objetivos: string
    dueno: string
    ubicacion: string
    dia_horario: string
    frecuencia: string
  } | null
  items: Array<{ seccion: string; orden: number; texto: string; responsable: string | null }>
}

const SECCION_LABEL: Record<string, string> = {
  participante: "Participantes",
  regla: "Reglas",
  entrada: "Entradas",
  salida: "Salidas",
  kpi: "KPIs",
  temario: "Temario",
}

function TorCard() {
  const [tor, setTor] = useState<TorData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/planeamiento/periodos-criticos/tor?tipo=pronostico")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setTor)
      .catch((e) => setError(e.message))
  }, [])

  if (error)
    return <p className="text-sm text-red-600">No se pudo cargar el TOR: {error}</p>
  if (!tor) return <p className="text-sm text-muted-foreground">Cargando TOR…</p>

  const porSeccion = new Map<string, TorData["items"]>()
  for (const it of tor.items) {
    const arr = porSeccion.get(it.seccion) ?? []
    arr.push(it)
    porSeccion.set(it.seccion, arr)
  }

  return (
    <div className="space-y-4">
      {tor.tor && (
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <p><span className="font-semibold">Objetivo:</span> {tor.tor.objetivos}</p>
          <div className="space-y-1">
            <p><span className="font-semibold">Dueño:</span> {tor.tor.dueno}</p>
            <p><span className="font-semibold">Frecuencia:</span> {tor.tor.frecuencia}</p>
            <p><span className="font-semibold">Día/horario:</span> {tor.tor.dia_horario}</p>
            <p><span className="font-semibold">Ubicación:</span> {tor.tor.ubicacion}</p>
          </div>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(SECCION_LABEL).map(([sec, label]) => (
          <div key={sec} className="rounded-md border p-3">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{label}</p>
            <ul className="space-y-1 text-sm">
              {(porSeccion.get(sec) ?? []).map((it, i) => (
                <li key={i}>
                  • {it.texto}
                  {it.responsable ? (
                    <span className="text-muted-foreground"> — {it.responsable}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Componente principal ───────────────────────────────────────────────────

export function PronosticoClient({
  data,
  canEdit,
  isAdmin,
}: {
  data: PronosticoData
  canEdit: boolean
  isAdmin: boolean
}) {
  const [pending, startTransition] = useTransition()
  const { resumen, cobertura, coberturaError, retiros } = data

  // política editable
  const [polEdit, setPolEdit] = useState(
    data.politica.map((p) => ({ ...p, min: String(p.min_dias), max: String(p.max_dias) })),
  )

  // filtro tabla cobertura
  const [filtroEstado, setFiltroEstado] = useState<string>("fuera")
  const coberturaFiltrada = useMemo(() => {
    if (filtroEstado === "todos") return cobertura
    if (filtroEstado === "fuera")
      return cobertura.filter((i) => i.estado === "debajo" || i.estado === "encima")
    return cobertura.filter((i) => i.estado === filtroEstado)
  }, [cobertura, filtroEstado])

  // SKUs en riesgo de quiebre (para tab OOS)
  const enRiesgo = useMemo(
    () => cobertura.filter((i) => i.estado === "debajo").slice(0, 50),
    [cobertura],
  )

  // forms
  const [cambioForm, setCambioForm] = useState({
    tipo: "alta" as "alta" | "baja", articulo: "", descripcion: "", fecha: hoyIso(), evidencia: "", notas: "",
  })
  const [planForm, setPlanForm] = useState({
    articulo: "", descripcion: "", brecha: "", accion: "", responsable: "", fecha: "",
  })
  const [reuForm, setReuForm] = useState({ fecha: hoyIso(), notas: "", acta: "" })
  const [asistentes, setAsistentes] = useState<ReunionAsistente[]>([
    { nombre: "", area: "operaciones", presente: true },
    { nombre: "", area: "ventas", presente: true },
  ])

  const run = (fn: () => Promise<{ data?: unknown; error?: string }>, ok: string) =>
    startTransition(async () => {
      const res = await fn()
      if ("error" in res && res.error) toast.error(res.error)
      else toast.success(ok)
    })

  const estadoBadge = (i: CoberturaItem) =>
    i.estado === "debajo" ? (
      <Badge variant="destructive">Debajo</Badge>
    ) : i.estado === "encima" ? (
      <Badge className="bg-amber-500 hover:bg-amber-500">Sobre stock</Badge>
    ) : i.estado === "ok" ? (
      <Badge className="bg-emerald-600 hover:bg-emerald-600">En rango</Badge>
    ) : (
      <Badge variant="secondary">s/VPD</Badge>
    )

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Rutina de Pronóstico (DPO 3.2)</h1>
        <p className="text-sm text-muted-foreground">
          Política de inventario, SKUs fuera de rango, OOS teórico, altas/bajas de SKU y reunión
          mensual con TOR — pilar Planeamiento, requisito R3.2.
          {resumen ? ` · Kardex ${resumen.kardexMes} · VPD 15 días (live chess-dashboard)` : ""}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">SKUs con VPD</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{resumen?.conVpd ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">% en rango</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold text-emerald-600">
            {resumen ? fmtPct(resumen.pctOk) : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">% debajo del rango</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold text-red-600">
            {resumen ? fmtPct(resumen.pctDebajo) : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">% sobre stock</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold text-amber-600">
            {resumen ? fmtPct(resumen.pctEncima) : "—"}
          </CardContent>
        </Card>
      </div>

      {coberturaError && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {coberturaError}
        </p>
      )}

      <Tabs defaultValue="cobertura">
        <TabsList className="flex-wrap">
          <TabsTrigger value="cobertura">Cobertura & Política</TabsTrigger>
          <TabsTrigger value="oos">OOS & Planes</TabsTrigger>
          <TabsTrigger value="cambios">SKUs nuevos / retirados</TabsTrigger>
          <TabsTrigger value="reunion">Reunión & TOR</TabsTrigger>
        </TabsList>

        {/* ─── TAB 1: Cobertura & Política ─────────────────────────────── */}
        <TabsContent value="cobertura" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Política de inventario (días de cobertura por segmento)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-4">
                {polEdit.map((p, idx) => (
                  <div key={p.segmento} className="rounded-md border p-3">
                    <p className="mb-2 text-sm font-semibold">{p.nombre}</p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" className="h-8 w-20" value={p.min}
                        disabled={!canEdit}
                        onChange={(e) => setPolEdit((s) => s.map((x, i) => i === idx ? { ...x, min: e.target.value } : x))}
                      />
                      <span className="text-sm text-muted-foreground">a</span>
                      <Input
                        type="number" className="h-8 w-20" value={p.max}
                        disabled={!canEdit}
                        onChange={(e) => setPolEdit((s) => s.map((x, i) => i === idx ? { ...x, max: e.target.value } : x))}
                      />
                      <span className="text-xs text-muted-foreground">días</span>
                    </div>
                    {canEdit && (
                      <Button
                        size="sm" variant="outline" className="mt-2" disabled={pending}
                        onClick={() => run(() => guardarPolitica(p.segmento, Number(p.min), Number(p.max)), "Política actualizada")}
                      >
                        Guardar
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Un SKU está <b>debajo</b> si su cobertura (stock ÷ VPD) es menor al mínimo del
                segmento, y en <b>sobre stock</b> si supera el máximo. R3.2.2 exige medir el % fuera de
                rango partido en debajo / encima.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">
                SKUs ({coberturaFiltrada.length}) — {filtroEstado === "fuera" ? "fuera de rango" : filtroEstado}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Select value={filtroEstado} onValueChange={(v) => setFiltroEstado(v ?? "fuera")}>
                  <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fuera">Fuera de rango</SelectItem>
                    <SelectItem value="debajo">Debajo</SelectItem>
                    <SelectItem value="encima">Sobre stock</SelectItem>
                    <SelectItem value="ok">En rango</SelectItem>
                    <SelectItem value="todos">Todos</SelectItem>
                  </SelectContent>
                </Select>
                {canEdit && (
                  <Button size="sm" disabled={pending || !resumen}
                    onClick={() => run(guardarSnapshotMensual, "Snapshot del mes guardado")}>
                    Guardar snapshot del mes
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-[480px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Segmento</TableHead>
                      <TableHead className="text-right">Stock (bul)</TableHead>
                      <TableHead className="text-right">VPD (bul/d)</TableHead>
                      <TableHead className="text-right">Cobertura (d)</TableHead>
                      <TableHead className="text-right">Rango</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coberturaFiltrada.slice(0, 300).map((i) => (
                      <TableRow key={i.articulo}>
                        <TableCell className="font-mono text-xs">{i.articulo}</TableCell>
                        <TableCell className="max-w-[260px] truncate text-sm">{i.descripcion}</TableCell>
                        <TableCell className="text-sm capitalize">{i.segmento}</TableCell>
                        <TableCell className="text-right text-sm">{i.stockBultos.toLocaleString("es-AR")}</TableCell>
                        <TableCell className="text-right text-sm">{i.vpdBultos.toLocaleString("es-AR")}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">
                          {i.coberturaDias == null ? "—" : i.coberturaDias.toLocaleString("es-AR")}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {i.minDias}–{i.maxDias}
                        </TableCell>
                        <TableCell>{estadoBadge(i)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {data.snapshots.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Snapshots mensuales (evidencia)</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mes</TableHead>
                      <TableHead className="text-right">SKUs</TableHead>
                      <TableHead className="text-right">% en rango</TableHead>
                      <TableHead className="text-right">% debajo</TableHead>
                      <TableHead className="text-right">% sobre stock</TableHead>
                      <TableHead>Tomado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.snapshots.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{MESES[s.mes]} {s.anio}</TableCell>
                        <TableCell className="text-right">{s.total_skus}</TableCell>
                        <TableCell className="text-right text-emerald-700">{fmtPct(Number(s.pct_ok))}</TableCell>
                        <TableCell className="text-right text-red-700">{fmtPct(Number(s.pct_debajo))}</TableCell>
                        <TableCell className="text-right text-amber-700">{fmtPct(Number(s.pct_encima))}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(s.created_at).toLocaleDateString("es-AR")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── TAB 2: OOS & Planes ──────────────────────────────────────── */}
        <TabsContent value="oos" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Quiebres teóricos — SKUs debajo del rango ({enRiesgo.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[360px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">VPD</TableHead>
                      <TableHead className="text-right">Cobertura</TableHead>
                      {canEdit && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enRiesgo.map((i) => (
                      <TableRow key={i.articulo}>
                        <TableCell className="font-mono text-xs">{i.articulo}</TableCell>
                        <TableCell className="max-w-[280px] truncate text-sm">{i.descripcion}</TableCell>
                        <TableCell className="text-right text-sm">{i.stockBultos.toLocaleString("es-AR")}</TableCell>
                        <TableCell className="text-right text-sm">{i.vpdBultos.toLocaleString("es-AR")}</TableCell>
                        <TableCell className="text-right text-sm font-semibold text-red-700">
                          {i.coberturaDias?.toLocaleString("es-AR") ?? "—"} d
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <Button
                              size="sm" variant="outline"
                              onClick={() => setPlanForm({
                                articulo: i.articulo,
                                descripcion: i.descripcion,
                                brecha: `cobertura ${i.coberturaDias ?? 0} días (piso ${i.minDias})`,
                                accion: "", responsable: "", fecha: "",
                              })}
                            >
                              Plan
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {canEdit && (
            <Card>
              <CardHeader><CardTitle className="text-base">Nuevo plan de acción</CardTitle></CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>SKU</Label>
                  <Input value={planForm.articulo} onChange={(e) => setPlanForm((s) => ({ ...s, articulo: e.target.value }))} />
                </div>
                <div>
                  <Label>Descripción</Label>
                  <Input value={planForm.descripcion} onChange={(e) => setPlanForm((s) => ({ ...s, descripcion: e.target.value }))} />
                </div>
                <div>
                  <Label>Brecha</Label>
                  <Input value={planForm.brecha} placeholder="ej: cobertura 1,2 días (piso 8)"
                    onChange={(e) => setPlanForm((s) => ({ ...s, brecha: e.target.value }))} />
                </div>
                <div>
                  <Label>Responsable</Label>
                  <Input value={planForm.responsable} onChange={(e) => setPlanForm((s) => ({ ...s, responsable: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <Label>Acción</Label>
                  <Textarea rows={2} value={planForm.accion} onChange={(e) => setPlanForm((s) => ({ ...s, accion: e.target.value }))} />
                </div>
                <div>
                  <Label>Fecha objetivo</Label>
                  <Input type="date" value={planForm.fecha} onChange={(e) => setPlanForm((s) => ({ ...s, fecha: e.target.value }))} />
                </div>
                <div className="flex items-end">
                  <Button disabled={pending}
                    onClick={() => run(() => crearOosPlan({
                      articulo: planForm.articulo, descripcion: planForm.descripcion,
                      brecha: planForm.brecha, accion: planForm.accion,
                      responsable: planForm.responsable, fecha_objetivo: planForm.fecha || undefined,
                    }), "Plan creado")}>
                    Crear plan
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Planes de acción ({data.planes.length})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Brecha</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Objetivo</TableHead>
                    <TableHead>Estado</TableHead>
                    {canEdit && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.planes.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">
                        <span className="font-mono text-xs">{p.articulo}</span>{" "}
                        <span className="text-muted-foreground">{p.descripcion}</span>
                      </TableCell>
                      <TableCell className="text-sm">{p.brecha ?? "—"}</TableCell>
                      <TableCell className="max-w-[260px] text-sm">{p.accion}</TableCell>
                      <TableCell className="text-sm">{p.responsable ?? "—"}</TableCell>
                      <TableCell className="text-sm">{p.fecha_objetivo ?? "—"}</TableCell>
                      <TableCell>
                        {canEdit ? (
                          <Select value={p.estado}
                            onValueChange={(v) => run(() => actualizarOosPlanEstado(p.id, v as typeof p.estado), "Estado actualizado")}>
                            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pendiente">Pendiente</SelectItem>
                              <SelectItem value="en_progreso">En progreso</SelectItem>
                              <SelectItem value="completado">Completado</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="secondary">{p.estado}</Badge>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <Button size="sm" variant="ghost" className="text-red-600"
                            onClick={() => run(() => eliminarOosPlan(p.id), "Plan eliminado")}>
                            Eliminar
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB 3: SKUs nuevos / retirados ───────────────────────────── */}
        <TabsContent value="cambios" className="space-y-6">
          {canEdit && (
            <Card>
              <CardHeader><CardTitle className="text-base">Registrar alta / baja de SKU</CardTitle></CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={cambioForm.tipo}
                    onValueChange={(v) => setCambioForm((s) => ({ ...s, tipo: v as "alta" | "baja" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alta">Alta (SKU nuevo)</SelectItem>
                      <SelectItem value="baja">Baja (retirado)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>SKU</Label>
                  <Input value={cambioForm.articulo} onChange={(e) => setCambioForm((s) => ({ ...s, articulo: e.target.value }))} />
                </div>
                <div>
                  <Label>Descripción</Label>
                  <Input value={cambioForm.descripcion} onChange={(e) => setCambioForm((s) => ({ ...s, descripcion: e.target.value }))} />
                </div>
                <div>
                  <Label>Fecha</Label>
                  <Input type="date" value={cambioForm.fecha} onChange={(e) => setCambioForm((s) => ({ ...s, fecha: e.target.value }))} />
                </div>
                <div>
                  <Label>Evidencia (link)</Label>
                  <Input value={cambioForm.evidencia} placeholder="mail / comunicado"
                    onChange={(e) => setCambioForm((s) => ({ ...s, evidencia: e.target.value }))} />
                </div>
                <div className="flex items-end gap-2">
                  <Input value={cambioForm.notas} placeholder="Notas"
                    onChange={(e) => setCambioForm((s) => ({ ...s, notas: e.target.value }))} />
                  <Button disabled={pending}
                    onClick={() => run(() => crearSkuCambio({
                      tipo: cambioForm.tipo, articulo: cambioForm.articulo,
                      descripcion: cambioForm.descripcion, fecha: cambioForm.fecha,
                      evidencia_url: cambioForm.evidencia, notas: cambioForm.notas,
                    }), "Registrado")}>
                    Registrar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Altas y bajas registradas ({data.cambios.length}) — R3.2.3
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Configurado en sistema</TableHead>
                    <TableHead>Comunicado al equipo</TableHead>
                    <TableHead>Evidencia</TableHead>
                    {canEdit && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.cambios.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        {c.tipo === "alta"
                          ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Alta</Badge>
                          : <Badge variant="destructive">Baja</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="font-mono text-xs">{c.articulo}</span>{" "}
                        <span className="text-muted-foreground">{c.descripcion}</span>
                      </TableCell>
                      <TableCell className="text-sm">{c.fecha}</TableCell>
                      {(["configurado_sistema", "comunicado_equipo"] as const).map((campo) => (
                        <TableCell key={campo}>
                          <button
                            disabled={!canEdit || pending}
                            className="disabled:cursor-default"
                            onClick={() => run(() => toggleSkuCambio(c.id, campo, !c[campo]), "Actualizado")}
                          >
                            {c[campo]
                              ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Sí</Badge>
                              : <Badge variant="outline">Pendiente</Badge>}
                          </button>
                        </TableCell>
                      ))}
                      <TableCell className="text-sm">
                        {c.evidencia_url
                          ? <a href={c.evidencia_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">ver</a>
                          : "—"}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <Button size="sm" variant="ghost" className="text-red-600"
                            onClick={() => run(() => eliminarSkuCambio(c.id), "Eliminado")}>
                            Eliminar
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB 4: Reunión & TOR ─────────────────────────────────────── */}
        <TabsContent value="reunion" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">TOR — Reunión mensual de Pronóstico (R3.2.1)</CardTitle>
            </CardHeader>
            <CardContent>
              <TorCard />
            </CardContent>
          </Card>

          {retiros && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Métrica de pronóstico — retiros vs objetivo ({MESES[retiros.mes]} {retiros.anio})
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                {(["cervezas", "aguas", "ung"] as const).map((cat) => (
                  <div key={cat} className="rounded-md border p-3">
                    <p className="text-sm font-semibold capitalize">{cat}</p>
                    <p className="text-2xl font-bold">
                      {retiros.cumplimiento?.[cat] != null ? fmtPct(Number(retiros.cumplimiento[cat])) : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Number(retiros.retirado?.[cat] ?? 0).toLocaleString("es-AR")} /{" "}
                      {Number(retiros.objetivo?.[cat] ?? 0).toLocaleString("es-AR")} HL
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {canEdit && (
            <Card>
              <CardHeader><CardTitle className="text-base">Registrar reunión del mes</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label>Fecha</Label>
                    <Input type="date" value={reuForm.fecha} onChange={(e) => setReuForm((s) => ({ ...s, fecha: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Acta (link, opcional)</Label>
                    <Input value={reuForm.acta} onChange={(e) => setReuForm((s) => ({ ...s, acta: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Notas / decisiones</Label>
                  <Textarea rows={3} value={reuForm.notas} onChange={(e) => setReuForm((s) => ({ ...s, notas: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Asistentes (ventas + operaciones)</Label>
                  {asistentes.map((a, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2">
                      <Input className="w-56" placeholder="Nombre" value={a.nombre}
                        onChange={(e) => setAsistentes((s) => s.map((x, i) => i === idx ? { ...x, nombre: e.target.value } : x))} />
                      <Select value={a.area}
                        onValueChange={(v) => setAsistentes((s) => s.map((x, i) => i === idx ? { ...x, area: v as ReunionAsistente["area"] } : x))}>
                        <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="operaciones">Operaciones</SelectItem>
                          <SelectItem value="ventas">Ventas</SelectItem>
                          <SelectItem value="otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={a.presente ? "si" : "no"}
                        onValueChange={(v) => setAsistentes((s) => s.map((x, i) => i === idx ? { ...x, presente: v === "si" } : x))}>
                        <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="si">Presente</SelectItem>
                          <SelectItem value="no">Ausente</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="ghost" className="text-red-600"
                        onClick={() => setAsistentes((s) => s.filter((_, i) => i !== idx))}>✕</Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline"
                    onClick={() => setAsistentes((s) => [...s, { nombre: "", area: "operaciones", presente: true }])}>
                    + Agregar asistente
                  </Button>
                </div>
                <Button disabled={pending}
                  onClick={() => run(() => crearReunionPronostico({
                    fecha: reuForm.fecha, notas: reuForm.notas, acta_url: reuForm.acta, asistentes,
                  }), "Reunión registrada (métrica del momento adjunta)")}>
                  Registrar reunión
                </Button>
                <p className="text-xs text-muted-foreground">
                  Al registrar, se adjunta automáticamente la métrica del momento: % fuera de rango
                  (debajo/encima) y cumplimiento de retiros vs objetivo.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reuniones realizadas ({data.reuniones.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.reuniones.length === 0 && (
                <p className="text-sm text-muted-foreground">Todavía no hay reuniones registradas.</p>
              )}
              {data.reuniones.map((r) => {
                const fr = (r.metrica as { fuera_rango?: { pct_debajo?: number; pct_encima?: number } })?.fuera_rango
                const ret = (r.metrica as { retiros?: { cumplimiento?: Record<string, number> } })?.retiros
                return (
                  <div key={r.id} className="rounded-md border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">
                        {new Date(`${r.fecha}T12:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}
                      </p>
                      <div className="flex items-center gap-2">
                        {r.acta_url && (
                          <a href={r.acta_url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">Acta</a>
                        )}
                        {isAdmin && (
                          <Button size="sm" variant="ghost" className="text-red-600"
                            onClick={() => run(() => eliminarReunionPronostico(r.id), "Reunión eliminada")}>
                            Eliminar
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm">
                      {r.asistentes.map((a, i) => (
                        <Badge key={i} variant={a.presente ? "secondary" : "outline"}
                          className={a.presente ? "" : "line-through opacity-60"}>
                          {a.nombre} · {a.area}
                        </Badge>
                      ))}
                    </div>
                    {(fr || ret) && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {fr ? `Fuera de rango: ${fr.pct_debajo ?? "?"}% debajo · ${fr.pct_encima ?? "?"}% encima. ` : ""}
                        {ret?.cumplimiento
                          ? `Retiros: Cza ${ret.cumplimiento.cervezas ?? "?"}% · Aguas ${ret.cumplimiento.aguas ?? "?"}% · UNG ${ret.cumplimiento.ung ?? "?"}%.`
                          : ""}
                      </p>
                    )}
                    {r.notas && <p className="mt-2 text-sm">{r.notas}</p>}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
