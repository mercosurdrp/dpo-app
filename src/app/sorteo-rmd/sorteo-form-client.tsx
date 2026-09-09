"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Loader2, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { inscribirSorteoRmd } from "@/actions/rmd-sorteo"
import { fechaSorteoLarga } from "@/lib/rmd-sorteo"

export function SorteoFormClient() {
  const [loading, setLoading] = useState(false)
  const [listo, setListo] = useState<null | { repetido: boolean }>(null)

  const [nombrePdv, setNombrePdv] = useState("")
  const [codCliente, setCodCliente] = useState("")
  const [direccion, setDireccion] = useState("")
  const [localidad, setLocalidad] = useState("")
  const [contacto, setContacto] = useState("")
  const [telefono, setTelefono] = useState("")
  const [califico, setCalifico] = useState(false)
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [ventanaObs, setVentanaObs] = useState("")
  const [web, setWeb] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombrePdv.trim()) return toast.error("Escribí el nombre del negocio")
    if (!direccion.trim()) return toast.error("Escribí la dirección")
    if (!localidad.trim()) return toast.error("Escribí la localidad")
    if (!contacto.trim()) return toast.error("Escribí tu nombre")
    if (telefono.replace(/\D/g, "").length < 6)
      return toast.error("Escribí un teléfono o WhatsApp válido")
    if (!desde || !hasta)
      return toast.error("Indicá desde y hasta qué hora podés recibir el pedido")
    if (desde >= hasta)
      return toast.error("La hora «hasta» tiene que ser después de la «desde»")

    setLoading(true)
    const r = await inscribirSorteoRmd({
      nombre_pdv: nombrePdv,
      cod_cliente: codCliente,
      direccion,
      localidad,
      nombre_contacto: contacto,
      telefono,
      declara_califico: califico,
      ventana_desde: desde,
      ventana_hasta: hasta,
      ventana_obs: ventanaObs,
      web,
    })
    setLoading(false)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    setListo({ repetido: r.repetido })
  }

  if (listo) {
    return (
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="py-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <p className="mt-3 text-lg font-bold text-emerald-900">
            {listo.repetido
              ? "Tu negocio ya estaba inscripto"
              : "¡Listo! Tu negocio quedó inscripto"}
          </p>
          <p className="mt-2 text-sm text-emerald-800">
            Acordate: para participar del sorteo tenés que{" "}
            <span className="font-semibold">
              calificar tu entrega en BEES
            </span>{" "}
            cuando te llega el pedido. Cada entrega calificada suma.
          </p>
          <p className="mt-2 text-sm font-semibold text-emerald-900">
            El sorteo es el {fechaSorteoLarga()}.
          </p>
          <p className="mt-4 inline-flex items-center gap-1 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            BEES → tu pedido entregado → puntuá de 1 a 5
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Inscribí tu punto de venta</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="nombre_pdv">Nombre del negocio *</Label>
            <Input
              id="nombre_pdv"
              value={nombrePdv}
              onChange={(e) => setNombrePdv(e.target.value)}
              placeholder="Como figura en BEES o en la factura"
              maxLength={120}
              autoComplete="organization"
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="cod_cliente">Número de cliente (opcional)</Label>
            <Input
              id="cod_cliente"
              value={codCliente}
              onChange={(e) => setCodCliente(e.target.value.replace(/\D/g, ""))}
              placeholder="Figura en tu factura"
              inputMode="numeric"
              maxLength={12}
            />
            <p className="text-[11px] text-slate-500">
              Nos ayuda a encontrar tus entregas más rápido.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="direccion">Dirección *</Label>
              <Input
                id="direccion"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Calle y número"
                maxLength={160}
                autoComplete="street-address"
                required
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="localidad">Localidad *</Label>
              <Input
                id="localidad"
                value={localidad}
                onChange={(e) => setLocalidad(e.target.value)}
                placeholder="Ej.: San Nicolás, Pergamino, Ramallo"
                maxLength={80}
                autoComplete="address-level2"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="contacto">Tu nombre *</Label>
              <Input
                id="contacto"
                value={contacto}
                onChange={(e) => setContacto(e.target.value)}
                maxLength={80}
                autoComplete="name"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="telefono">Teléfono / WhatsApp *</Label>
              <Input
                id="telefono"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Ej.: 3364 123456"
                inputMode="tel"
                maxLength={30}
                autoComplete="tel"
                required
              />
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-800">
              ¿En qué horario podés recibir el pedido? *
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="desde" className="text-xs">
                  Desde
                </Label>
                <Input
                  id="desde"
                  type="time"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hasta" className="text-xs">
                  Hasta
                </Label>
                <Input
                  id="hasta"
                  type="time"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  required
                />
              </div>
            </div>
            <Input
              value={ventanaObs}
              onChange={(e) => setVentanaObs(e.target.value)}
              placeholder="Aclaración (opcional): ej. cerrado de 13 a 16, sábados hasta las 12"
              maxLength={200}
              className="text-sm"
            />
            <p className="text-[11px] text-slate-500">
              Nos sirve para que el reparto pase cuando estás.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <input
              type="checkbox"
              checked={califico}
              onChange={(e) => setCalifico(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-amber-600"
            />
            <span>
              Ya califiqué mi última entrega en BEES{" "}
              <span className="text-xs text-amber-700">
                (si todavía no, hacelo con la próxima: es lo que te hace
                participar)
              </span>
            </span>
          </label>

          {/* Honeypot: invisible para personas, tentador para bots. */}
          <div className="hidden" aria-hidden="true">
            <label htmlFor="web">Sitio web</label>
            <input
              id="web"
              name="web"
              tabIndex={-1}
              autoComplete="off"
              value={web}
              onChange={(e) => setWeb(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando…
              </>
            ) : (
              "Inscribirme al sorteo"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
