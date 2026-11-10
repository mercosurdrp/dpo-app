"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PackagePlus, PenLine, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { actualizarRemito, crearRemito } from "@/actions/remitos-internos"
import {
  UNIDADES_REMITO,
  type RemitoArticuloOpcion,
  type RemitoChoferOpcion,
  type RemitoInput,
  type RemitoItem,
  type RemitoVehiculoOpcion,
} from "@/types/remitos-internos"

type Fila = RemitoItem & { key: number; libre: boolean }

let seq = 0
const nuevaFila = (libre: boolean): Fila => ({
  key: ++seq,
  libre,
  orden: 0,
  id_articulo: null,
  descripcion: "",
  cantidad: 0,
  unidad: libre ? "unidades" : "bultos",
})

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

function BuscadorArticulo({
  articulos,
  fila,
  onElegir,
}: {
  articulos: RemitoArticuloOpcion[]
  fila: Fila
  onElegir: (a: RemitoArticuloOpcion | null, texto: string) => void
}) {
  const [texto, setTexto] = useState(fila.descripcion)
  const [abierto, setAbierto] = useState(false)

  const opciones = useMemo(() => {
    const palabras = normalizar(texto).split(/\s+/).filter(Boolean)
    if (!palabras.length) return []
    return articulos
      .filter((a) => {
        const hay = normalizar(`${a.id} ${a.descripcion} ${a.corta ?? ""}`)
        return palabras.every((p) => hay.includes(p))
      })
      .slice(0, 10)
  }, [texto, articulos])

  return (
    <div className="relative">
      <Input
        value={texto}
        placeholder="Buscar artículo por nombre o código…"
        className={fila.id_articulo ? "border-emerald-300" : undefined}
        onChange={(e) => {
          setTexto(e.target.value)
          setAbierto(true)
          // Al tocar el texto se suelta el artículo elegido hasta que se elija otro.
          onElegir(null, e.target.value)
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
      />
      {abierto && opciones.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-white shadow-lg">
          {opciones.map((a) => (
            <button
              type="button"
              key={a.id}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const desc = `${a.id} - ${a.descripcion}`
                setTexto(desc)
                setAbierto(false)
                onElegir(a, desc)
              }}
            >
              <span className="tabular-nums text-slate-500">{a.id}</span> {a.descripcion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function RemitoForm({
  remitoId,
  numero,
  operacionNombre,
  inicial,
  vehiculos,
  choferes,
  articulos,
}: {
  remitoId?: string
  numero?: number
  operacionNombre: string
  inicial: RemitoInput
  vehiculos: RemitoVehiculoOpcion[]
  choferes: RemitoChoferOpcion[]
  articulos: RemitoArticuloOpcion[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fecha, setFecha] = useState(inicial.fecha)
  const [origen, setOrigen] = useState(inicial.origen)
  const [destino, setDestino] = useState(inicial.destino)
  const [patente, setPatente] = useState(inicial.patente)
  const [chofer, setChofer] = useState(inicial.chofer_nombre)
  const [observaciones, setObservaciones] = useState(inicial.observaciones)
  const [filas, setFilas] = useState<Fila[]>(() =>
    inicial.items.length
      ? inicial.items.map((i) => ({ ...i, key: ++seq, libre: i.id_articulo == null }))
      : [nuevaFila(false)],
  )

  const cambiar = (key: number, patch: Partial<Fila>) =>
    setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)))

  const guardar = () => {
    // Un renglón de catálogo con texto pero sin artículo elegido no se guarda a ciegas.
    const sinElegir = filas.find((f) => !f.libre && !f.id_articulo && f.descripcion.trim())
    if (sinElegir) {
      toast.error("Hay un artículo escrito pero no elegido de la lista")
      return
    }
    const input: RemitoInput = {
      operacion_id: inicial.operacion_id,
      fecha,
      origen,
      destino,
      patente,
      chofer_nombre: chofer,
      observaciones,
      items: filas
        .filter((f) => f.descripcion.trim())
        .map((f, idx) => ({
          orden: idx + 1,
          id_articulo: f.libre ? null : f.id_articulo,
          descripcion: f.descripcion,
          cantidad: Number(f.cantidad),
          unidad: f.unidad,
        })),
    }
    startTransition(async () => {
      if (remitoId) {
        const res = await actualizarRemito(remitoId, input)
        if ("error" in res) {
          toast.error(res.error)
          return
        }
        toast.success("Remito guardado")
        router.push(`/remitos-internos/${remitoId}`)
      } else {
        const res = await crearRemito(input)
        if ("error" in res) {
          toast.error(res.error)
          return
        }
        toast.success(`Remito N° ${res.data.numero} creado`)
        router.push(`/remitos-internos/${res.data.id}`)
      }
    })
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>
            {operacionNombre} · {numero ? `Viaje N° ${numero}` : "Nuevo viaje (el número se asigna al guardar)"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="fecha">Fecha</Label>
            <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="hidden sm:block" />
          <div className="space-y-1">
            <Label htmlFor="origen">Origen</Label>
            <Input id="origen" value={origen} onChange={(e) => setOrigen(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="destino">Destino</Label>
            <Input id="destino" value={destino} onChange={(e) => setDestino(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="patente">Camión (patente)</Label>
            <Input
              id="patente"
              list="remito-patentes"
              value={patente}
              placeholder="Elegí de la flota o escribila"
              onChange={(e) => setPatente(e.target.value)}
            />
            <datalist id="remito-patentes">
              {vehiculos.map((v) => (
                <option key={v.id} value={v.dominio}>
                  {v.descripcion ?? ""}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label htmlFor="chofer">Chofer</Label>
            <Input
              id="chofer"
              list="remito-choferes"
              value={chofer}
              placeholder="Elegí de la lista o escribilo"
              onChange={(e) => setChofer(e.target.value)}
            />
            <datalist id="remito-choferes">
              {choferes.map((c) => (
                <option key={c.id} value={c.nombre} />
              ))}
            </datalist>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Carga</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {filas.map((f, idx) => (
            <div key={f.key} className="grid grid-cols-[1.5rem_1fr] items-start gap-2 sm:grid-cols-[1.5rem_1fr_7rem_8rem_2rem]">
              <span className="pt-2 text-right text-xs tabular-nums text-slate-400">{idx + 1}</span>
              {f.libre ? (
                <Input
                  value={f.descripcion}
                  placeholder="Qué se lleva (ej.: módulo de rack 3 m, escritorio, balanza)"
                  onChange={(e) => cambiar(f.key, { descripcion: e.target.value })}
                />
              ) : (
                <BuscadorArticulo
                  articulos={articulos}
                  fila={f}
                  onElegir={(a, texto) => cambiar(f.key, { id_articulo: a?.id ?? null, descripcion: texto })}
                />
              )}
              <Input
                className="col-start-2 sm:col-start-auto"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                placeholder="Cant."
                value={f.cantidad || ""}
                onChange={(e) => cambiar(f.key, { cantidad: Number(e.target.value) })}
              />
              <select
                className="col-start-2 h-8 rounded-lg border border-input bg-background px-2 text-sm sm:col-start-auto"
                value={f.unidad}
                onChange={(e) => cambiar(f.key, { unidad: e.target.value })}
              >
                {UNIDADES_REMITO.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="col-start-2 sm:col-start-auto"
                aria-label="Quitar renglón"
                onClick={() => setFilas((fs) => (fs.length > 1 ? fs.filter((x) => x.key !== f.key) : [nuevaFila(false)]))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setFilas((fs) => [...fs, nuevaFila(false)])}>
              <PackagePlus /> Artículo
            </Button>
            <Button type="button" variant="outline" onClick={() => setFilas((fs) => [...fs, nuevaFila(true)])}>
              <PenLine /> Renglón a mano
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-1">
        <Label htmlFor="obs">Observaciones</Label>
        <Textarea id="obs" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} />
      </div>

      <div className="flex gap-2">
        <Button size="lg" onClick={guardar} disabled={pending}>
          {pending ? "Guardando…" : remitoId ? "Guardar cambios" : "Crear remito"}
        </Button>
        <Button size="lg" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
