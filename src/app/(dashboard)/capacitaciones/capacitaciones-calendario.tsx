"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CapacitacionConResumen, EstadoCapacitacion } from "@/types/database"

type Item = CapacitacionConResumen & { estadoReal: EstadoCapacitacion }

interface Props {
  capacitaciones: Item[]
}

const PILAR_COLORS: Record<string, string> = {
  Seguridad: "#EF4444",
  Gente: "#3B82F6",
  Gestion: "#8B5CF6",
  Entrega: "#F59E0B",
  Flota: "#10B981",
  Almacen: "#6366F1",
  Planeamiento: "#EC4899",
}
const SIN_PILAR_COLOR = "#94A3B8"

function normalizePilar(pilar: string | null): string {
  return pilar ? pilar.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : ""
}

function colorDePilar(pilar: string | null): string {
  return PILAR_COLORS[normalizePilar(pilar)] ?? SIN_PILAR_COLOR
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

const pad = (n: number) => String(n).padStart(2, "0")
const MAX_CHIPS = 3

export function CapacitacionesCalendario({ capacitaciones }: Props) {
  const hoy = new Date()
  const hoyStr = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`

  const [cursor, setCursor] = useState({ y: hoy.getFullYear(), m: hoy.getMonth() })

  // Agrupa por fecha (YYYY-MM-DD) para evitar problemas de zona horaria
  const porFecha = useMemo(() => {
    const map = new Map<string, Item[]>()
    for (const c of capacitaciones) {
      if (!c.fecha) continue
      const arr = map.get(c.fecha) ?? []
      arr.push(c)
      map.set(c.fecha, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.titulo.localeCompare(b.titulo))
    }
    return map
  }, [capacitaciones])

  const { celdas, enElMes } = useMemo(() => {
    const { y, m } = cursor
    const primer = new Date(y, m, 1)
    const offset = (primer.getDay() + 6) % 7 // lunes = 0
    const diasEnMes = new Date(y, m + 1, 0).getDate()
    const arr: (number | null)[] = []
    for (let i = 0; i < offset; i++) arr.push(null)
    for (let d = 1; d <= diasEnMes; d++) arr.push(d)
    while (arr.length % 7 !== 0) arr.push(null)

    const prefijo = `${y}-${pad(m + 1)}-`
    let total = 0
    for (const [fecha, items] of porFecha) {
      if (fecha.startsWith(prefijo)) total += items.length
    }
    return { celdas: arr, enElMes: total }
  }, [cursor, porFecha])

  const irMes = (delta: number) =>
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4 text-slate-400" />
            Calendario de Programación
          </CardTitle>
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs text-slate-500">
              {enElMes} {enElMes === 1 ? "capacitación" : "capacitaciones"}
            </span>
            <Button variant="outline" size="icon" className="size-8" onClick={() => irMes(-1)} title="Mes anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-[9.5rem] text-center text-sm font-semibold text-slate-900">
              {MESES[cursor.m]} {cursor.y}
            </span>
            <Button variant="outline" size="icon" className="size-8" onClick={() => irMes(1)} title="Mes siguiente">
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="ml-1 h-8"
              onClick={() => setCursor({ y: hoy.getFullYear(), m: hoy.getMonth() })}
            >
              Hoy
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-px border-b text-center text-xs font-medium uppercase tracking-wide text-slate-500">
          {DIAS.map((d) => (
            <div key={d} className="pb-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-md bg-slate-100">
          {celdas.map((d, i) => {
            if (d === null) {
              return <div key={`x${i}`} className="min-h-[5.5rem] bg-slate-50/60" />
            }
            const fecha = `${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}`
            const items = porFecha.get(fecha) ?? []
            const esHoy = fecha === hoyStr
            return (
              <div key={fecha} className="min-h-[5.5rem] bg-white p-1">
                <div
                  className={`mb-1 flex size-5 items-center justify-center rounded-full text-xs ${
                    esHoy ? "bg-blue-600 font-semibold text-white" : "text-slate-400"
                  }`}
                >
                  {d}
                </div>
                <div className="space-y-0.5">
                  {items.slice(0, MAX_CHIPS).map((c) => {
                    const color = colorDePilar(c.pilar)
                    const cancelada = c.estadoReal === "cancelada"
                    return (
                      <Link
                        key={c.id}
                        href={`/capacitaciones/${c.id}`}
                        title={`${c.titulo}${c.instructor ? ` · ${c.instructor}` : ""}${c.lugar ? ` · ${c.lugar}` : ""}`}
                        className={`block truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight hover:brightness-95 ${
                          cancelada ? "line-through opacity-50" : ""
                        }`}
                        style={{ backgroundColor: color + "22", color }}
                      >
                        {c.titulo}
                      </Link>
                    )
                  })}
                  {items.length > MAX_CHIPS && (
                    <div className="px-1 text-[10px] text-slate-400">
                      +{items.length - MAX_CHIPS} más
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
