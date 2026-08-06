"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { importarConsolidadoGops, type ResumenImportacion } from "@/actions/gops"
import { MES_NOMBRE } from "./formato"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  anioSugerido: number
  mesSugerido: number
}

export function ImportarDialog({ open, onOpenChange, anioSugerido, mesSugerido }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResumenImportacion | null>(null)

  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setError(null)
      setResultado(null)
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const res = await importarConsolidadoGops(form)
      if ("error" in res) {
        setError(res.error)
        return
      }
      setResultado(res.data)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar el consolidado de GOPs</DialogTitle>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-semibold">Listo.</p>
              <p>
                {resultado.temas} temas · {resultado.preguntasTotal} preguntas (
                {resultado.preguntasNuevas} nuevas) · {resultado.respuestas} respuestas de{" "}
                {resultado.meses.map((m) => MES_NOMBRE[m]).join(", ")} {resultado.anio}.
              </p>
            </div>
            {resultado.avisos.length > 0 && (
              <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                {resultado.avisos.map((a) => (
                  <li key={a}>· {a}</li>
                ))}
              </ul>
            )}
            <DialogFooter>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Cerrar
              </button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="archivo">Archivo .xlsx</Label>
              <Input
                id="archivo"
                name="archivo"
                type="file"
                accept=".xlsx,.xlsm"
                required
              />
              <p className="text-xs text-muted-foreground">
                El mismo consolidado que se sube al Campus. Reimportarlo no duplica nada: las
                respuestas se actualizan y las decisiones y planes quedan como están.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="anio">Año</Label>
                <Input
                  id="anio"
                  name="anio"
                  type="number"
                  defaultValue={anioSugerido}
                  min={2020}
                  max={2100}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hasta_mes">Importar hasta</Label>
                <select
                  id="hasta_mes"
                  name="hasta_mes"
                  defaultValue={String(mesSugerido)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  {Object.entries(MES_NOMBRE).map(([n, nombre]) => (
                    <option key={n} value={n}>
                      {nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="rounded-lg bg-slate-50 p-2 text-xs text-muted-foreground">
              El Excel trae los meses que todavía no se completaron con &ldquo;No&rdquo; precargado.
              Por eso se importa hasta el último mes realmente relevado: más allá de ahí, esos
              &ldquo;No&rdquo; no son respuestas, son celdas sin usar.
            </p>

            {error && (
              <p className="rounded-lg bg-red-50 p-2 text-sm font-medium text-red-700">{error}</p>
            )}

            <DialogFooter>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Importar
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
