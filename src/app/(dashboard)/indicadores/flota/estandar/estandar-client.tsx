"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowLeft, ChevronDown, Loader2, Ruler } from "lucide-react"
import { PlanesAccionFlota } from "../_components/planes-accion-flota"

const GREEN = "#16A34A"
const AMBER = "#D97706"
const RED = "#DC2626"
const BORDER = "#E2E8F0"

function colorPct(p: number) {
  if (p >= 95) return GREEN
  if (p >= 80) return AMBER
  return RED
}

interface Pendiente {
  item: string
  obs: string
}
interface Unidad {
  patente: string
  total: number
  cumple: number
  pct: number
  pendientes: Pendiente[]
}
interface Item {
  item: string
  total: number
  cumple: number
  aplican: string[]
  noOk: string[]
  obs: string
  pct: number
}
interface TipoData {
  pct: number
  cumple: number
  total: number
  itemsOk: number
  itemsTotal: number
  unidades: Unidad[]
  items: Item[]
}
interface EstandarData {
  actualizado: string
  camiones: TipoData
  autoelevadores: TipoData
}
interface Resp {
  ok: boolean
  datos?: EstandarData
  sucursales?: Record<string, string>
  error?: string
}

const TIPOS = [
  { key: "camiones" as const, label: "Camiones", foto: "/camion.jpg" },
  { key: "autoelevadores" as const, label: "Autoelevadores", foto: "/autoelevador.jpg" },
]

// Iguazú aparece con y sin tilde según la ficha; unificar para filtrar.
function normSucursal(s: string | undefined | null) {
  if (!s) return null
  const v = String(s).trim()
  if (/^iguaz/i.test(v)) return "Iguazú"
  if (/^eldorado/i.test(v)) return "Eldorado"
  return v
}

// Dona de progreso (conic-gradient): número grande al centro.
function Dona({ pct }: { pct: number }) {
  const c = colorPct(pct)
  return (
    <div
      className="grid h-24 w-24 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(${c} ${pct * 3.6}deg, ${BORDER} 0deg)` }}
    >
      <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-white">
        <span className="text-xl font-bold" style={{ color: c }}>{pct}%</span>
      </div>
    </div>
  )
}

