"use client"

import { useCallback, useState, useSyncExternalStore } from "react"
import {
  Truck,
  PackageCheck,
  Forklift,
  ScanLine,
  CalendarClock,
  TriangleAlert,
  Ban,
  BookOpenCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  PROCEDIMIENTOS,
  VIGENCIA_INSTRUCTIVOS,
  type Procedimiento,
  type TonoNumero,
} from "./procedimientos"

const ICONOS: Record<string, React.ReactNode> = {
  camion: <Truck className="size-5" />,
  recepcion: <PackageCheck className="size-5" />,
  carga: <Forklift className="size-5" />,
  picking: <ScanLine className="size-5" />,
  fefo: <CalendarClock className="size-5" />,
}

const TONO_NUMERO: Record<TonoNumero, string> = {
  ok: "text-emerald-700",
  warn: "text-amber-700",
  stop: "text-red-700",
  neutro: "text-slate-900",
}

/**
 * Los tildes del check rápido son una ayuda para no perder el hilo en la tarea:
 * viven en el celular del operario y no se informan a nadie. Por eso van a
 * localStorage y no a la base — si mañana el encargado necesita ver quién leyó
 * qué, eso es otra pantalla, con su tabla y su registro.
 */
const VACIO: number[] = []
const suscriptores = new Set<() => void>()
/** Caché por instructivo: useSyncExternalStore exige un snapshot estable. */
const cache = new Map<string, number[]>()

function claveCheck(id: string) {
  return `dpo-instructivo-check-${id}`
}

function leerCheck(id: string): number[] {
  try {
    const raw = localStorage.getItem(claveCheck(id))
    if (!raw) return VACIO
    const indices = raw
      .split(",")
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n))
    return indices.length > 0 ? indices : VACIO
  } catch {
    // Modo privado o storage bloqueado: la pantalla funciona igual, sin memoria.
    return VACIO
  }
}

function snapshotCheck(id: string): number[] {
  const guardado = cache.get(id)
  if (guardado) return guardado
  const leido = leerCheck(id)
  cache.set(id, leido)
  return leido
}

function suscribir(cb: () => void) {
  suscriptores.add(cb)
  return () => {
    suscriptores.delete(cb)
  }
}

function guardarCheck(id: string, indices: number[]) {
  cache.set(id, indices)
  try {
    localStorage.setItem(claveCheck(id), indices.join(","))
  } catch {
    // Igual que arriba: sin storage, el tilde vale para esta visita nomás.
  }
  suscriptores.forEach((cb) => cb())
}

export function InstructivosClient() {
  const [activoId, setActivoId] = useState(PROCEDIMIENTOS[0].id)
  const activo = PROCEDIMIENTOS.find((p) => p.id === activoId) ?? PROCEDIMIENTOS[0]

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <BookOpenCheck className="size-6 text-blue-600" />
          Cómo se hace
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          El paso a paso del depósito. Elegí el tuyo: vas a encontrar la regla que no se
          negocia, los pasos en orden, qué hacer cuando algo no cierra y un check rápido
          para cerrar la tarea.
        </p>
      </div>

      {/* Selector de instructivo */}
      <div className="grid gap-2 sm:grid-cols-2">
        {PROCEDIMIENTOS.map((p) => {
          const esActivo = p.id === activo.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setActivoId(p.id)}
              aria-pressed={esActivo}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                esActivo
                  ? "border-blue-600 bg-blue-50"
                  : "border-slate-200 bg-white hover:border-slate-300",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 shrink-0",
                  esActivo ? "text-blue-600" : "text-slate-400",
                )}
              >
                {ICONOS[p.id]}
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] font-semibold text-slate-400">
                    {p.numero}
                  </span>
                  <span className="text-sm font-semibold text-slate-900">{p.titulo}</span>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {p.resumen}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <DetalleProcedimiento key={activo.id} proc={activo} />

      <p className="text-xs text-muted-foreground">
        Contenido vigente al {VIGENCIA_INSTRUCTIVOS}. Si cambia una meta, un horario o un
        criterio de bloqueo, se actualiza acá y se avisa en el cambio de turno.
      </p>
    </div>
  )
}

