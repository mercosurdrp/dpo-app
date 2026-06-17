"use client"

// Gestión de repuestos del taller interno: catálogo editable de consumibles
// (focos, micas, fusibles…), carga de ingresos y salidas, saldo de stock y
// costos. Datos en Vercel Blob (UNIFICADOS con herminio-web) vía los proxies
// /api/flota-repuestos (movimientos) y /api/flota-repuestos-catalogo (catálogo).
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { ArrowLeft, Check, Loader2, Package, Pencil, RefreshCw, Trash2, X } from "lucide-react"
import { PlanesAccionFlota } from "../_components/planes-accion-flota"

const SUCURSALES = ["Eldorado", "Iguazú"]

// Flota actualizada (FLOTA QUILMES ACTUALIZADA). Lista curada por Herminio: cada
// salida de repuesto se imputa a una de estas unidades para medir el gasto por
// unidad. Si cambia la flota, editar acá.
// `value` = lo que se guarda/identifica; `label` = lo que se ve en el desplegable.
const FLOTA = [
  { value: "OJA408", label: "OJA408 (1714)" },
  { value: "FUB570", label: "FUB570 (1106)" },
  { value: "AF399KW", label: "AF399KW (3922)" },
  { value: "HJR136", label: "HJR136 (1408)" },
  { value: "OTY696", label: "OTY696 (1915)" },
  { value: "FTI792", label: "FTI792 (1306)" },
  { value: "OTB032", label: "OTB032 (2015)" },
  { value: "AB386KV", label: "AB386KV (2117)" },
  { value: "AB386KU", label: "AB386KU (2217)" },
  { value: "AE445WS", label: "AE445WS (2320)" },
  { value: "AE445WT", label: "AE445WT (2420)" },
  { value: "AE591EV", label: "AE591EV (2521)" },
  { value: "AE523XP", label: "AE523XP (2721)" },
  { value: "AF399KX", label: "AF399KX (3722)" },
  { value: "AF552QZ", label: "AF552QZ (4123)" },
  { value: "AF399KZ", label: "AF399KZ (3822)" },
  { value: "TOYOTA4", label: "TOYOTA4 (autoelevador)" },
  { value: "TOYOTA5", label: "TOYOTA5 (autoelevador)" },
  { value: "TOYOTA6", label: "TOYOTA6 (autoelevador)" },
  { value: "AB729UX", label: "AB729UX (4517 · acoplado)" },
  { value: "AF516JC", label: "AF516JC (4422 · acoplado)" },
]
const FLOTA_VALUES = FLOTA.map((u) => u.value)
function etiquetaUnidad(value: string) {
  const u = FLOTA.find((x) => x.value === value)
  return u ? u.label : value
}

const OK = "#10B981" // verde (ingresos / stock)
const ACCENT = "#0284C7" // azul (salidas / consumo)
const BAD = "#EF4444"
const MUTED = "#94A3B8"

function hoyArg() {
  const arg = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return arg.toISOString().slice(0, 10)
}
function restarDias(fechaISO: string, dias: number) {
  const d = new Date(fechaISO + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}
function lunesDeLaSemana(fechaISO: string) {
  const d = new Date(fechaISO + "T00:00:00Z")
  const dia = d.getUTCDay()
  return restarDias(fechaISO, (dia + 6) % 7)
}
function primerDiaDelMes(fechaISO: string) {
  return fechaISO.slice(0, 8) + "01"
}
function finDeMes(mesISO: string) {
  const [y, m] = mesISO.split("-").map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}
function fmtFecha(iso: string) {
  if (!iso) return "—"
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}
function fmtNum(n: number) {
  return Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })
}
function fmtPesos(n: number) {
  return "$ " + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })
}
function claveRepuesto(nombre: string) {
  return String(nombre || "").trim().toUpperCase().replace(/\s+/g, " ")
}
// Deriva la sucursal a partir de la ubicación del catálogo ("Taller Eldorado").
function sucursalDeUbicacion(ub: string) {
  const u = (ub || "").toLowerCase()
  if (u.includes("eldorado")) return "Eldorado"
  if (u.includes("iguaz")) return "Iguazú"
  return ""
}

interface Mov {
  id: string
  tipo: string
  repuesto: string
  cantidad: number | null
  precio: number | null
  sucursal: string
  fecha: string
  ref: string
  vehiculo: string
  comentario: string
  creado?: string
}
interface CatItem {
  id: string
  nombre: string
  grupo?: string
  ubicacion?: string
}

// Estado del formulario de alta / edición (todos los campos como string para
// los inputs controlados).
interface MovForm {
  tipo: string
  repuesto: string
  cantidad: string
  precio: string
  sucursal: string
  fecha: string
  ref: string
  vehiculo: string
  comentario: string
}

const SUC_ALL = "__all__"
const SUC_NONE = "__none__"
const UNIDAD_SIN = "__sin__"

