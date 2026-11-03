"use client"

import { useMemo, useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { actualizarAplicacion, crearAplicacion } from "@/actions/benchmarking"
import { INDICADORES, PILARES_ORDEN } from "@/lib/indicadores/cuadro-mensual"
import { APLICACION_ESTADOS, type Bench, type BenchAplicacion } from "@/types/benchmarking"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  bench: Bench | null
  aplicacion: BenchAplicacion | null
  /** Pampeana: se puede elegir un indicador del Cuadro mensual (serie automática). */
  conCuadro: boolean
}

const MANUAL = "__manual__"

export function AplicacionFormDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl">
        {props.open && props.bench && <AplicacionForm {...props} bench={props.bench} />}
      </DialogContent>
    </Dialog>
  )
}

function AplicacionForm({
  onOpenChange,
  onSaved,
  bench,
  aplicacion,
  conCuadro,
}: Omit<Props, "open" | "bench"> & { bench: Bench }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [estado, setEstado] = useState<string>(aplicacion?.estado ?? "en_curso")
  const [indicadorId, setIndicadorId] = useState<string>(aplicacion?.indicador_id ?? MANUAL)
  const [mejorSi, setMejorSi] = useState<string>(aplicacion?.mejor_si ?? "menor")

  const opcionesCuadro = useMemo(() => {
    const porPilar = new Map<string, typeof INDICADORES>()
    for (const d of INDICADORES) {
      if (d.mejor_si === "sin") continue
      const arr = porPilar.get(d.pilar) ?? []
      arr.push(d)
      porPilar.set(d.pilar, arr)
    }
    return PILARES_ORDEN.filter((p) => porPilar.has(p)).map((p) => ({ pilar: p, items: porPilar.get(p)! }))
  }, [])
  const defCuadro = indicadorId !== MANUAL ? INDICADORES.find((d) => d.id === indicadorId) : undefined

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set("estado", estado)
    fd.set("indicador_id", indicadorId === MANUAL ? "" : indicadorId)
    fd.set("mejor_si", mejorSi)
    startTransition(async () => {
      const r = aplicacion ? await actualizarAplicacion(aplicacion.id, fd) : await crearAplicacion(bench.id, fd)
      if ("error" in r) {
        setError(r.error)
        return
      }
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{aplicacion ? "Editar aplicación" : "Qué aplicamos del bench"}</DialogTitle>
        <DialogDescription>
          {bench.titulo}. Elegí el indicador con el que vamos a medir si mejoró (R5.2.4).
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ap-titulo">Qué aplicamos *</Label>
          <Input
            id="ap-titulo"
            name="titulo"
            required
            maxLength={160}
            defaultValue={aplicacion?.titulo ?? ""}
            placeholder="Ej.: Llamado al cliente antes de salir con pedidos grandes"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ap-proceso">Proceso / SOP afectado</Label>
            <Input
              id="ap-proceso"
              name="proceso"
              maxLength={160}
              defaultValue={aplicacion?.proceso ?? ""}
              placeholder="Ej.: SOP 3.3 Ruteo · Reunión preruta"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-resp">Responsable</Label>
            <Input id="ap-resp" name="responsable" maxLength={120} defaultValue={aplicacion?.responsable ?? ""} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ap-desc">Cómo se aplicó</Label>
          <Textarea
            id="ap-desc"
            name="descripcion"
            rows={3}
            maxLength={2000}
            defaultValue={aplicacion?.descripcion ?? ""}
            placeholder="Qué cambió en la rutina, quién lo hace, desde cuándo."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={estado} onValueChange={(v: string | null) => setEstado(v ?? "en_curso")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APLICACION_ESTADOS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-fecha">Aplicado desde (mes base de la comparación)</Label>
            <Input
              id="ap-fecha"
              name="fecha_aplicacion"
              type="date"
              defaultValue={aplicacion?.fecha_aplicacion ?? bench.fecha}
            />
          </div>
        </div>

        <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Indicador que mide la mejora
          </legend>
          <div className="space-y-1.5">
            <Label>Fuente</Label>
            <Select value={indicadorId} onValueChange={(v: string | null) => setIndicadorId(v ?? MANUAL)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MANUAL}>Carga manual por mes (TLP, RMD, NPS, otro…)</SelectItem>
                {conCuadro &&
                  opcionesCuadro.map((g) => (
                    <SelectGroup key={g.pilar}>
                      <SelectLabel>Cuadro mensual · {g.pilar}</SelectLabel>
                      {g.items.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.nombre} ({d.unidad})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
              </SelectContent>
            </Select>
            {defCuadro ? (
              <p className="text-xs text-slate-500">
                Serie automática del Cuadro mensual · mejor si {defCuadro.mejor_si}
                {defCuadro.meta !== null ? ` · meta ${defCuadro.meta} ${defCuadro.unidad}` : ""}.
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Los valores de cada mes se cargan a mano desde la ficha de la aplicación.
              </p>
            )}
          </div>

          {!defCuadro && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ap-ind">Nombre del indicador</Label>
                <Input
                  id="ap-ind"
                  name="indicador_nombre"
                  maxLength={80}
                  defaultValue={aplicacion?.indicador_nombre ?? ""}
                  placeholder="Ej.: TLP, RMD, On Time"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-unidad">Unidad</Label>
                <Input id="ap-unidad" name="unidad" maxLength={20} defaultValue={aplicacion?.unidad ?? "%"} />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {!defCuadro && (
              <div className="space-y-1.5">
                <Label>Mejor si…</Label>
                <Select value={mejorSi} onValueChange={(v: string | null) => setMejorSi(v ?? "menor")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="menor">Baja (rechazos, TLP, costo)</SelectItem>
                    <SelectItem value="mayor">Sube (In Full, On Time, NPS)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="ap-meta">Meta (opcional)</Label>
              <Input
                id="ap-meta"
                name="meta"
                type="number"
                step="any"
                defaultValue={aplicacion?.meta ?? defCuadro?.meta ?? ""}
                placeholder={defCuadro?.meta !== null && defCuadro?.meta !== undefined ? String(defCuadro.meta) : ""}
              />
            </div>
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="ap-resultado">Lectura del resultado</Label>
          <Textarea
            id="ap-resultado"
            name="resultado"
            rows={2}
            maxLength={1500}
            defaultValue={aplicacion?.resultado ?? ""}
            placeholder="Qué pasó con el indicador después de aplicarlo; qué se ajustó."
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {aplicacion ? "Guardar" : "Registrar"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
