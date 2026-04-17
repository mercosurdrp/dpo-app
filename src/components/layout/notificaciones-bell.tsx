"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Bell, Check, X } from "lucide-react"
import { toast } from "sonner"
import {
  eliminarNotificacion,
  getMisNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
} from "@/actions/notificaciones"
import type { Notificacion } from "@/types/database"
import { cn } from "@/lib/utils"

const POLL_MS = 60_000

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffSec = Math.max(1, Math.floor(diffMs / 1000))
  if (diffSec < 60) return `hace ${diffSec}s`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `hace ${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `hace ${diffHr}h`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `hace ${diffDay}d`
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" })
}

interface Props {
  collapsed?: boolean
}

export function NotificacionesBell({ collapsed = false }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notificacion[]>([])
  const [isPending, startTransition] = useTransition()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)

  const noLeidas = items.filter((n) => !n.leida).length

  // Initial + polling. Sincroniza el componente con el sistema externo (DB).
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const res = await getMisNotificaciones()
      if (cancelled) return
      if ("data" in res) {
        setItems(res.data)
      }
    }
    run()
    const id = setInterval(run, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  // Click fuera cierra
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      const target = e.target as Node
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        btnRef.current &&
        !btnRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  function handleClickItem(n: Notificacion) {
    // Marcar leída (optimista) + navegar
    if (!n.leida) {
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x))
      )
      marcarLeida(n.id).catch(() => {
        // revert en caso de error — no crítico
      })
    }
    setOpen(false)
    if (n.link) {
      router.push(n.link)
    }
  }

  function handleEliminar(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const prev = items
    setItems((p) => p.filter((n) => n.id !== id))
    startTransition(async () => {
      const res = await eliminarNotificacion(id)
      if ("error" in res) {
        setItems(prev)
        toast.error(res.error)
      }
    })
  }

  function handleMarcarTodas() {
    const prev = items
    setItems((p) => p.map((n) => ({ ...n, leida: true })))
    startTransition(async () => {
      const res = await marcarTodasLeidas()
      if ("error" in res) {
        setItems(prev)
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors",
          "text-slate-400 hover:bg-white/5 hover:text-white"
        )}
        aria-label="Notificaciones"
      >
        <Bell className="size-4 shrink-0" />
        {!collapsed && <span className="flex-1 text-left">Notificaciones</span>}
        {noLeidas > 0 && (
          <span
            className={cn(
              "rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-5 text-white",
              collapsed && "absolute left-7 top-1.5"
            )}
          >
            {noLeidas > 99 ? "99+" : noLeidas}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-full bottom-0 z-50 ml-2 w-80 rounded-lg border border-slate-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-semibold text-slate-800">Notificaciones</p>
            {noLeidas > 0 && (
              <button
                type="button"
                onClick={handleMarcarTodas}
                disabled={isPending}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
              >
                <Check className="size-3" />
                Marcar todas leídas
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">
                No tenés notificaciones.
              </p>
            ) : (
              <ul className="divide-y">
                {items.map((n) => (
                  <li
                    key={n.id}
                    onClick={() => handleClickItem(n)}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-slate-50",
                      !n.leida && "bg-blue-50/50"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {!n.leida && (
                          <span className="size-2 shrink-0 rounded-full bg-blue-500" />
                        )}
                        <p className="truncate text-sm font-medium text-slate-900">
                          {n.titulo}
                        </p>
                      </div>
                      {n.mensaje && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                          {n.mensaje}
                        </p>
                      )}
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {formatRelative(n.created_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleEliminar(e, n.id)}
                      disabled={isPending}
                      className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      aria-label="Eliminar notificación"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
