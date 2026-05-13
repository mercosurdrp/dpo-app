"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Save, AlertCircle, CheckCircle2 } from "lucide-react"
import {
  setObjetivoTiempoRutaZona,
  type ObjetivosTiempoRuta,
  type ZonaName,
} from "@/actions/tiempo-ruta-zona"

const ZONAS: ZonaName[] = ["Norte", "Central", "Este"]
const ZONA_COLOR: Record<ZonaName, string> = {
  Norte: "#ef4444",
  Central: "#f59e0b",
  Este: "#2dd4bf",
}

function fmtHHMM(min: number): string {
  const hh = Math.floor(min / 60)
  const mm = min % 60
  return `${hh}:${mm.toString().padStart(2, "0")}`
}

function parseHHMM(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // Acepta "HH:MM", "H:MM", "Hh", "HHmm", "HH" (horas enteras)
  const m = trimmed.match(/^(\d{1,2}):(\d{1,2})$/)
  if (m) {
    const h = parseInt(m[1], 10)
    const mm = parseInt(m[2], 10)
    if (mm >= 60) return null
    return h * 60 + mm
  }
  const onlyDigits = trimmed.match(/^(\d{1,3})$/)
  if (onlyDigits) {
    return parseInt(onlyDigits[1], 10) * 60
  }
  return null
}

interface RowState {
  meta: string
  tol: string
  saving: boolean
  status: { kind: "ok" | "err"; msg: string } | null
}

interface Props {
  initial: ObjetivosTiempoRuta
}

export function ObjetivosTiempoRutaEditor({ initial }: Props) {
  const [rows, setRows] = useState<Record<ZonaName, RowState>>(() => {
    const out = {} as Record<ZonaName, RowState>
    for (const z of ZONAS) {
      out[z] = {
        meta: fmtHHMM(initial[z].meta_minutos),
        tol: fmtHHMM(initial[z].tolerancia_minutos),
        saving: false,
        status: null,
      }
    }
    return out
  })
  const [, startTransition] = useTransition()

  const updateRow = (z: ZonaName, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [z]: { ...prev[z], ...patch } }))

  const guardar = (z: ZonaName) => {
    const row = rows[z]
    const meta = parseHHMM(row.meta)
    const tol = parseHHMM(row.tol)
    if (meta == null || meta <= 0) {
      updateRow(z, { status: { kind: "err", msg: "Meta inválida (usá hh:mm)" } })
      return
    }
    if (tol == null || tol < 0) {
      updateRow(z, { status: { kind: "err", msg: "Tolerancia inválida (usá hh:mm)" } })
      return
    }
    updateRow(z, { saving: true, status: null })
    startTransition(async () => {
      const r = await setObjetivoTiempoRutaZona({
        zona: z,
        meta_minutos: meta,
        tolerancia_minutos: tol,
      })
      if ("error" in r) {
        updateRow(z, { saving: false, status: { kind: "err", msg: r.error } })
      } else {
        updateRow(z, {
          saving: false,
          meta: fmtHHMM(meta),
          tol: fmtHHMM(tol),
          status: { kind: "ok", msg: "Guardado" },
        })
        setTimeout(() => updateRow(z, { status: null }), 2500)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Objetivos de tiempo en ruta por zona</h1>
        <p className="text-sm text-muted-foreground">
          Meta y tolerancia (hh:mm). Verde ≤ meta · Amarillo ≤ meta + tolerancia · Rojo &gt; meta + tolerancia.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {ZONAS.map((z) => {
          const row = rows[z]
          const last = initial[z].updated_at
          return (
            <Card key={z} className="border-l-4" style={{ borderLeftColor: ZONA_COLOR[z] }}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{z}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-700">Meta (hh:mm)</label>
                  <Input
                    value={row.meta}
                    onChange={(e) => updateRow(z, { meta: e.target.value })}
                    placeholder="8:00"
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700">Tolerancia (hh:mm)</label>
                  <Input
                    value={row.tol}
                    onChange={(e) => updateRow(z, { tol: e.target.value })}
                    placeholder="1:00"
                    className="mt-1 font-mono"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => guardar(z)}
                    disabled={row.saving}
                  >
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    {row.saving ? "Guardando…" : "Guardar"}
                  </Button>
                  {row.status?.kind === "ok" && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {row.status.msg}
                    </span>
                  )}
                  {row.status?.kind === "err" && (
                    <span className="inline-flex items-center gap-1 text-xs text-red-700">
                      <AlertCircle className="h-3.5 w-3.5" /> {row.status.msg}
                    </span>
                  )}
                </div>
                {last && (
                  <p className="text-[10px] text-muted-foreground">
                    Actualizado {new Date(last).toLocaleString("es-AR")}
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        Las zonas se definen por polígono en{" "}
        <Link href="/indicadores/foxtrot-tracking/zonas" className="underline">
          Foxtrot Tracking · Configurar zonas
        </Link>
        . Acá solo se editan los objetivos numéricos.
      </div>
    </div>
  )
}
