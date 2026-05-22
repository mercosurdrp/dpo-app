"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { getHerramientaPdfUrl } from "@/actions/herramientas-gestion"
import type {
  HerramientaGestion,
  HerramientaGestionConContexto,
  CincoPorquesContenido,
  CausaEfectoContenido,
  PdcaContenido,
} from "@/types/database"
import { HERRAMIENTA_GESTION_LABELS } from "@/lib/herramientas-gestion"

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
    </div>
  )
}

function PdcaView({ c }: { c: PdcaContenido }) {
  const secciones = [
    {
      badge: "P",
      label: "PLAN — Planificar",
      badgeColor: "bg-blue-600",
      borderColor: "border-blue-200",
      bgColor: "bg-blue-50/40",
      textColor: "text-blue-800",
      items: [
        { label: "Problema", value: c.plan.problema },
        { label: "Brechas", value: c.plan.brechas },
        { label: "Objetivos", value: c.plan.objetivos },
        { label: "Causas analizadas", value: c.plan.causas },
      ],
    },
    {
      badge: "H",
      label: "HACER — Ejecutar",
      badgeColor: "bg-emerald-600",
      borderColor: "border-emerald-200",
      bgColor: "bg-emerald-50/40",
      textColor: "text-emerald-800",
      items: [{ label: "Acciones implementadas", value: c.hacer.acciones }],
    },
    {
      badge: "V",
      label: "VERIFICAR — Controlar",
      badgeColor: "bg-amber-500",
      borderColor: "border-amber-200",
      bgColor: "bg-amber-50/40",
      textColor: "text-amber-800",
      items: [{ label: "Resultados observados", value: c.verificar.resultados }],
    },
    {
      badge: "A",
      label: "ACTUAR — Estandarizar",
      badgeColor: "bg-rose-600",
      borderColor: "border-rose-200",
      bgColor: "bg-rose-50/40",
      textColor: "text-rose-800",
      items: [
        {
          label: "Estandarización y próximos pasos",
          value: c.actuar.estandarizacion,
        },
      ],
    },
  ]

  return (
    <div className="space-y-3">
      {secciones.map((s) => {
        const tieneContenido = s.items.some((item) => !!item.value)
        return (
          <div
            key={s.badge}
            className={`rounded-md border-2 ${s.borderColor} ${s.bgColor} overflow-hidden`}
          >
            <div
              className={`flex items-center gap-2 px-3 py-2 border-b ${s.borderColor}`}
            >
              <span
                className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold text-white ${s.badgeColor}`}
              >
                {s.badge}
              </span>
              <span className="text-sm font-semibold text-slate-700">
                {s.label}
              </span>
            </div>
            <div className="p-3 space-y-2">
              {!tieneContenido ? (
                <p className="text-xs text-slate-400 italic">Sin datos registrados.</p>
              ) : (
                s.items.map((item) =>
                  item.value ? (
                    <div key={item.label}>
                      <p className={`text-xs font-semibold uppercase tracking-wide ${s.textColor} opacity-70`}>
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">
                        {item.value}
                      </p>
                    </div>
                  ) : null,
                )
              )}
            </div>
          </div>
        )
      })}
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
      window.open(r.data.url, "_blank")
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
        <PdcaView c={herramienta.contenido as PdcaContenido} />
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
