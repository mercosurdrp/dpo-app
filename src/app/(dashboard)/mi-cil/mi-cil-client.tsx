"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Camera, CheckCircle2, CircleAlert, Sparkles } from "lucide-react"
import { createMiTareaCil, type MiCilData } from "@/actions/mi-cil"
import { TAREAS_CIL, labelTareaCil } from "@/lib/flota/cil-tareas"
import { cn } from "@/lib/utils"

const TIPO_LABEL: Record<string, string> = {
  camion: "Camión",
  camioneta: "Camioneta",
  autoelevador: "Autoelevador",
  acoplado: "Acoplado",
}

export function MiCilClient({ data }: { data: MiCilData }) {
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  const [dominio, setDominio] = useState("")
  const [tarea, setTarea] = useState("")
  const [operario, setOperario] = useState(data.nombre)
  const [descripcion, setDescripcion] = useState("")
  const [foto, setFoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const fotoRef = useRef<HTMLInputElement>(null)

  function enviar() {
    setError(null)
    const fd = new FormData()
    fd.set("dominio", dominio)
    fd.set("tarea", tarea)
    fd.set("operario", operario)
    fd.set("descripcion", descripcion)
    if (foto) fd.set("foto", foto)

    iniciar(async () => {
      const res = await createMiTareaCil(fd)
      if ("error" in res) {
        setError(res.error)
        return
      }
      setOk(true)
      setDominio("")
      setTarea("")
      setDescripcion("")
      setFoto(null)
      if (fotoRef.current) fotoRef.current.value = ""
      router.refresh()
      setTimeout(() => setOk(false), 4000)
    })
  }

  const listo = dominio && tarea && operario.trim() && foto

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 pb-24">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Sparkles className="size-6 text-primary" /> Mi CIL
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registrá la limpieza, el control de fluidos o la lubricación que hiciste sobre tu unidad.
        </p>
      </header>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Tareas del equipo este mes</span>
          <span className="text-sm font-semibold text-foreground">
            {data.mesTotal} / {data.metaMes}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              data.mesTotal >= data.metaMes ? "bg-emerald-500" : "bg-primary",
            )}
            style={{ width: `${Math.min(100, (data.mesTotal / data.metaMes) * 100)}%` }}
          />
        </div>
      </div>

      {/* Qué unidades quedan sin cerrar el ciclo del mes: evita que el chofer
          tenga que preguntar y que todo el CIL caiga sobre las mismas 6. */}
      {data.pendientes.length > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-300">
            <CircleAlert className="size-4 shrink-0" />
            Faltan {data.pendientes.length} unidad
            {data.pendientes.length === 1 ? "" : "es"} este mes
          </p>
          <ul className="mt-2 space-y-1">
            {data.pendientes.map((u) => (
              <li key={u.dominio} className="text-sm text-amber-900 dark:text-amber-200">
                <span className="font-medium">{u.dominio}</span>
                {u.numero && <span className="text-xs"> (N° {u.numero})</span>}
                <span className="text-xs">
                  {" — "}
                  {u.faltan.map((t) => labelTareaCil(t)).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="size-5 shrink-0" />
          <span className="text-sm font-medium">
            Todas las unidades tienen el CIL del mes completo.
          </span>
        </div>
      )}

      {ok && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="size-5 shrink-0" />
          <span className="text-sm font-medium">Tarea registrada. Gracias.</span>
        </div>
      )}

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div>
          <label className="text-sm font-medium text-foreground">1 · ¿Qué unidad?</label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.unidades.map((u) => (
              <button
                key={u.dominio}
                type="button"
                onClick={() => setDominio(u.dominio)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  dominio === u.dominio
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "hover:bg-accent",
                )}
              >
                <span className="block text-sm font-semibold text-foreground">
                  {u.numero ? `${u.numero} · ` : ""}
                  {u.dominio}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {TIPO_LABEL[u.tipo ?? ""] ?? u.tipo ?? ""}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">2 · ¿Qué hiciste?</label>
          <div className="mt-2 space-y-2">
            {TAREAS_CIL.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTarea(t.id)}
                className={cn(
                  "block w-full rounded-lg border p-3 text-left transition-colors",
                  tarea === t.id
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "hover:bg-accent",
                )}
              >
                <span className="block text-sm font-semibold text-foreground">{t.label}</span>
                <span className="block text-xs text-muted-foreground">{t.detalle}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">3 · ¿Quién la hizo?</label>
          <p className="mt-1 text-xs text-muted-foreground">
            Viene con tu nombre. Si la hizo otra persona, escribí el nombre de quien la hizo.
          </p>
          <input
            type="text"
            value={operario}
            onChange={(e) => setOperario(e.target.value)}
            placeholder="Nombre y apellido"
            className="mt-2 w-full rounded-lg border bg-background p-3 text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">4 · Foto de la unidad</label>
          <p className="mt-1 text-xs text-muted-foreground">
            Es obligatoria: es la prueba de que la tarea se hizo.
          </p>
          <input
            ref={fotoRef}
            type="file"
            accept="image/*"
            onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fotoRef.current?.click()}
            className={cn(
              "mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm transition-colors",
              foto
                ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            <Camera className="size-5" />
            {foto ? foto.name.slice(0, 40) : "Sacar o elegir una foto"}
          </button>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">
            5 · ¿Encontraste algo? <span className="text-muted-foreground">(opcional)</span>
          </label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            placeholder="Ej.: pérdida de aceite debajo del motor, faro trasero quemado…"
            className="mt-2 w-full rounded-lg border bg-background p-3 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Si es un defecto crítico, avisá igual al Supervisor de Flota: la unidad no sale a ruta
            hasta resolverlo.
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!listo || pendiente}
          onClick={enviar}
          className="w-full rounded-lg bg-primary p-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {pendiente ? "Guardando…" : "Registrar la tarea"}
        </button>
      </section>

      {data.mias.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Lo que cargaste</h2>
          <ul className="mt-3 space-y-2">
            {data.mias.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between border-b pb-2 text-sm last:border-0 last:pb-0"
              >
                <span className="text-foreground">
                  <span className="font-medium">{t.dominio}</span>
                  <span className="text-muted-foreground"> · {labelTareaCil(t.tarea)}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.fecha.split("-").reverse().join("/")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
