"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Gift,
  HelpCircle,
  Loader2,
  MapPin,
  Phone,
  QrCode,
  Search,
  Star,
  User,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  buscarInscripcionesSorteoRmd,
  exportarInscripcionesSorteoRmd,
  type EstadoInscripcion,
  type InscripcionSorteoRmd,
  type ResumenSorteoRmd,
} from "@/actions/rmd-sorteo"
import { RMD_SORTEO_URL } from "@/lib/rmd-sorteo"

const FMT_DIA_HORA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
})

const FMT_DIA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
})

const POR_PAGINA = 20

type Filtro = EstadoInscripcion | "todos"

function fechaDia(iso: string): string {
  try {
    return FMT_DIA.format(new Date(iso.slice(0, 10) + "T00:00:00"))
  } catch {
    return iso
  }
}

function fmt(n: number): string {
  return n.toLocaleString("es-AR")
}

interface Props {
  /** Conteos que hace la base. Null si la vista todavía no existe. */
  resumen: ResumenSorteoRmd | null
}

/**
 * Los PDV que escanearon el QR del folleto y se inscribieron al sorteo.
 * Pensado para decenas de miles de filas: los números los cuenta la base, el
 * buscador consulta al servidor de a 20 y el cruce con el RMD lo resuelve la
 * vista v_rmd_sorteo_inscripciones. Acá nunca se baja la lista entera.
 */
