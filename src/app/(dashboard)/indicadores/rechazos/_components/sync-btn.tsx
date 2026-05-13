"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SyncOk {
  success: true
  dias_procesados: number
  rechazos_insertados: number
  rechazos_repetidos: number
  ventas_upserted: number
  dias_sin_datos: number
  errors: { day: string | null; kind: string; message: string }[]
  duration_ms: number
}

interface SyncErr {
  error: string
}

function ymdART(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d)
  const y = parts.find((p) => p.type === "year")!.value
  const m = parts.find((p) => p.type === "month")!.value
  const day = parts.find((p) => p.type === "day")!.value
  return `${y}-${m}-${day}`
}

export function SyncBtn() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [isRefreshing, startRefresh] = useTransition()
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  const onClick = async () => {
    setPending(true)
    setMsg(null)
    try {
      const hoy = new Date()
      const ayer = new Date(hoy.getTime() - 24 * 60 * 60 * 1000)
      const fechaDesde = ymdART(ayer)
      const fechaHasta = ymdART(hoy)

      const res = await fetch("/api/rechazos/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechaDesde, fechaHasta }),
      })

      const data: SyncOk | SyncErr = await res.json().catch(() => ({ error: "Respuesta inválida" }))

      if (!res.ok || "error" in data) {
        const errText =
          res.status === 401 ? "No autenticado — refrescá la sesión" :
          res.status === 403 ? "Sin permisos (requiere admin o supervisor)" :
          ("error" in data ? data.error : `Error ${res.status}`)
        setMsg({ kind: "err", text: errText })
        return
      }

      const errsTail = data.errors.length > 0 ? ` · ⚠ ${data.errors.length} error${data.errors.length > 1 ? "es" : ""}` : ""
      setMsg({
        kind: "ok",
        text: `${data.dias_procesados} día${data.dias_procesados !== 1 ? "s" : ""} · ${data.rechazos_insertados} rechazos nuevos${errsTail}`,
      })
      startRefresh(() => router.refresh())
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) })
    } finally {
      setPending(false)
    }
  }

  const busy = pending || isRefreshing

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={onClick}
        disabled={busy}
        className="h-8 gap-1.5"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        {pending ? "Sincronizando..." : isRefreshing ? "Refrescando..." : "Sincronizar"}
      </Button>

      {msg && (
        <div
          className={
            msg.kind === "ok"
              ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800 max-w-[300px]"
              : "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 max-w-[300px]"
          }
        >
          {msg.text}
        </div>
      )}
    </div>
  )
}
