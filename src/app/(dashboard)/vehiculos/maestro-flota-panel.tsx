"use client"

/**
 * Maestro de flota — el padrón del parque, entero, en la pantalla de inicio.
 *
 * Punto 1 de la auditoría del gestor de flota. Los datos ya estaban cargados en
 * `vehiculos_ficha`, pero sólo se veían de a una unidad entrando a su ficha: no
 * había ninguna pantalla donde el parque se viera completo.
 *
 * La tabla es ancha por naturaleza (un maestro tiene que mostrar chasis, motor,
 * VIN…), así que en vez de apretar todo se agrupa en cuatro vistas —
 * identificación, asignación, documentación y estado— y se cambia de una a otra
 * sin perder la fila.
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ClipboardCheck,
  FileWarning,
  Search,
  Truck,
  Wrench,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { MaestroFlota, MaestroFlotaUnidad } from "@/types/database"

type Vista = "identificacion" | "asignacion" | "documentacion" | "estado"

const VISTAS: Array<{ id: Vista; label: string }> = [
  { id: "identificacion", label: "Identificación" },
  { id: "asignacion", label: "Asignación" },
  { id: "documentacion", label: "Documentación" },
  { id: "estado", label: "Estado" },
]

const TIPO_LABEL: Record<string, string> = {
  camion: "Camión",
  camioneta: "Camioneta",
  acoplado: "Acoplado",
  autoelevador: "Autoelevador",
  auto: "Auto",
  moto: "Moto",
}

function fmtFecha(f: string | null): string {
  if (!f) return "—"
  const [a, m, d] = f.slice(0, 10).split("-")
  return `${d}/${m}/${a}`
}

function fmtNum(n: number | null): string {
  return n == null ? "—" : new Intl.NumberFormat("es-AR").format(n)
}

/** Celda que deja ver a simple vista qué falta cargar en la ficha. */
function Dato({ valor, falta }: { valor: string | null | undefined; falta?: boolean }) {
  if (valor) return <span>{valor}</span>
  return (
    <span className={cn("text-xs", falta ? "font-medium text-amber-600" : "text-muted-foreground/60")}>
      {falta ? "falta" : "—"}
    </span>
  )
}

