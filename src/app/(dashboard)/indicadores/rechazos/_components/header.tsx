"use client"

import type { RechazosComparado } from "@/lib/types/rechazos"
import { formatFecha } from "@/lib/format/rechazos"
import { ExportCsvBtn } from "./export-csv-btn"
import { SyncBtn } from "./sync-btn"
import { PdfPeriodoBtn } from "./pdf-periodo-btn"
import { VerDiaControl } from "./ver-dia-control"

const SOURCE_LABEL: Record<string, string> = {
  cron: "automático",
  "manual-bearer": "manual (API)",
  "manual-session": "manual (UI)",
  script: "script local",
}

export function Header({ meta }: { meta: RechazosComparado["meta"] }) {
  const lastSync = meta.lastSync
    ? formatLastSync(meta.lastSync.ran_at, meta.lastSync.source, meta.lastSync.errors_count)
    : "Sin datos de sincronización"

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">Rechazos Pampeana — Dashboard ejecutivo</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            Período: <span className="font-medium text-slate-700">{formatFecha(meta.actual.desde)} → {formatFecha(meta.actual.hasta)}</span>{" "}
            ({meta.actual.label}) · vs {meta.previous.label}
          </span>
          <span className="text-slate-400">·</span>
          <span title={meta.lastSync?.ran_at}>Última corrida: <span className="font-medium text-slate-700">{lastSync}</span></span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-start gap-2">
          <SyncBtn />
          <PdfPeriodoBtn defaultDesde={meta.actual.desde} defaultHasta={meta.actual.hasta} />
          <ExportCsvBtn defaultDesde={meta.actual.desde} defaultHasta={meta.actual.hasta} />
        </div>
        <VerDiaControl defaultHasta={meta.actual.hasta} />
      </div>
    </header>
  )
}

function formatLastSync(iso: string, source: string, errorsCount: number): string {
  const d = new Date(iso)
  const fechaPart = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d)
  const horaPart = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d)
  const sourceLabel = SOURCE_LABEL[source] ?? source
  const tail = errorsCount > 0 ? ` · ⚠ ${errorsCount} error${errorsCount > 1 ? "es" : ""}` : ""
  return `${fechaPart} ${horaPart} ART (${sourceLabel})${tail}`
}
