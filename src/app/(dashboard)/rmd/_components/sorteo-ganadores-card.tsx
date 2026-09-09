"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  Camera,
  CheckCircle2,
  Clock,
  Dices,
  ImageIcon,
  Loader2,
  MapPin,
  Phone,
  Trophy,
  User,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  elegirGanadorSorteoRmd,
  getSorteoRmdSignedUrl,
  registrarEntregaGanadorRmd,
  type GanadorSorteoRmd,
} from "@/actions/rmd-sorteo"
import { RMD_SORTEO_PREMIO, fechaSorteoLarga } from "@/lib/rmd-sorteo"
import { abrirArchivo } from "@/lib/abrir-archivo"

const FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
})

interface Props {
  ganadoresIniciales: GanadorSorteoRmd[] | null
  participan: number
  /** Avisa que hubo un sorteo nuevo (el ganador ya no cuenta como candidato). */
  onCambio?: () => void
}

/**
 * El sorteo en sí: un botón que elige al azar entre los que participan y deja
 * registro de quién salió, cuántos participaban y quién sorteó. Cuando se
 * entrega el premio, ahí mismo se sube la foto como evidencia.
 */
export function SorteoGanadoresCard({
  ganadoresIniciales,
  participan,
  onCambio,
}: Props) {
  const [ganadores, setGanadores] = useState<GanadorSorteoRmd[]>(
    ganadoresIniciales ?? [],
  )
  const [confirmar, setConfirmar] = useState(false)
  const [sorteando, setSorteando] = useState(false)
  const [recien, setRecien] = useState<string | null>(null)

  const [entregaDe, setEntregaDe] = useState<GanadorSorteoRmd | null>(null)
  const [fotos, setFotos] = useState<File[]>([])
  const [obs, setObs] = useState("")
  const [guardando, setGuardando] = useState(false)

  async function sortear() {
    setSorteando(true)
    const r = await elegirGanadorSorteoRmd()
    setSorteando(false)
    setConfirmar(false)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    setGanadores((g) => [r.data, ...g])
    setRecien(r.data.id)
    toast.success(`Salió ${r.data.nombre_pdv}`)
    onCambio?.()
  }

  async function guardarEntrega() {
    if (!entregaDe) return
    if (fotos.length === 0) {
      toast.error("Sacá o subí al menos una foto de la entrega")
      return
    }
    setGuardando(true)
    const fd = new FormData()
    fd.set("ganador_id", entregaDe.id)
    fd.set("observaciones", obs)
    for (const f of fotos) fd.append("archivo", f)
    const r = await registrarEntregaGanadorRmd(fd)
    setGuardando(false)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    setGanadores((g) => g.map((x) => (x.id === r.data.id ? r.data : x)))
    setEntregaDe(null)
    setFotos([])
    setObs("")
    toast.success("Entrega registrada")
  }

  async function verFoto(path: string) {
    const r = await getSorteoRmdSignedUrl(path)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    abrirArchivo(r.data.url)
  }

  const pendientes = ganadores.filter((g) => !g.entregado_en).length

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-600" />
            Ganadores del sorteo
            {ganadores.length > 0 && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-800"
              >
                {ganadores.length}
                {pendientes > 0 && ` · ${pendientes} sin entregar`}
              </Badge>
            )}
          </span>
          <Button
            size="sm"
            onClick={() => setConfirmar(true)}
            disabled={ganadoresIniciales == null || participan === 0}
            title={
              participan === 0
                ? "Todavía nadie participa (inscripto + calificó en BEES)"
                : `Elige al azar entre ${participan.toLocaleString("es-AR")} que participan`
            }
          >
            <Dices className="mr-1 h-4 w-4" />
            Elegir ganador al azar
          </Button>
        </CardTitle>
        <p className="text-xs text-slate-500">
          Premio vigente: <strong>{RMD_SORTEO_PREMIO.titulo}</strong>. Fecha
          del sorteo: <strong>{fechaSorteoLarga()}</strong>. Entran
          sólo los que participan (inscriptos que calificaron en BEES) y nadie
          gana dos veces en la misma campaña. Cada sorteo queda registrado con
          fecha, quién lo hizo y cuántos participaban.
        </p>
      </CardHeader>

      <CardContent className="border-t pt-4">
        {ganadoresIniciales == null ? (
          <p className="py-6 text-center text-sm text-amber-700">
            No se pudo leer la tabla de ganadores. ¿Está aplicada la migración
            del sorteo en Supabase?
          </p>
        ) : ganadores.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Todavía no se sorteó. Cuando haya participantes, «Elegir ganador al
            azar» elige uno y lo deja registrado acá.
          </p>
        ) : (
          <ul className="space-y-2">
            {ganadores.map((g) => (
              <li
                key={g.id}
                className={`rounded-md border p-3 ${
                  g.id === recien
                    ? "border-amber-300 bg-amber-50"
                    : g.entregado_en
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-bold text-slate-900">
                        {g.nombre_pdv}
                      </span>
                      {g.cod_cliente_resuelto != null && (
                        <span className="font-mono text-xs text-slate-500">
                          #{g.cod_cliente_resuelto}
                        </span>
                      )}
                      {g.entregado_en ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-100 text-emerald-800"
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Entregado
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-200 bg-amber-100 text-amber-800"
                        >
                          Pendiente de entrega
                        </Badge>
                      )}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {g.direccion}, {g.localidad}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {g.nombre_contacto}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {g.telefono}
                      </span>
                      {g.ventana_desde && g.ventana_hasta && (
                        <span
                          className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 text-sky-800"
                          title={g.ventana_obs ?? undefined}
                        >
                          <Clock className="h-3 w-3" />
                          Recibe {g.ventana_desde.slice(0, 5)}–
                          {g.ventana_hasta.slice(0, 5)}
                          {g.ventana_obs && ` (${g.ventana_obs})`}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Premio: {g.premio}. Sorteado el{" "}
                      {FMT.format(new Date(g.sorteado_en))}
                      {g.sorteado_por_nombre && ` por ${g.sorteado_por_nombre}`}{" "}
                      entre {g.participantes.toLocaleString("es-AR")}{" "}
                      participantes.
                      {g.entregado_en && (
                        <>
                          {" "}
                          Entregado el {FMT.format(new Date(g.entregado_en))}
                          {g.entregado_por_nombre &&
                            ` por ${g.entregado_por_nombre}`}
                          .
                        </>
                      )}
                    </p>
                    {g.observaciones && (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">
                        {g.observaciones}
                      </p>
                    )}
                    {g.archivos.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {g.archivos.map((a) => (
                          <button
                            key={a.path}
                            type="button"
                            onClick={() => verFoto(a.path)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
                            title={a.nombre}
                          >
                            <ImageIcon className="h-3.5 w-3.5 text-slate-500" />
                            <span className="max-w-[160px] truncate">
                              {a.nombre}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={g.entregado_en ? "outline" : "default"}
                    className="h-8 text-xs"
                    onClick={() => {
                      setEntregaDe(g)
                      setFotos([])
                      setObs("")
                    }}
                  >
                    <Camera className="mr-1 h-3.5 w-3.5" />
                    {g.entregado_en ? "Agregar foto" : "Registrar entrega"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {/* Confirmación del sorteo */}
      <Dialog open={confirmar} onOpenChange={(o) => !sorteando && setConfirmar(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Dices className="h-5 w-5 text-amber-600" />
              ¿Sortear ahora?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-700">
            Se elige al azar uno entre los{" "}
            <strong>{participan.toLocaleString("es-AR")}</strong> que
            participan. El resultado queda registrado y no se puede deshacer.
          </p>
          <p className="text-xs text-slate-500">
            Premio: {RMD_SORTEO_PREMIO.titulo}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmar(false)}
              disabled={sorteando}
            >
              Cancelar
            </Button>
            <Button onClick={sortear} disabled={sorteando}>
              {sorteando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sorteando…
                </>
              ) : (
                "Sortear"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registro de la entrega con foto */}
      <Dialog
        open={entregaDe !== null}
        onOpenChange={(o) => !guardando && !o && setEntregaDe(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-emerald-600" />
              Entrega del premio
            </DialogTitle>
          </DialogHeader>
          {entregaDe && (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                <strong>{entregaDe.nombre_pdv}</strong> · {entregaDe.direccion},{" "}
                {entregaDe.localidad}
                <span className="block text-xs text-slate-500">
                  {entregaDe.premio}
                </span>
              </p>
              <div className="space-y-1">
                <Label htmlFor="fotos-entrega">Foto de la entrega *</Label>
                <input
                  id="fotos-entrega"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={(e) =>
                    setFotos(Array.from(e.target.files ?? []))
                  }
                  className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-700"
                />
                {fotos.length > 0 && (
                  <p className="text-[11px] text-slate-500">
                    {fotos.length} archivo{fotos.length === 1 ? "" : "s"}{" "}
                    seleccionado{fotos.length === 1 ? "" : "s"}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="obs-entrega">Observaciones</Label>
                <Textarea
                  id="obs-entrega"
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Quién recibió, cómo fue, algo para recordar"
                  rows={3}
                  maxLength={500}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEntregaDe(null)}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button onClick={guardarEntrega} disabled={guardando}>
              {guardando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                "Guardar entrega"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
