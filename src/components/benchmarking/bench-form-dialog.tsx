"use client"

import { useState, useTransition } from "react"
import { Loader2, X } from "lucide-react"
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AdjuntosInput } from "@/components/adjuntos-input"
import { actualizarBench, crearBench } from "@/actions/benchmarking"
import {
  BENCH_MODALIDADES,
  INDICADORES_SUGERIDOS,
  type Bench,
  type BenchTipo,
} from "@/types/benchmarking"
import { cn } from "@/lib/utils"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  tipo: BenchTipo
  /** Si viene, edita; si no, crea. */
  bench: Bench | null
}

export function BenchFormDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl">
        {props.open && <BenchForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function isoHoy() {
  return new Date().toISOString().slice(0, 10)
}

function BenchForm({ onOpenChange, onSaved, tipo, bench }: Omit<Props, "open">) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [modalidad, setModalidad] = useState<string>(
    bench?.modalidad ?? (tipo === "interno" ? "analisis_interno" : "visita"),
  )
  const [indicadores, setIndicadores] = useState<string[]>(bench?.indicadores ?? [])
  const [otroIndicador, setOtroIndicador] = useState("")
  const [archivos, setArchivos] = useState<File[]>([])

  const esInterno = tipo === "interno"

  function toggle(ind: string) {
    setIndicadores((prev) => (prev.includes(ind) ? prev.filter((i) => i !== ind) : [...prev, ind]))
  }
  function agregarOtro() {
    const v = otroIndicador.trim()
    if (!v) return
    if (!indicadores.includes(v)) setIndicadores((p) => [...p, v])
    setOtroIndicador("")
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set("tipo", tipo)
    fd.set("modalidad", modalidad)
    fd.delete("indicadores")
    for (const i of indicadores) fd.append("indicadores", i)
    for (const f of archivos) fd.append("archivo", f)
    startTransition(async () => {
      const r = bench ? await actualizarBench(bench.id, fd) : await crearBench(fd)
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
        <DialogTitle>
          {bench ? "Editar bench" : esInterno ? "Nuevo bench interno" : "Nuevo bench externo"}
        </DialogTitle>
        <DialogDescription>
          {esInterno
            ? "Comparación entre nuestros equipos o rutas de entrega (R5.2.1 / R5.2.2)."
            : "Comparación con otro distribuidor ABI u otra operación similar (R5.2.3)."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="bf-titulo">Título *</Label>
          <Input
            id="bf-titulo"
            name="titulo"
            required
            maxLength={160}
            defaultValue={bench?.titulo ?? ""}
            placeholder={esInterno ? "Ej.: Bench de rutas por TLP y rechazos, S1 2026" : "Ej.: Visita a Palco Distribuciones"}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="bf-fecha">Fecha *</Label>
            <Input id="bf-fecha" name="fecha" type="date" required defaultValue={bench?.fecha ?? isoHoy()} />
          </div>
          <div className="space-y-1.5">
            <Label>Modalidad</Label>
            <Select value={modalidad} onValueChange={(v: string | null) => setModalidad(v ?? "visita")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BENCH_MODALIDADES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bf-lugar">Lugar</Label>
            <Input id="bf-lugar" name="lugar" maxLength={120} defaultValue={bench?.lugar ?? ""} placeholder="Ciudad / CD" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bf-contraparte">{esInterno ? "Qué se comparó" : "Con quién"}</Label>
            <Input
              id="bf-contraparte"
              name="contraparte"
              maxLength={160}
              defaultValue={bench?.contraparte ?? ""}
              placeholder={esInterno ? "Ej.: 11 rutas / choferes del CD Ramallo" : "Ej.: Palco (CD Pergamino)"}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bf-participantes">Participantes</Label>
            <Input
              id="bf-participantes"
              name="participantes"
              maxLength={240}
              defaultValue={bench?.participantes ?? ""}
              placeholder="Quiénes fueron / participaron"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bf-objetivo">Por qué se hizo (qué KPI no llega)</Label>
          <Textarea
            id="bf-objetivo"
            name="objetivo"
            rows={2}
            maxLength={600}
            defaultValue={bench?.objetivo ?? ""}
            placeholder="Ej.: el % de rechazo viene arriba de la meta y queremos ver cómo lo trabajan ellos."
          />
        </div>

        <div className="space-y-1.5">
          <Label>Indicadores que se miraron</Label>
          <div className="flex flex-wrap gap-1.5">
            {Array.from(new Set([...INDICADORES_SUGERIDOS, ...indicadores])).map((ind) => {
              const on = indicadores.includes(ind)
              return (
                <button
                  key={ind}
                  type="button"
                  onClick={() => toggle(ind)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {ind}
                </button>
              )
            })}
          </div>
          <div className="flex gap-2 pt-1">
            <Input
              value={otroIndicador}
              onChange={(e) => setOtroIndicador(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  agregarOtro()
                }
              }}
              placeholder="Otro indicador…"
              maxLength={60}
              className="max-w-xs"
            />
            <Button type="button" variant="outline" onClick={agregarOtro}>
              Agregar
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bf-temas">Minuta: temas que se vieron</Label>
          <Textarea
            id="bf-temas"
            name="temas"
            rows={5}
            maxLength={4000}
            defaultValue={bench?.temas ?? ""}
            placeholder={"Un tema por línea. Ej.:\n- Cómo arman el ruteo y la secuencia\n- Gestión de rechazos en el día\n- Carga del camión y control de peso"}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bf-conclusiones">Conclusiones / qué hacen distinto</Label>
          <Textarea
            id="bf-conclusiones"
            name="conclusiones"
            rows={3}
            maxLength={3000}
            defaultValue={bench?.conclusiones ?? ""}
            placeholder="Qué aprendimos, qué podríamos copiar, qué no aplica."
          />
        </div>

        {!bench && (
          <div className="space-y-1.5">
            <Label>Fotos o archivos de evidencia (Ctrl+V para pegar capturas)</Label>
            <AdjuntosInput
              archivos={archivos}
              onChange={setArchivos}
              disabled={pending}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.doc,.docx,.ppt,.pptx"
            />
            <p className="text-xs text-slate-500">Después se pueden seguir agregando desde la ficha del bench.</p>
          </div>
        )}

        {error && (
          <p className="flex items-center gap-1 text-sm text-red-600">
            <X className="size-4" /> {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {bench ? "Guardar" : "Registrar bench"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
