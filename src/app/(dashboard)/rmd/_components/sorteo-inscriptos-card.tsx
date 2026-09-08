"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Check,
  Copy,
  Download,
  Gift,
  MapPin,
  Phone,
  QrCode,
  Search,
  Star,
  User,
  Users,
  HelpCircle,
  Clock,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { InscripcionSorteoRmd } from "@/actions/rmd-sorteo"
import { RMD_SORTEO_URL, normalizarNombre } from "@/lib/rmd-sorteo"

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

const PAGINA = 20

type Filtro = "todos" | "participan" | "todavia_no" | "sin_cruzar"

function fechaDia(iso: string): string {
  try {
    return FMT_DIA.format(new Date(iso.slice(0, 10) + "T00:00:00"))
  } catch {
    return iso
  }
}

function csvCelda(v: unknown): string {
  const s = v == null ? "" : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function estadoDe(i: InscripcionSorteoRmd): Exclude<Filtro, "todos"> {
  if (i.participa) return "participan"
  if (i.cod_cliente != null || i.cod_sugerido != null) return "todavia_no"
  return "sin_cruzar"
}

interface Props {
  inscriptos: InscripcionSorteoRmd[] | null
}

/**
 * Los PDV que escanearon el QR del folleto y se inscribieron al sorteo, con
 * el cruce contra el RMD: participa el que calificó al menos una entrega en
 * BEES desde que se inscribió. Arriba van los números; la lista se busca y
 * se filtra, y se muestra de a 20 para no desplegar miles de filas.
 */
export function SorteoInscriptosCard({ inscriptos }: Props) {
  const [copiado, setCopiado] = useState(false)
  const [busqueda, setBusqueda] = useState("")
  const [filtro, setFiltro] = useState<Filtro>("todos")
  const [mostrar, setMostrar] = useState(PAGINA)

  const lista = useMemo(() => inscriptos ?? [], [inscriptos])

  const conteo = useMemo(() => {
    const c = { participan: 0, todavia_no: 0, sin_cruzar: 0 }
    for (const i of lista) c[estadoDe(i)] += 1
    return c
  }, [lista])

  const filtrados = useMemo(() => {
    const q = normalizarNombre(busqueda)
    return lista.filter((i) => {
      if (filtro !== "todos" && estadoDe(i) !== filtro) return false
      if (!q) return true
      const pajar = normalizarNombre(
        [
          i.nombre_pdv,
          i.cod_cliente ?? "",
          i.cod_sugerido ?? "",
          i.direccion,
          i.localidad,
          i.nombre_contacto,
          i.telefono,
        ].join(" "),
      )
      return q.split(" ").every((w) => pajar.includes(w))
    })
  }, [lista, busqueda, filtro])

  const visibles = filtrados.slice(0, mostrar)

  function cambiarFiltro(f: Filtro) {
    setFiltro(f)
    setMostrar(PAGINA)
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

  function exportarCsv() {
    const cab = [
      "fecha_inscripcion",
      "negocio",
      "cod_cliente",
      "cod_sugerido",
      "direccion",
      "localidad",
      "contacto",
      "telefono",
      "declara_califico",
      "entregas_calificadas_desde",
      "ultima_puntuacion",
      "ultima_puntuacion_fecha",
      "participa",
    ]
    const filas = filtrados.map((i) => [
      i.created_at.slice(0, 16).replace("T", " "),
      i.nombre_pdv,
      i.cod_cliente ?? "",
      i.cod_sugerido ?? "",
      i.direccion,
      i.localidad,
      i.nombre_contacto,
      i.telefono,
      i.declara_califico ? "si" : "no",
      i.votos_desde,
      i.ultima_puntuacion ?? "",
      i.ultima_puntuacion_fecha ?? "",
      i.participa ? "SI" : "no",
    ])
    const csv = [cab, ...filas]
      .map((f) => f.map(csvCelda).join(";"))
      .join("\r\n")
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8",
    })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "sorteo-rmd-inscriptos.csv"
    a.click()
    URL.revokeObjectURL(a.href)
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
      valor: lista.length,
      etiqueta: "Inscriptos",
      cls: "text-violet-700",
      ayuda: "Todos los que completaron el formulario del QR",
    },
    {
      key: "participan",
      icono: <Star className="h-4 w-4" />,
      valor: conteo.participan,
      etiqueta: "Participan",
      cls: conteo.participan > 0 ? "text-emerald-700" : "text-slate-400",
      ayuda: "Se inscribieron y calificaron al menos una entrega en BEES desde ese día",
    },
    {
      key: "todavia_no",
      icono: <Clock className="h-4 w-4" />,
      valor: conteo.todavia_no,
      etiqueta: "Todavía no votaron",
      cls: conteo.todavia_no > 0 ? "text-amber-700" : "text-slate-400",
      ayuda: "Identificados como cliente pero sin calificación desde la inscripción",
    },
    {
      key: "sin_cruzar",
      icono: <HelpCircle className="h-4 w-4" />,
      valor: conteo.sin_cruzar,
      etiqueta: "Sin cruzar",
      cls: conteo.sin_cruzar > 0 ? "text-red-600" : "text-slate-400",
      ayuda: "No cargaron número de cliente y el nombre no coincide con uno solo: revisar a mano",
    },
  ]

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
              disabled={filtrados.length === 0}
              title="Exporta lo que está filtrado"
            >
              <Download className="mr-1 h-3.5 w-3.5" />
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
                {t.valor.toLocaleString("es-AR")}
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
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value)
                setMostrar(PAGINA)
              }}
              placeholder="Buscar por negocio, nº de cliente, localidad, contacto o teléfono"
              className="h-8 pl-8 text-xs"
            />
          </div>
          {(busqueda || filtro !== "todos") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-slate-500"
              onClick={() => {
                setBusqueda("")
                cambiarFiltro("todos")
              }}
            >
              Limpiar
            </Button>
          )}
          <span className="text-xs text-slate-500">
            {filtrados.length === lista.length
              ? `${lista.length.toLocaleString("es-AR")} en total`
              : `${filtrados.length.toLocaleString("es-AR")} de ${lista.length.toLocaleString("es-AR")}`}
          </span>
        </div>
      </CardHeader>

      <CardContent className="overflow-x-auto border-t pt-4">
        {inscriptos == null ? (
          <p className="py-6 text-center text-sm text-amber-700">
            No se pudo leer la tabla de inscriptos. ¿Está aplicada la migración
            del sorteo en Supabase?
          </p>
        ) : lista.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Todavía nadie escaneó el QR. Los inscriptos aparecen acá apenas
            completan el formulario.
          </p>
        ) : filtrados.length === 0 ? (
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
              <tbody>
                {visibles.map((i) => {
                  const estado = estadoDe(i)
                  return (
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
                        {i.cod_cliente != null ? (
                          <span className="font-mono text-slate-700">
                            #{i.cod_cliente}
                          </span>
                        ) : i.cod_sugerido != null ? (
                          <span
                            className="text-slate-600"
                            title={`Coincide por nombre con ${i.nombre_sugerido}`}
                          >
                            <span className="font-mono">#{i.cod_sugerido}</span>
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
                        {estado === "participan" ? (
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
                        ) : estado === "todavia_no" ? (
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
                  )
                })}
              </tbody>
            </table>
            {filtrados.length > visibles.length && (
              <div className="mt-3 flex items-center justify-center gap-3 text-xs text-slate-500">
                <span>
                  Mostrando {visibles.length} de{" "}
                  {filtrados.length.toLocaleString("es-AR")}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setMostrar((m) => m + PAGINA)}
                >
                  Ver {Math.min(PAGINA, filtrados.length - visibles.length)} más
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
