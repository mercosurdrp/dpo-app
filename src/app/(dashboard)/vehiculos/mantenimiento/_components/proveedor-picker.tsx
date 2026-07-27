"use client"

// Selector de proveedor / taller compartido por TODO el módulo de mantenimiento
// (OT, programación de OT, OT de neumáticos, compra de cubiertas, alineaciones y
// gastos). Antes cada uno de esos formularios tenía un <Input> libre y el mismo
// taller terminaba cargado con 3 escrituras distintas ("Pozzi" / "GOMERIA POZZI
// ARNALDO JOSE" / "Pozzi gomería"), con lo que el gasto por proveedor salía
// partido en cualquier ranking.
//
// Se elige de la lista (`mantenimiento_proveedores`) con buscador; si el
// proveedor no existe todavía se agrega al maestro desde el mismo campo, así el
// próximo que cargue lo encuentra escrito igual. El texto libre NO se bloquea
// (nunca frena una carga), pero queda avisado en ámbar cuando no está en el
// listado.
import { createContext, useContext, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Plus } from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { createProveedor } from "@/actions/mantenimiento-gastos"
import type { MantenimientoProveedor } from "@/types/database"

/** Minúsculas y sin acentos, para que "Pagnanini" matchee "PAGNANINI SERGIO". */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

// Contexto para no tener que pasar el catálogo por props a través de diálogos
// anidados (el módulo de neumáticos tiene el picker en 4 pantallas distintas).
const ProveedoresCtx = createContext<{
  lista: MantenimientoProveedor[]
  agregar: (p: MantenimientoProveedor) => void
}>({ lista: [], agregar: () => {} })

export function ProveedoresProvider({
  proveedores,
  onProveedorCreado,
  children,
}: {
  proveedores: MantenimientoProveedor[]
  onProveedorCreado: (p: MantenimientoProveedor) => void
  children: React.ReactNode
}) {
  const valor = useMemo(
    () => ({ lista: proveedores, agregar: onProveedorCreado }),
    [proveedores, onProveedorCreado]
  )
  return <ProveedoresCtx.Provider value={valor}>{children}</ProveedoresCtx.Provider>
}

export function ProveedorPicker({
  proveedores: proveedoresProp,
  value,
  onChange,
  onCreado,
  placeholder = "Buscá o elegí el proveedor",
  disabled,
}: {
  /** Opcional: si no viene, sale del ProveedoresProvider más cercano. */
  proveedores?: MantenimientoProveedor[]
  value: string
  onChange: (nombre: string) => void
  /** Avisa al padre para sumarlo al catálogo en memoria (sin recargar). */
  onCreado?: (p: MantenimientoProveedor) => void
  placeholder?: string
  disabled?: boolean
}) {
  const ctx = useContext(ProveedoresCtx)
  const proveedores = proveedoresProp ?? ctx.lista
  const avisarCreado = onCreado ?? ctx.agregar
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const cerrarTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const texto = value.trim()
  const opciones = useMemo(() => {
    const q = norm(texto)
    const lista = q
      ? proveedores.filter((p) => norm(p.nombre).includes(q))
      : proveedores
    return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
  }, [proveedores, texto])

  const existe = useMemo(
    () => proveedores.some((p) => norm(p.nombre) === norm(texto)),
    [proveedores, texto]
  )

  // El blur se demora para que llegue el click sobre una opción de la lista.
  const cerrarDiferido = () => {
    if (cerrarTimer.current) clearTimeout(cerrarTimer.current)
    cerrarTimer.current = setTimeout(() => setAbierto(false), 150)
  }
  const cancelarCierre = () => {
    if (cerrarTimer.current) clearTimeout(cerrarTimer.current)
  }

  const elegir = (nombre: string) => {
    cancelarCierre()
    onChange(nombre)
    setAbierto(false)
  }

  const agregarAlMaestro = async () => {
    cancelarCierre()
    const nombre = texto
    if (!nombre) {
      toast.error("Escribí el nombre del proveedor")
      return
    }
    setGuardando(true)
    const res = await createProveedor(nombre)
    setGuardando(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    avisarCreado(res.data)
    onChange(res.data.nombre)
    setAbierto(false)
    toast.success("Proveedor agregado al listado")
  }

  return (
    <div className="relative" onBlur={cerrarDiferido} onFocus={cancelarCierre}>
      <div className="flex items-center gap-1">
        <Input
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value)
            setAbierto(true)
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAbierto(false)
            if (e.key === "Enter" && abierto && opciones.length === 1) {
              e.preventDefault()
              elegir(opciones[0].nombre)
            }
          }}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          title="Ver todos los proveedores"
          disabled={disabled}
          onClick={() => setAbierto((v) => !v)}
        >
          <ChevronDown className="size-4" />
        </Button>
      </div>

      {texto && !existe && !abierto ? (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
          No está en el listado de proveedores.
        </p>
      ) : null}

      {abierto ? (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {opciones.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Ningún proveedor coincide con “{texto}”.
            </p>
          ) : (
            opciones.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(p.nombre)}
              >
                {norm(p.nombre) === norm(texto) ? (
                  <Check className="size-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <span className="size-3.5 shrink-0" />
                )}
                <span className="truncate">{p.nombre}</span>
              </button>
            ))
          )}

          {texto && !existe ? (
            <button
              type="button"
              className="mt-1 flex w-full items-center gap-2 rounded border-t px-2 py-1.5 text-left text-sm font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:text-sky-400 dark:hover:bg-sky-950"
              disabled={guardando}
              onMouseDown={(e) => e.preventDefault()}
              onClick={agregarAlMaestro}
            >
              <Plus className="size-3.5 shrink-0" />
              <span className="truncate">
                {guardando ? "Agregando…" : `Agregar “${texto}” al listado`}
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
