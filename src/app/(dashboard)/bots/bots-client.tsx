"use client"
/**
 * /bots: bots por pilar. Tres bloques:
 *  1) Bots: a quién le escribe cada uno + ronda de prueba (no manda nada).
 *  2) Planes propuestos: aprobar (crea el plan en /planes) o descartar.
 *  3) Últimas corridas: el mensaje tal cual salió y qué indicadores vio.
 */
import { Fragment, useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Bot, Check, ChevronDown, ChevronRight, Play, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  aprobarPlanPropuesto,
  descartarPlanPropuesto,
  probarRonda,
  type BotsData,
} from "@/actions/bots"
import type { ContextoPilar } from "@/lib/bots/contexto"
import type { BotCorrida, BotPlanPropuesto } from "@/lib/bots/tipos"
import type { EstadoSemaforo } from "@/lib/reuniones/semaforo"

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })

const PUNTO: Record<EstadoSemaforo, string> = {
  verde: "bg-emerald-500",
  amarillo: "bg-amber-400",
  rojo: "bg-red-500",
  neutro: "bg-slate-300",
  sin_dato: "bg-slate-200",
}

/** Renderiza el texto de WhatsApp respetando *negrita* y los saltos. */
function MensajeWhatsApp({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg bg-[#e7ffdb] p-3 font-sans text-sm leading-relaxed text-slate-800 shadow-sm">
      {texto.split("\n").map((linea, i) => (
        <div key={i}>
          {linea.split(/(\*[^*]+\*)/g).map((parte, j) =>
            parte.startsWith("*") && parte.endsWith("*") && parte.length > 2 ? (
              <strong key={j}>{parte.slice(1, -1)}</strong>
            ) : (
              <Fragment key={j}>{parte}</Fragment>
            ),
          )}
        </div>
      ))}
    </div>
  )
}

function TablaContexto({ ctx }: { ctx: ContextoPilar }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1.5 pr-2 font-medium">Indicador</th>
            <th className="py-1.5 pr-2 font-medium">Último día</th>
            <th className="py-1.5 pr-2 text-right font-medium">Valor</th>
            <th className="py-1.5 pr-2 text-right font-medium">Meta</th>
            <th className="py-1.5 pr-2 text-right font-medium">Gatillo</th>
            <th className="py-1.5 pr-2 text-right font-medium">MTD</th>
            <th className="py-1.5 text-right font-medium">Racha</th>
          </tr>
        </thead>
        <tbody>
          {ctx.indicadores.map((i) => {
            const estado = i.umbral_mensual ? i.estado_mtd : (i.ultimo?.estado ?? "sin_dato")
            return (
              <tr key={i.id} className="border-b border-slate-100">
                <td className="py-1.5 pr-2">
                  <span className={cn("mr-2 inline-block size-2 rounded-full", PUNTO[estado])} />
                  {i.nombre}
                </td>
                <td className="py-1.5 pr-2 text-muted-foreground">{i.ultimo?.fecha ?? "—"}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {i.ultimo?.texto ?? fmt(i.ultimo?.valor)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(i.meta)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(i.gatillo)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{i.mtd_texto ?? fmt(i.mtd)}</td>
                <td className="py-1.5 text-right tabular-nums">{i.racha_fuera || ""}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CorridaCard({ c, nombreBot }: { c: BotCorrida; nombreBot: string }) {
  const [abierta, setAbierta] = useState(false)
  const ctx = c.contexto as ContextoPilar | null
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-slate-900">{nombreBot}</span>
          <span className="text-muted-foreground">{fechaHora(c.created_at)}</span>
          {c.dry ? (
            <Badge variant="outline">Prueba</Badge>
          ) : c.enviado ? (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Enviado</Badge>
          ) : (
            <Badge className="bg-red-100 text-red-700 hover:bg-red-100">No enviado</Badge>
          )}
          <Badge variant="outline">{c.modo === "ia" ? "IA" : "Plantilla"}</Badge>
        </div>
        {c.mensaje && <MensajeWhatsApp texto={c.mensaje} />}
        {c.error && <p className="text-xs text-amber-700">⚠ {c.error}</p>}
        {ctx?.indicadores && (
          <div>
            <button
              type="button"
              onClick={() => setAbierta((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              {abierta ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              Qué vio el bot ({ctx.indicadores.length} indicadores)
            </button>
            {abierta && (
              <div className="mt-2">
                <TablaContexto ctx={ctx} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PlanCard({ p, nombreBot }: { p: BotPlanPropuesto; nombreBot: string }) {
  const [pending, start] = useTransition()
  const aprobar = () =>
    start(async () => {
      const r = await aprobarPlanPropuesto(p.id)
      if ("error" in r) toast.error(r.error)
      else toast.success("Plan creado en Planes")
    })
  const descartar = () =>
    start(async () => {
      const r = await descartarPlanPropuesto(p.id)
      if ("error" in r) toast.error(r.error)
      else toast("Propuesta descartada")
    })
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{nombreBot}</Badge>
          <Badge className="bg-red-50 text-red-700 hover:bg-red-50">{p.indicador}</Badge>
          {p.fecha_objetivo && (
            <span className="text-xs text-muted-foreground">Para el {p.fecha_objetivo}</span>
          )}
        </div>
        <p className="font-semibold text-slate-900">{p.titulo}</p>
        {p.causa_probable && (
          <p className="text-sm text-slate-600">
            <span className="font-medium">Causa probable:</span> {p.causa_probable}
          </p>
        )}
        <p className="text-sm text-slate-700">
          <span className="font-medium">Acción:</span> {p.accion}
        </p>
        {p.responsable_sugerido && (
          <p className="text-xs text-muted-foreground">Responsable sugerido: {p.responsable_sugerido}</p>
        )}
        {p.estado === "propuesto" ? (
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={aprobar} disabled={pending}>
              <Check className="mr-1 size-4" /> Aprobar
            </Button>
            <Button size="sm" variant="outline" onClick={descartar} disabled={pending}>
              <X className="mr-1 size-4" /> Descartar
            </Button>
          </div>
        ) : p.estado === "aprobado" && p.plan_accion_id ? (
          <Link
            href={`/planes/${p.plan_accion_id}`}
            className="text-sm font-medium text-emerald-700 hover:underline"
          >
            Aprobado → ver plan
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">Descartado</p>
        )}
      </CardContent>
    </Card>
  )
}

export function BotsClient({ data }: { data: BotsData }) {
  const [pending, start] = useTransition()
  const [prueba, setPrueba] = useState<{ bot: string; mensaje: string } | null>(null)
  const nombre = new Map(data.bots.map((b) => [b.key, `${b.emoji} ${b.nombre}`]))
  const pendientes = data.planes.filter((p) => p.estado === "propuesto")
  const resueltos = data.planes.filter((p) => p.estado !== "propuesto").slice(0, 10)

  const probar = (key: string) =>
    start(async () => {
      const r = await probarRonda(key)
      if ("error" in r) toast.error(r.error)
      else setPrueba({ bot: key, mensaje: r.data.mensaje })
    })

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Bots</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.bots.map((b) => (
            <Card key={b.key}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-slate-900">
                    {b.emoji} {b.nombre}
                  </span>
                  <Badge variant={b.activo ? "default" : "outline"}>
                    {b.activo ? "Activo" : "Apagado"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Mira la reunión <span className="font-medium">{b.reunion_tipo}</span> · le escribe a{" "}
                  {b.telefono ?? "nadie (sin teléfono)"}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => probar(b.key)}
                  disabled={pending || !b.activo}
                >
                  <Play className="mr-1 size-4" />
                  {pending ? "Corriendo…" : "Probar ahora (no manda nada)"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        {prueba && (
          <div className="max-w-xl space-y-2">
            <p className="text-sm font-medium text-slate-700">
              <Bot className="mr-1 inline size-4" /> Así saldría hoy el mensaje:
            </p>
            <MensajeWhatsApp texto={prueba.mensaje} />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Planes propuestos {pendientes.length > 0 && `(${pendientes.length})`}
        </h2>
        {pendientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay propuestas pendientes.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {pendientes.map((p) => (
              <PlanCard key={p.id} p={p} nombreBot={nombre.get(p.bot_key) ?? p.bot_key} />
            ))}
          </div>
        )}
        {resueltos.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Últimas resueltas ({resueltos.length})
            </summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {resueltos.map((p) => (
                <PlanCard key={p.id} p={p} nombreBot={nombre.get(p.bot_key) ?? p.bot_key} />
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Últimas corridas</h2>
        {data.corridas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no corrió ningún bot.</p>
        ) : (
          <div className="grid max-w-3xl gap-3">
            {data.corridas.map((c) => (
              <CorridaCard key={c.id} c={c} nombreBot={nombre.get(c.bot_key) ?? c.bot_key} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
