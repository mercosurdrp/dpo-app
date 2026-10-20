import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, Eye, FileText } from "lucide-react"
import { IS_MISIONES } from "@/lib/empresa"
import { getProfile } from "@/lib/session"
import { getUsoRadar, type UsoRadarEvento } from "@/lib/radar-rechazos/uso"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

const DIAS = 30
const TZ = "America/Argentina/Buenos_Aires"

const fmtHora = new Intl.DateTimeFormat("es-AR", {
  timeZone: TZ,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})
const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: TZ })

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

interface ResumenUsuario {
  clave: string
  nombre: string
  email: string | null
  role: string | null
  aperturas: number
  pdfs: number
  dias: number
  ultima: string
}

/** Agrupa los eventos por persona: cuántas veces abrió, cuántos PDF, en cuántos días. */
function resumir(eventos: UsoRadarEvento[]): ResumenUsuario[] {
  const porUsuario = new Map<string, ResumenUsuario & { diasSet: Set<string> }>()
  for (const e of eventos) {
    const clave = e.user_id ?? e.email ?? "?"
    let r = porUsuario.get(clave)
    if (!r) {
      r = {
        clave,
        nombre: e.nombre || e.email || "Sin nombre",
        email: e.email,
        role: e.role,
        aperturas: 0,
        pdfs: 0,
        dias: 0,
        ultima: e.created_at,
        diasSet: new Set(),
      }
      porUsuario.set(clave, r)
    }
    if (e.accion === "PDF") r.pdfs++
    else r.aperturas++
    r.diasSet.add(fmtDia.format(new Date(e.created_at)))
    if (e.created_at > r.ultima) r.ultima = e.created_at
  }
  return [...porUsuario.values()]
    .map(({ diasSet, ...r }) => ({ ...r, dias: diasSet.size }))
    .sort((a, b) => b.ultima.localeCompare(a.ultima))
}

/**
 * Uso del Radar de Rechazos: quién abre la pantalla y quién baja el PDF de
 * críticos, en los últimos 30 días. Solo admin y supervisor.
 */
export default async function RadarUsoPage() {
  if (IS_MISIONES) notFound()

  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (profile.role !== "admin" && profile.role !== "supervisor") redirect("/sueno/radar-rechazos")

  const res = await getUsoRadar(DIAS)
  const eventos = "error" in res ? [] : res.data
  const resumen = resumir(eventos)

  return (
    <div className="space-y-4">
      <Link
        href="/sueno/radar-rechazos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al radar
      </Link>

      <div className="flex items-start gap-3">
        <Eye className="mt-1 size-6 shrink-0 text-amber-500" />
        <div>
          <h1 className="text-xl font-bold text-slate-900">Uso del Radar de Rechazos</h1>
          <p className="text-sm text-muted-foreground">
            Quién abrió el radar y quién bajó el PDF de críticos en los últimos {DIAS} días.
            Se registra desde el 20/10/2026.
          </p>
        </div>
      </div>

      {"error" in res && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo leer el registro de uso: {res.error}
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Persona</th>
              <th className="px-3 py-2">Rol</th>
              <th className="px-3 py-2 text-right">Aperturas</th>
              <th className="px-3 py-2 text-right">PDF</th>
              <th className="px-3 py-2 text-right">Días que entró</th>
              <th className="px-3 py-2">Última vez</th>
            </tr>
          </thead>
          <tbody>
            {resumen.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Nadie abrió el radar en los últimos {DIAS} días.
                </td>
              </tr>
            ) : (
              resumen.map((r) => (
                <tr key={r.clave} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{r.nombre}</div>
                    {r.email && r.email !== r.nombre && (
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 capitalize">{r.role ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.aperturas}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.pdfs}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.dias}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {fmtHora.format(new Date(r.ultima))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <h2 className="pt-2 text-sm font-semibold text-slate-900">Detalle</h2>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Cuándo</th>
              <th className="px-3 py-2">Persona</th>
              <th className="px-3 py-2">Qué hizo</th>
              <th className="px-3 py-2">Foto (entrega)</th>
            </tr>
          </thead>
          <tbody>
            {eventos.slice(0, 300).map((e) => (
              <tr key={e.id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{fmtHora.format(new Date(e.created_at))}</td>
                <td className="px-3 py-2">{e.nombre || e.email || "Sin nombre"}</td>
                <td className="px-3 py-2">
                  {e.accion === "PDF" ? (
                    <Badge variant="secondary" className="gap-1">
                      <FileText className="size-3" /> Bajó el PDF
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <Eye className="size-3" /> Abrió el radar
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {e.fecha_entrega ? fechaCorta(e.fecha_entrega) : "—"}
                  {e.historica && (
                    <span className="ml-1 text-xs text-muted-foreground">(foto anterior)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {eventos.length > 300 && (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            Mostrando los últimos 300 de {eventos.length} eventos.
          </p>
        )}
      </Card>
    </div>
  )
}
