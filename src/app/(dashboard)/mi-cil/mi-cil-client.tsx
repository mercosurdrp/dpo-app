"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Check,
  CheckCircle2,
  CircleAlert,
  Plus,
  Sparkles,
  X,
} from "lucide-react"
import { createMiTareaCil, type MiCilData } from "@/actions/mi-cil"
import { FotoInput } from "@/components/foto/foto-input"
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
  // 🚨 Es una LISTA de trabajos, no uno solo: el que lava el camión casi siempre
  // aprovecha y controla fluidos y engrasa en la misma parada. Con una sola
  // opción había que repetir el formulario entero —foto incluida— por cada
  // trabajo, y terminaba cargándose uno solo de los tres.
  const [tareas, setTareas] = useState<string[]>([])
  // 🚨 Arranca vacío a propósito: antes venía con el nombre del usuario logueado
  // y quedaba pegado por descuido, aunque la tarea la hubiera hecho otro.
  // Es una lista porque el CIL se hace de a dos casi siempre.
  const [operarios, setOperarios] = useState<string[]>([""])
  const [descripcion, setDescripcion] = useState("")
  const [foto, setFoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<number | null>(null)

  /** Los nombres cargados, en una sola línea: así los guarda la tabla. */
  const nombres = operarios.map((n) => n.trim()).filter(Boolean)

  /** Qué le falta este mes a la unidad elegida, para no cargar dos veces lo mismo. */
  const faltanEnLaUnidad =
    data.pendientes.find((u) => u.dominio === dominio)?.faltan ?? null

  function alternarTarea(id: string) {
    setTareas((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    )
  }

  function enviar() {
    setError(null)
    const fd = new FormData()
    fd.set("dominio", dominio)
    // append, no set: el server las lee con `getAll`.
    for (const t of tareas) fd.append("tarea", t)
    fd.set("operario", nombres.join(", "))
    fd.set("descripcion", descripcion)
    if (foto) fd.set("foto", foto)

    iniciar(async () => {
      const res = await createMiTareaCil(fd)
      if ("error" in res) {
        setError(res.error)
        return
      }
      setOk(res.creadas)
      setDominio("")
      setTareas([])
      setDescripcion("")
      setFoto(null)
      router.refresh()
      setTimeout(() => setOk(null), 4000)
    })
  }

  // Los nombres NO se limpian al guardar: el que hace el CIL suele cargar varias
  // unidades seguidas y volver a escribirlos cada vez es lo que hace que se
  // abandone la carga por la mitad.
  const listo = dominio && tareas.length > 0 && nombres.length > 0 && foto

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 pb-24">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Sparkles className="size-6 text-primary" /> Mi CIL
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registrá la limpieza, el control de fluidos y la lubricación que le hiciste a tu
          unidad. Si hiciste más de una, van todas juntas en una sola carga.
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

      {ok !== null && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="size-5 shrink-0" />
          <span className="text-sm font-medium">
            {ok === 1 ? "Trabajo registrado" : `${ok} trabajos registrados`}. Gracias.
          </span>
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
          <label className="text-sm font-medium text-foreground">
            2 · ¿Qué le hiciste?
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Tildá todos los trabajos que le hiciste a la unidad. Si lavaste, controlaste
            fluidos y engrasaste, marcá los tres: se registran juntos, con una sola foto.
          </p>
          <div className="mt-2 space-y-2">
            {TAREAS_CIL.map((t) => {
              const marcada = tareas.includes(t.id)
              // Sólo se informa; no se pre-tilda nada, porque tildar solo sería
              // registrar trabajo que capaz no se hizo.
              const yaHecha =
                dominio !== "" && faltanEnLaUnidad !== null && !faltanEnLaUnidad.includes(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={marcada}
                  onClick={() => alternarTarea(t.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    marcada
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "hover:bg-accent",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border-2",
                      marcada
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40",
                    )}
                  >
                    {marcada && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{t.label}</span>
                      {yaHecha && (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                          ya hecha este mes
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground">{t.detalle}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">
            3 · ¿Quién los hizo?
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Escribí el nombre de quien hizo el trabajo. Si lo hicieron entre varios,
            agregalos a todos.
          </p>
          <div className="mt-2 space-y-2">
            {operarios.map((nombre, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) =>
                    setOperarios((prev) =>
                      prev.map((n, j) => (j === i ? e.target.value : n)),
                    )
                  }
                  placeholder={i === 0 ? "Nombre y apellido" : "Nombre y apellido de la otra persona"}
                  className="w-full rounded-lg border bg-background p-3 text-sm"
                />
                {operarios.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setOperarios((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Quitar la persona ${i + 1}`}
                    className="shrink-0 rounded-lg border p-3 text-muted-foreground transition-colors hover:bg-accent"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOperarios((prev) => [...prev, ""])}
            className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Plus className="size-4" /> Agregar otra persona
          </button>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">4 · Foto de la unidad</label>
          <p className="mt-1 text-xs text-muted-foreground">
            Es obligatoria: es la prueba de que el trabajo se hizo. Con una alcanza
            para todos los trabajos que marcaste.
          </p>
          {/*
            🚨 «Sacar foto» abre la cámara DENTRO de la app (getUserMedia), no el
            selector del sistema. Antes era un `<input capture="environment">` y
            el celular abría la galería igual —el atributo es sólo una sugerencia
            y los WebView lo ignoran—, así que sin foto el botón de guardar
            quedaba deshabilitado y la carga no se enviaba nunca.
          */}
          <FotoInput
            foto={foto}
            onFoto={setFoto}
            nombreBase={`cil-${dominio || "unidad"}`}
            className="mt-2"
          />
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
          {pendiente
            ? "Guardando…"
            : tareas.length > 1
              ? `Registrar los ${tareas.length} trabajos`
              : "Registrar el trabajo"}
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
