"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Truck, Clock, Package, MapPin, FileText, PlayCircle, CheckCircle2, LogIn, Trash2, Tv, QrCode, Download } from "lucide-react"
import {
  getPendientesAcarreo,
  ingresarDepositoAcarreo,
  iniciarDescargaAcarreo,
  finalizarDescargaAcarreo,
  borrarRecepcionAcarreo,
  type RecepcionPendiente,
} from "@/actions/acarreo"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ACARREO_ANUNCIO_URL } from "@/lib/acarreo-anuncio"

type Color = "verde" | "amarillo" | "rojo"
function semaforo(min: number): Color {
  if (min > 120) return "rojo"
  if (min >= 60) return "amarillo"
  return "verde"
}
const ESTILO: Record<Color, { card: string; dot: string; timer: string; chip: string }> = {
  verde: { card: "border-emerald-200 bg-emerald-50", dot: "bg-emerald-500", timer: "text-emerald-700", chip: "bg-emerald-100 text-emerald-700" },
  amarillo: { card: "border-amber-200 bg-amber-50", dot: "bg-amber-500", timer: "text-amber-700", chip: "bg-amber-100 text-amber-700" },
  rojo: { card: "border-red-300 bg-red-50", dot: "bg-red-500", timer: "text-red-700", chip: "bg-red-100 text-red-700" },
}

function fmtDur(min: number): string {
  const m = Math.max(0, min)
  const h = Math.floor(m / 60)
  const r = m % 60
  return h > 0 ? `${h}h ${String(r).padStart(2, "0")}m` : `${r}m`
}
function horaHHmm(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

export function RecepcionClient({
  inicial,
  errorInicial,
  esAdmin = false,
  puedeIngreso = false,
}: {
  inicial: RecepcionPendiente[]
  errorInicial: string | null
  esAdmin?: boolean
  puedeIngreso?: boolean
}) {
  const [rows, setRows] = useState<RecepcionPendiente[]>(inicial)
  const [now, setNow] = useState(() => Date.now())
  const [pending, start] = useTransition()
  const [qrAbierto, setQrAbierto] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setInterval(async () => {
      const r = await getPendientesAcarreo()
      if ("data" in r) setRows(r.data)
    }, 20000)
    return () => clearInterval(t)
  }, [])

  async function refrescar() {
    const r = await getPendientesAcarreo()
    if ("data" in r) setRows(r.data)
  }

  return (
    <div className="space-y-5 p-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Truck className="size-6 text-pink-600" />
            Recepción de acarreos
          </h1>
          <p className="text-sm text-slate-500">
            Camiones anunciados y en descarga. El tiempo se actualiza solo. 🟢 &lt;1h · 🟡 1–2h · 🔴 &gt;2h.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setQrAbierto(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <QrCode className="size-4" /> Ver QR
          </button>
          <a
            href="https://acarreo-rdf.vercel.app/monitor"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Tv className="size-4" /> Modo monitor
          </a>
        </div>
      </div>

      <Dialog open={qrAbierto} onOpenChange={setQrAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="size-5 text-pink-600" />
              QR para anunciarse
            </DialogTitle>
            <DialogDescription>
              Mostrale esta pantalla al chofer o imprimí el cartel para la portería. Al escanearlo
              carga patente, transportista y remito, y queda anunciado acá.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/api/acarreo/qr"
              alt={`Código QR que abre ${ACARREO_ANUNCIO_URL}`}
              width={280}
              height={280}
              className="size-[280px] max-w-full rounded-lg border border-slate-200 bg-white p-2"
            />
            <a
              href={ACARREO_ANUNCIO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-center text-xs text-slate-500 underline-offset-2 hover:underline"
            >
              {ACARREO_ANUNCIO_URL}
            </a>
            <a
              href="/api/acarreo/qr?format=pdf"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
            >
              <Download className="size-4" /> Descargar cartel A4
            </a>
          </div>
        </DialogContent>
      </Dialog>

      {errorInicial ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {errorInicial}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 py-16 text-center">
          <Truck className="mx-auto size-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">No hay camiones pendientes en este momento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const estadiaMin = Math.round((now - new Date(r.hora_arribo).getTime()) / 60000)
            const color = semaforo(estadiaMin)
            const c = ESTILO[color]
            const estadoLabel =
              r.estado === "descargando" ? "Descargando" : r.estado === "ingresado" ? "En depósito" : "Anunciado"
            return (
              <div key={r.id} className={`rounded-xl border p-4 shadow-sm ${c.card}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full ${c.dot}`} />
                    <span className="text-lg font-bold tracking-tight text-slate-900">{r.patente}</span>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.chip}`}>
                    {estadoLabel}
                  </span>
                </div>

                <div className="mt-3 flex items-baseline gap-2">
                  <Clock className="size-4 text-slate-400" />
                  <span className={`font-mono text-2xl font-bold tabular-nums ${c.timer}`}>
                    {fmtDur(estadiaMin)}
                  </span>
                  <span className="text-xs text-slate-500">de estadía</span>
                </div>

                <div className="mt-3 space-y-1 text-sm text-slate-600">
                  <Linea icon={<Clock className="size-3.5" />} t={`Arribo ${horaHHmm(r.hora_arribo)}`} />
                  {r.hora_ingreso_deposito && <Linea icon={<LogIn className="size-3.5" />} t={`Ingreso ${horaHHmm(r.hora_ingreso_deposito)}`} />}
                  {r.transportista && <Linea icon={<Truck className="size-3.5" />} t={r.transportista} />}
                  {r.origen && <Linea icon={<MapPin className="size-3.5" />} t={r.origen} />}
                  {r.remito && <Linea icon={<FileText className="size-3.5" />} t={`Remito ${r.remito}`} />}
                  {r.pallets != null && <Linea icon={<Package className="size-3.5" />} t={`${r.pallets} pallets`} />}
                </div>

                <div className="mt-4 flex gap-2">
                  {r.estado === "anunciado" && puedeIngreso && (
                    <button
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const res = await ingresarDepositoAcarreo(r.id)
                          if (res.error) toast.error(res.error)
                          await refrescar()
                        })
                      }
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
                    >
                      <LogIn className="size-4" /> Ingreso a depósito
                    </button>
                  )}
                  {r.estado === "anunciado" && !puedeIngreso && (
                    <span className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs italic text-slate-500">
                      Esperando ingreso a depósito
                    </span>
                  )}
                  {r.estado === "ingresado" && (
                    <button
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const res = await iniciarDescargaAcarreo(r.id)
                          if (res.error) toast.error(res.error)
                          await refrescar()
                        })
                      }
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
                    >
                      <PlayCircle className="size-4" /> Iniciar descarga
                    </button>
                  )}
                  {r.estado === "descargando" && (
                    <button
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const res = await finalizarDescargaAcarreo(r.id)
                          if (res.error) toast.error(res.error)
                          await refrescar()
                        })
                      }
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                    >
                      <CheckCircle2 className="size-4" /> Finalizar
                    </button>
                  )}
                  {esAdmin && (
                    <button
                      disabled={pending}
                      title="Borrar arribo"
                      onClick={() =>
                        start(async () => {
                          if (!window.confirm(`¿Borrar el arribo de ${r.patente}?`)) return
                          const res = await borrarRecepcionAcarreo(r.id)
                          if (res.error) toast.error(res.error)
                          await refrescar()
                        })
                      }
                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Linea({ icon, t }: { icon: React.ReactNode; t: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-400">{icon}</span>
      <span>{t}</span>
    </div>
  )
}
