"use client"

import { useMemo, useState } from "react"
import { MessageSquare, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ClimaComentario } from "@/actions/clima-tipos"

const TODAS = "__todas__"
const TANDA = 30

/** Las dos preguntas abiertas, acortadas para el filtro. */
function preguntaCorta(p: string): string {
  const t = p.toLocaleLowerCase("es-AR")
  if (t.includes("más le gusta") || t.includes("mas le gusta")) {
    return "Lo que más gusta"
  }
  if (t.includes("cambio")) return "Qué cambiarían"
  return p.length > 40 ? `${p.slice(0, 40)}…` : p
}

export function ComentariosBloque({
  comentarios,
  olaCodigo,
  puedeVerEquipos,
}: {
  comentarios: ClimaComentario[]
  olaCodigo: string
  /**
   * Mostrar de qué equipo salió un comentario achica el anonimato: en un
   * equipo de 7 personas es media pista. Solo se muestra a RRHH y a quienes
   * conducen, que son los que lo usan para la devolución.
   */
  puedeVerEquipos: boolean
}) {
  const [busqueda, setBusqueda] = useState("")
  const [pregunta, setPregunta] = useState(TODAS)
  const [visibles, setVisibles] = useState(TANDA)

  /**
   * La consultora manda los mismos textos dos veces: una vez en la hoja por
   * distribuidora y otra en la hoja por jefe. Se muestran los de la hoja por
   * distribuidora (están todos) y el equipo se usa solo como dato de contexto.
   */
  const porJefe = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of comentarios) {
      if (c.corte_tipo === "jefe") m.set(`${c.pregunta}|${c.respuesta}`, c.corte)
    }
    return m
  }, [comentarios])

  const base = useMemo(
    () => comentarios.filter((c) => c.corte_tipo === "total"),
    [comentarios],
  )

  const preguntas = useMemo(
    () => [...new Set(base.map((c) => c.pregunta))],
    [base],
  )

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase("es-AR")
    return base.filter(
      (c) =>
        (pregunta === TODAS || c.pregunta === pregunta) &&
        (!q || c.respuesta.toLocaleLowerCase("es-AR").includes(q)),
    )
  }, [base, busqueda, pregunta])

  if (!base.length) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="size-4 text-blue-600" />
          Lo que escribió la gente ({base.length} respuestas de {olaCodigo})
        </CardTitle>
        <p className="text-xs text-slate-500">
          Textual, sin editar. Es anónimo: la encuesta no informa quién escribió
          cada comentario.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value)
                setVisibles(TANDA)
              }}
              placeholder="Buscar en los comentarios…"
              className="pl-8"
            />
          </div>
          <Select
            value={pregunta}
            onValueChange={(v) => {
              if (!v) return
              setPregunta(v)
              setVisibles(TANDA)
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Las dos preguntas</SelectItem>
              {preguntas.map((p) => (
                <SelectItem key={p} value={p}>
                  {preguntaCorta(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filtrados.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            Ningún comentario coincide con la búsqueda.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {filtrados.slice(0, visibles).map((c, i) => {
                const equipo = puedeVerEquipos
                  ? porJefe.get(`${c.pregunta}|${c.respuesta}`)
                  : undefined
                return (
                  <div
                    key={`${c.respuesta}-${i}`}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <p className="text-sm text-slate-800">{c.respuesta}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge className="border-slate-200 bg-slate-50 text-[10px] text-slate-600">
                        {preguntaCorta(c.pregunta)}
                      </Badge>
                      {equipo && (
                        <span className="text-[11px] text-slate-400">
                          equipo de {equipo}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {visibles < filtrados.length && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setVisibles((v) => v + TANDA)}
              >
                Ver más ({filtrados.length - visibles} restantes)
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
