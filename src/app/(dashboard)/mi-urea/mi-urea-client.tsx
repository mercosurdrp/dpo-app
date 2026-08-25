"use client"
import { parseEnteroEsAR, parseNumeroEsAR } from "@/lib/numeros"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Droplet, Loader2, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { crearCargaUrea, type MiUreaData } from "@/actions/urea"
import { UREA_LITROS_MAX } from "@/lib/vehiculos/tipos-carga"
import { validarLectura } from "@/lib/vehiculos/validar-lectura"

const fmtKm = (n: number) => new Intl.NumberFormat("es-AR").format(n)
const fmtFecha = (f: string) => f.slice(0, 10).split("-").reverse().join("/")

/**
 * Carga de urea del chofer. Misma forma que el registro de combustible —campos
 * grandes, un dato por vez— porque se completa parado al lado del camión y con
 * el celular en la mano.
 *
 * 🚨 NO pide el costo: cuantos menos campos, más cargas terminadas. Lo que se
 * busca es cada cuántos km se le echa urea a cada unidad, y para eso alcanzan el
 * camión, el odómetro y los litros.
 */
export function MiUreaClient({ data }: { data: MiUreaData }) {
  const router = useRouter()
  const [guardando, iniciar] = useTransition()
  const [dominio, setDominio] = useState("")
  const [chofer, setChofer] = useState("")
  const [odometro, setOdometro] = useState("")
  const [litros, setLitros] = useState("")
  const [hoyISO] = useState(() => new Date().toISOString().slice(0, 10))

  const unidad = data.unidades.find((u) => u.dominio === dominio) ?? null

  // Las que la ficha marca con urea van primero; el resto queda abajo, visible
  // pero advertido: si a un camión le reactivaron el sistema y la ficha todavía
  // no se actualizó, el chofer igual tiene que poder cargar.
  const conUrea = data.unidades.filter((u) => u.llevaUrea)
  const sinUrea = data.unidades.filter((u) => !u.llevaUrea)

  const errorOdometro = odometro
    ? validarLectura({
        valor: parseEnteroEsAR(odometro) ?? NaN,
        previa: unidad?.ultima
          ? { odometro: unidad.ultima.odometro, fecha: unidad.ultima.fecha }
          : null,
        fecha: hoyISO,
      })
    : null

  // Los km que lleva la unidad desde su última carga de urea: se muestra
  // mientras tipea, que es cuando sirve para darse cuenta de un dedazo.
  const kmDesdeUltima =
    unidad?.ultima && odometro && !errorOdometro
      ? parseEnteroEsAR(odometro) ?? NaN - unidad.ultima.odometro
      : null

  const listo =
    dominio && chofer.trim().length >= 5 && odometro && litros && !errorOdometro

  function enviar() {
    if (!listo) return
    iniciar(async () => {
      const res = await crearCargaUrea({
        dominio,
        chofer,
        odometro: parseEnteroEsAR(odometro) ?? NaN,
        litros: parseNumeroEsAR(litros) ?? 0,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Carga de urea registrada")
      if (res.kmDesdeAnterior != null) {
        toast.info(
          `${fmtKm(res.kmDesdeAnterior)} km desde la carga anterior de urea` +
            (res.litrosPor1000Km != null
              ? ` · ${res.litrosPor1000Km} l cada 1.000 km`
              : ""),
        )
      } else {
        toast.info(
          "Primera carga de urea de esta unidad — los km se calculan en la próxima",
        )
      }
      // Se vuelve al Inicio y NO se rehabilita el botón: el formulario se
      // desmonta al navegar, así no entra dos veces la misma carga.
      router.replace("/mis-capacitaciones")
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Carga de Urea</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Registrá la urea que le echaste al camión. Sirve para saber cada cuántos
          kilómetros la está pidiendo cada unidad.
        </p>
      </div>

      <Card className="border-sky-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Droplet className="size-6 text-sky-600" />
            Datos de la carga
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="text-base font-semibold">¿Qué camión?</Label>
            <Select value={dominio} onValueChange={(v: string | null) => setDominio(v ?? "")}>
              <SelectTrigger className="h-14 text-lg font-semibold">
                <SelectValue placeholder="Seleccionar camión..." />
              </SelectTrigger>
              <SelectContent>
                {conUrea.map((u) => (
                  <SelectItem key={u.dominio} value={u.dominio} className="py-2.5 text-base">
                    <span className="font-semibold">
                      {u.numero ? `${u.numero} · ` : ""}
                      {u.dominio}
                    </span>
                  </SelectItem>
                ))}
                {sinUrea.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No deberían llevar urea
                    </div>
                    {sinUrea.map((u) => (
                      <SelectItem key={u.dominio} value={u.dominio} className="py-2.5 text-base">
                        <span className="font-semibold">
                          {u.numero ? `${u.numero} · ` : ""}
                          {u.dominio}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          — {u.combustibleAux ?? "sin dato"}
                        </span>
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            {unidad && !unidad.llevaUrea && (
              <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  Según la ficha, este camión figura como{" "}
                  <strong>{unidad.combustibleAux ?? "sin dato"}</strong>. Si le pusiste
                  urea igual, cargala y avisale al Supervisor de Flota para que
                  actualice la ficha.
                </span>
              </p>
            )}
            {unidad?.ultima && (
              <p className="text-xs text-muted-foreground">
                Última carga de urea: {fmtFecha(unidad.ultima.fecha)} ·{" "}
                {fmtKm(unidad.ultima.odometro)} km · {unidad.ultima.litros} l
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-base font-semibold">Chofer del camión</Label>
            <Input
              placeholder="Ej: PEREZ JUAN"
              value={chofer}
              onChange={(e) => setChofer(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              className="h-14 text-lg font-semibold"
            />
            <p className="text-xs text-muted-foreground">
              Apellido y nombre de quien maneja la unidad. Se guarda en mayúsculas.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-base font-semibold">Odómetro (km)</Label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Ej: 125430"
              value={odometro}
              onChange={(e) => setOdometro(e.target.value)}
              className={`h-14 text-lg font-semibold tracking-wide ${
                errorOdometro ? "border-red-400 focus-visible:ring-red-200" : ""
              }`}
            />
            {errorOdometro ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {errorOdometro}
              </p>
            ) : kmDesdeUltima != null ? (
              <p className="text-xs text-muted-foreground">
                {fmtKm(kmDesdeUltima)} km desde la última carga de urea.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label className="text-base font-semibold">Litros de urea</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              max={UREA_LITROS_MAX}
              placeholder="Ej: 20"
              value={litros}
              onChange={(e) => setLitros(e.target.value)}
              className="h-14 text-lg font-semibold tracking-wide"
            />
            <p className="text-xs text-muted-foreground">
              Lo que le echaste ahora, no lo que marca el tanque.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
        <Button
          onClick={enviar}
          disabled={!listo || guardando}
          className="h-14 w-full bg-sky-600 text-base font-semibold text-white hover:bg-sky-700 disabled:opacity-60 sm:ml-auto sm:flex sm:w-auto sm:min-w-[260px] sm:text-lg"
        >
          {guardando ? (
            <Loader2 className="mr-2 size-5 animate-spin" />
          ) : (
            <Droplet className="mr-2 size-5" />
          )}
          {guardando ? "Registrando..." : "Registrar carga"}
        </Button>
      </div>

      {data.ultimas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Últimas cargas registradas</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.ultimas.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b pb-2 text-sm last:border-0 last:pb-0"
                >
                  <span>
                    <span className="font-medium text-foreground">{c.dominio}</span>
                    <span className="text-muted-foreground"> · {c.litros} l</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.kmDesdeAnterior != null
                      ? `${fmtKm(c.kmDesdeAnterior)} km desde la anterior · `
                      : ""}
                    {fmtFecha(c.fecha)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