export function SorteoInscriptosCard({ resumen }: Props) {
  const [copiado, setCopiado] = useState(false)
  const [texto, setTexto] = useState("")
  const [filtro, setFiltro] = useState<Filtro>("todos")
  const [pagina, setPagina] = useState(0)
  const [filas, setFilas] = useState<InscripcionSorteoRmd[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [errorLista, setErrorLista] = useState<string | null>(null)
  const ultimaQ = useRef<string | null>(null)
  const q = texto.trim()

  // Consulta al servidor. Si lo que cambió fue el texto, espera a que el
  // usuario pare de tipear; si fue el filtro o la página, va enseguida.
  useEffect(() => {
    if (!resumen) return
    const espera = q !== ultimaQ.current ? 350 : 0
    let vivo = true
    const t = setTimeout(() => {
      ultimaQ.current = q
      setCargando(true)
      buscarInscripcionesSorteoRmd({
        q,
        estado: filtro,
        pagina,
        porPagina: POR_PAGINA,
      }).then((r) => {
        if (!vivo) return
        setCargando(false)
        if ("error" in r) {
          setErrorLista(r.error)
          return
        }
        setErrorLista(null)
        setFilas(r.data.filas)
        setTotal(r.data.total)
      })
    }, espera)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [resumen, q, filtro, pagina])

  function cambiarFiltro(f: Filtro) {
    setFiltro(f)
    setPagina(0)
  }

  async function copiarUrl() {
    try {
      await navigator.clipboard.writeText(RMD_SORTEO_URL)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  async function exportarCsv() {
    setExportando(true)
    const r = await exportarInscripcionesSorteoRmd({ q, estado: filtro })
    setExportando(false)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    const blob = new Blob(["﻿" + r.data.csv], {
      type: "text/csv;charset=utf-8",
    })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `sorteo-rmd-inscriptos${filtro !== "todos" ? `-${filtro}` : ""}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success(`${fmt(r.data.filas)} filas exportadas`)
  }

  const tiles: Array<{
    key: Filtro
    icono: React.ReactNode
    valor: number
    etiqueta: string
    cls: string
    ayuda: string
  }> = [
    {
      key: "todos",
      icono: <Users className="h-4 w-4" />,
      valor: resumen?.total ?? 0,
      etiqueta: "Inscriptos",
      cls: "text-violet-700",
      ayuda: "Todos los que completaron el formulario del QR",
    },
    {
      key: "participa",
      icono: <Star className="h-4 w-4" />,
      valor: resumen?.participan ?? 0,
      etiqueta: "Participan",
      cls: (resumen?.participan ?? 0) > 0 ? "text-emerald-700" : "text-slate-400",
      ayuda:
        "Se inscribieron y calificaron al menos una entrega en BEES desde ese día",
    },
    {
      key: "todavia_no",
      icono: <Clock className="h-4 w-4" />,
      valor: resumen?.todavia_no ?? 0,
      etiqueta: "Todavía no votaron",
      cls: (resumen?.todavia_no ?? 0) > 0 ? "text-amber-700" : "text-slate-400",
      ayuda:
        "Identificados como cliente pero sin calificación desde la inscripción",
    },
    {
      key: "sin_cruzar",
      icono: <HelpCircle className="h-4 w-4" />,
      valor: resumen?.sin_cruzar ?? 0,
      etiqueta: "Sin cruzar",
      cls: (resumen?.sin_cruzar ?? 0) > 0 ? "text-red-600" : "text-slate-400",
      ayuda:
        "No cargaron número de cliente y el nombre no coincide con uno solo: revisar a mano",
    },
  ]

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  return (
    <Card className="border-violet-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-violet-600" />
            Inscriptos al sorteo (QR del folleto)
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copiarUrl}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-mono text-[11px] text-slate-600 hover:bg-slate-100"
              title="Copiar el link que lleva el QR del folleto"
            >
              <QrCode className="h-3.5 w-3.5" />
              {RMD_SORTEO_URL.replace("https://", "")}
              {copiado ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={exportarCsv}
              disabled={!resumen || total === 0 || exportando}
              title="Exporta lo que está filtrado (hasta 50.000 filas)"
            >
              {exportando ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1 h-3.5 w-3.5" />
              )}
              CSV
            </Button>
          </span>
        </CardTitle>
        <p className="text-xs text-slate-500">
          Participa el negocio que se inscribió <strong>y</strong> calificó al
          menos una entrega en BEES desde el día de la inscripción. Clic en un
          número para filtrar.
        </p>

        {/* Números */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => cambiarFiltro(t.key)}
              title={t.ayuda}
              className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors ${
                filtro === t.key
                  ? "border-violet-300 bg-violet-50"
                  : "border-slate-100 bg-slate-50/60 hover:bg-slate-100"
              }`}
            >
              <span className={t.cls}>{t.icono}</span>
              <span className={`text-lg font-bold tabular-nums ${t.cls}`}>
                {fmt(t.valor)}
              </span>
              <span className="text-[11px] leading-tight text-slate-500">
                {t.etiqueta}
              </span>
            </button>
          ))}
        </div>

        {/* Buscador */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value)
                setPagina(0)
              }}
              placeholder="Buscar por negocio, nº de cliente, localidad, contacto o teléfono"
              className="h-8 pl-8 text-xs"
              disabled={!resumen}
            />
          </div>
          {(texto || filtro !== "todos") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-slate-500"
              onClick={() => {
                setTexto("")
                cambiarFiltro("todos")
              }}
            >
              Limpiar
            </Button>
          )}
          <span className="flex items-center gap-1 text-xs text-slate-500">
            {cargando && <Loader2 className="h-3 w-3 animate-spin" />}
            {resumen && total !== resumen.total
              ? `${fmt(total)} de ${fmt(resumen.total)}`
              : `${fmt(total)} en total`}
          </span>
        </div>
      </CardHeader>

      <CardContent className="overflow-x-auto border-t pt-4">
        {resumen == null ? (
          <p className="py-6 text-center text-sm text-amber-700">
            No se pudo leer la tabla de inscriptos. ¿Está aplicada la migración
            del sorteo en Supabase?
          </p>
        ) : errorLista ? (
          <p className="py-6 text-center text-sm text-red-600">{errorLista}</p>
        ) : resumen.total === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Todavía nadie escaneó el QR. Los inscriptos aparecen acá apenas
            completan el formulario.
          </p>
        ) : total === 0 && !cargando ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No hay inscriptos con esa búsqueda.
          </p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Inscripto</th>
                  <th className="py-2 pr-3">Negocio</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Dirección</th>
                  <th className="py-2 pr-3">Contacto</th>
                  <th className="py-2 text-right">Votó RMD</th>
                </tr>
              </thead>
              <tbody className={cargando ? "opacity-50" : ""}>
                {filas.map((i) => (
                  <tr
                    key={i.id}
                    className="border-b align-top last:border-0 hover:bg-slate-50"
                  >
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-slate-500">
                      {FMT_DIA_HORA.format(new Date(i.created_at))}
                    </td>
                    <td className="py-2 pr-3">
                      <p className="font-medium text-slate-800">
                        {i.nombre_pdv}
                      </p>
                      {i.declara_califico && (
                        <p className="text-[11px] text-amber-700">
                          dice que ya calificó
                        </p>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {i.codigo_origen === "cargado" ? (
                        <span className="font-mono text-slate-700">
                          #{i.cod_cliente_resuelto}
                        </span>
                      ) : i.codigo_origen === "por_nombre" ? (
                        <span
                          className="text-slate-600"
                          title={`Coincide por nombre con ${i.nombre_sugerido}`}
                        >
                          <span className="font-mono">
                            #{i.cod_cliente_resuelto}
                          </span>
                          <span className="ml-1 text-slate-400">
                            (por nombre)
                          </span>
                        </span>
                      ) : (
                        <span className="text-amber-700">sin cruzar</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-600">
                      <span className="inline-flex items-start gap-1">
                        <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                          {i.direccion}
                          <span className="block text-slate-400">
                            {i.localidad}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-600">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3 shrink-0" />
                        {i.nombre_contacto}
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3 shrink-0" />
                        {i.telefono}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {i.estado === "participa" ? (
                        <>
                          <Badge
                            variant="outline"
                            className="border-emerald-200 bg-emerald-100 text-emerald-800"
                          >
                            <Star className="mr-1 h-3 w-3 fill-emerald-600 text-emerald-600" />
                            Participa
                          </Badge>
                          <span className="mt-0.5 block text-[10px] text-slate-500">
                            {i.votos_desde} calif. · última{" "}
                            {i.ultima_puntuacion}/5 el{" "}
                            {i.ultima_puntuacion_fecha
                              ? fechaDia(i.ultima_puntuacion_fecha)
                              : "—"}
                          </span>
                        </>
                      ) : i.estado === "todavia_no" ? (
                        <Badge
                          variant="outline"
                          className="border-slate-200 bg-slate-100 text-slate-600"
                        >
                          Todavía no
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-200 bg-amber-50 text-amber-800"
                        >
                          Revisar
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {paginas > 1 && (
              <div className="mt-3 flex items-center justify-center gap-3 text-xs text-slate-500">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2"
                  disabled={pagina === 0 || cargando}
                  onClick={() => setPagina((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span>
                  Página {fmt(pagina + 1)} de {fmt(paginas)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2"
                  disabled={pagina >= paginas - 1 || cargando}
                  onClick={() => setPagina((p) => Math.min(paginas - 1, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
