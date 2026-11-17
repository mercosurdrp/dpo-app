"use client"

import { useState } from "react"
import { toast } from "sonner"
import { MessageSquarePlus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  agregarObservacionCruceNps,
  eliminarObservacionCruceNps,
  type CruceCliente,
  type CruceGrupo,
  type CruceObservacion,
  type RmdCruceNpsData,
} from "@/actions/rmd-cruce-nps"

const FMT_DIA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
})
const FMT_DIA_HORA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
})
const dia = (iso: string) => FMT_DIA.format(new Date(`${iso}T00:00:00Z`))

const GRUPOS: Array<{ key: CruceGrupo; titulo: string; detalle: string; tono: string }> = [
  {
    key: "coincide",
    titulo: "Coinciden: queja logística también en NPS",
    detalle: "En NPS fueron detractores o pasivos y eligieron un motivo de «Experiencia de entrega».",
    tono: "border-red-200 bg-red-50/40",
  },
  {
    key: "bajo_sin_logistico",
    titulo: "Bajos en NPS, pero sin motivo logístico",
    detalle: "Detractores o pasivos en NPS por otros motivos (vendedor, precios, BEES…).",
    tono: "border-amber-200 bg-amber-50/40",
  },
  {
    key: "destaca",
    titulo: "Promotores en NPS que destacan la entrega",
    detalle: "Eligieron la entrega como lo que les gusta: el voto bajo de RMD fue puntual.",
    tono: "border-emerald-200 bg-emerald-50/40",
  },
  {
    key: "sin_logistico",
    titulo: "Promotores en NPS, sin motivo logístico",
    detalle: "Conformes en NPS; no mencionan la entrega.",
    tono: "border-slate-200",
  },
]

const COLOR_CAT: Record<string, string> = {
  Detractor: "bg-red-100 text-red-700 border-red-200",
  Passive: "bg-amber-100 text-amber-800 border-amber-200",
  Promoter: "bg-emerald-100 text-emerald-700 border-emerald-200",
}
const NOMBRE_CAT: Record<string, string> = {
  Detractor: "Detractor",
  Passive: "Pasivo",
  Promoter: "Promotor",
}

function colorEstrellas(p: number) {
  return p <= 3 ? "text-red-600" : "text-amber-600"
}

