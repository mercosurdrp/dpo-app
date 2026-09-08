"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  Check,
  Copy,
  Download,
  Gift,
  MapPin,
  Phone,
  QrCode,
  Star,
  User,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { InscripcionSorteoRmd } from "@/actions/rmd-sorteo"
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

interface Props {
  inscriptos: InscripcionSorteoRmd[] | null
}

/**
 * Los PDV que escanearon el QR del folleto y se inscribieron al sorteo, con
 * el cruce contra el RMD: participa el que calificó al menos una entrega en
 * BEES desde que se inscribió.
 */
export function SorteoInscriptosCard({ inscriptos }: Props) {
  const [copiado, setCopiado] = useState(false)
  const lista = inscriptos ?? []
  const participan = lista.filter((i) => i.participa)

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
    const filas = lista.map((i) => [
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

  return (
    <Card className="border-violet-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-violet-600" />
            Inscriptos al sorteo (QR del folleto)
            <Badge
              variant="outline"
              className="border-violet-200 bg-violet-50 text-violet-800"
            >
              {lista.length} inscripto{lista.length === 1 ? "" : "s"}
            </Badge>
            <Badge
              variant="outline"
              className={
                participan.length > 0
                  ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                  : "border-slate-200 bg-slate-100 text-slate-500"
              }
            >
              {participan.length} participa{participan.length === 1 ? "" : "n"}
            </Badge>
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
              disabled={lista.length === 0}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              CSV
            </Button>
          </span>
        </CardTitle>
        <p className="text-xs text-slate-500">
          Participa el negocio que se inscribió <strong>y</strong> calificó al
          menos una entrega en BEES desde el día de la inscripción. Si no cargó
          su número de cliente, se busca por nombre y localidad; cuando la
          coincidencia es dudosa queda «sin cruzar» para revisarlo a mano.
        </p>
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
        ) : (
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
              {lista.map((i) => {
                const cod = i.cod_cliente ?? i.cod_sugerido
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
                      {i.participa ? (
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
                      ) : cod != null ? (
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
        )}
      </CardContent>
    </Card>
  )
}
