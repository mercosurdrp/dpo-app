"use client"

import { useEffect, useState, useTransition } from "react"
import { Camera, Handshake, Loader2, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { getSignedUrl } from "@/actions/reuniones"
import {
  desmarcarParticipacionCruzada,
  getParticipacionCruzadaDeReunion,
  marcarReunionComoCruzada,
} from "@/actions/participaciones-cruzadas"
import { labelDeFoto } from "@/lib/participacion-cruzada-fotos"
import { prepararFotos } from "@/lib/preparar-fotos-cruce"
import {
  PARTICIPACION_CRUZADA_SENTIDO_LABELS,
  type ParticipacionCruzada,
  type ParticipacionCruzadaSentido,
} from "@/types/database"

/**
 * Punto del pilar Planeamiento (conectar Ventas y Operaciones): cuando alguien
 * de la otra área participa de esta reunión, se tilda acá y queda la evidencia
 * — foto, quiénes vinieron y qué se habló. La reunión queda identificada en el
 * listado y suma al plan de participaciones cruzadas.
 */
export function SeccionParticipacionCruzada({
  reunionId,
  fechaReunion,
  tipoLabel,
  puedeEditar,
}: {
  reunionId: string
  fechaReunion: string
  /** Nombre de esta reunión, para proponerlo como destino. */
  tipoLabel: string
  puedeEditar: boolean
}) {
  const [cruce, setCruce] = useState<ParticipacionCruzada | null>(null)
  const [cargando, setCargando] = useState(true)
  const [abrir, setAbrir] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sentido, setSentido] = useState<ParticipacionCruzadaSentido>(
    "ventas_a_operaciones",
  )

  async function recargar() {
    const result = await getParticipacionCruzadaDeReunion(reunionId)
    if (!("error" in result)) setCruce(result.data)
    setCargando(false)
  }

  useEffect(() => {
    void recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reunionId])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set("reunion_id", reunionId)
    formData.set("fecha_real", fechaReunion)
    formData.set("destino", tipoLabel)
    formData.set("sentido", sentido)

    startTransition(async () => {
      const preparado = await prepararFotos(formData)
      if ("error" in preparado) {
        setError(preparado.error)
        return
      }
      const result = await marcarReunionComoCruzada(preparado.formData)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setCruce(result.data)
      setAbrir(false)
    })
  }

  function deshacer() {
    if (!cruce) return
    if (!confirm("¿Sacar la marca de participación cruzada y borrar la foto?")) {
      return
    }
    startTransition(async () => {
      const result = await desmarcarParticipacionCruzada(cruce.id)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setCruce(null)
    })
  }

  async function verFoto(path: string) {
    const result = await getSignedUrl(path)
    if ("error" in result) {
      setError(`No se pudo abrir la foto: ${result.error}`)
      return
    }
    window.open(result.data.url, "_blank", "noopener,noreferrer")
  }

  const marcada = cruce?.estado === "realizada"

  return (
    <Card className={marcada ? "border-emerald-300 bg-emerald-50/40" : undefined}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Handshake
            className={`size-5 ${marcada ? "text-emerald-600" : "text-slate-500"}`}
          />
          Participación cruzada
        </CardTitle>
        {!cargando && puedeEditar && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={marcada}
              disabled={pending}
              onCheckedChange={(checked: boolean) => {
                if (checked && !marcada) setAbrir(true)
                else if (!checked && marcada) deshacer()
              }}
            />
            <span className="text-muted-foreground">
              Participó alguien de otra área
            </span>
          </label>
        )}
      </CardHeader>

      <CardContent className="space-y-2">
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {cargando ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Cargando…
          </p>
        ) : marcada && cruce ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium text-emerald-800">
              {PARTICIPACION_CRUZADA_SENTIDO_LABELS[cruce.sentido]}
            </p>
            {cruce.tema && (
              <p className="whitespace-pre-wrap">
                <span className="text-muted-foreground">Tema tratado: </span>
                {cruce.tema}
              </p>
            )}
            <p>
              <span className="text-muted-foreground">Participaron: </span>
              {cruce.participantes}
            </p>
            {cruce.minuta && (
              <p className="whitespace-pre-wrap">
                <span className="text-muted-foreground">Qué se habló: </span>
                {cruce.minuta}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {cruce.fotos.map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant="outline"
                  onClick={() => verFoto(f)}
                >
                  <Camera className="mr-2 size-4" />
                  {labelDeFoto(f)}
                </Button>
              ))}
              {puedeEditar && (
                <>
                  {/* La minuta se suele escribir después de subir la foto: se
                      puede volver a entrar sin perder lo cargado. */}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      setSentido(cruce.sentido)
                      setAbrir(true)
                    }}
                  >
                    <Pencil className="mr-2 size-4" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={deshacer}
                  >
                    <Trash2 className="mr-2 size-4 text-red-600" />
                    Deshacer
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {puedeEditar
              ? "Si a esta reunión vino alguien de otra área (por ejemplo, un supervisor de Ventas), tildá la casilla y cargá la foto: queda como evidencia del punto de Planeamiento."
              : "Esta reunión no está marcada como participación cruzada."}
          </p>
        )}
      </CardContent>

      <Dialog open={abrir} onOpenChange={setAbrir}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake className="size-5 text-emerald-600" />
              {marcada
                ? "Editar la participación cruzada"
                : "Registrar participación cruzada"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>¿Quién participó de la reunión del otro área? *</Label>
              <Select
                value={sentido}
                onValueChange={(v) =>
                  setSentido(
                    (v ?? "ventas_a_operaciones") as ParticipacionCruzadaSentido,
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ventas_a_operaciones">
                    Vino gente de Ventas a esta reunión
                  </SelectItem>
                  <SelectItem value="operaciones_a_ventas">
                    Vino gente de Operaciones (Almacén / Distribución)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cruce_tema">Tema tratado</Label>
              <Textarea
                id="cruce_tema"
                name="tema"
                rows={2}
                defaultValue={cruce?.tema ?? ""}
                placeholder="Qué tema se trajo a esta reunión…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cruce_participantes">Quiénes participaron *</Label>
              <Input
                id="cruce_participantes"
                name="participantes"
                defaultValue={cruce?.participantes ?? ""}
                placeholder="Nombre y apellido, separados por coma"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cruce_minuta">Breve minuta</Label>
              <Textarea
                id="cruce_minuta"
                name="minuta"
                rows={3}
                defaultValue={cruce?.minuta ?? ""}
                placeholder="Qué se habló y a qué se comprometieron…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cruce_foto_tema">Captura del tema tratado</Label>
              <Input
                id="cruce_foto_tema"
                name="foto_tema"
                type="file"
                accept="image/*"
                multiple
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cruce_foto_part">Foto de los participantes</Label>
              <Input
                id="cruce_foto_part"
                name="foto_participantes"
                type="file"
                accept="image/*"
                capture="environment"
                multiple
              />
              <p className="text-xs text-muted-foreground">
                {marcada && cruce && cruce.fotos.length > 0
                  ? `Ya hay ${cruce.fotos.length} foto${cruce.fotos.length > 1 ? "s" : ""} cargada${cruce.fotos.length > 1 ? "s" : ""}: subí otra sólo si querés sumar evidencia.`
                  : "Es la evidencia de la auditoría · podés subir varias de cada tipo, pero al menos una es obligatoria."}
              </p>
            </div>

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAbrir(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