export function MaestroFlotaPanel({ maestro }: { maestro: MaestroFlota }) {
  const { unidades, resumen } = maestro
  const [vista, setVista] = useState<Vista>("identificacion")
  const [busqueda, setBusqueda] = useState("")
  const [tipo, setTipo] = useState<string>("todos")
  const [verBajas, setVerBajas] = useState(false)

  const tipos = useMemo(
    () => Array.from(new Set(unidades.map((u) => u.tipo).filter(Boolean))) as string[],
    [unidades]
  )

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return unidades.filter((u) => {
      if (!verBajas && !u.activo) return false
      if (tipo !== "todos" && u.tipo !== tipo) return false
      if (!q) return true
      const f = u.ficha
      return [
        u.dominio,
        u.descripcion,
        f?.marca,
        f?.modelo,
        f?.chasis,
        f?.vin,
        f?.motor,
        f?.chofer_asignado,
        f?.centro_costo,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    })
  }, [unidades, busqueda, tipo, verBajas])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Truck className="size-4 text-muted-foreground" />
          Maestro de flota
          <span className="text-xs font-normal text-muted-foreground">
            {resumen.activas} unidades activas
            {resumen.bajas > 0 ? ` · ${resumen.bajas} de baja` : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Composición del parque + lo que hay que mirar */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(resumen.porTipo)
            .sort((a, b) => b[1] - a[1])
            .map(([t, n]) => (
              <Badge key={t} variant="outline" className="gap-1 text-xs">
                {TIPO_LABEL[t] ?? t}
                <span className="font-semibold">{n}</span>
              </Badge>
            ))}
        </div>

        {(resumen.docsVencidos > 0 ||
          resumen.docsPorVencer > 0 ||
          resumen.fueraServicio > 0 ||
          resumen.sinFicha > 0 ||
          resumen.fichasIncompletas > 0) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {resumen.docsVencidos > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 font-medium text-destructive">
                <FileWarning className="size-3" />
                {resumen.docsVencidos} documento{resumen.docsVencidos === 1 ? "" : "s"} vencido
                {resumen.docsVencidos === 1 ? "" : "s"}
              </span>
            )}
            {resumen.docsPorVencer > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                <FileWarning className="size-3" />
                {resumen.docsPorVencer} vence{resumen.docsPorVencer === 1 ? "" : "n"} en 30 días
              </span>
            )}
            {resumen.fueraServicio > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-orange-300 bg-orange-50 px-2 py-1 font-medium text-orange-700 dark:bg-orange-950/40 dark:text-orange-400">
                <Wrench className="size-3" />
                {resumen.fueraServicio} fuera de servicio
              </span>
            )}
            {(resumen.sinFicha > 0 || resumen.fichasIncompletas > 0) && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 font-medium text-muted-foreground">
                <AlertTriangle className="size-3" />
                {resumen.sinFicha > 0 && `${resumen.sinFicha} sin ficha`}
                {resumen.sinFicha > 0 && resumen.fichasIncompletas > 0 && " · "}
                {resumen.fichasIncompletas > 0 &&
                  `${resumen.fichasIncompletas} con datos faltantes`}
              </span>
            )}
          </div>
        )}

        {/* Filtros + qué bloque de columnas se mira */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Dominio, marca, chasis, motor, chofer…"
              className="h-8 pl-7 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            <Button
              variant={tipo === "todos" ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => setTipo("todos")}
            >
              Todos
            </Button>
            {tipos.map((t) => (
              <Button
                key={t}
                variant={tipo === t ? "default" : "outline"}
                size="sm"
                className="h-8"
                onClick={() => setTipo(t)}
              >
                {TIPO_LABEL[t] ?? t}
              </Button>
            ))}
          </div>
          {resumen.bajas > 0 && (
            <Button
              variant={verBajas ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => setVerBajas((v) => !v)}
            >
              {verBajas ? "Ocultar bajas" : `Ver bajas (${resumen.bajas})`}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-1 border-b pb-2">
          {VISTAS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setVista(v.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                vista === v.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        {filtradas.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Ninguna unidad coincide con el filtro.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dominio</TableHead>
                  <TableHead>Tipo</TableHead>
                  {vista === "identificacion" && (
                    <>
                      <TableHead>Marca</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Año</TableHead>
                      <TableHead>Chasis</TableHead>
                      <TableHead>VIN</TableHead>
                      <TableHead>Motor</TableHead>
                      <TableHead>Capacidad</TableHead>
                      <TableHead>Carrocería</TableHead>
                    </>
                  )}
                  {vista === "asignacion" && (
                    <>
                      <TableHead>Chofer asignado</TableHead>
                      <TableHead>Centro de costo</TableHead>
                      <TableHead>Ciudad</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead>Combustible</TableHead>
                    </>
                  )}
                  {vista === "documentacion" && (
                    <>
                      <TableHead>Documentos</TableHead>
                      <TableHead>Próximo vencimiento</TableHead>
                      <TableHead>Estado</TableHead>
                    </>
                  )}
                  {vista === "estado" && (
                    <>
                      <TableHead className="text-right">Km actual</TableHead>
                      <TableHead>Última lectura</TableHead>
                      <TableHead>Último checklist</TableHead>
                      <TableHead>Disponibilidad</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((u) => (
                  <FilaUnidad key={u.dominio} u={u} vista={vista} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FilaUnidad({ u, vista }: { u: MaestroFlotaUnidad; vista: Vista }) {
  const f = u.ficha
  const falta = (campo: string) => u.camposFaltantes.includes(campo)

  // Papel que vence primero (los que no vencen nunca no cuentan).
  const proximo = u.documentos
    .filter((d) => d.vencimiento)
    .sort((a, b) => (a.vencimiento! < b.vencimiento! ? -1 : 1))[0]

  return (
    <TableRow className={cn(!u.activo && "opacity-60")}>
      <TableCell className="font-medium">
        <Link href={`/vehiculos/${encodeURIComponent(u.dominio)}`} className="hover:underline">
          {u.dominio}
        </Link>
        {!u.activo && (
          <Badge variant="outline" className="ml-1.5 text-[10px]">
            baja
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {u.tipo ? (TIPO_LABEL[u.tipo] ?? u.tipo) : "—"}
      </TableCell>

      {vista === "identificacion" && (
        <>
          <TableCell><Dato valor={f?.marca} falta={falta("marca")} /></TableCell>
          <TableCell><Dato valor={f?.modelo} falta={falta("modelo")} /></TableCell>
          <TableCell><Dato valor={f?.anio} falta={falta("anio")} /></TableCell>
          <TableCell className="font-mono text-xs">
            <Dato valor={f?.chasis} falta={falta("chasis")} />
          </TableCell>
          <TableCell className="font-mono text-xs"><Dato valor={f?.vin} /></TableCell>
          <TableCell className="font-mono text-xs">
            <Dato valor={f?.motor} falta={falta("motor")} />
          </TableCell>
          <TableCell><Dato valor={f?.capacidad_carga} /></TableCell>
          <TableCell><Dato valor={f?.carroceria} /></TableCell>
        </>
      )}

      {vista === "asignacion" && (
        <>
          <TableCell><Dato valor={f?.chofer_asignado} /></TableCell>
          <TableCell><Dato valor={f?.centro_costo} /></TableCell>
          <TableCell><Dato valor={f?.ciudad} /></TableCell>
          <TableCell className="text-muted-foreground">{u.sector ?? "—"}</TableCell>
          <TableCell>
            <Dato valor={f?.combustible} />
            {f?.combustible_aux && (
              <span className="text-xs text-muted-foreground"> + {f.combustible_aux}</span>
            )}
          </TableCell>
        </>
      )}

      {vista === "documentacion" && (
        <>
          <TableCell>
            {u.documentos.length === 0 ? (
              <span className="text-xs text-amber-600">sin documentos</span>
            ) : (
              <span>{u.documentos.length}</span>
            )}
          </TableCell>
          <TableCell className="text-muted-foreground">
            {proximo ? `${proximo.nombre} · ${fmtFecha(proximo.vencimiento)}` : "—"}
          </TableCell>
          <TableCell>
            {u.docsVencidos > 0 ? (
              <Badge variant="outline" className="border-destructive/40 bg-destructive/5 text-[10px] text-destructive">
                {u.docsVencidos} vencido{u.docsVencidos === 1 ? "" : "s"}
              </Badge>
            ) : u.docsPorVencer > 0 ? (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                {u.docsPorVencer} por vencer
              </Badge>
            ) : u.documentos.length > 0 ? (
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                Al día
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground/60">—</span>
            )}
          </TableCell>
        </>
      )}

      {vista === "estado" && (
        <>
          <TableCell className="text-right tabular-nums">{fmtNum(u.kmActual)}</TableCell>
          <TableCell className="text-muted-foreground">{fmtFecha(u.kmFecha)}</TableCell>
          <TableCell className="text-muted-foreground">
            {u.ultimoChecklist ? (
              <span className="inline-flex items-center gap-1">
                <ClipboardCheck className="size-3" />
                {fmtFecha(u.ultimoChecklist)}
              </span>
            ) : (
              <span className="text-xs text-amber-600">nunca</span>
            )}
          </TableCell>
          <TableCell>
            {u.fueraServicio ? (
              <Badge
                variant="outline"
                className="border-orange-300 bg-orange-50 text-[10px] text-orange-700 dark:bg-orange-950/40 dark:text-orange-400"
                title={u.fueraServicio.motivo ?? undefined}
              >
                Fuera de servicio desde {fmtFecha(u.fueraServicio.desde)}
                {u.fueraServicio.numero_ot ? ` · OT ${u.fueraServicio.numero_ot}` : ""}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              >
                Disponible
              </Badge>
            )}
          </TableCell>
        </>
      )}
    </TableRow>
  )
}
