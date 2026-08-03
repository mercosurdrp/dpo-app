"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getMaquinistasMinutosDia } from "@/actions/reuniones"
import type {
  AperturaMinutosCamionDelDia,
  MaquinistasTramo,
} from "@/lib/warehouse/auto-indicadores"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  reunionId: string
  fecha: string | null
  tramo: MaquinistasTramo
}

/**
 * Cada mitad del muelle va contra su propio camión: el de reparto lleva 9
 * pallets de mediana y el de acarreo 25, así que los mismos minutos no
 * significan lo mismo y las escalas de color no pueden ser la misma.
 */
const ESCALAS: Record<MaquinistasTramo, { verde: number; amarillo: number }> = {
  carga: { verde: 15, amarillo: 25 },
  descarga: { verde: 22, amarillo: 32 },
}

const TEXTOS: Record<
  MaquinistasTramo,
  { titulo: string; descripcion: string; pie: string }
> = {
  carga: {
    titulo: "Despacho de camiones",
    descripcion: "Minutos por camión de reparto",
    pie:
      "Medición indirecta: el reloj arranca con el primer pallet ya escaneado " +
      "(no incluye posicionar el camión) y se estira si el maquinista intercala " +
      "dos viajes. Sirve para comparar, no como tiempo de dársena.",
  },
  descarga: {
    titulo: "Descarga de acarreos",
    descripcion: "Minutos por camión de abastecimiento",
    pie:
      "Cuando un camión se descarga entre dos, a cada maquinista se le imputan " +
      "los minutos que estuvo en él, pero el Total del día lo cuenta en " +
      "minutos-persona (el doble): por eso el total no es el promedio de las " +
      "filas de arriba.",
  },
}

function formatFechaLarga(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

function fmt(n: number | null, decimales = 1): string {
  if (n === null || !Number.isFinite(n)) return "—"
  return n.toLocaleString("es-AR", { maximumFractionDigits: decimales })
}

/** Menos minutos es mejor: la escala va al revés que la de bul/HH. */
function colorMinutos(v: number, tramo: MaquinistasTramo): string {
  const { verde, amarillo } = ESCALAS[tramo]
  if (v <= verde) return "text-emerald-700"
  if (v <= amarillo) return "text-amber-700"
  return "text-red-700"
}

export function MaquinistasMinutosDetalleDiaDialog({
  open,
  onOpenChange,
  reunionId,
  fecha,
  tramo,
}: Props) {
  const [data, setData] = useState<AperturaMinutosCamionDelDia | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!open || !fecha || !reunionId) return
    setLoading(true)
    setError(null)
    const res = await getMaquinistasMinutosDia(reunionId, fecha, tramo)
    if ("error" in res) {
      setError(res.error)
      setData(null)
    } else {
      setData(res.data)
    }
    setLoading(false)
  }, [open, fecha, reunionId, tramo])

  useEffect(() => {
    if (!open) {
      setData(null)
      setError(null)
      return
    }
    void cargar()
  }, [open, cargar])

  const textos = TEXTOS[tramo]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{textos.titulo} — minutos por camión</DialogTitle>
          <DialogDescription>
            {textos.descripcion} ·{" "}
            {/* El capitalize va sólo en la fecha: toLocaleDateString devuelve
                "lunes 03 de agosto". Aplicado a toda la línea capitalizaría
                cada palabra ("Minutos Por Camión De Reparto"). */}
            <span className="capitalize">
              {fecha ? formatFechaLarga(fecha) : "Sin fecha"}
            </span>
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando minutos por camión…
          </div>
        )}

        {error && !loading && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {!loading && data && data.filas.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sin camiones registrados para este día.
          </p>
        )}

        {!loading && data && data.filas.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Maquinista</TableHead>
                <TableHead className="text-right">Min/camión</TableHead>
                <TableHead className="text-right">Camiones</TableHead>
                <TableHead className="text-right">Minutos</TableHead>
                <TableHead className="text-right">Pallets</TableHead>
                <TableHead className="text-right">Pal/h</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.filas.map((fila) => (
                <TableRow key={fila.operario}>
                  <TableCell className="font-medium capitalize">
                    {fila.operario.toLowerCase()}
                    {fila.en_equipo > 0 && (
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        ({fila.en_equipo} de a dos)
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    className={`text-right font-semibold tabular-nums ${colorMinutos(fila.min_camion, tramo)}`}
                  >
                    {fmt(fila.min_camion)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(fila.camiones, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(fila.minutos, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(fila.pallets, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(fila.pal_h)}
                  </TableCell>
                </TableRow>
              ))}
              {data.total && (
                <TableRow className="border-t-2">
                  <TableCell className="font-semibold">
                    Total día
                    {tramo === "descarga" && (
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                        (min-persona)
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    className={`text-right font-semibold tabular-nums ${colorMinutos(data.total.min_camion, tramo)}`}
                  >
                    {fmt(data.total.min_camion)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(data.total.camiones, 0)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(data.total.minutos, 0)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(data.total.pallets, 0)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(data.total.pal_h)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {!loading && data && (
          <div className="space-y-1 text-[11px] text-muted-foreground">
            <p>
              Menos es mejor. Verde ≤ {ESCALAS[tramo].verde} · Amarillo{" "}
              {ESCALAS[tramo].verde + 1}-{ESCALAS[tramo].amarillo} · Rojo &gt;{" "}
              {ESCALAS[tramo].amarillo} (provisorio). {textos.pie}
            </p>
            {data.descartados && (
              <p className="text-amber-600">
                Fuera del cálculo: {data.descartados}.
              </p>
            )}
            <p>Fuente: tablero del depósito (deposito-esteban).</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