export function EstandarFlotaClient() {
  const [vista, setVista] = useState<"camiones" | "autoelevadores">("camiones")
  const [abierta, setAbierta] = useState<string | null>(null)
  const [sucursal, setSucursal] = useState("__all__")
  const [datos, setDatos] = useState<EstandarData | null>(null)
  const [sucursales, setSucursales] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    setLoading(true)
    fetch("/api/flota-estandar", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Resp) => {
        if (!activo) return
        if (!j.ok || !j.datos) throw new Error(j.error || "Error al traer el estándar")
        setDatos(j.datos)
        setSucursales(j.sucursales || {})
      })
      .catch((e) => activo && setError(String((e as Error).message || e)))
      .finally(() => activo && setLoading(false))
    return () => { activo = false }
  }, [])

  const sucursalDe = (patente: string) => normSucursal(sucursales[patente])

  // Re-estratificación según el filtro de sucursal (réplica de la lógica de herminio).
  const porTipo = useMemo(() => {
    const r: Record<string, TipoData> = {}
    if (!datos) return r
    for (const t of TIPOS) {
      const base = datos[t.key]
      const unidades = base.unidades.filter(
        (u) => sucursal === "__all__" || sucursalDe(u.patente) === sucursal
      )
      const visibles = new Set(unidades.map((u) => u.patente))
      const items = base.items
        .map((it) => {
          const aplican = it.aplican.filter((p) => visibles.has(p))
          const noOk = it.noOk.filter((p) => visibles.has(p))
          if (!aplican.length || !noOk.length) return null
          return {
            ...it,
            total: aplican.length,
            cumple: aplican.length - noOk.length,
            noOk,
            pct: Math.round(((aplican.length - noOk.length) / aplican.length) * 1000) / 10,
          }
        })
        .filter((x): x is Item => x !== null)
        .sort((a, b) => a.pct - b.pct || a.item.localeCompare(b.item))
      const total = unidades.reduce((s, u) => s + u.total, 0)
      const cumple = unidades.reduce((s, u) => s + u.cumple, 0)
      r[t.key] = {
        unidades,
        items,
        total,
        cumple,
        pct: total ? Math.round((cumple / total) * 1000) / 10 : 0,
        itemsOk: base.itemsTotal - items.length,
        itemsTotal: base.itemsTotal,
      }
    }
    return r
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, sucursal, sucursales])

  const tipo = TIPOS.find((t) => t.key === vista)!
  const d = porTipo[vista]

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/indicadores/df74e60b-bff9-4d87-ae16-edf0bb8bfe87"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Flota
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-emerald-100 p-3 text-emerald-600">
          <Ruler className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Estándar — Cumplimiento</h1>
          <p className="text-sm text-muted-foreground">
            {datos
              ? `Listado de estándar (planilla del ${datos.actualizado.split("-").reverse().join("/")}) · verde ≥95% · ámbar ≥80% · rojo <80%`
              : "Cumplimiento del listado de estándar por unidad"}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* Filtro sucursal */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sucursal} onValueChange={(v) => { setSucursal(v ?? "__all__"); setAbierta(null) }}>
          <SelectTrigger className="h-9 w-[200px] font-semibold">
            <SelectValue placeholder="Sucursal">
              {(v) => (v === "__all__" || v == null ? "Todas las sucursales" : String(v))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas las sucursales</SelectItem>
            <SelectItem value="Eldorado">Eldorado</SelectItem>
            <SelectItem value="Iguazú">Iguazú</SelectItem>
          </SelectContent>
        </Select>
        {sucursal !== "__all__" && (
          <span className="text-xs text-muted-foreground">
            La sucursal sale de la ficha de Cloudfleet; las unidades sin sucursal sólo aparecen en «Todas».
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando estándar…
        </div>
      ) : !d ? null : (
        <>
          {/* Resumen por tipo */}
          <div className="grid gap-4 sm:grid-cols-2">
            {TIPOS.map((t) => {
              const r = porTipo[t.key]
              const activo = vista === t.key
              return (
                <button key={t.key} onClick={() => { setVista(t.key); setAbierta(null) }} className="text-left">
                  <Card
                    className={`transition-colors ${activo ? "ring-2 ring-emerald-500" : "hover:bg-slate-50"}`}
                  >
                    <CardContent className="flex items-center gap-4 pt-6">
                      <Dona pct={r.pct} />
                      <div>
                        <p className="flex items-center gap-2 font-semibold text-slate-900">
                          <Image
                            src={t.foto}
                            alt={t.label}
                            width={48}
                            height={32}
                            className="h-8 w-12 rounded object-cover"
                          />
                          {t.label}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {r.unidades.length} unidades{sucursal !== "__all__" ? ` en ${sucursal}` : ""}
                        </p>
                        <p className="text-sm text-muted-foreground">{r.cumple} de {r.total} ítems cumplidos</p>
                        <p className="text-sm text-muted-foreground">
                          {r.itemsOk} de {r.itemsTotal} ítems del estándar al 100%
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              )
            })}
          </div>

          {/* Cumplimiento por unidad */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="font-semibold text-slate-900">
                Cumplimiento por unidad — {tipo.label}{sucursal !== "__all__" ? ` · ${sucursal}` : ""}
              </h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Ordenado de menor a mayor cumplimiento. Tocá una unidad para ver qué le falta.
              </p>
              {d.unidades.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin unidades de {tipo.label.toLowerCase()} en {sucursal}.
                </p>
              ) : (
                <div className="space-y-1">
                  {[...d.unidades].sort((a, b) => a.pct - b.pct).map((u) => {
                    const abierto = abierta === u.patente
                    const suc = sucursalDe(u.patente)
                    return (
                      <div key={u.patente} className="rounded-lg border">
                        <button
                          className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                          onClick={() => setAbierta(abierto ? null : u.patente)}
                        >
                          <span className="flex w-36 shrink-0 items-center gap-2 font-medium">
                            <Image
                              src={tipo.foto}
                              alt={tipo.label}
                              width={32}
                              height={22}
                              className="h-[22px] w-8 rounded object-cover"
                            />
                            {u.patente}
                          </span>
                          {suc && <Badge variant="secondary" className="shrink-0">{suc}</Badge>}
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <span
                              className="block h-full rounded-full"
                              style={{ width: `${u.pct}%`, backgroundColor: colorPct(u.pct) }}
                            />
                          </span>
                          <span className="w-12 shrink-0 text-right font-semibold" style={{ color: colorPct(u.pct) }}>
                            {u.pct}%
                          </span>
                          <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
                            {u.cumple}/{u.total}
                          </span>
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${abierto ? "rotate-180" : ""}`}
                          />
                        </button>
                        {abierto && (
                          <div className="border-t bg-slate-50/60 px-3 py-2">
                            {u.pendientes.length === 0 ? (
                              <p className="text-sm text-green-700">✅ Cumple todos los ítems que le aplican.</p>
                            ) : (
                              <div className="space-y-1">
                                {u.pendientes.map((p, i) => (
                                  <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                                    <Badge className="bg-red-100 text-red-700 hover:bg-red-100">NO OK</Badge>
                                    <span className="font-medium">{p.item}</span>
                                    {p.obs && <span className="text-muted-foreground">— {p.obs}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ítems con incumplimiento */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-1 font-semibold text-slate-900">
                Ítems con incumplimiento — {tipo.label}{sucursal !== "__all__" ? ` · ${sucursal}` : ""}
              </h2>
              {d.items.length === 0 ? (
                <p className="py-6 text-center text-sm text-green-700">
                  ✅ Todos los ítems del estándar están al 100%.
                </p>
              ) : (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Los {d.itemsOk} ítems restantes del estándar están al 100%.
                  </p>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[200px]">Ítem del estándar</TableHead>
                          <TableHead>Cumplimiento</TableHead>
                          <TableHead className="min-w-[200px]">Unidades que no cumplen</TableHead>
                          <TableHead className="min-w-[180px]">Observación</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {d.items.map((it) => (
                          <TableRow key={it.item}>
                            <TableCell className="whitespace-normal font-semibold">{it.item}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <span className="font-semibold" style={{ color: colorPct(it.pct) }}>{it.pct}%</span>
                              <span className="text-muted-foreground"> ({it.total - it.noOk.length}/{it.total})</span>
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              {it.noOk.length === it.total ? (
                                <strong>Toda la flota ({it.noOk.length})</strong>
                              ) : (
                                <span className="flex flex-wrap gap-1">
                                  {it.noOk.map((p) => (
                                    <Badge key={p} variant="secondary" className="font-normal">{p}</Badge>
                                  ))}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-normal text-muted-foreground">{it.obs || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Planes de acción (independientes, propios de esta sección) */}
      <PlanesAccionFlota
        ambito="estandar"
        descripcion="Acciones para cerrar las brechas del estándar de flota (ítems NO OK). No depende del filtro de sucursal: muestra siempre todos los planes."
      />
    </div>
  )
}
