"use client"

import { useState, useTransition } from "react"
import {
  AlertTriangle,
  Clock,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  Store,
  UserRound,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { buscarClientesPdv } from "@/actions/clientes-pdv"
import {
  DIAS_SEMANA,
  diaDeHoy,
  telefonoLegible,
  telefonoWhatsapp,
  textoDia,
  type ClientePdv,
} from "@/lib/clientes-pdv"

function fmtFecha(f: string): string {
  const [y, m, d] = f.split("-")
  return `${d}/${m}/${y}`
}

function BotonesTelefono({ telefono }: { telefono: string }) {
  const wa = telefonoWhatsapp(telefono)
  const tel = telefono.replace(/[^\d+]/g, "")
  return (
    <div className="flex shrink-0 gap-2">
      <a href={`tel:${tel}`} className={buttonVariants({ variant: "outline", size: "lg", className: "gap-1.5" })}>
        <Phone className="size-4" />
        Llamar
      </a>
      {wa && (
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "lg", className: "gap-1.5 text-emerald-700" })}
        >
          <MessageCircle className="size-4" />
          WhatsApp
        </a>
      )}
    </div>
  )
}

function FichaCliente({ c }: { c: ClientePdv }) {
  const hoy = diaDeHoy()
  const labelHoy = DIAS_SEMANA.find((d) => d.id === hoy)?.label ?? ""
  const textoHoy = c.horario ? textoDia(c.horario[hoy]) : null
  const hayMapa = c.lat != null && c.lng != null && c.lat !== 0 && c.lng !== 0

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        {/* Quién y dónde */}
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              {c.id_cliente}
            </Badge>
            {c.anulado && (
              <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Dado de baja</Badge>
            )}
          </div>
          <p className="text-lg font-semibold leading-tight text-slate-900">
            {c.nombre_fantasia ?? c.razon_social}
          </p>
          {c.nombre_fantasia && c.nombre_fantasia !== c.razon_social && (
            <p className="text-sm text-muted-foreground">{c.razon_social}</p>
          )}
          {(c.direccion || c.localidad) && (
            <p className="flex items-start gap-1.5 text-sm text-slate-700">
              <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />
              <span>
                {[c.direccion, c.localidad].filter(Boolean).join(", ")}
                {hayMapa && (
                  <>
                    {" · "}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-sky-700 underline underline-offset-2"
                    >
                      Ver en el mapa
                    </a>
                  </>
                )}
              </span>
            </p>
          )}
        </div>

        {/* Ventana horaria */}
        {c.horario ? (
          <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 size-5 shrink-0 text-sky-700" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-sky-800">
                  Hoy, {labelHoy.toLowerCase()}
                </p>
                <p
                  className={`text-base font-semibold ${
                    textoHoy === "Cerrado" ? "text-rose-700" : "text-slate-900"
                  }`}
                >
                  {textoHoy ?? "Sin dato para hoy"}
                </p>
              </div>
            </div>
            <ul className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              {DIAS_SEMANA.map((d) => {
                const t = textoDia(c.horario?.[d.id])
                return (
                  <li
                    key={d.id}
                    className={`flex justify-between gap-3 ${
                      d.id === hoy ? "font-semibold text-slate-900" : "text-slate-600"
                    }`}
                  >
                    <span>{d.label}</span>
                    <span className={t === "Cerrado" ? "text-rose-700" : ""}>{t ?? "—"}</span>
                  </li>
                )
              })}
            </ul>
            <p className="text-xs text-sky-900/70">
              Relevada por el promotor
              {c.horario_actualizado && ` el ${fmtFecha(c.horario_actualizado)}`}
              {c.horario_ciclo && ` (ciclo ${c.horario_ciclo})`}.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="font-medium text-amber-900">
                El promotor todavía no relevó la ventana horaria de este cliente.
              </p>
              {c.horario_chess && (
                <p className="text-amber-900/80">
                  En Chess figura «{c.horario_chess}», pero es un dato cargado de fábrica: confirmalo
                  con el vendedor.
                </p>
              )}
            </div>
          </div>
        )}

        {c.comentario_entrega && (
          <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm">
            <span className="font-medium text-slate-700">Indicaciones de entrega: </span>
            <span className="text-slate-900">{c.comentario_entrega}</span>
          </div>
        )}

        {/* Teléfonos */}
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Store className="size-3.5" />
            Cliente
          </p>
          {c.telefonos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin teléfono cargado en Chess.</p>
          ) : (
            c.telefonos.map((t) => (
              <div key={t} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm text-slate-900">{telefonoLegible(t)}</span>
                <BotonesTelefono telefono={t} />
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <UserRound className="size-3.5" />
            {c.vendedores.length > 1 ? "Vendedores" : "Vendedor"}
          </p>
          {c.vendedores.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              El cliente no está en ninguna ruta de venta vigente.
            </p>
          ) : (
            c.vendedores.map((v) => (
              <div key={v.nombre} className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">{v.nombre}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {v.telefono ? telefonoLegible(v.telefono) : "Sin celular cargado"}
                  </p>
                </div>
                {v.telefono && <BotonesTelefono telefono={v.telefono} />}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function BuscarClienteClient() {
  const [q, setQ] = useState("")
  const [resultados, setResultados] = useState<ClientePdv[] | null>(null)
  const [buscado, setBuscado] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function buscar(e: React.FormEvent) {
    e.preventDefault()
    const texto = q.trim()
    if (!texto) return
    startTransition(async () => {
      try {
        const res = await buscarClientesPdv(texto)
        if ("error" in res) {
          setError(res.error)
          setResultados(null)
        } else {
          setError(null)
          setBuscado(texto)
          setResultados(res.data)
        }
      } catch {
        setError("No se pudo buscar. Revisá la conexión y probá de nuevo.")
        setResultados(null)
      }
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-sky-100 p-2.5">
          <Clock className="size-6 text-sky-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Buscar cliente</h1>
          <p className="text-sm text-muted-foreground">
            Ventana horaria, teléfono del cliente y celular de su vendedor.
          </p>
        </div>
      </div>

      <form onSubmit={buscar} className="flex gap-2">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Código de cliente o nombre"
          aria-label="Código de cliente o nombre"
          autoComplete="off"
          className="h-11 text-base"
        />
        <Button type="submit" disabled={isPending || !q.trim()} className="h-11 gap-2">
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Buscar
        </Button>
      </form>

      {error && <p className="text-sm text-rose-700">{error}</p>}

      {resultados && resultados.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No hay ningún cliente con «{buscado}».
        </p>
      )}

      {resultados && resultados.length >= 10 && (
        <p className="text-xs text-muted-foreground">
          Se muestran los primeros 10. Si no está el que buscás, probá con el código.
        </p>
      )}

      <div className="space-y-4">
        {resultados?.map((c) => (
          <FichaCliente key={c.id_cliente} c={c} />
        ))}
      </div>
    </div>
  )
}
