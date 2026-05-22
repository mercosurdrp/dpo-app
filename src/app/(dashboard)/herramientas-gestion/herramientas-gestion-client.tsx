"use client"

import { useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Wrench, ClipboardList } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { HERRAMIENTA_GESTION_TIPOS, HERRAMIENTA_GESTION_LABELS } from "@/lib/herramientas-gestion"
import { HerramientaGestionView } from "@/components/herramientas-gestion/herramienta-gestion-view"
import type { HerramientaGestionConContexto, HerramientaGestionTipo } from "@/types/database"

interface Props {
  items: HerramientaGestionConContexto[]
}

export function HerramientasGestionClient({ items }: Props) {
  const [filtro, setFiltro] = useState<HerramientaGestionTipo | "all">("all")
  const [verHerramienta, setVerHerramienta] = useState<HerramientaGestionConContexto | null>(null)

  const filtrados = filtro === "all" ? items : items.filter((i) => i.tipo === filtro)

  function contarTipo(tipo: HerramientaGestionTipo): number {
    return items.filter((i) => i.tipo === tipo).length
  }

  function formatFecha(iso: string | null): string {
    if (!iso) return "—"
    try {
      return format(new Date(iso), "dd/MM/yyyy", { locale: es })
    } catch {
      return iso
    }
  }

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Herramientas de Gestión</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Análisis de calidad aplicados a tareas y planes: 5 Porqués, Causa-Efecto (Ishikawa) y PDCA.
          Aquí se listan todos los análisis registrados sobre cualquier plan o tarea.
        </p>
      </div>

      {/* Chips de filtro por tipo */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFiltro("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            filtro === "all"
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Todas
          <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-white/20 px-1.5 text-[10px] font-semibold">
            {items.length}
          </span>
        </button>
        {HERRAMIENTA_GESTION_TIPOS.map((tipo) => {
          const count = contarTipo(tipo)
          return (
            <button
              key={tipo}
              onClick={() => setFiltro(tipo)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filtro === tipo
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {HERRAMIENTA_GESTION_LABELS[tipo]}
              <span
                className={`ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                  filtro === tipo ? "bg-white/20" : "bg-slate-200"
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Lista de tarjetas */}
      {filtrados.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
          <ClipboardList className="h-14 w-14 text-muted-foreground/40" />
          <h2 className="text-lg font-semibold text-slate-700">
            {items.length === 0
              ? "Todavía no hay herramientas registradas"
              : "No hay resultados para este filtro"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {items.length === 0
              ? "Las herramientas de gestión se aplican desde el detalle de cada tarea o plan."
              : "Probá seleccionando otra categoría."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map((item) => (
            <Card key={item.id} className="transition-colors hover:bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    {/* Tipo + contexto */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        <Wrench className="mr-1 h-3 w-3" />
                        {HERRAMIENTA_GESTION_LABELS[item.tipo]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {item.reunion_actividad_id
                          ? `Reunión${item.reunion_tipo ? ` (${item.reunion_tipo})` : ""}${
                              item.actividad_descripcion
                                ? ` · ${item.actividad_descripcion.slice(0, 50)}`
                                : ""
                            }`
                          : item.plan_pilar_nombre && item.plan_pregunta_numero
                            ? `Pilar: ${item.plan_pilar_nombre} · Pregunta ${item.plan_pregunta_numero}`
                            : "Tarea"}
                      </span>
                    </div>

                    {/* Título */}
                    <p className="text-sm font-medium text-slate-800">
                      {item.titulo}
                    </p>

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {item.autor_nombre && (
                        <span>
                          Autor:{" "}
                          <span className="font-medium text-slate-700">
                            {item.autor_nombre}
                          </span>
                        </span>
                      )}
                      <span>{formatFecha(item.created_at ?? null)}</span>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={
                        item.plan_id
                          ? `/planes/${item.plan_id}`
                          : `/reuniones/${item.reunion_id}`
                      }
                    >
                      <Button variant="ghost" size="sm" className="text-xs">
                        {item.plan_id ? "Ir a la tarea" : "Ir a la reunión"}
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => setVerHerramienta(item)}
                    >
                      Ver
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de vista */}
      <Dialog
        open={verHerramienta !== null}
        onOpenChange={(o) => !o && setVerHerramienta(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {verHerramienta
                ? HERRAMIENTA_GESTION_LABELS[verHerramienta.tipo]
                : "Herramienta de gestión"}
            </DialogTitle>
          </DialogHeader>
          {verHerramienta && (
            <HerramientaGestionView herramienta={verHerramienta} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