function Observaciones({
  codCliente,
  iniciales,
  deshabilitado,
  placeholder,
}: {
  codCliente: number
  iniciales: CruceObservacion[]
  deshabilitado: boolean
  placeholder: string
}) {
  const [lista, setLista] = useState(iniciales)
  const [texto, setTexto] = useState("")
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    const res = await agregarObservacionCruceNps(codCliente, texto)
    setGuardando(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    setLista((l) => [...l, res.data])
    setTexto("")
    setAbierto(false)
    toast.success("Observación guardada")
  }

  async function borrar(id: string) {
    if (!confirm("¿Borrar esta observación?")) return
    const res = await eliminarObservacionCruceNps(id)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    setLista((l) => l.filter((o) => o.id !== id))
  }

  return (
    <div className="space-y-2">
      {lista.map((o) => (
        <div key={o.id} className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm">
          <div className="flex-1">
            <p className="whitespace-pre-wrap text-slate-800">{o.texto}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {o.autor_nombre ?? "—"} · {FMT_DIA_HORA.format(new Date(o.created_at))} hs
            </p>
          </div>
          <button
            type="button"
            onClick={() => borrar(o.id)}
            className="text-slate-400 hover:text-red-600"
            title="Borrar observación"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      {abierto ? (
        <div className="space-y-2">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={placeholder}
            rows={3}
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={guardar} disabled={guardando || !texto.trim()}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAbierto(true)}
          disabled={deshabilitado}
          className="gap-1"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Dejar observación
        </Button>
      )}
    </div>
  )
}

const VOTOS_VISIBLES = 4

function ClienteFila({ c, deshabilitado }: { c: CruceCliente; deshabilitado: boolean }) {
  const [verTodos, setVerTodos] = useState(false)
  const votos = verTodos ? [...c.rmd].reverse() : [...c.rmd].reverse().slice(0, VOTOS_VISIBLES)
  const ocultos = c.rmd.length - VOTOS_VISIBLES

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold text-slate-900">{c.nombre ?? "Sin nombre"}</span>
        <span className="text-xs text-slate-500">
          #{c.cod_cliente} · {c.localidad ?? "—"}
        </span>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            RMD ({c.rmd.length} {c.rmd.length === 1 ? "voto bajo" : "votos bajos"})
          </p>
          <ul className="space-y-1 text-sm">
            {votos.map((v, i) => (
              <li key={`${v.fecha}-${i}`}>
                <span className="text-slate-500">{dia(v.fecha)}</span>{" "}
                <span className={`font-semibold ${colorEstrellas(v.puntuacion)}`}>{v.puntuacion}★</span>{" "}
                {v.motivo && <span className="text-slate-700">{v.motivo}</span>}
                {v.comentario && <span className="italic text-slate-500"> «{v.comentario}»</span>}
              </li>
            ))}
          </ul>
          {ocultos > 0 && (
            <button
              type="button"
              className="mt-1 text-xs text-sky-700 hover:underline"
              onClick={() => setVerTodos((x) => !x)}
            >
              {verTodos ? "Ver menos" : `Ver ${ocultos} más`}
            </button>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            NPS ({c.nps.length} {c.nps.length === 1 ? "encuesta" : "encuestas"})
          </p>
          <ul className="space-y-2 text-sm">
            {[...c.nps].reverse().map((e, i) => (
              <li key={`${e.fecha}-${i}`}>
                <span className="text-slate-500">{dia(e.fecha)}</span>{" "}
                <span
                  className={`inline-flex rounded border px-1.5 text-xs font-medium ${COLOR_CAT[e.categoria] ?? ""}`}
                >
                  {e.score} · {NOMBRE_CAT[e.categoria] ?? e.categoria}
                </span>
                {e.logisticos.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {e.logisticos.map((l) => (
                      <Badge
                        key={l}
                        variant="outline"
                        className={
                          e.categoria === "Promoter"
                            ? "border-emerald-300 text-emerald-700"
                            : "border-red-300 text-red-700"
                        }
                      >
                        🚚 {l}
                      </Badge>
                    ))}
                  </div>
                )}
                {e.otros.length > 0 && (
                  <p className="text-xs text-slate-500">Otros motivos: {e.otros.join(" · ")}</p>
                )}
                {e.comentario && <p className="text-xs italic text-slate-600">«{e.comentario}»</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <Observaciones
          codCliente={c.cod_cliente}
          iniciales={c.observaciones}
          deshabilitado={deshabilitado}
          placeholder="Qué se habló con el cliente, qué se hizo, qué falta…"
        />
      </div>
    </div>
  )
}

export function CruceNpsBloque({ data }: { data: RmdCruceNpsData }) {
  const deshabilitado = data.aviso_observaciones !== null
  const porGrupo = (g: CruceGrupo) => data.clientes.filter((c) => c.grupo === g)
  const nCoincide = porGrupo("coincide").length
  const nDestaca = porGrupo("destaca").length

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">RMD bajo × motivo logístico en NPS</CardTitle>
          <p className="text-sm text-slate-500">
            Clientes que en {data.anio} votaron RMD detractor (1-3★) o pasivo (4★), cruzados con
            todas sus encuestas NPS. Motivo logístico = driver «Experiencia de entrega» de NPS.
            En un promotor, el driver es lo que le gusta, no una queja.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { n: data.clientes_rmd_bajo, t: "clientes con RMD bajo" },
              { n: data.clientes_con_nps, t: "también respondieron NPS" },
              { n: nCoincide, t: "con queja logística en NPS", c: "text-red-600" },
              { n: nDestaca, t: "promotores que destacan la entrega", c: "text-emerald-600" },
            ].map((k) => (
              <div key={k.t} className="rounded-md border border-slate-200 p-3">
                <p className={`text-2xl font-bold ${k.c ?? "text-slate-900"}`}>{k.n}</p>
                <p className="text-xs text-slate-500">{k.t}</p>
              </div>
            ))}
          </div>

          {data.aviso_observaciones && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {data.aviso_observaciones} Falta aplicar la migración
              «20261117150000_rmd_cruce_nps_observaciones.sql».
            </p>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">Observación general del análisis</p>
            <Observaciones
              codCliente={0}
              iniciales={data.observaciones_generales}
              deshabilitado={deshabilitado}
              placeholder="Conclusión del cruce, acciones a tomar…"
            />
          </div>
        </CardContent>
      </Card>

      {GRUPOS.map((g) => {
        const lista = porGrupo(g.key)
        if (lista.length === 0) return null
        return (
          <section key={g.key} className={`space-y-3 rounded-xl border p-4 ${g.tono}`}>
            <div>
              <h3 className="font-semibold text-slate-900">
                {g.titulo} <span className="text-slate-500">({lista.length})</span>
              </h3>
              <p className="text-sm text-slate-500">{g.detalle}</p>
            </div>
            {lista.map((c) => (
              <ClienteFila key={c.cod_cliente} c={c} deshabilitado={deshabilitado} />
            ))}
          </section>
        )
      })}
    </div>
  )
}
