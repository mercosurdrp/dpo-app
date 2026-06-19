"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  NIVEL_LABEL,
  RAMA_COLOR,
  RAMA_LABEL,
  type SuenoNodo,
  type SuenoRama,
} from "@/lib/sueno/arbol-config"
import { SuenoKpiCard } from "./sueno-kpi-card"
import { SuenoEditDialog } from "./sueno-edit-dialog"

const RAMA_ORDEN: SuenoRama[] = ["seguridad", "productividad", "cliente"]
const NIVELES_HIJOS = ["gestion", "operacional", "estacion"] as const

export function ArbolSueno({
  nodos,
  editable,
  anio,
}: {
  nodos: SuenoNodo[]
  editable: boolean
  anio: number
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(true)
  const [editNodo, setEditNodo] = useState<SuenoNodo | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const estrategicos = useMemo(
    () =>
      [...nodos.filter((n) => n.nivel === "estrategia")].sort(
        (a, b) => RAMA_ORDEN.indexOf(a.rama) - RAMA_ORDEN.indexOf(b.rama),
      ),
    [nodos],
  )

  const porNivel = useMemo(() => {
    const map: Record<string, SuenoNodo[]> = {}
    for (const niv of NIVELES_HIJOS) {
      map[niv] = nodos
        .filter((n) => n.nivel === niv)
        .sort((a, b) => RAMA_ORDEN.indexOf(a.rama) - RAMA_ORDEN.indexOf(b.rama))
    }
    return map
  }, [nodos])

  function openEdit(n: SuenoNodo) {
    setEditNodo(n)
    setDialogOpen(true)
  }

  return (
    <section className="mb-6">
      {/* Encabezado del Sueño */}
      <Card className="overflow-hidden border-slate-200 p-0 gap-0">
        <div className="bg-gradient-to-r from-[#0a1628] to-[#1a2d52] px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 size-5 shrink-0 text-amber-300" />
              <div>
                <h2 className="text-lg font-bold">El Sueño {anio}</h2>
                <p className="mt-1 max-w-4xl text-sm leading-snug text-slate-200">
                  Soñamos con ser la empresa que marque la diferencia en nuestro
                  rubro, liderando con excelencia operativa, pasión y
                  profesionalismo en cada área. Lo medimos a través del
                  compromiso en la seguridad de las personas{" "}
                  <strong className="text-orange-300">(TRI)</strong>, la
                  eficiencia en nuestros costos logísticos{" "}
                  <strong className="text-blue-300">(VLC/HL)</strong> y la
                  satisfacción de nuestros clientes{" "}
                  <strong className="text-amber-300">(OTIF)</strong>.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAbierto((v) => !v)}
              className="shrink-0 text-white hover:bg-white/10 hover:text-white"
            >
              {abierto ? (
                <>
                  Ocultar <ChevronUp className="ml-1 size-4" />
                </>
              ) : (
                <>
                  Ver indicadores <ChevronDown className="ml-1 size-4" />
                </>
              )}
            </Button>
          </div>

          {/* Leyenda de ramas */}
          <div className="mt-3 flex flex-wrap gap-3">
            {RAMA_ORDEN.map((r) => (
              <span key={r} className="flex items-center gap-1.5 text-xs text-slate-200">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: RAMA_COLOR[r] }}
                />
                {RAMA_LABEL[r]}
              </span>
            ))}
          </div>
        </div>

        {abierto && (
          <div className="space-y-5 p-5">
            {/* KPIs estratégicos (Resultados) */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {NIVEL_LABEL.estrategia}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {estrategicos.map((n) => (
                  <SuenoKpiCard
                    key={n.key}
                    nodo={n}
                    editable={editable}
                    destacado
                    onEdit={openEdit}
                  />
                ))}
              </div>
            </div>

            {/* Resto de niveles en cascada */}
            {NIVELES_HIJOS.map((niv) => (
              <div key={niv}>
                <div className="mb-2 flex items-center gap-2">
                  <ChevronDown className="size-4 text-slate-300" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {NIVEL_LABEL[niv]}
                  </p>
                </div>
                <div
                  className={cn(
                    "grid grid-cols-2 gap-3 sm:grid-cols-3",
                    "lg:grid-cols-4 xl:grid-cols-5",
                  )}
                >
                  {porNivel[niv].map((n) => (
                    <SuenoKpiCard
                      key={n.key}
                      nodo={n}
                      editable={editable}
                      onEdit={openEdit}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editable && (
        <SuenoEditDialog
          nodo={editNodo}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSaved={() => router.refresh()}
        />
      )}
    </section>
  )
}