function DetalleProcedimiento({ proc }: { proc: Procedimiento }) {
  const tildados = useSyncExternalStore(
    suscribir,
    useCallback(() => snapshotCheck(proc.id), [proc.id]),
    // En el server no hay storage: la lista arranca vacía y se completa al hidratar.
    useCallback(() => VACIO, []),
  )

  function alternar(i: number) {
    const siguiente = tildados.includes(i)
      ? tildados.filter((x) => x !== i)
      : [...tildados, i]
    guardarCheck(proc.id, siguiente)
  }

  function limpiar() {
    guardarCheck(proc.id, VACIO)
  }

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="border-t-2 border-slate-900 pt-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-blue-600">
          Instructivo {proc.numero} · {proc.area}
        </p>
        <h2 className="mt-1 text-xl font-bold text-slate-900">{proc.titulo}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Dato etiqueta="Quién" valor={proc.quien} />
          <Dato etiqueta="Cuándo" valor={proc.cuando} />
          <Dato etiqueta="Con qué" valor={proc.conQue} />
        </div>
      </div>

      {/* Regla de oro */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div
          className="h-2"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, #e9b500 0 10px, #15202b 10px 20px)",
          }}
        />
        <div className="p-4">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Regla de oro
          </p>
          <p className="mt-1 text-base font-bold uppercase leading-snug text-slate-900">
            {proc.reglaDeOro}
          </p>
        </div>
      </div>

      {/* Por qué */}
      <Card>
        <CardContent className="space-y-2 p-4 text-sm text-slate-600">
          {proc.porQue.map((parrafo, i) => (
            <p key={i}>
              {i === 0 && <span className="font-semibold text-slate-900">Por qué. </span>}
              {parrafo}
            </p>
          ))}
        </CardContent>
      </Card>

      {/* Pasos */}
      <ol className="overflow-hidden rounded-lg border border-slate-200">
        {proc.pasos.map((paso, i) => (
          <li
            key={i}
            className={cn(
              "grid grid-cols-[2.5rem_1fr] gap-3 bg-white p-3",
              i > 0 && "border-t border-slate-100",
            )}
          >
            <span className="flex h-7 items-center justify-center rounded bg-blue-50 font-mono text-xs font-semibold text-blue-700">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="text-[15px] font-semibold leading-snug text-slate-900">
                {paso.titulo}
                {paso.sistema && (
                  <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 align-middle font-mono text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                    sistema
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">{paso.detalle}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* Números */}
      {proc.numeros && (
        <div>
          <div className="grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-3">
            {proc.numeros.map((n) => (
              <div key={n.etiqueta} className="bg-white p-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  {n.etiqueta}
                </p>
                <p
                  className={cn(
                    "text-2xl font-bold tabular-nums leading-tight",
                    TONO_NUMERO[n.tono ?? "neutro"],
                  )}
                >
                  {n.valor}
                </p>
                <p className="text-xs text-slate-500">{n.unidad}</p>
              </div>
            ))}
          </div>
          {proc.notaNumeros && (
            <p className="mt-2 text-xs text-muted-foreground">{proc.notaNumeros}</p>
          )}
        </div>
      )}

      {/* Si pasa esto / Nunca */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-amber-50 p-4">
          <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-amber-700">
            <TriangleAlert className="size-3.5" />
            Si pasa esto
          </p>
          <ul className="mt-2 space-y-2 text-sm text-slate-700">
            {proc.siPasa.map((c) => (
              <li key={c.caso}>
                <span className="font-semibold text-slate-900">{c.caso}:</span> {c.que}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg bg-red-50 p-4">
          <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-red-700">
            <Ban className="size-3.5" />
            Nunca
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-4 text-sm text-slate-700">
            {proc.nunca.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Check rápido */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-semibold text-slate-900">Check rápido</p>
          <p className="font-mono text-xs tabular-nums text-slate-500">
            {tildados.length} de {proc.check.length}
          </p>
        </div>
        <div className="mt-3 space-y-2">
          {proc.check.map((item, i) => {
            const tildado = tildados.includes(i)
            return (
              <label
                key={item}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-white p-3"
              >
                <input
                  type="checkbox"
                  id={`check-${proc.id}-${i}`}
                  checked={tildado}
                  onChange={() => alternar(i)}
                  className="mt-0.5 size-5 shrink-0 accent-blue-600"
                />
                <span
                  className={cn(
                    "text-sm",
                    tildado ? "text-slate-400 line-through" : "text-slate-700",
                  )}
                >
                  {item}
                </span>
              </label>
            )
          })}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-8 px-2 text-xs text-slate-500"
          onClick={limpiar}
        >
          Limpiar
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">
          Los tildes quedan en este celular: son para vos, no se informan a nadie.
        </p>
      </div>
    </div>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
      <span className="font-semibold text-slate-900">{etiqueta}:</span> {valor}
    </span>
  )
}
