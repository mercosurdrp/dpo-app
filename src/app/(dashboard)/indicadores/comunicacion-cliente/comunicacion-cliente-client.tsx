"use client"

import { Fragment, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Download, Loader2, Megaphone,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { getPospuestos } from "@/actions/comunicacion-cliente"
import type { PospuestoDia, PospuestosPeriodo } from "@/lib/comunicacion-cliente/pospuestos"

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

function nombreMes(anioMes: string): string {
  const [y, m] = anioMes.split("-").map((s) => parseInt(s, 10))
  return `${MESES[m - 1]} ${y}`
}

function correrMes(anioMes: string, delta: number): string {
  const [y, m] = anioMes.split("-").map((s) => parseInt(s, 10))
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`
}

/** "2026-07-20" → "lun 20/07" */
function fechaCorta(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00`)
  const dia = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][d.getDay()]
  const [, m, dd] = fecha.split("-")
  return `${dia} ${dd}/${m}`
}

/** Fecha/hora de registro en hora Argentina; si es solo fecha, solo la fecha. */
function registro(iso: string | null): string {
  if (!iso) return "—"
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return fechaCorta(iso)
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso))
}

const fmtHl = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR")

export function ComunicacionClienteClient({
  mesInicial,
  inicial,
}: {
  mesInicial: string
  inicial: PospuestosPeriodo
}) {
  const [mes, setMes] = useState(mesInicial)
  const [data, setData] = useState(inicial)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [cargando, startTransition] = useTransition()

  function irA(nuevo: string) {
    setMes(nuevo)
    setAbierto(null)
    startTransition(async () => {
      const res = await getPospuestos(nuevo, 1)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setData(res.data)
    })
  }

  const logisticos = data.dias.filter((d) => d.tipo === "logistico")
  const comerciales = data.dias.filter((d) => d.tipo === "comercial")
  const sum = (ds: PospuestoDia[], k: "clientes" | "hl") => ds.reduce((s, d) => s + d[k], 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Megaphone className="h-6 w-6" /> Pedidos pospuestos y aviso a Ventas
        </h1>
        <p className="text-sm text-muted-foreground">
          DPO Entrega 4.2 · Comunicación al cliente · cada día que un pedido no salió en la fecha pactada, con el
          motivo y el PDF con el que Ventas avisa a esos clientes.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => irA(correrMes(mes, -1))} disabled={cargando}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-36 text-center font-medium capitalize">{nombreMes(mes)}</span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => irA(correrMes(mes, 1))}
          disabled={cargando || mes >= mesInicial}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {cargando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Días con pedidos pospuestos</p>
            <p className="text-3xl font-bold text-slate-900">{new Set(data.dias.map((d) => d.fecha)).size}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Logístico (corte del ruteo)</p>
            <p className="text-3xl font-bold text-slate-900">{logisticos.length} días</p>
            <p className="text-xs text-muted-foreground">
              {fmtInt(sum(logisticos, "clientes"))} clientes · {fmtHl(sum(logisticos, "hl"))} HL
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Comercial (retenidos por crédito)</p>
            <p className="text-3xl font-bold text-slate-900">{comerciales.length} días</p>
            <p className="text-xs text-muted-foreground">
              {fmtInt(sum(comerciales, "clientes"))} clientes · {fmtHl(sum(comerciales, "hl"))} HL
            </p>
          </CardContent>
        </Card>
      </div>

      {data.vrcError && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {data.vrcError}
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          {data.dias.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hubo pedidos pospuestos en {nombreMes(mes)}.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Entrega pactada</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Clientes</TableHead>
                    <TableHead className="text-right">HL</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Registrado</TableHead>
                    <TableHead className="text-right">Aviso a Ventas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.dias.map((d) => {
                    const k = `${d.fecha}|${d.tipo}`
                    const open = abierto === k
                    return (
                      <Fragment key={k}>
                        <TableRow className="cursor-pointer" onClick={() => setAbierto(open ? null : k)}>
                          <TableCell>
                            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-medium">{fechaCorta(d.fecha)}</TableCell>
                          <TableCell>
                            {d.tipo === "logistico" ? (
                              <Badge variant="outline" className="border-blue-300 text-blue-700">Logístico</Badge>
                            ) : (
                              <Badge variant="outline" className="border-amber-300 text-amber-700">Comercial · crédito</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{fmtInt(d.clientes)}</TableCell>
                          <TableCell className="text-right">{fmtHl(d.hl)}</TableCell>
                          <TableCell className="max-w-80 truncate" title={d.motivo}>{d.motivo}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {registro(d.registradoEn)}
                            {d.registradoPor && <div className="truncate">{d.registradoPor}</div>}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <a href={`/api/entrega/pospuestos/pdf?fecha=${d.fecha}&tipo=${d.tipo}`} download>
                              <Button variant="outline" size="sm">
                                <Download className="mr-1 h-3.5 w-3.5" /> PDF
                              </Button>
                            </a>
                          </TableCell>
                        </TableRow>
                        {open && (
                          <TableRow>
                            <TableCell />
                            <TableCell colSpan={7} className="bg-slate-50">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Localidad</TableHead>
                                    <TableHead className="text-right">Bultos</TableHead>
                                    <TableHead className="text-right">HL</TableHead>
                                    <TableHead>{d.tipo === "logistico" ? "Veces pospuesto antes" : "Nueva fecha"}</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {d.filas.map((f, i) => (
                                    <TableRow key={`${f.idCliente}-${i}`}>
                                      <TableCell>
                                        {f.cliente} {f.idCliente && <span className="text-muted-foreground">#{f.idCliente}</span>}
                                      </TableCell>
                                      <TableCell>{f.localidad ?? "—"}</TableCell>
                                      <TableCell className="text-right">{fmtInt(f.bultos)}</TableCell>
                                      <TableCell className="text-right">{fmtHl(f.hl)}</TableCell>
                                      <TableCell>
                                        {d.tipo === "logistico"
                                          ? f.vecesPrevias || "—"
                                          : f.fechaNueva
                                            ? fechaCorta(f.fechaNueva)
                                            : "sin fecha"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Logístico: cortes registrados en Planeamiento → Priorización de Entrega (se registran el día anterior a la
        entrega y el PDF «Clientes a reprogramar» va a Ventas). Comercial: pedidos retenidos por deuda vencida que
        guarda Créditos/Ventas en el dashboard Mercosur. Ventas avisa a cada cliente según el SOP 4.2.
      </p>
    </div>
  )
}
