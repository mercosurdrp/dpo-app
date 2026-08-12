"use client"

import { useMemo, useState } from "react"
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Info,
  Plus,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DIMENSION_EN_CRIOLLO,
  DIMENSION_DISCONTINUADA,
  DIM_ENGAGEMENT,
  SEMAFORO_ETIQUETA,
  UMBRAL_VARIACION,
  semaforo,
} from "@/lib/clima-vocabulario"
import type {
  ClimaAnalisis,
  ClimaPlan,
  FilaComparada,
} from "@/actions/clima-tipos"
import type { FocoInicialPlan } from "./planes/planes-bloque"
import { CortesBloque } from "./cortes-bloque"
import { ComentariosBloque } from "./comentarios-bloque"

const SEMAFORO_COLOR: Record<string, string> = {
  verde: "bg-emerald-500",
  amarillo: "bg-amber-400",
  naranja: "bg-orange-500",
  rojo: "bg-red-500",
}

const SEMAFORO_TEXTO: Record<string, string> = {
  verde: "text-emerald-700",
  amarillo: "text-amber-700",
  naranja: "text-orange-700",
  rojo: "text-red-700",
}

const TODAS = "__todas__"

export function Delta({ delta }: { delta: number | null }) {
  if (delta == null) {
    return <span className="text-xs text-slate-400">sin base</span>
  }
  if (Math.abs(delta) < UMBRAL_VARIACION) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-500">
        <ArrowRight className="size-3" />
        {delta > 0 ? "+" : ""}
        {delta}
      </span>
    )
  }
  const sube = delta > 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
        sube ? "text-emerald-700" : "text-red-700"
      }`}
    >
      {sube ? (
        <ArrowUpRight className="size-3" />
      ) : (
        <ArrowDownRight className="size-3" />
      )}
      {sube ? "+" : ""}
      {delta}
    </span>
  )
}

/** Barra 0–100 con el color del semáforo de RRHH. */
function Barra({ valor }: { valor: number | null }) {
  if (valor == null) {
    return <div className="h-1.5 w-full rounded-full bg-slate-100" />
  }
  const s = semaforo(valor) ?? "rojo"
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100">
      <div
        className={`h-1.5 rounded-full ${SEMAFORO_COLOR[s]}`}
        style={{ width: `${valor}%` }}
      />
    </div>
  )
}

function FilaPregunta({
  fila,
  onCrearPlan,
  tienePlan,
}: {
  fila: FilaComparada
  onCrearPlan: (f: FilaComparada) => void
  tienePlan: boolean
}) {
  const s = semaforo(fila.valor)
  return (
    <div className="group flex items-center gap-3 border-b border-slate-100 py-2 last:border-0">
      <div className="w-10 shrink-0 text-right">
        <span
          className={`text-sm font-bold ${
            s ? SEMAFORO_TEXTO[s] : "text-slate-400"
          }`}
        >
          {fila.valor ?? "—"}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className="truncate text-sm text-slate-800"
            title={fila.texto}
          >
            {fila.etiqueta}
          </p>
          {tienePlan && (
            <Badge className="border-blue-200 bg-blue-50 text-[10px] text-blue-700">
              con plan
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-slate-500">{fila.dimensionNombre}</p>
      </div>
      <div className="w-24 shrink-0">
        <Barra valor={fila.valor} />
      </div>
      <div className="w-16 shrink-0 text-right">
        <Delta delta={fila.delta} />
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={() => onCrearPlan(fila)}
        title="Crear plan de acción sobre este ítem"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  )
}

interface Props {
  analisis: ClimaAnalisis
  planes: ClimaPlan[]
  onCrearPlan: (foco: FocoInicialPlan) => void
  /** El corte por equipo es nominal: solo lo ven RRHH y quienes conducen. */
  puedeVerEquipos: boolean
}

export function ResultadosBloque({
  analisis,
  planes,
  onCrearPlan,
  puedeVerEquipos,
}: Props) {
  const { ola, olaAnterior, dimensiones, preguntas, resumen } = analisis
  const [dimFiltro, setDimFiltro] = useState(TODAS)

  /** Ítems que ya tienen un plan cargado, para no duplicar esfuerzo. */
  const conPlan = useMemo(
    () => new Set(planes.map((p) => (p.pregunta ?? "").trim()).filter(Boolean)),
    [planes],
  )

  const crear = (f: FilaComparada) =>
    onCrearPlan({
      dimension: f.dimension,
      pregunta: f.texto,
      hallazgo:
        `${f.etiqueta}: ${f.valor ?? "—"} en ${ola.codigo}` +
        (f.anterior != null
          ? ` (${f.delta! > 0 ? "+" : ""}${f.delta} vs ${olaAnterior?.codigo})`
          : ""),
      ola_id: ola.id,
    })

  const preguntasFiltradas = useMemo(
    () =>
      dimFiltro === TODAS
        ? preguntas
        : preguntas.filter((p) => p.dimension === dimFiltro),
    [preguntas, dimFiltro],
  )

  const engagement = resumen.engagement
  const sem = semaforo(engagement)

  return (
    <div className="space-y-6">
      {/* ---------------- KPIs ---------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase text-slate-500">
              Índice de Engagement
            </p>
            <div className="flex items-baseline gap-2">
              <p
                className={`text-4xl font-bold ${
                  sem ? SEMAFORO_TEXTO[sem] : "text-slate-400"
                }`}
              >
                {engagement ?? "—"}
              </p>
              <Delta delta={resumen.engagementDelta} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {ola.codigo}
              {olaAnterior ? ` vs ${olaAnterior.codigo}` : ""}
              {sem ? ` · ${SEMAFORO_ETIQUETA[sem]}` : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase text-slate-500">
              Preguntas que suben
            </p>
            <p className="text-4xl font-bold text-emerald-600">
              {resumen.suben}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              de {resumen.comparables} comparables
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase text-slate-500">
              Preguntas que bajan
            </p>
            <p className="text-4xl font-bold text-red-600">{resumen.bajan}</p>
            <p className="mt-1 text-xs text-slate-500">
              {resumen.estables} sin cambios
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase text-slate-500">
              Respondentes
            </p>
            <p className="text-4xl font-bold text-slate-800">
              {ola.respondentes ?? "—"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {ola.respondentes == null
                ? "La planilla no lo publica: lo carga RRHH"
                : "personas que contestaron"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ---------------- Dimensiones ---------------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Dimensiones</CardTitle>
          <p className="text-xs text-slate-500">
            El Índice de Engagement lo calcula la consultora sobre las respuestas
            individuales: no es el promedio de sus preguntas y por eso puede no
            coincidir con ellas.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {dimensiones.map((d) => {
            const s = semaforo(d.valor)
            const esIndice = d.dimension === DIM_ENGAGEMENT
            return (
              <div
                key={d.dimension}
                className={`rounded-lg border p-3 ${
                  esIndice
                    ? "border-blue-200 bg-blue-50/50"
                    : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {d.etiqueta}
                    </p>
                    <p className="text-xs text-slate-500">
                      {DIMENSION_EN_CRIOLLO[d.dimension] ?? ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-2">
                    <span
                      className={`text-2xl font-bold ${
                        s ? SEMAFORO_TEXTO[s] : "text-slate-400"
                      }`}
                    >
                      {d.valor ?? "—"}
                    </span>
                    <Delta delta={d.delta} />
                  </div>
                </div>
                <div className="mt-2">
                  <Barra valor={d.valor} />
                </div>
                {d.dimension === DIMENSION_DISCONTINUADA && (
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700">
                    <Info className="mt-0.5 size-3 shrink-0" />
                    Dimensión discontinuada por la consultora: valía{" "}
                    {d.anterior} en {olaAnterior?.codigo} y ya no se mide. Los
                    temas que seguía (baños, oficinas, salas, refrigerios) siguen
                    apareciendo en los comentarios.
                  </p>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* ---------------- Dónde poner el foco ---------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Los puntajes más bajos
            </CardTitle>
            <p className="text-xs text-slate-500">
              Fijan el techo del Índice. Pasá el mouse y tocá + para abrir un
              plan de acción sobre el ítem.
            </p>
          </CardHeader>
          <CardContent>
            {resumen.masBajas.map((f) => (
              <FilaPregunta
                key={f.texto}
                fila={f}
                onCrearPlan={crear}
                tienePlan={conPlan.has(f.texto)}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {resumen.masCaen.length ? "Lo que más retrocede" : "Lo que más avanza"}
            </CardTitle>
            <p className="text-xs text-slate-500">
              {resumen.masCaen.length
                ? `Contra ${olaAnterior?.codigo ?? "la ola anterior"}.`
                : "Ninguna pregunta cae contra la ola anterior: se muestran las que más suben, para sostenerlas."}
            </p>
          </CardHeader>
          <CardContent>
            {(resumen.masCaen.length ? resumen.masCaen : resumen.masSuben).map(
              (f) => (
                <FilaPregunta
                  key={f.texto}
                  fila={f}
                  onCrearPlan={crear}
                  tienePlan={conPlan.has(f.texto)}
                />
              ),
            )}
            {!resumen.masCaen.length && !resumen.masSuben.length && (
              <p className="py-4 text-sm text-slate-500">
                No hay ola anterior para comparar.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------------- Todas las preguntas ---------------- */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
          <div>
            <CardTitle className="text-base">Todas las preguntas</CardTitle>
            <p className="text-xs text-slate-500">
              De menor a mayor puntaje. Las que cambiaron de redacción entre olas
              se cruzan igual.
            </p>
          </div>
          <Select value={dimFiltro} onValueChange={(v) => v && setDimFiltro(v)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas las dimensiones</SelectItem>
              {dimensiones
                .filter((d) => d.dimension !== DIM_ENGAGEMENT)
                .map((d) => (
                  <SelectItem key={d.dimension} value={d.dimension}>
                    {d.etiqueta}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {preguntasFiltradas.map((f) => (
            <FilaPregunta
              key={f.texto}
              fila={f}
              onCrearPlan={crear}
              tienePlan={conPlan.has(f.texto)}
            />
          ))}
        </CardContent>
      </Card>

      {/* ---------------- Cortes ---------------- */}
      <CortesBloque
        cortes={analisis.cortes}
        olaCodigo={ola.codigo}
        olaAnteriorCodigo={olaAnterior?.codigo ?? null}
        onCrearPlan={onCrearPlan}
        olaId={ola.id}
        puedeVerEquipos={puedeVerEquipos}
      />

      {/* ---------------- Comentarios ---------------- */}
      <ComentariosBloque
        comentarios={analisis.comentarios}
        olaCodigo={ola.codigo}
        puedeVerEquipos={puedeVerEquipos}
      />

      <p className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <Users className="mt-0.5 size-4 shrink-0" />
        <span>
          La encuesta no publica cuánta gente contestó cada corte. Con equipos de
          7 a 30 personas, <strong>una sola respuesta mueve entre 3 y 14
          puntos</strong>: los cortes chicos sirven para conversar con el equipo,
          no para rankear.
        </span>
      </p>
    </div>
  )
}
