"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Lock,
  Save,
  Truck,
  User,
  Warehouse,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { finalizarAuditoria, guardarPuntajeItem } from "@/actions/s5"
import {
  S5_AUDITORIA_ESTADO_COLORS,
  S5_AUDITORIA_ESTADO_LABELS,
  S5_CATEGORIA_COLORS,
  S5_CATEGORIA_LABELS,
  S5_CATEGORIA_ORDEN,
  S5_CATEGORIA_S_LABELS,
  S5_PUNTAJES_ALMACEN,
  S5_PUNTAJES_FLOTA,
  S5_TIPO_LABELS,
  type S5AuditoriaFull,
  type S5AuditoriaItemConCatalogo,
  type S5Categoria,
  type UserRole,
} from "@/types/database"

function formatFecha(iso: string) {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

export function AuditoriaClient({
  auditoria,
  currentRole,
}: {
  auditoria: S5AuditoriaFull
  currentRole: UserRole
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Estado local para ítems (puntaje + observaciones + saving flag)
  type ItemState = {
    puntaje: number | null
    observaciones: string
    saving: boolean
  }
  const [estado, setEstado] = useState<Record<string, ItemState>>(() => {
    const m: Record<string, ItemState> = {}
    for (const it of auditoria.items) {
      m[it.item_id] = {
        puntaje: it.puntaje,
        observaciones: it.observaciones ?? "",
        saving: false,
      }
    }
    return m
  })

  const canEdit =
    (currentRole === "admin" || currentRole === "auditor") &&
    auditoria.estado === "borrador"
  const readOnly = auditoria.estado === "completada"

  const puntajesValidos =
    auditoria.tipo === "almacen" ? S5_PUNTAJES_ALMACEN : S5_PUNTAJES_FLOTA

  const itemsPorCategoria = useMemo(() => {
    const map = new Map<S5Categoria, S5AuditoriaItemConCatalogo[]>()
    for (const cat of S5_CATEGORIA_ORDEN) map.set(cat, [])
    for (const it of auditoria.items) {
      const cat = it.catalogo.categoria
      const arr = map.get(cat) ?? []
      arr.push(it)
      map.set(cat, arr)
    }
    return map
  }, [auditoria.items])

  const totalItems = auditoria.items.length
  const cargados = useMemo(
    () =>
      auditoria.items.reduce((acc, it) => {
        const s = estado[it.item_id]
        return acc + (s && s.puntaje !== null ? 1 : 0)
      }, 0),
    [estado, auditoria.items]
  )
  const pctProgreso =
    totalItems > 0 ? Math.round((cargados / totalItems) * 100) : 0
  const todoCompleto = cargados === totalItems && totalItems > 0

  function handleSetPuntaje(itemId: string, puntaje: number) {
    if (!canEdit) return
    const actual = estado[itemId]
    setEstado((prev) => ({
      ...prev,
      [itemId]: { ...actual, puntaje, saving: true },
    }))

    guardarPuntajeItem(
      auditoria.id,
      itemId,
      puntaje,
      actual.observaciones || null
    )
      .then((res) => {
        if ("error" in res) {
          toast.error(res.error)
          setEstado((prev) => ({
            ...prev,
            [itemId]: { ...prev[itemId], puntaje: actual.puntaje, saving: false },
          }))
        } else {
          setEstado((prev) => ({
            ...prev,
            [itemId]: { ...prev[itemId], saving: false },
          }))
        }
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Error guardando")
        setEstado((prev) => ({
          ...prev,
          [itemId]: { ...prev[itemId], saving: false },
        }))
      })
  }

  function handleChangeObs(itemId: string, value: string) {
    setEstado((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], observaciones: value },
    }))
  }

  function handleSaveObs(itemId: string) {
    if (!canEdit) return
    const actual = estado[itemId]
    if (actual.puntaje === null) {
      toast.error("Primero seleccioná un puntaje")
      return
    }
    setEstado((prev) => ({
      ...prev,
      [itemId]: { ...actual, saving: true },
    }))
    guardarPuntajeItem(
      auditoria.id,
      itemId,
      actual.puntaje,
      actual.observaciones || null
    )
      .then((res) => {
        if ("error" in res) {
          toast.error(res.error)
        } else {
          toast.success("Observación guardada")
        }
      })
      .finally(() => {
        setEstado((prev) => ({
          ...prev,
          [itemId]: { ...prev[itemId], saving: false },
        }))
      })
  }

  function handleFinalizar() {
    if (!todoCompleto) {
      toast.error("Faltan ítems por puntuar")
      return
    }
    if (
      !confirm(
        "¿Finalizar auditoría? Una vez completada no se podrán modificar los puntajes."
      )
    ) {
      return
    }
    startTransition(async () => {
      const res = await finalizarAuditoria(auditoria.id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Auditoría finalizada")
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumb / back */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/5s"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a 5S
        </Link>
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                {auditoria.tipo === "flota" ? (
                  <Truck className="size-5 text-indigo-600" />
                ) : (
                  <Warehouse className="size-5 text-indigo-600" />
                )}
                <CardTitle className="text-xl">
                  Auditoría 5S — {S5_TIPO_LABELS[auditoria.tipo]}
                  {auditoria.tipo === "flota" && auditoria.vehiculo_dominio && (
                    <span className="ml-2 text-base font-normal text-muted-foreground">
                      · {auditoria.vehiculo_dominio}
                    </span>
                  )}
                  {auditoria.tipo === "almacen" && auditoria.sector_numero && (
                    <span className="ml-2 text-base font-normal text-muted-foreground">
                      · Sector {auditoria.sector_numero}
                    </span>
                  )}
                </CardTitle>
              </div>
            </div>
            <Badge
              variant="secondary"
              style={{
                backgroundColor:
                  S5_AUDITORIA_ESTADO_COLORS[auditoria.estado] + "20",
                color: S5_AUDITORIA_ESTADO_COLORS[auditoria.estado],
              }}
            >
              {auditoria.estado === "completada" && (
                <Lock className="mr-1 size-3" />
              )}
              {S5_AUDITORIA_ESTADO_LABELS[auditoria.estado]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Fecha:</span>
              <span className="font-medium">{formatFecha(auditoria.fecha)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Auditor:</span>
              <span className="font-medium">{auditoria.auditor_nombre}</span>
            </div>
            {auditoria.tipo === "flota" && auditoria.chofer_nombre && (
              <div className="col-span-2 flex items-center gap-2 text-sm">
                <User className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Chofer:</span>
                <span className="font-medium">{auditoria.chofer_nombre}</span>
              </div>
            )}
            {auditoria.tipo === "flota" &&
              (auditoria.ayudante_1 || auditoria.ayudante_2) && (
                <div className="col-span-2 flex items-center gap-2 text-sm">
                  <User className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Ayudantes:</span>
                  <span className="font-medium">
                    {[auditoria.ayudante_1, auditoria.ayudante_2]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              )}
          </div>

          {/* Progreso o resultados */}
          {readOnly && auditoria.nota_total !== null ? (
            <div className="mt-5 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">
                  Resultado
                </p>
                <p className="text-3xl font-bold text-indigo-700">
                  {auditoria.nota_total.toFixed(1)}%
                </p>
              </div>
              {auditoria.notas_por_s && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {S5_CATEGORIA_ORDEN.map((cat) => {
                    const nota = auditoria.notas_por_s?.[cat] ?? 0
                    return (
                      <div
                        key={cat}
                        className="rounded-md border bg-white p-2"
                      >
                        <p
                          className="text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: S5_CATEGORIA_COLORS[cat] }}
                        >
                          {S5_CATEGORIA_LABELS[cat]}
                        </p>
                        <p className="mt-1 text-lg font-bold">
                          {nota.toFixed(1)}%
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">
                  Progreso: {cargados}/{totalItems}
                </span>
                <span className="text-muted-foreground">{pctProgreso}%</span>
              </div>
              <Progress value={pctProgreso} className="mt-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Checklist por categoría */}
      <div className="space-y-4">
        {S5_CATEGORIA_ORDEN.map((cat) => {
          const items = itemsPorCategoria.get(cat) ?? []
          if (items.length === 0) return null
          const color = S5_CATEGORIA_COLORS[cat]
          const cargadosCat = items.reduce((acc, it) => {
            const s = estado[it.item_id]
            return acc + (s && s.puntaje !== null ? 1 : 0)
          }, 0)
          return (
            <Card key={cat}>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-3 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <CardTitle className="text-base">
                      {S5_CATEGORIA_S_LABELS[cat]}
                    </CardTitle>
                    <span className="text-sm text-muted-foreground">
                      · {S5_CATEGORIA_LABELS[cat]}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {cargadosCat}/{items.length}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="divide-y">
                {items.map((it) => {
                  const s = estado[it.item_id]
                  return (
                    <div key={it.item_id} className="py-4 first:pt-3 last:pb-2">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-slate-700">
                          {it.catalogo.numero}
                        </div>
                        <div className="flex-1 space-y-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {it.catalogo.titulo}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {it.catalogo.descripcion}
                            </p>
                          </div>

                          {/* Botones de puntaje */}
                          <div className="flex flex-wrap gap-1.5">
                            {puntajesValidos.map((p) => {
                              const seleccionado = s?.puntaje === p.valor
                              return (
                                <button
                                  key={p.valor}
                                  type="button"
                                  disabled={readOnly || !canEdit}
                                  onClick={() =>
                                    handleSetPuntaje(it.item_id, p.valor)
                                  }
                                  className={
                                    seleccionado
                                      ? "rounded-md border-2 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                                      : "rounded-md border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                                  }
                                  style={
                                    seleccionado
                                      ? { borderColor: color, backgroundColor: color }
                                      : undefined
                                  }
                                >
                                  {p.valor} · {p.label}
                                </button>
                              )
                            })}
                            {s?.saving && (
                              <span className="ml-2 self-center text-xs text-muted-foreground">
                                guardando...
                              </span>
                            )}
                            {!s?.saving && s?.puntaje !== null && (
                              <CheckCircle2 className="size-4 self-center text-emerald-500" />
                            )}
                          </div>

                          {/* Observaciones */}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              Observaciones (opcional)
                            </Label>
                            <div className="flex gap-2">
                              <Textarea
                                rows={2}
                                value={s?.observaciones ?? ""}
                                onChange={(e) =>
                                  handleChangeObs(it.item_id, e.target.value)
                                }
                                disabled={readOnly || !canEdit}
                                className="flex-1"
                              />
                              {!readOnly && canEdit && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSaveObs(it.item_id)}
                                  disabled={s?.saving}
                                >
                                  <Save className="size-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Footer: finalizar */}
      {!readOnly && canEdit && (
        <div className="flex items-center justify-end gap-3 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            {todoCompleto
              ? "Todos los ítems cargados. Podés finalizar la auditoría."
              : `Faltan ${totalItems - cargados} ítems por puntuar.`}
          </p>
          <Button
            onClick={handleFinalizar}
            disabled={!todoCompleto || isPending}
          >
            <Lock className="mr-2 size-4" />
            {isPending ? "Finalizando..." : "Finalizar auditoría"}
          </Button>
        </div>
      )}
    </div>
  )
}
