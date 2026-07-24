"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  CheckCircle2,
  Download,
  ImageOff,
  PackageCheck,
  PackageOpen,
  Refrigerator,
  Search,
  TriangleAlert,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { revisarMovimientoHeladera } from "@/actions/heladeras"
import {
  HELADERA_ESTADO_LABELS,
  HELADERA_TIPO_LABELS_CORTO,
  resumirMovimientos,
  type HeladeraEstado,
  type HeladeraMovimientoConDetalle,
  type HeladeraTipoMov,
} from "@/types/heladeras"

const TIPO_COLOR: Record<HeladeraTipoMov, string> = {
  colocacion: "bg-emerald-100 text-emerald-800",
  retiro: "bg-amber-100 text-amber-800",
}

const ESTADO_COLOR: Record<HeladeraEstado, string> = {
  registrado: "bg-slate-100 text-slate-700",
  validado: "bg-blue-100 text-blue-800",
  observado: "bg-rose-100 text-rose-800",
}

function fmtFecha(f: string): string {
  const [y, m, d] = f.split("-")
  return `${d}/${m}/${y}`
}

function csvEscape(v: string | number | null): string {
  const s = v == null ? "" : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

export function HeladerasGestionClient({
  movimientos,
  desde,
  hasta,
  puedeRevisar,
}: {
  movimientos: HeladeraMovimientoConDetalle[]
  desde: string
  hasta: string
  puedeRevisar: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [d, setD] = useState(desde)
  const [h, setH] = useState(hasta)
  const [q, setQ] = useState("")
  const [revisando, setRevisando] = useState<HeladeraMovimientoConDetalle | null>(null)
  const [comentario, setComentario] = useState("")

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return movimientos
    return movimientos.filter((m) =>
      [
        String(m.id_cliente),
        m.nombre_cliente,
        m.localidad,
        m.cod_activo,
        m.patente,
        m.chofer_nombre,
        m.autor_nombre,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    )
  }, [movimientos, q])

  const resumen = useMemo(() => resumirMovimientos(filtrados), [filtrados])

  function aplicarRango() {
    router.push(`/heladeras?desde=${d}&hasta=${h}`)
  }

  function exportarCSV() {
    const header = [
      "Fecha",
      "Movimiento",
      "Cod cliente",
      "Cliente",
      "Localidad",
      "Nro activo",
      "Equipo",
      "Patente",
      "Chofer",
      "Cargado por",
      "Fotos",
      "Estado",
      "Observaciones",
    ]
    const filas = filtrados.map((m) => [
      m.fecha,
      HELADERA_TIPO_LABELS_CORTO[m.tipo],
      m.id_cliente,
      m.nombre_cliente,
      m.localidad,
      m.cod_activo,
      m.descripcion,
      m.patente,
      m.chofer_nombre,
      m.autor_nombre,
      m.adjuntos.length,
      HELADERA_ESTADO_LABELS[m.estado],
      m.observaciones,
    ])
    const csv = [header, ...filas].map((r) => r.map(csvEscape).join(";")).join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `heladeras_${desde}_a_${hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function revisar(estado: HeladeraEstado) {
    if (!revisando) return
    const id = revisando.id
    startTransition(async () => {
      const res = await revisarMovimientoHeladera(id, estado, comentario)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(estado === "validado" ? "Movimiento validado" : "Movimiento observado")
      setRevisando(null)
      setComentario("")
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-sky-100 p-2.5">
          <Refrigerator className="size-6 text-sky-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Heladeras — movimientos en ruta</h1>
          <p className="text-sm text-muted-foreground">
            Colocaciones y retiros que cargan los choferes desde el celular, con la foto como evidencia.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div>
            <Label>Desde</Label>
            <Input type="date" value={d} onChange={(e) => setD(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label>Hasta</Label>
            <Input type="date" value={h} onChange={(e) => setH(e.target.value)} className="w-40" />
          </div>
          <Button variant="outline" onClick={aplicarRango}>
            Aplicar
          </Button>
          <div className="min-w-[220px] flex-1">
            <Label>Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cliente, código, activo, patente, chofer…"
                className="pl-8"
              />
            </div>
          </div>
          <Button variant="outline" onClick={exportarCSV} className="gap-2">
            <Download className="size-4" />
            Exportar
          </Button>
        </CardContent>
      </Card>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Movimientos</p>
            <p className="text-2xl font-semibold">{resumen.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Colocadas</p>
            <p className="text-2xl font-semibold text-emerald-600">{resumen.colocaciones}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Retiradas</p>
            <p className="text-2xl font-semibold text-amber-600">{resumen.retiros}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Sin foto</p>
            <p className="text-2xl font-semibold text-rose-600">{resumen.sin_foto}</p>
          </CardContent>
        </Card>
      </div>

      {/* Listado */}
      {filtrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay movimientos de heladeras en el período seleccionado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtrados.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-start">
                {/* Fotos */}
                <div className="flex gap-2">
                  {m.adjuntos.length === 0 ? (
                    <div className="flex size-24 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                      <ImageOff className="size-6" />
                    </div>
                  ) : (
                    m.adjuntos.slice(0, 2).map((a) => (
                      <a
                        key={a.id}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block size-24 overflow-hidden rounded-md border bg-muted"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.url} alt="Foto de la heladera" className="size-full object-cover" />
                      </a>
                    ))
                  )}
                </div>

                {/* Datos */}
                <div className="flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{fmtFecha(m.fecha)}</span>
                    <Badge className={TIPO_COLOR[m.tipo]}>
                      {m.tipo === "colocacion" ? (
                        <PackageCheck className="mr-1 size-3.5" />
                      ) : (
                        <PackageOpen className="mr-1 size-3.5" />
                      )}
                      {HELADERA_TIPO_LABELS_CORTO[m.tipo]}
                    </Badge>
                    <Badge className={ESTADO_COLOR[m.estado]}>{HELADERA_ESTADO_LABELS[m.estado]}</Badge>
                  </div>
                  <p className="text-sm">
                    <span className="font-mono text-muted-foreground">{m.id_cliente}</span>{" "}
                    <span className="font-medium">{m.nombre_cliente ?? "—"}</span>
                    {m.localidad && <span className="text-muted-foreground"> · {m.localidad}</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.cod_activo ? (
                      <>Activo <span className="font-mono">{m.cod_activo}</span></>
                    ) : (
                      "Sin Nº de activo"
                    )}
                    {m.descripcion && ` · ${m.descripcion}`}
                    {m.patente && ` · ${m.patente}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cargó {m.autor_nombre}
                    {m.chofer_nombre && m.chofer_nombre !== m.autor_nombre && ` (${m.chofer_nombre})`}
                  </p>
                  {m.observaciones && <p className="text-sm">{m.observaciones}</p>}
                  {m.comentario_gestion && (
                    <p className="rounded-md bg-slate-50 p-2 text-sm">
                      <span className="font-medium">Gestión: </span>
                      {m.comentario_gestion}
                    </p>
                  )}
                </div>

                {puedeRevisar && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 self-start"
                    onClick={() => {
                      setRevisando(m)
                      setComentario(m.comentario_gestion ?? "")
                    }}
                  >
                    <CheckCircle2 className="size-4" />
                    Revisar
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Diálogo de revisión */}
      <Dialog open={!!revisando} onOpenChange={(v) => !v && setRevisando(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Revisar movimiento</DialogTitle>
          </DialogHeader>
          {revisando && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {fmtFecha(revisando.fecha)} · {HELADERA_TIPO_LABELS_CORTO[revisando.tipo]} ·{" "}
                {revisando.nombre_cliente ?? `Cliente ${revisando.id_cliente}`}
              </p>
              <div>
                <Label>Comentario (lo ve el chofer)</Label>
                <Textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  rows={3}
                  placeholder="Ej: falta el Nº de activo, cargarlo la próxima"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => revisar("observado")}
                  disabled={isPending}
                >
                  <TriangleAlert className="size-4" />
                  Observar
                </Button>
                <Button className="gap-2" onClick={() => revisar("validado")} disabled={isPending}>
                  <CheckCircle2 className="size-4" />
                  Validar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
