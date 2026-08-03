"use client"

import { abrirArchivo } from "@/lib/abrir-archivo"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Download, Loader2, PencilLine } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { getHerramientaPdfUrl, guardarCampoPdca } from "@/actions/herramientas-gestion"
import type {
  HerramientaGestion,
  HerramientaGestionConContexto,
  CincoPorquesContenido,
  CausaEfectoContenido,
  PdcaCampoEditable,
  PdcaContenido,
} from "@/types/database"
import { HERRAMIENTA_GESTION_LABELS } from "@/lib/herramientas-gestion"
import { PdcaRevisionesMensuales } from "@/components/herramientas-gestion/pdca-revisiones-mensuales"

interface Props {
  herramienta: HerramientaGestion | HerramientaGestionConContexto
}

// ─── helpers ────────────────────────────────────────────────────────────────

function Campo({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{value}</p>
    </div>
  )
}

// ─── vistas por tipo ─────────────────────────────────────────────────────────

function CincoPorquesView({ c }: { c: CincoPorquesContenido }) {
  return (
    <div className="space-y-4">
      <Campo label="Problema inicial" value={c.problema} />

      {c.porques.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Cascada de &quot;¿Por qué?&quot;
          </p>
          <ol className="space-y-2">
            {c.porques.map((p, i) => (
              <li
                key={i}
                className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"
              >
                <p className="font-medium text-slate-600">
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-slate-700 text-white text-xs mr-2">
                    {i + 1}
                  </span>
                  {p.pregunta || `¿Por qué ${i + 1}?`}
                </p>
                {p.respuesta ? (
                  <p className="mt-1.5 ml-7 text-slate-800 whitespace-pre-wrap">
                    {p.respuesta}
                  </p>
                ) : (
                  <p className="mt-1.5 ml-7 text-slate-400 italic">
                    Sin respuesta registrada.
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {c.causa_raiz && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">
            Causa raíz identificada
          </p>
          <p className="text-sm text-amber-900 whitespace-pre-wrap">
            {c.causa_raiz}
          </p>
        </div>
      )}

      {c.contramedida && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-1">
            Contramedida propuesta
          </p>
          <p className="text-sm text-emerald-900 whitespace-pre-wrap">
            {c.contramedida}
          </p>
        </div>
      )}
    </div>
  )
}

function CausaEfectoView({ c }: { c: CausaEfectoContenido }) {
  const categoriasConCausas = c.categorias.filter((cat) => cat.causas.length > 0)

  return (
    <div className="space-y-4">
      <Campo label="Efecto / problema observado" value={c.efecto} />
      {c.problema && <Campo label="Contexto adicional" value={c.problema} />}

      {categoriasConCausas.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Causas por categoría (6M)
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {categoriasConCausas.map((cat) => (
              <div
                key={cat.nombre}
                className="rounded-md border border-slate-200 bg-slate-50 p-3"
              >
                <p className="text-xs font-semibold text-slate-700 mb-1.5">
                  {cat.nombre}
                </p>
                <ul className="space-y-1">
                  {cat.causas.map((causa, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-slate-700">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                      <span className="whitespace-pre-wrap">{causa}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {c.causa_raiz && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">
            Causa raíz priorizada
          </p>
          <p className="text-sm text-amber-900 whitespace-pre-wrap">
            {c.causa_raiz}
          </p>
        </div>
      )}

      {c.contramedida && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-1">
            Contraacción
          </p>
          <p className="text-sm text-emerald-900 whitespace-pre-wrap">
            {c.contramedida}
          </p>
        </div>
      )}
    </div>
  )
}

/** Banda a dos columnas para los pasos de análisis (observación y causas).
 *  Parte el texto por párrafos: cada bloque queda en su propia tarjeta. */
function BandaAnalisis({
  letra,
  titulo,
  subtitulo,
  texto,
  color,
}: {
  letra: string
  titulo: string
  subtitulo: string
  texto: string
  color: {
    badge: string
    borde: string
    fondo: string
    item: string
    texto: string
  }
}) {
  const bloques = texto
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  if (bloques.length === 0) return null

  return (
    <div className={`rounded-lg border-2 ${color.borde} ${color.fondo} overflow-hidden`}>
      <div className={`flex items-center gap-2 border-b ${color.borde} bg-white/60 px-3 py-2`}>
        <span
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${color.badge}`}
        >
          {letra}
        </span>
        <div>
          <p className={`text-sm font-bold leading-tight ${color.texto}`}>{titulo}</p>
          <p className="text-[11px] leading-tight text-slate-500">{subtitulo}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 p-3 md:grid-cols-2">
        {bloques.map((bloque, i) => (
          <p
            key={i}
            className={`rounded-md border ${color.item} bg-white/70 p-2 whitespace-pre-wrap text-sm leading-snug text-slate-800`}
          >
            {bloque}
          </p>
        ))}
      </div>
    </div>
  )
}

/** Un cuadrante del ciclo. Con `edicion` suma el lápiz para completarlo. */
function Cuadrante({
  n,
  letra,
  titulo,
  subtitulo,
  color,
  items,
  edicion,
}: {
  n: number
  letra: string
  titulo: string
  subtitulo: string
  color: { badge: string; borde: string; fondo: string; texto: string }
  items: { label: string; value: string }[]
  edicion?: {
    valor: string
    placeholder: string
    onGuardar: (texto: string) => Promise<boolean>
  }
}) {
  const conDatos = items.filter((i) => !!i.value?.trim())
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState("")
  const [guardando, setGuardando] = useState(false)

  function abrir() {
    if (!edicion) return
    setBorrador(edicion.valor)
    setEditando(true)
  }

  async function guardar() {
    if (!edicion) return
    setGuardando(true)
    try {
      if (await edicion.onGuardar(borrador)) setEditando(false)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      className={`flex flex-col rounded-lg border-2 ${color.borde} ${color.fondo} overflow-hidden`}
    >
      <div
        className={`flex items-center gap-2 border-b ${color.borde} bg-white/60 px-3 py-2`}
      >
        <span
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${color.badge}`}
        >
          {letra}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-bold leading-tight ${color.texto}`}>
            {n}. {titulo}
          </p>
          <p className="text-[11px] leading-tight text-slate-500">{subtitulo}</p>
        </div>
        {edicion && !editando && (
          <button
            type="button"
            onClick={abrir}
            title={`Editar ${titulo}`}
            className="ml-auto shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
          >
            <PencilLine className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {editando && edicion && (
        <div className="space-y-2 p-3">
          <Textarea
            autoFocus
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            placeholder={edicion.placeholder}
            rows={5}
            className="bg-white text-sm"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={guardando}
              onClick={guardar}
            >
              {guardando && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Guardar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={guardando}
              onClick={() => setEditando(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {!editando && (
        <div className="flex-1 space-y-3 p-3">
          {conDatos.length === 0 ? (
            edicion ? (
              <button
                type="button"
                onClick={abrir}
                className="text-xs italic text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
              >
                Sin datos registrados — cargar
              </button>
            ) : (
              <p className="text-xs italic text-slate-400">Sin datos registrados.</p>
            )
          ) : (
            conDatos.map((item) => (
              <div key={item.label}>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${color.texto} opacity-70`}
                >
                  {item.label}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-snug text-slate-800">
                  {item.value}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function PdcaView({
  c: contenidoInicial,
  herramienta,
}: {
  c: PdcaContenido
  herramienta: HerramientaGestion
}) {
  const router = useRouter()
  // El contenido se edita cuadrante a cuadrante, así que la vista se queda con
  // lo último que devolvió el server en vez de esperar al refresh.
  const [c, setC] = useState<PdcaContenido>(contenidoInicial)

  async function guardarCampo(campo: PdcaCampoEditable, texto: string): Promise<boolean> {
    const r = await guardarCampoPdca(herramienta.id, campo, texto)
    if ("error" in r) {
      toast.error(r.error)
      return false
    }
    setC(r.data)
    toast.success("Cuadrante actualizado")
    router.refresh()
    return true
  }

  const e = c.encuadre
  const tieneEncuadre = !!(
    e?.objetivo_estrategico?.trim() ||
    e?.kpi_meta?.trim() ||
    e?.equipo?.trim() ||
    e?.sdca_notas?.trim() ||
    e?.sdca_verificado
  )

  const cuadrantes = [
    {
      n: 1,
      letra: "P",
      titulo: "PLAN",
      subtitulo: "Planificar",
      color: {
        badge: "bg-blue-600",
        borde: "border-blue-200",
        fondo: "bg-blue-50/40",
        texto: "text-blue-800",
      },
      items: [
        { label: "Problema", value: c.plan?.problema ?? "" },
        { label: "Brechas", value: c.plan?.brechas ?? "" },
        { label: "Objetivos", value: c.plan?.objetivos ?? "" },
      ],
    },
    {
      n: 2,
      letra: "D",
      titulo: "HACER",
      subtitulo: "Ejecutar",
      color: {
        badge: "bg-emerald-600",
        borde: "border-emerald-200",
        fondo: "bg-emerald-50/40",
        texto: "text-emerald-800",
      },
      items: [
        {
          label: "Acciones implementadas · R4.3.5",
          value: c.hacer?.acciones ?? "",
        },
      ],
      edicion: {
        valor: c.hacer?.acciones ?? "",
        placeholder: "¿Qué acciones concretas se ejecutaron o se ejecutarán?",
        onGuardar: (texto: string) => guardarCampo("hacer", texto),
      },
    },
    {
      n: 3,
      letra: "C",
      titulo: "VERIFICAR",
      subtitulo: "Controlar",
      color: {
        badge: "bg-amber-500",
        borde: "border-amber-200",
        fondo: "bg-amber-50/40",
        texto: "text-amber-800",
      },
      items: [
        { label: "Resultados observados", value: c.verificar?.resultados ?? "" },
      ],
      edicion: {
        valor: c.verificar?.resultados ?? "",
        placeholder: "¿Qué resultados se obtuvieron? ¿Se alcanzaron los objetivos?",
        onGuardar: (texto: string) => guardarCampo("verificar", texto),
      },
    },
    {
      n: 4,
      letra: "A",
      titulo: "ACTUAR",
      subtitulo: "Estandarizar",
      color: {
        badge: "bg-rose-600",
        borde: "border-rose-200",
        fondo: "bg-rose-50/40",
        texto: "text-rose-800",
      },
      items: [
        {
          label: "Estandarización y próximos pasos · R4.3.6",
          value: c.actuar?.estandarizacion ?? "",
        },
      ],
      edicion: {
        valor: c.actuar?.estandarizacion ?? "",
        placeholder: "¿Cómo se estandariza lo aprendido? ¿Qué queda pendiente o se repite?",
        onGuardar: (texto: string) => guardarCampo("actuar", texto),
      },
    },
  ]

  return (
    <div className="space-y-3">
      {/* Encuadre: la ficha de arriba, no un bloque más del ciclo */}
      {tieneEncuadre && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            {e?.kpi_meta?.trim() && (
              <div className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 sm:max-w-[16rem]">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  KPI y meta
                </p>
                <p className="mt-0.5 text-sm font-semibold leading-snug text-slate-900">
                  {e.kpi_meta}
                </p>
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-2">
              {e?.objetivo_estrategico?.trim() && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Objetivo estratégico · R4.3.1
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-snug text-slate-800">
                    {e.objetivo_estrategico}
                  </p>
                </div>
              )}
              {e?.equipo?.trim() && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Equipo
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-snug text-slate-800">
                    {e.equipo}
                  </p>
                </div>
              )}
            </div>
          </div>
          {(e?.sdca_notas?.trim() || e?.sdca_verificado) && (
            <div
              className={`mt-3 flex gap-2 rounded-md border px-3 py-2 ${
                e?.sdca_verificado
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              {e?.sdca_verificado ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              )}
              <div className="min-w-0">
                <p
                  className={`text-xs font-semibold ${
                    e?.sdca_verificado ? "text-emerald-800" : "text-amber-800"
                  }`}
                >
                  Checklist SDCA previo · R4.3.2 —{" "}
                  {e?.sdca_verificado ? "verificado" : "pendiente de verificar"}
                </p>
                {e?.sdca_notas?.trim() && (
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-snug text-slate-700">
                    {e.sdca_notas}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Observación y causas: bandas propias a dos columnas. Son los dos pasos
          con más texto y, dentro del cuadrante PLAN, lo dejaban cuatro veces
          más alto que los otros tres. */}
      <BandaAnalisis
        letra="O"
        titulo="Observación · R4.3.3"
        subtitulo="El problema partido en problemas menores"
        texto={c.plan?.observacion ?? ""}
        color={{
          badge: "bg-indigo-600",
          borde: "border-indigo-200",
          fondo: "bg-indigo-50/40",
          item: "border-indigo-100",
          texto: "text-indigo-800",
        }}
      />
      <BandaAnalisis
        letra="?"
        titulo="Análisis de causas · R4.3.4"
        subtitulo="Causas raíz conectadas al problema"
        texto={c.plan?.causas ?? ""}
        color={{
          badge: "bg-violet-600",
          borde: "border-violet-200",
          fondo: "bg-violet-50/40",
          item: "border-violet-100",
          texto: "text-violet-800",
        }}
      />

      {/* El ciclo, en cuadrantes */}
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
        {cuadrantes.map((q) => (
          <Cuadrante key={q.letra} {...q} />
        ))}
      </div>

      {/* Revisiones: un renglón por mes, cargable desde acá mismo */}
      <PdcaRevisionesMensuales
        herramientaId={herramienta.id}
        contenido={c}
        desde={herramienta.created_at}
      />
    </div>
  )
}

// ─── componente principal ────────────────────────────────────────────────────

export function HerramientaGestionView({ herramienta }: Props) {
  const conContexto = herramienta as HerramientaGestionConContexto
  const [descargando, setDescargando] = useState(false)

  async function descargarPdf() {
    setDescargando(true)
    try {
      const r = await getHerramientaPdfUrl(herramienta.id)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      abrirArchivo(r.data.url)
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-slate-800 leading-snug">
            {herramienta.titulo}
          </h3>
          {conContexto.plan_titulo && (
            <p className="mt-0.5 text-xs text-slate-500">
              Plan:{" "}
              {conContexto.plan_pilar_nombre && (
                <span className="font-medium text-slate-600">
                  {conContexto.plan_pilar_nombre} ·{" "}
                </span>
              )}
              {conContexto.plan_pregunta_numero !== null && (
                <span>Pregunta {conContexto.plan_pregunta_numero} · </span>
              )}
              {conContexto.plan_titulo}
            </p>
          )}
          {conContexto.actividad_descripcion && (
            <p className="mt-0.5 text-xs text-slate-500">
              Actividad de reunión
              {conContexto.reunion_tipo ? ` (${conContexto.reunion_tipo})` : ""}:{" "}
              {conContexto.actividad_descripcion}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge variant="outline" className="text-xs">
            {HERRAMIENTA_GESTION_LABELS[herramienta.tipo]}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={descargarPdf}
            disabled={descargando}
          >
            {descargando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            PDF
          </Button>
        </div>
      </div>

      <Separator />

      {/* Contenido según tipo */}
      {herramienta.tipo === "cinco_porques" && (
        <CincoPorquesView
          c={herramienta.contenido as CincoPorquesContenido}
        />
      )}
      {herramienta.tipo === "causa_efecto" && (
        <CausaEfectoView
          c={herramienta.contenido as CausaEfectoContenido}
        />
      )}
      {herramienta.tipo === "pdca" && (
        <PdcaView
          c={herramienta.contenido as PdcaContenido}
          herramienta={herramienta}
        />
      )}

      {/* Pie */}
      {conContexto.autor_nombre && (
        <>
          <Separator />
          <p className="text-xs text-slate-400">
            Creado por{" "}
            <span className="font-medium text-slate-600">
              {conContexto.autor_nombre}
            </span>
          </p>
        </>
      )}
    </div>
  )
}
