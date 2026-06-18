"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { toast } from "sonner"
import { Sparkles, Award, CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { enviarIdeaPortal } from "@/actions/buenas-practicas"
import type { BpIdea, BpArea, BpCategoria } from "@/types/buenas-practicas"
import {
  BP_AREA_LABEL,
  BP_CATEGORIA_LABEL,
  BP_ESTADO_LABEL,
} from "@/types/buenas-practicas"

const AREAS: BpArea[] = ["almacen", "entrega", "flota", "gestion", "seguridad", "otro"]
const CATEGORIAS: BpCategoria[] = [
  "seguridad",
  "calidad",
  "productividad",
  "capacidad",
  "otro",
]

function fecha(iso: string | null): string {
  if (!iso) return "—"
  try {
    return format(new Date(iso), "dd/MM/yyyy", { locale: es })
  } catch {
    return iso
  }
}

export function MisBuenasPracticasClient({ ideas }: { ideas: BpIdea[] }) {
  const router = useRouter()
  const [titulo, setTitulo] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [area, setArea] = useState<BpArea>("almacen")
  const [categoria, setCategoria] = useState<BpCategoria>("productividad")
  const [saving, startSaving] = useTransition()

  function enviar() {
    if (!titulo.trim()) {
      toast.error("Contanos tu idea")
      return
    }
    startSaving(async () => {
      const r = await enviarIdeaPortal({ titulo, descripcion, area, categoria })
      if ("error" in r) toast.error(r.error)
      else {
        toast.success("¡Gracias! Tu idea fue enviada.")
        setTitulo("")
        setDescripcion("")
        router.refresh()
      }
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Sparkles className="size-6 text-amber-500" />
          Buenas Prácticas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ¿Tenés una idea para mejorar el trabajo en almacén, entrega o flota? Compartila
          acá. Buscamos ideas que mejoren la seguridad, la calidad, la productividad o la
          capacidad. Las revisamos, te damos una respuesta y reconocemos las mejores.
        </p>
      </div>

      {/* Formulario */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <Label htmlFor="mi-titulo">Mi idea *</Label>
            <Input
              id="mi-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Resumila en una frase"
            />
          </div>
          <div>
            <Label htmlFor="mi-desc">Detalle</Label>
            <Textarea
              id="mi-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="¿Qué proponés? ¿Qué problema soluciona?"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Área</Label>
              <select
                value={area}
                onChange={(e) => setArea(e.target.value as BpArea)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {BP_AREA_LABEL[a]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Mejora</Label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as BpCategoria)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {BP_CATEGORIA_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={enviar} disabled={saving}>
              <Sparkles className="size-4" /> Enviar idea
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Mis ideas enviadas */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Mis ideas enviadas ({ideas.length})
        </h2>
        {ideas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no enviaste ninguna idea. ¡Animate!
          </p>
        ) : (
          <div className="space-y-2">
            {ideas.map((idea) => (
              <Card key={idea.id}>
                <CardContent className="space-y-1 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-slate-900">{idea.titulo}</span>
                    <Badge variant="outline">{BP_ESTADO_LABEL[idea.estado]}</Badge>
                    {idea.reconocido && (
                      <Badge variant="outline" className="gap-1 text-amber-700">
                        <Award className="size-3" /> Reconocida
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {BP_AREA_LABEL[idea.area]} · {BP_CATEGORIA_LABEL[idea.categoria]} ·{" "}
                    {fecha(idea.created_at)}
                  </p>
                  {idea.comentario_revision && (
                    <p className="text-xs">
                      <span className="font-semibold">Respuesta:</span>{" "}
                      {idea.comentario_revision}
                    </p>
                  )}
                  {idea.reconocido && idea.reconocimiento && (
                    <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-1.5 text-xs text-amber-800">
                      <Award className="mt-0.5 size-3.5 shrink-0" />
                      <span>{idea.reconocimiento}</span>
                    </p>
                  )}
                  {idea.kpi_nombre && idea.kpi_logrado != null && (
                    <p className="flex items-center gap-1 text-xs text-emerald-700">
                      <CheckCircle2 className="size-3.5" /> Mejoró {idea.kpi_nombre}:{" "}
                      {idea.kpi_linea_base ?? "—"} → {idea.kpi_logrado} {idea.kpi_unidad ?? ""}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