export function RepuestosFlotaClient() {
  const hoy = hoyArg()
  const [movs, setMovs] = useState<Mov[]>([])
  const [catalogo, setCatalogo] = useState<CatItem[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filtros de período (default: año en curso) + sucursal.
  const [desde, setDesde] = useState(hoy.slice(0, 4) + "-01-01")
  const [hasta, setHasta] = useState(hoy)
  const [sucursal, setSucursal] = useState(SUC_ALL)

  // Formulario de alta de movimiento.
  const vacio: MovForm = {
    tipo: "ingreso",
    repuesto: "",
    cantidad: "",
    precio: "",
    sucursal: "",
    fecha: hoy,
    ref: "",
    vehiculo: "",
    comentario: "",
  }
  const [nuevo, setNuevo] = useState<MovForm>(vacio)

  // Filtros del historial.
  const [fTipo, setFTipo] = useState("")
  const [fRepuesto, setFRepuesto] = useState(SUC_ALL)
  const [fVehiculo, setFVehiculo] = useState(SUC_ALL)

  // Edición inline de movimientos del historial.
  const [editId, setEditId] = useState<string | null>(null)
  const [edit, setEdit] = useState<MovForm | null>(null)

  // Panel "Administrar repuestos" (catálogo editable).
  const [verCatalogo, setVerCatalogo] = useState(false)
  const repVacio = { nombre: "", grupo: "", ubicacion: "" }
  const [repNuevo, setRepNuevo] = useState(repVacio)

  // Edición inline de un repuesto del catálogo (corregir nombre/grupo/ubicación).
  const [editCatId, setEditCatId] = useState<string | null>(null)
  const [editCat, setEditCat] = useState({ nombre: "", grupo: "", ubicacion: "" })

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [rm, rc] = await Promise.all([
        fetch("/api/flota-repuestos", { cache: "no-store" }),
        fetch("/api/flota-repuestos-catalogo", { cache: "no-store" }),
      ])
      const jm = await rm.json()
      const jc = await rc.json()
      if (!jm.ok) throw new Error(jm.error || "Error al leer los movimientos")
      if (!jc.ok) throw new Error(jc.error || "Error al leer el catálogo")
      setMovs(jm.movimientos || [])
      setCatalogo(jc.catalogo || [])
    } catch (e) {
      setError(String((e as Error).message || e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Mutación de movimientos. El payload va al proxy tal cual (cantidad/precio
  // pueden viajar como string desde los inputs; el backend los normaliza).
  const mutar = async (accion: string, mov: Record<string, unknown>) => {
    setGuardando(true)
    setError(null)
    try {
      const r = await fetch("/api/flota-repuestos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, mov }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "No se pudo guardar")
      setMovs(j.movimientos || [])
      return true
    } catch (e) {
      setError(String((e as Error).message || e))
      return false
    } finally {
      setGuardando(false)
    }
  }

  // Mutación del catálogo (lista de repuestos).
  const mutarCatalogo = async (accion: string, item: Partial<CatItem>) => {
    setGuardando(true)
    setError(null)
    try {
      const r = await fetch("/api/flota-repuestos-catalogo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, item }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "No se pudo guardar el repuesto")
      setCatalogo(j.catalogo || [])
      return true
    } catch (e) {
      setError(String((e as Error).message || e))
      return false
    } finally {
      setGuardando(false)
    }
  }

  const registrar = async () => {
    if (!nuevo.repuesto.trim() || !Number(nuevo.cantidad) || !nuevo.fecha) {
      setError("Elegí el repuesto, la cantidad (mayor a 0) y la fecha.")
      return
    }
    const ok = await mutar("crear", { ...nuevo, repuesto: nuevo.repuesto.trim() })
    if (ok)
      setNuevo({
        ...vacio,
        tipo: nuevo.tipo,
        fecha: nuevo.fecha,
        sucursal: nuevo.sucursal,
        vehiculo: nuevo.vehiculo,
      })
  }

  const borrar = async (m: Mov) => {
    if (!window.confirm(`¿Borrar este movimiento de "${m.repuesto}"?`)) return
    await mutar("borrar", { id: m.id })
  }

  // Edición inline de un movimiento del historial (corregir una carga errónea).
  const empezarEdicion = (m: Mov) => {
    setEditId(m.id)
    setEdit({
      tipo: m.tipo,
      repuesto: m.repuesto || "",
      cantidad: m.cantidad != null ? String(m.cantidad) : "",
      precio: m.precio != null ? String(m.precio) : "",
      sucursal: m.sucursal || "",
      fecha: m.fecha || hoy,
      ref: m.ref || "",
      vehiculo: m.vehiculo || "",
      comentario: m.comentario || "",
    })
  }
  const cancelarEdicion = () => {
    setEditId(null)
    setEdit(null)
  }
  const guardarEdicion = async () => {
    if (!edit) return
    if (!edit.repuesto.trim() || !Number(edit.cantidad) || !edit.fecha) {
      setError("Para guardar: repuesto, cantidad (mayor a 0) y fecha.")
      return
    }
    const payload: Record<string, unknown> = {
      ...edit,
      id: editId,
      repuesto: edit.repuesto.trim(),
    }
    // Si pasa a ingreso, la unidad deja de aplicar.
    if (edit.tipo === "ingreso") payload.vehiculo = ""
    const ok = await mutar("editar", payload)
    if (ok) cancelarEdicion()
  }

  const agregarRepuesto = async () => {
    if (!repNuevo.nombre.trim()) {
      setError("Escribí el nombre del repuesto nuevo.")
      return
    }
    const ok = await mutarCatalogo("crear", repNuevo)
    if (ok) setRepNuevo(repVacio)
  }

  const borrarRepuesto = async (c: CatItem) => {
    if (!window.confirm(`¿Quitar "${c.nombre}" de la lista de repuestos?`)) return
    await mutarCatalogo("borrar", { id: c.id })
  }

  const empezarEdicionCat = (c: CatItem) => {
    setEditCatId(c.id)
    setEditCat({ nombre: c.nombre || "", grupo: c.grupo || "", ubicacion: c.ubicacion || "" })
  }
  const cancelarEdicionCat = () => {
    setEditCatId(null)
    setEditCat({ nombre: "", grupo: "", ubicacion: "" })
  }
  const guardarEdicionCat = async () => {
    if (!editCatId) return
    if (!editCat.nombre.trim()) {
      setError("El repuesto necesita un nombre.")
      return
    }
    const ok = await mutarCatalogo("editar", {
      id: editCatId,
      nombre: editCat.nombre.trim(),
      grupo: editCat.grupo.trim(),
      ubicacion: editCat.ubicacion.trim(),
    })
    if (ok) cancelarEdicionCat()
  }

  // Al elegir un repuesto del catálogo, autocompleta la sucursal por su ubicación.
  const elegirRepuesto = (nombre: string) => {
    const cat = catalogo.find((c) => claveRepuesto(c.nombre) === claveRepuesto(nombre))
    const suc = cat ? sucursalDeUbicacion(cat.ubicacion || "") : ""
    setNuevo((n) => ({ ...n, repuesto: nombre, sucursal: suc || n.sucursal }))
  }

  // Rangos rápidos.
  const rangos = [
    { key: "hoy", label: "Hoy", desde: hoy, hasta: hoy },
    { key: "semana", label: "Semana", desde: lunesDeLaSemana(hoy), hasta: hoy },
    { key: "mes", label: "Mes", desde: primerDiaDelMes(hoy), hasta: hoy },
    { key: "anio", label: "Año", desde: hoy.slice(0, 4) + "-01-01", hasta: hoy },
  ]
  const rangoActivo = rangos.find((r) => r.desde === desde && r.hasta === hasta)?.key

  const mesFiltro =
    desde.slice(0, 7) === hasta.slice(0, 7) &&
    desde.endsWith("-01") &&
    (hasta === finDeMes(hasta.slice(0, 7)) || hasta === hoy)
      ? desde.slice(0, 7)
      : ""
  const aplicarMes = (mes: string) => {
    if (!mes) return
    setDesde(mes + "-01")
    setHasta(mes === hoy.slice(0, 7) ? hoy : finDeMes(mes))
  }

  const anios = useMemo(() => {
    const s = new Set(movs.map((m) => (m.fecha || "").slice(0, 4)).filter(Boolean))
    s.add(hoy.slice(0, 4))
    return [...s].filter(Boolean).sort((a, b) => b.localeCompare(a))
  }, [movs, hoy])
  const anioFiltro =
    desde.endsWith("-01-01") &&
    desde.slice(0, 4) === hasta.slice(0, 4) &&
    (hasta === desde.slice(0, 4) + "-12-31" || hasta === hoy)
      ? desde.slice(0, 4)
      : ""
  const aplicarAnio = (a: string) => {
    if (!a) return
    setDesde(a + "-01-01")
    setHasta(a === hoy.slice(0, 4) ? hoy : a + "-12-31")
  }

  // Movimientos dentro del período + sucursal (cards de período e historial).
  const sucFiltro = sucursal === SUC_ALL ? "" : sucursal
  const enRango = useCallback(
    (m: Mov) => {
      const f = m.fecha || ""
      if (desde && f < desde) return false
      if (hasta && f > hasta) return false
      if (sucFiltro && (m.sucursal || "") !== sucFiltro) return false
      return true
    },
    [desde, hasta, sucFiltro]
  )

  // Nombres del catálogo (para el desplegable filtrable y el filtro del historial).
  const nombresCatalogo = useMemo(
    () => catalogo.map((c) => c.nombre).sort((a, b) => a.localeCompare(b)),
    [catalogo]
  )
  // Grupo por clave de repuesto (para mostrarlo en la tabla de stock).
  const grupoPorClave = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of catalogo) m.set(claveRepuesto(c.nombre), c.grupo || "")
    return m
  }, [catalogo])

  // Saldo de stock por repuesto: acumulado hasta "hasta", respetando sucursal.
  const stock = useMemo(() => {
    interface StockRow {
      repuesto: string
      ingresos: number
      salidas: number
      costoIng: number
      cantIngConPrecio: number
      ultIngreso: string
      ultSalida: string
    }
    const m = new Map<string, StockRow>()
    const sembrar = (nombre: string) => {
      const k = claveRepuesto(nombre)
      if (!k) return null
      if (!m.has(k))
        m.set(k, {
          repuesto: nombre,
          ingresos: 0,
          salidas: 0,
          costoIng: 0,
          cantIngConPrecio: 0,
          ultIngreso: "",
          ultSalida: "",
        })
      return m.get(k)!
    }
    for (const c of catalogo) {
      const sucCat = sucursalDeUbicacion(c.ubicacion || "")
      if (sucFiltro && sucCat && sucCat !== sucFiltro) continue
      sembrar(c.nombre)
    }
    for (const x of movs) {
      if (hasta && (x.fecha || "") > hasta) continue
      if (sucFiltro && (x.sucursal || "") !== sucFiltro) continue
      const g = sembrar(x.repuesto)
      if (!g) continue
      const c = Number(x.cantidad) || 0
      const f = x.fecha || ""
      if (x.tipo === "ingreso") {
        g.ingresos += c
        if (f > g.ultIngreso) g.ultIngreso = f
        if (x.precio != null) {
          g.costoIng += c * x.precio
          g.cantIngConPrecio += c
        }
      } else if (x.tipo === "salida") {
        g.salidas += c
        if (f > g.ultSalida) g.ultSalida = f
      }
    }
    return [...m.values()]
      .map((g) => {
        const saldo = Math.round((g.ingresos - g.salidas) * 100) / 100
        const precioProm = g.cantIngConPrecio > 0 ? g.costoIng / g.cantIngConPrecio : null
        const valor = precioProm != null ? Math.max(0, saldo) * precioProm : 0
        return {
          ...g,
          grupo: grupoPorClave.get(claveRepuesto(g.repuesto)) || "",
          saldo,
          precioProm,
          valor,
        }
      })
      .sort((a, b) => a.repuesto.localeCompare(b.repuesto))
  }, [movs, catalogo, hasta, sucFiltro, grupoPorClave])

  // Saldo actual por clave (para el stock en vivo del repuesto elegido).
  const stockPorClave = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of stock) m.set(claveRepuesto(s.repuesto), s.saldo)
    return m
  }, [stock])
  const stockElegido = nuevo.repuesto.trim()
    ? stockPorClave.get(claveRepuesto(nuevo.repuesto))
    : undefined

  // Tarjetas resumen.
  const resumen = useMemo(() => {
    const enStock = stock.filter((s) => s.saldo > 0)
    const sinStock = stock.filter((s) => s.saldo <= 0)
    const unidades = stock.reduce((t, s) => t + Math.max(0, s.saldo), 0)
    const valorStock = stock.reduce((t, s) => t + (s.valor || 0), 0)
    const delRango = movs.filter(enRango)
    const costoMov = (tipo: string) =>
      delRango
        .filter((x) => x.tipo === tipo)
        .reduce((t, x) => t + (x.precio != null ? (Number(x.cantidad) || 0) * x.precio : 0), 0)
    return {
      tipos: enStock.length,
      unidades,
      sinStock: sinStock.length,
      valorStock,
      costoIng: costoMov("ingreso"),
      costoSal: costoMov("salida"),
    }
  }, [stock, movs, enRango])

  // Historial de movimientos (más nuevo primero) con período + filtros.
  const historial = useMemo(() => {
    let f = movs
      .filter(enRango)
      .sort(
        (a, b) =>
          (b.fecha || "").localeCompare(a.fecha || "") ||
          (b.creado || "").localeCompare(a.creado || "")
      )
    if (fTipo) f = f.filter((x) => x.tipo === fTipo)
    if (fRepuesto !== SUC_ALL)
      f = f.filter((x) => claveRepuesto(x.repuesto) === claveRepuesto(fRepuesto))
    if (fVehiculo === UNIDAD_SIN) f = f.filter((x) => x.tipo === "salida" && !(x.vehiculo || ""))
    else if (fVehiculo !== SUC_ALL) f = f.filter((x) => (x.vehiculo || "") === fVehiculo)
    return f
  }, [movs, enRango, fTipo, fRepuesto, fVehiculo])

  // Gasto de salidas imputado a cada unidad de la flota, dentro del período.
  const gastoPorUnidad = useMemo(() => {
    const m = new Map<string, { vehiculo: string; salidas: number; costo: number }>()
    for (const x of movs.filter(enRango)) {
      if (x.tipo !== "salida") continue
      const k = x.vehiculo || ""
      const g = m.get(k) || { vehiculo: k, salidas: 0, costo: 0 }
      g.salidas += Number(x.cantidad) || 0
      if (x.precio != null) g.costo += (Number(x.cantidad) || 0) * x.precio
      m.set(k, g)
    }
    return [...m.values()].sort((a, b) => b.costo - a.costo || b.salidas - a.salidas)
  }, [movs, enRango])

  const esIngreso = nuevo.tipo === "ingreso"

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/indicadores/df74e60b-bff9-4d87-ae16-edf0bb8bfe87"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Flota
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-orange-100 p-3 text-orange-600">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Gestión de repuestos</h1>
            <p className="text-sm text-muted-foreground">
              Taller interno · consumibles y repuestos de emergencia (focos, micas, fusibles…)
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={cargar} disabled={cargando}>
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {cargando ? "Cargando…" : "Actualizar"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Repuestos en stock</p>
            <p className="text-3xl font-bold text-slate-900">{resumen.tipos}</p>
            <p className="text-xs text-muted-foreground">con saldo disponible</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Unidades en stock</p>
            <p className="text-3xl font-bold text-slate-900">{fmtNum(resumen.unidades)}</p>
            <p className="text-xs text-muted-foreground">suma de saldos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Valor de stock</p>
            <p className="text-2xl font-bold text-slate-900">{fmtPesos(resumen.valorStock)}</p>
            <p className="text-xs text-muted-foreground">saldo × precio promedio</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Compras del período</p>
            <p className="text-2xl font-bold" style={{ color: OK }}>{fmtPesos(resumen.costoIng)}</p>
            <p className="text-xs text-muted-foreground">costo de ingresos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Consumo del período</p>
            <p className="text-2xl font-bold" style={{ color: ACCENT }}>{fmtPesos(resumen.costoSal)}</p>
            <p className="text-xs text-muted-foreground">costo de salidas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Sin stock</p>
            <p className="text-3xl font-bold" style={{ color: resumen.sinStock ? BAD : MUTED }}>
              {resumen.sinStock}
            </p>
            <p className="text-xs text-muted-foreground">saldo en cero o negativo</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros de período + sucursal */}
      <div className="flex flex-wrap items-end gap-2">
        {rangos.map((r) => (
          <Button
            key={r.key}
            size="sm"
            variant={rangoActivo === r.key ? "default" : "outline"}
            className="font-semibold"
            onClick={() => {
              setDesde(r.desde)
              setHasta(r.hasta)
            }}
          >
            {r.label}
          </Button>
        ))}
        <span className="mx-1 h-9 w-px bg-slate-200" />
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Desde
          <Input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setDesde(e.target.value)}
            className="h-9 w-[150px] font-semibold"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Hasta
          <Input
            type="date"
            value={hasta}
            max={hoy}
            onChange={(e) => setHasta(e.target.value)}
            className="h-9 w-[150px] font-semibold"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Mes
          <Input
            type="month"
            value={mesFiltro}
            max={hoy.slice(0, 7)}
            onChange={(e) => aplicarMes(e.target.value)}
            className="h-9 w-[140px] font-semibold"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Año
          <Select value={anioFiltro || ""} onValueChange={(v) => aplicarAnio(v ?? "")}>
            <SelectTrigger className="h-9 w-[110px] font-semibold">
              <SelectValue placeholder="—">{(v) => (v ? String(v) : "—")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {anios.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Sucursal
          <Select value={sucursal} onValueChange={(v) => setSucursal(v ?? SUC_ALL)}>
            <SelectTrigger className="h-9 w-[150px] font-semibold">
              <SelectValue placeholder="Todas">
                {(v) => (v === SUC_ALL || v == null ? "Todas" : String(v))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SUC_ALL}>Todas</SelectItem>
              {SUCURSALES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      {/* Carga de movimiento */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Cargar movimiento</h2>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={esIngreso ? "default" : "outline"}
                onClick={() => setNuevo({ ...nuevo, tipo: "ingreso" })}
              >
                ⬇️ Ingreso
              </Button>
              <Button
                size="sm"
                variant={!esIngreso ? "default" : "outline"}
                onClick={() => setNuevo({ ...nuevo, tipo: "salida" })}
              >
                ⬆️ Salida
              </Button>
            </div>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            {esIngreso
              ? "Ingreso: repuestos que entran al taller (compra, devolución a stock)."
              : "Salida: repuestos que se consumen al usarlos en una reparación."}
          </p>

          <div className="grid gap-2 rounded-lg border bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1 lg:col-span-2">
              <label className="text-xs text-muted-foreground">Repuesto</label>
              <Input
                list="lista-repuestos"
                placeholder="Escribí para filtrar o elegí…"
                autoComplete="off"
                value={nuevo.repuesto}
                onChange={(e) => elegirRepuesto(e.target.value)}
              />
              <datalist id="lista-repuestos">
                {nombresCatalogo.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              {stockElegido !== undefined && (
                <span className="text-xs text-muted-foreground">
                  Stock actual: <strong className="text-slate-700">{fmtNum(stockElegido)}</strong>
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Cantidad</label>
              <Input
                type="number"
                min="0"
                step="any"
                placeholder="0"
                value={nuevo.cantidad}
                onChange={(e) => setNuevo({ ...nuevo, cantidad: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Precio unit. ($)</label>
              <Input
                type="number"
                min="0"
                step="any"
                placeholder="0"
                value={nuevo.precio}
                onChange={(e) => setNuevo({ ...nuevo, precio: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Sucursal</label>
              <Select
                value={nuevo.sucursal || SUC_NONE}
                onValueChange={(v) => setNuevo({ ...nuevo, sucursal: v && v !== SUC_NONE ? v : "" })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="—">
                    {(v) => (v === SUC_NONE || v == null ? "—" : String(v))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SUC_NONE}>—</SelectItem>
                  {SUCURSALES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                {esIngreso ? "Fecha de ingreso" : "Fecha de salida"}
              </label>
              <Input
                type="date"
                value={nuevo.fecha}
                max={hoy}
                onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })}
              />
            </div>
            {esIngreso ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Proveedor / remito</label>
                <Input
                  placeholder="De dónde vino"
                  autoComplete="off"
                  value={nuevo.ref}
                  onChange={(e) => setNuevo({ ...nuevo, ref: e.target.value })}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Unidad (camión)</label>
                <Select
                  value={nuevo.vehiculo || SUC_NONE}
                  onValueChange={(v) => setNuevo({ ...nuevo, vehiculo: v && v !== SUC_NONE ? v : "" })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="— Elegir unidad —">
                      {(v) => (v === SUC_NONE || v == null ? "— Elegir unidad —" : etiquetaUnidad(String(v)))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SUC_NONE}>— Elegir unidad —</SelectItem>
                    {FLOTA.map((u) => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1 lg:col-span-2">
              <label className="text-xs text-muted-foreground">Comentario</label>
              <Input
                placeholder="Opcional"
                autoComplete="off"
                value={nuevo.comentario}
                onChange={(e) => setNuevo({ ...nuevo, comentario: e.target.value })}
              />
            </div>
            <div className="flex items-end lg:col-span-2">
              <Button className="w-full" onClick={registrar} disabled={guardando}>
                {guardando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : esIngreso ? (
                  "+ Registrar ingreso"
                ) : (
                  "− Registrar salida"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Saldo de stock */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">
              Saldo de stock
              {sucFiltro && <span className="ml-1 font-normal text-muted-foreground">· {sucFiltro}</span>}
            </h2>
            <span className="text-xs text-muted-foreground">Acumulado al {fmtFecha(hasta)}</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Repuesto</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                  <TableHead className="text-right">Salidas</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Últ. ingreso</TableHead>
                  <TableHead>Últ. salida</TableHead>
                  <TableHead className="text-right">Precio unit.</TableHead>
                  <TableHead className="text-right">Valor stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargando ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      Cargando…
                    </TableCell>
                  </TableRow>
                ) : stock.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      No hay repuestos en el catálogo. Agregá uno en «Administrar repuestos».
                    </TableCell>
                  </TableRow>
                ) : (
                  stock.map((s) => (
                    <TableRow key={claveRepuesto(s.repuesto)}>
                      <TableCell className="font-semibold">{s.repuesto}</TableCell>
                      <TableCell className="text-muted-foreground">{s.grupo || "—"}</TableCell>
                      <TableCell className="text-right" style={{ color: OK }}>{fmtNum(s.ingresos)}</TableCell>
                      <TableCell className="text-right" style={{ color: ACCENT }}>{fmtNum(s.salidas)}</TableCell>
                      <TableCell className="text-right">
                        {s.saldo > 0 ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{fmtNum(s.saldo)}</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{fmtNum(s.saldo)}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.ultIngreso ? fmtFecha(s.ultIngreso) : "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{s.ultSalida ? fmtFecha(s.ultSalida) : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{s.precioProm != null ? fmtPesos(s.precioProm) : "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{s.precioProm != null ? fmtPesos(s.valor) : "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Gasto de repuestos por unidad de la flota */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">
              Gasto por unidad <span className="font-normal text-muted-foreground">· salidas del período</span>
            </h2>
            <span className="text-xs text-muted-foreground">
              {fmtFecha(desde)} – {fmtFecha(hasta)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unidad (camión)</TableHead>
                  <TableHead className="text-right">Repuestos consumidos</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargando ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      Cargando…
                    </TableCell>
                  </TableRow>
                ) : gastoPorUnidad.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      No hay salidas en el período.
                    </TableCell>
                  </TableRow>
                ) : (
                  gastoPorUnidad.map((g) => (
                    <TableRow key={g.vehiculo || UNIDAD_SIN}>
                      <TableCell className="font-semibold">
                        {g.vehiculo ? etiquetaUnidad(g.vehiculo) : <span className="text-muted-foreground">Sin asignar</span>}
                      </TableCell>
                      <TableCell className="text-right">{fmtNum(g.salidas)}</TableCell>
                      <TableCell className="text-right font-semibold" style={{ color: ACCENT }}>{fmtPesos(g.costo)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Administrar repuestos (catálogo editable) */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-orange-500" />
              <h2 className="font-semibold text-slate-900">Administrar repuestos</h2>
            </div>
            <Button size="sm" variant="outline" onClick={() => setVerCatalogo((v) => !v)}>
              {verCatalogo ? "Ocultar" : `Editar lista (${catalogo.length})`}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            La lista de repuestos del desplegable. Agregá los que necesites o quitá los que no uses.
          </p>

          {verCatalogo && (
            <>
              <div className="mt-4 grid gap-2 rounded-lg border bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1 lg:col-span-2">
                  <label className="text-xs text-muted-foreground">Nombre del repuesto</label>
                  <Input
                    placeholder="Ej. RELÉ 24V"
                    autoComplete="off"
                    value={repNuevo.nombre}
                    onChange={(e) => setRepNuevo({ ...repNuevo, nombre: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Grupo</label>
                  <Input
                    placeholder="Ej. Eléctrico"
                    autoComplete="off"
                    value={repNuevo.grupo}
                    onChange={(e) => setRepNuevo({ ...repNuevo, grupo: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Ubicación</label>
                  <Input
                    placeholder="Ej. Taller Eldorado"
                    autoComplete="off"
                    value={repNuevo.ubicacion}
                    onChange={(e) => setRepNuevo({ ...repNuevo, ubicacion: e.target.value })}
                  />
                </div>
                <div className="flex items-end lg:col-span-4">
                  <Button onClick={agregarRepuesto} disabled={guardando}>
                    {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "+ Agregar repuesto"}
                  </Button>
                </div>
              </div>

              <div className="mt-3 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Repuesto</TableHead>
                      <TableHead>Grupo</TableHead>
                      <TableHead>Ubicación</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalogo.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          Sin repuestos en la lista.
                        </TableCell>
                      </TableRow>
                    ) : (
                      [...catalogo]
                        .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))
                        .map((c) =>
                          editCatId === c.id ? (
                            // Repuesto del catálogo en modo edición.
                            <TableRow key={c.id} className="bg-slate-50/60">
                              <TableCell>
                                <Input
                                  autoComplete="off"
                                  className="h-8 min-w-[150px]"
                                  value={editCat.nombre}
                                  onChange={(e) => setEditCat({ ...editCat, nombre: e.target.value })}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  autoComplete="off"
                                  placeholder="Ej. Eléctrico"
                                  className="h-8 min-w-[120px]"
                                  value={editCat.grupo}
                                  onChange={(e) => setEditCat({ ...editCat, grupo: e.target.value })}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  autoComplete="off"
                                  placeholder="Ej. Taller Eldorado"
                                  className="h-8 min-w-[140px]"
                                  value={editCat.ubicacion}
                                  onChange={(e) => setEditCat({ ...editCat, ubicacion: e.target.value })}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                                    disabled={guardando}
                                    onClick={guardarEdicionCat}
                                    title="Guardar cambios"
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-muted-foreground"
                                    disabled={guardando}
                                    onClick={cancelarEdicionCat}
                                    title="Cancelar"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            <TableRow key={c.id}>
                              <TableCell className="font-semibold">{c.nombre}</TableCell>
                              <TableCell className="text-muted-foreground">{c.grupo || "—"}</TableCell>
                              <TableCell className="text-muted-foreground">{c.ubicacion || "—"}</TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-muted-foreground hover:text-slate-900"
                                    disabled={guardando}
                                    onClick={() => empezarEdicionCat(c)}
                                    title="Editar repuesto"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-muted-foreground hover:text-red-600"
                                    disabled={guardando}
                                    onClick={() => borrarRepuesto(c)}
                                    title="Quitar de la lista"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        )
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Historial de movimientos */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">
              Movimientos <span className="font-normal text-muted-foreground">· {historial.length}</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant={fTipo === "" ? "default" : "outline"} className="font-semibold" onClick={() => setFTipo("")}>
                Todos
              </Button>
              <Button size="sm" variant={fTipo === "ingreso" ? "default" : "outline"} className="font-semibold" onClick={() => setFTipo("ingreso")}>
                Ingresos
              </Button>
              <Button size="sm" variant={fTipo === "salida" ? "default" : "outline"} className="font-semibold" onClick={() => setFTipo("salida")}>
                Salidas
              </Button>
              {nombresCatalogo.length > 0 && (
                <Select value={fRepuesto} onValueChange={(v) => setFRepuesto(v ?? SUC_ALL)}>
                  <SelectTrigger className="h-9 w-[200px] font-semibold">
                    <SelectValue placeholder="Todos los repuestos">
                      {(v) => (v === SUC_ALL || v == null ? "Todos los repuestos" : String(v))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SUC_ALL}>Todos los repuestos</SelectItem>
                    {nombresCatalogo.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={fVehiculo} onValueChange={(v) => setFVehiculo(v ?? SUC_ALL)}>
                <SelectTrigger className="h-9 w-[200px] font-semibold">
                  <SelectValue placeholder="Todas las unidades">
                    {(v) =>
                      v === SUC_ALL || v == null
                        ? "Todas las unidades"
                        : v === UNIDAD_SIN
                        ? "Sin unidad"
                        : etiquetaUnidad(String(v))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SUC_ALL}>Todas las unidades</SelectItem>
                  {FLOTA_VALUES.map((p) => (
                    <SelectItem key={p} value={p}>{etiquetaUnidad(p)}</SelectItem>
                  ))}
                  <SelectItem value={UNIDAD_SIN}>Sin unidad</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Acciones</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Repuesto</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Precio unit.</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Comentario</TableHead>
                  <TableHead>Unidad (camión)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargando ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                      Cargando…
                    </TableCell>
                  </TableRow>
                ) : historial.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                      Sin movimientos para el filtro elegido.
                    </TableCell>
                  </TableRow>
                ) : (
                  historial.map((m) =>
                    editId === m.id && edit ? (
                      // Fila en modo edición.
                      <TableRow key={m.id} className="bg-slate-50/60">
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                              disabled={guardando}
                              onClick={guardarEdicion}
                              title="Guardar cambios"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground"
                              disabled={guardando}
                              onClick={cancelarEdicion}
                              title="Cancelar"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={edit.fecha}
                            max={hoy}
                            className="h-8 w-[140px]"
                            onChange={(e) => setEdit({ ...edit, fecha: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Select value={edit.tipo} onValueChange={(v) => setEdit({ ...edit, tipo: v ?? "ingreso" })}>
                            <SelectTrigger className="h-8 w-[110px]">
                              <SelectValue placeholder="Tipo">
                                {(v) => (v === "salida" ? "⬆️ Salida" : "⬇️ Ingreso")}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ingreso">⬇️ Ingreso</SelectItem>
                              <SelectItem value="salida">⬆️ Salida</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            list="lista-repuestos"
                            autoComplete="off"
                            value={edit.repuesto}
                            className="h-8 min-w-[150px]"
                            onChange={(e) => setEdit({ ...edit, repuesto: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            className="h-8 w-[80px]"
                            value={edit.cantidad}
                            onChange={(e) => setEdit({ ...edit, cantidad: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            className="h-8 w-[100px]"
                            value={edit.precio}
                            onChange={(e) => setEdit({ ...edit, precio: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {edit.precio !== "" && edit.precio != null
                            ? fmtPesos((Number(edit.cantidad) || 0) * Number(edit.precio))
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={edit.sucursal || SUC_NONE}
                            onValueChange={(v) => setEdit({ ...edit, sucursal: v && v !== SUC_NONE ? v : "" })}
                          >
                            <SelectTrigger className="h-8 w-[120px]">
                              <SelectValue placeholder="—">
                                {(v) => (v === SUC_NONE || v == null ? "—" : String(v))}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={SUC_NONE}>—</SelectItem>
                              {SUCURSALES.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 min-w-[120px]"
                            autoComplete="off"
                            value={edit.ref}
                            onChange={(e) => setEdit({ ...edit, ref: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 min-w-[120px]"
                            autoComplete="off"
                            value={edit.comentario}
                            onChange={(e) => setEdit({ ...edit, comentario: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          {edit.tipo === "salida" ? (
                            <Select
                              value={edit.vehiculo || SUC_NONE}
                              onValueChange={(v) => setEdit({ ...edit, vehiculo: v && v !== SUC_NONE ? v : "" })}
                            >
                              <SelectTrigger className="h-8 w-[150px]">
                                <SelectValue placeholder="— Asignar —">
                                  {(v) => (v === SUC_NONE || v == null ? "— Asignar —" : etiquetaUnidad(String(v)))}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={SUC_NONE}>— Asignar —</SelectItem>
                                {FLOTA.map((u) => (
                                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : (
                      // Fila en modo vista.
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-slate-900"
                              disabled={guardando}
                              onClick={() => empezarEdicion(m)}
                              title="Editar movimiento"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-red-600"
                              disabled={guardando}
                              onClick={() => borrar(m)}
                              title="Borrar movimiento"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>{fmtFecha(m.fecha)}</TableCell>
                        <TableCell>
                          {m.tipo === "ingreso" ? (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">⬇️ Ingreso</Badge>
                          ) : (
                            <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100">⬆️ Salida</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold">{m.repuesto}</TableCell>
                        <TableCell className="text-right">{fmtNum(m.cantidad ?? 0)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{m.precio != null ? fmtPesos(m.precio) : "—"}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {m.precio != null ? fmtPesos((Number(m.cantidad) || 0) * m.precio) : "—"}
                        </TableCell>
                        <TableCell>{m.sucursal || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{m.ref || "—"}</TableCell>
                        <TableCell className="max-w-[220px] whitespace-normal text-muted-foreground">{m.comentario || "—"}</TableCell>
                        <TableCell>
                          {m.tipo === "salida" ? (
                            <Select
                              value={m.vehiculo || SUC_NONE}
                              disabled={guardando}
                              onValueChange={(v) => mutar("editar", { id: m.id, vehiculo: v && v !== SUC_NONE ? v : "" })}
                            >
                              <SelectTrigger className="h-8 w-[150px]">
                                <SelectValue placeholder="— Asignar —">
                                  {(v) => (v === SUC_NONE || v == null ? "— Asignar —" : etiquetaUnidad(String(v)))}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={SUC_NONE}>— Asignar —</SelectItem>
                                {FLOTA.map((u) => (
                                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  )
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Planes de acción (independientes, propios de esta sección) */}
      <PlanesAccionFlota
        ambito="repuestos"
        descripcion="Acciones sobre faltantes de stock o reposición de repuestos del taller. No depende de los filtros: muestra siempre todos los planes."
      />
    </div>
  )
}
