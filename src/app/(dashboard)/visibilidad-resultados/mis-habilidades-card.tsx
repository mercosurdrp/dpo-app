"use client"

// Sección SKAP de la vista del empleado (R2.1.4): cómo lo evaluaron en cada
// habilidad de su puesto, contra el estándar, con el mismo semáforo que usa la
// matriz del supervisor en /gente/matriz-skap.

import { useState } from "react"
import { ChevronDown, GraduationCap, TrendingUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { COLOR_GAP, ESCALA_SKAP, LABEL_GAP } from "@/lib/skap/gap"
import type { SkapEmpleadoData, SkapHabilidadEmpleado, SkapRolEmpleado } from "@/types/database"

const fmtPct = (n: number) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}%`

function fmtFecha(fecha: string): string {
  return new Date(`${fecha}T00:00:00-03:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

export function MisHabilidadesCard({ data }: { data: SkapEmpleadoData }) {
  return (
    <>
      {data.roles.map((r) => (
        <RolCard key={r.rol} rol={r} varios={data.roles.length > 1} />
      ))}
    </>
  )
}

function RolCard({ rol, varios }: { rol: SkapRolEmpleado; varios: boolean }) {
  // Agrupa por bloque preservando el orden que trae la query (ORDER BY orden).
  const bloques: { nombre: string; items: SkapHabilidadEmpleado[] }[] = []
  for (const h of rol.habilidades) {
    const ultimo = bloques[bloques.length - 1]
    if (ultimo && ultimo.nombre === h.bloque) ultimo.items.push(h)
    else bloques.push({ nombre: h.bloque, items: [h] })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="size-5 text-indigo-600" />
          Mis habilidades{varios ? ` — ${rol.label}` : ""}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Última evaluación de tu supervisor — no cambia con el mes seleccionado.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {rol.evaluadas === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Todavía no te evaluaron en la matriz de habilidades de {rol.label.toLowerCase()}.
            Cuando tu supervisor te evalúe, vas a ver acá tu nivel en cada una.
          </p>
        ) : (
          <>
            <Resumen rol={rol} />
            {bloques.map((b) => (
              <div key={b.nombre}>
                <p className="mb-1 border-l-4 border-indigo-500 pl-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {b.nombre}
                </p>
                <div className="divide-y">
                  {b.items.map((h) => (
                    <HabilidadRow key={h.habilidad_id} h={h} />
                  ))}
                </div>
              </div>
            ))}
            <Leyenda />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Resumen({ rol }: { rol: SkapRolEmpleado }) {
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-3xl font-bold tabular-nums text-slate-900">
            {rol.pct_criticas === null ? "—" : fmtPct(rol.pct_criticas)}
          </p>
          <p className="text-xs text-muted-foreground">
            de tus habilidades críticas llegan al estándar
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>
            {rol.evaluadas} de {rol.total} evaluadas
          </p>
          {rol.gaps > 0 && (
            <p className="font-medium text-amber-700">
              {rol.gaps} {rol.gaps === 1 ? "habilidad a reforzar" : "habilidades a reforzar"}
            </p>
          )}
        </div>
      </div>
      {rol.pct_criticas !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${Math.min(100, rol.pct_criticas)}%` }}
          />
        </div>
      )}
    </div>
  )
}

function HabilidadRow({ h }: { h: SkapHabilidadEmpleado }) {
  const [abierto, setAbierto] = useState(false)
  const evaluada = h.estado !== "sin_evaluar" && h.estado !== "no_aplica"
  const critA = h.criticidad === "A"

  return (
    <div className="py-2">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={abierto}
      >
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
            critA ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"
          }`}
          title={critA ? "Habilidad crítica" : "Habilidad requerida"}
        >
          {h.criticidad}
        </span>
        <span className="min-w-0 flex-1 text-sm text-slate-800">{h.habilidad}</span>
        <span
          className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold tabular-nums ${COLOR_GAP[h.estado]}`}
          title={LABEL_GAP[h.estado]}
        >
          {evaluada ? `${h.nivel} / ${h.estandar}` : h.estado === "no_aplica" ? "NA" : "—"}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`}
        />
      </button>

      {abierto && (
        <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3 text-xs">
          {evaluada && h.nivel !== null ? (
            <>
              <p className="text-slate-700">
                <span className="font-semibold">Tu nivel {h.nivel}:</span> {ESCALA_SKAP[h.nivel]}
              </p>
              <p className="text-slate-600">
                <span className="font-semibold">Estándar del puesto: {h.estandar}</span>{" "}
                — {ESCALA_SKAP[h.estandar]}
              </p>
              <p className="font-medium text-slate-700">{LABEL_GAP[h.estado]}</p>
              {h.historial.length > 1 && <Evolucion historial={h.historial} />}
              {h.fecha_evaluacion && h.historial.length <= 1 && (
                <p className="text-slate-500">Evaluada el {fmtFecha(h.fecha_evaluacion)}</p>
              )}
            </>
          ) : (
            <p className="text-slate-600">
              {h.estado === "no_aplica"
                ? "Esta habilidad no aplica a tu puesto."
                : `Todavía sin evaluar. El estándar del puesto es ${h.estandar}: ${ESCALA_SKAP[h.estandar]}`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Evolucion({ historial }: { historial: { fecha: string; nivel: number | null }[] }) {
  const primero = historial[0]?.nivel
  const ultimo = historial[historial.length - 1]?.nivel
  const subio = primero !== null && ultimo !== null && ultimo > primero

  return (
    <div className="space-y-1 border-t border-slate-200 pt-2">
      <p className="flex items-center gap-1 font-semibold text-slate-700">
        Tu evolución
        {subio && <TrendingUp className="size-3.5 text-emerald-600" />}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {historial.map((e, i) => (
          <span key={`${e.fecha}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-slate-400">→</span>}
            <span className="rounded bg-white px-1.5 py-0.5 tabular-nums text-slate-700 ring-1 ring-slate-200">
              {e.nivel ?? "NA"}
            </span>
            <span className="text-[10px] text-slate-500">{fmtFecha(e.fecha)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function Leyenda() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="size-2.5 rounded-sm bg-emerald-500" /> Cumple el estándar
      </span>
      <span className="flex items-center gap-1">
        <span className="size-2.5 rounded-sm bg-amber-400" /> 1 nivel por debajo
      </span>
      <span className="flex items-center gap-1">
        <span className="size-2.5 rounded-sm bg-red-500" /> 2 o más por debajo
      </span>
    </div>
  )
}
