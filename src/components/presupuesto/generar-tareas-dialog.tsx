"use client"

import { useEffect, useState, useTransition } from "react"
import { Loader2, Sparkles, CheckCircle2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  previewTareasDesdeEerr,
  generarTareasDesdeEerr,
  type PreviewTareaItem,
  type GenerarItemInput,
} from "@/actions/presupuesto-generador"

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  anio: number
  defaultMes: number
  responsables: ResponsableOpt[]
  onSaved: () => void
}

function formatMoney(n: number | null): string {
  if (n === null || n === undefined) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n)
}

function formatPct(n: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—"
  const sign = n > 0 ? "+" : ""
  return `${sign}${n.toFixed(1)}%`
}

function MotivoBadge({
  motivo,
}: {
  motivo: PreviewTareaItem["motivo"]
}) {
  if (motivo === "no_presupuestado") {
    return (
      <Badge className="border-purple-200 bg-purple-100 text-purple-700 hover:bg-purple-100">
        No presupuestado
      </Badge>
    )
  }
  if (motivo === "pct_y_abs") {
    return (
      <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
        % y $
      </Badge>
    )
  }
  if (motivo === "abs") {
    return (
      <Badge className="border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100">
        Por monto
      </Badge>
    )
  }
  return (
    <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
      Por %
    </Badge>
  )
}

function TipoBadge({ tipo }: { tipo: PreviewTareaItem["tipo_costo"] }) {
  if (tipo === "variable") {
    return (
      <Badge variant="outline" className="border-blue-300 text-blue-700">
        Variable
      </Badge>
    )
  }
  if (tipo === "fijo") {
    return (
      <Badge variant="outline" className="border-slate-300 text-slate-700">
        Fijo
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-yellow-300 text-yellow-700">
      Sin clasificar
    </Badge>
  )
}

interface ItemEditable extends PreviewTareaItem {
  selected: boolean
  responsable_id_actual: string | null
}

export function GenerarTareasDialog({
  open,
  onOpenChange,
  anio,
  defaultMes,
  responsables,
  onSaved,
}: Props) {
  const [mes, setMes] = useState<number>(defaultMes)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [items, setItems] = useState<ItemEditable[]>([])
  const [, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (open) {
      setMes(defaultMes)
      setItems([])
      setErrorMsg(null)
    }
  }, [open, defaultMes])

  async function cargarPreview() {
    setLoading(true)
    setErrorMsg(null)
    const result = await previewTareasDesdeEerr(anio, mes)
    setLoading(false)
    if ("error" in result) {
      setErrorMsg(result.error)
      setItems([])
      return
    }
    setItems(
      result.data.map((it) => ({
        ...it,
        selected: !it.ya_existe,
        responsable_id_actual: it.responsable_id,
      })),
    )
  }

  function toggleAll(checked: boolean) {
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        selected: it.ya_existe ? false : checked,
      })),
    )
  }

  function toggleItem(idx: number, checked: boolean) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, selected: checked } : it)),
    )
  }

  function cambiarResp(idx: number, respId: string | null) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, responsable_id_actual: respId } : it,
      ),
    )
  }

  async function confirmar() {
    const seleccionados = items.filter((it) => it.selected && !it.ya_existe)
    if (!seleccionados.length) {
      setErrorMsg("Tildá al menos una tarea para crear")
      return
    }
    const payload: GenerarItemInput[] = seleccionados.map((it) => ({
      rubro: it.rubro,
      monto_presupuestado: it.monto_presupuestado,
      monto_real: it.monto_real,
      responsable_id: it.responsable_id_actual,
      tipo_costo: it.tipo_costo,
    }))
    setCreating(true)
    setErrorMsg(null)
    startTransition(async () => {
      const result = await generarTareasDesdeEerr(anio, mes, payload)
      setCreating(false)
      if ("error" in result) {
        setErrorMsg(result.error)
        return
      }
      onSaved()
      onOpenChange(false)
    })
  }

  const seleccionadosCount = items.filter(
    (it) => it.selected && !it.ya_existe,
  ).length
  const elegibles = items.filter((it) => !it.ya_existe)
  const todoSeleccionado =
    elegibles.length > 0 && elegibles.every((it) => it.selected)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-blue-600" />
            Generar tareas sugeridas
          </DialogTitle>
          <DialogDescription>
            Cruzo el Estado de Resultado contra el catálogo de rubros (fijo/variable)
            y aplico el criterio de desvío. Las tareas creadas tienen vencimiento
            a 10 días, responsable por categoría y se pueden editar después.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Mes a analizar</label>
            <Select
              value={String(mes)}
              onValueChange={(v: string | null) => setMes(Number(v) || mes)}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((nom, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            onClick={cargarPreview}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" />
            )}
            Analizar EERR
          </Button>
          {items.length > 0 && (
            <p className="ml-auto text-xs text-muted-foreground">
              {seleccionadosCount} seleccionada{seleccionadosCount === 1 ? "" : "s"}{" "}
              de {elegibles.length} sugerencia{elegibles.length === 1 ? "" : "s"} ·{" "}
              {items.length - elegibles.length} ya existe
              {items.length - elegibles.length === 1 ? "" : "n"}
            </p>
          )}
        </div>

        {errorMsg && (
          <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">
            {errorMsg}
          </p>
        )}

        {items.length > 0 && (
          <div className="max-h-[55vh] overflow-auto rounded-lg border bg-white">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-white">
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={todoSeleccionado}
                      onCheckedChange={(c: boolean) => toggleAll(!!c)}
                    />
                  </TableHead>
                  <TableHead>Rubro</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Ppto</TableHead>
                  <TableHead className="text-right">Real</TableHead>
                  <TableHead className="text-right">Desvío %</TableHead>
                  <TableHead className="text-right">Desvío $</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Responsable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, idx) => (
                  <TableRow
                    key={`${it.rubro}-${idx}`}
                    className={it.ya_existe ? "opacity-50" : ""}
                  >
                    <TableCell>
                      {it.ya_existe ? (
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      ) : (
                        <Checkbox
                          checked={it.selected}
                          onCheckedChange={(c: boolean) =>
                            toggleItem(idx, !!c)
                          }
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {it.rubro}
                      {it.categoria && (
                        <p className="text-[11px] text-muted-foreground">
                          {it.categoria}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <TipoBadge tipo={it.tipo_costo} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm">
                      {formatMoney(it.monto_presupuestado)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm">
                      {formatMoney(it.monto_real)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm">
                      {formatPct(it.desvio_pct)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm">
                      {formatMoney(it.desvio_abs)}
                    </TableCell>
                    <TableCell>
                      <MotivoBadge motivo={it.motivo} />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={it.responsable_id_actual ?? "sin"}
                        onValueChange={(v: string | null) =>
                          cambiarResp(idx, v === "sin" ? null : v)
                        }
                        disabled={it.ya_existe}
                      >
                        <SelectTrigger className="h-8 w-48 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sin">Sin asignar</SelectItem>
                          {responsables.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && items.length === 0 && !errorMsg && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Elegí el mes y apretá <strong>Analizar EERR</strong> para ver las
            tareas sugeridas.
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={confirmar}
            disabled={creating || seleccionadosCount === 0}
          >
            {creating && <Loader2 className="mr-2 size-4 animate-spin" />}
            Crear {seleccionadosCount} tarea{seleccionadosCount === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
