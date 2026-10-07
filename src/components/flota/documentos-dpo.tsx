"use client"

/**
 * SOPs y SLAs del pilar Flota, al lado de la evidencia que respaldan.
 *
 * Dos vistas sobre los mismos datos:
 *  - `DocsDePunto`: los documentos de UN punto, en línea. Va en la cinta de
 *    cada sección, así la solapa que responde al 2.3 muestra su SOP sin que
 *    haya que ir a buscarlo a `/pilares`.
 *  - `DocumentosDpoPanel`: la lista completa, para la pestaña.
 *
 * 🚨 La carga se hace UNA vez por página, no una por sección: la cinta aparece
 * en una docena de solapas y cada una pidiendo lo mismo sería una docena de
 * consultas para el mismo puñado de filas. La promesa se guarda a nivel módulo
 * y todas las instancias se cuelgan de ella.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink, FileText, Handshake } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { getDocumentosFlota, type DocumentoDpo } from "@/actions/documentos-dpo"

let cache: Promise<DocumentoDpo[]> | null = null

function cargar(): Promise<DocumentoDpo[]> {
  cache ??= getDocumentosFlota().then((r) => ("data" in r ? r.data : []))
  return cache
}

function useDocumentos(): DocumentoDpo[] {
  const [docs, setDocs] = useState<DocumentoDpo[]>([])
  useEffect(() => {
    let vivo = true
    cargar().then((d) => vivo && setDocs(d))
    return () => {
      vivo = false
    }
  }, [])
  return docs
}

const ESTADO_BADGE: Record<string, string> = {
  vigente: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  firmado: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  borrador: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  pendiente: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
}

const fmtFecha = (f: string | null) =>
  !f ? "—" : f.slice(0, 10).split("-").reverse().join("/")

/** Los documentos de los puntos que responde una sección, en una línea. */
export function DocsDePunto({
  puntos,
  className,
}: {
  puntos: string[]
  className?: string
}) {
  const docs = useDocumentos().filter((d) => d.puntos.some((p) => puntos.includes(p)))
  if (docs.length === 0) return null
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {docs.map((d) => (
        <Link
          key={d.id}
          href={d.href}
          target={d.tipo === "sop" ? "_blank" : undefined}
          rel={d.tipo === "sop" ? "noreferrer" : undefined}
          title={d.descripcion ?? d.nombre}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-colors",
            "border-border bg-muted/60 text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
          )}
        >
          {d.tipo === "sop" ? (
            <FileText className="size-3" aria-hidden />
          ) : (
            <Handshake className="size-3" aria-hidden />
          )}
          {d.tipo === "sop" ? "SOP" : "SLA"}
          {(d.estado === "borrador" || d.estado === "pendiente") && (
            <span className="text-amber-600 dark:text-amber-400">· {d.estado}</span>
          )}
        </Link>
      ))}
    </span>
  )
}

/** La lista completa: procedimientos y acuerdos de servicio del pilar. */
export function DocumentosDpoPanel() {
  const docs = useDocumentos()
  const sops = docs.filter((d) => d.tipo === "sop")
  const slas = docs.filter((d) => d.tipo === "sla")
  const sinFirmar = docs.filter((d) => d.estado === "borrador" || d.estado === "pendiente").length

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">
          Procedimientos y acuerdos de servicio
        </h3>
        <p className="text-sm text-muted-foreground">
          Los SOP y los SLA del pilar Flota, con el punto del DPO que responde cada uno. El
          SOP abre el documento; el SLA lleva a su pantalla. Se editan donde viven:{" "}
          <Link href="/pilares" className="text-primary hover:underline">
            Pilares → Flota → SOPs
          </Link>{" "}
          y{" "}
          <Link href="/sla" className="text-primary hover:underline">
            SLA
          </Link>
          .
        </p>
        {sinFirmar > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {sinFirmar} sin firmar: para el auditor un borrador no es un procedimiento
            vigente.
          </p>
        )}
      </div>

      <Tabla titulo={`SOPs (${sops.length})`} docs={sops} vacio="Sin SOPs cargados." />
      <Tabla titulo={`SLAs (${slas.length})`} docs={slas} vacio="Sin SLAs cargados." />
    </div>
  )
}

function Tabla({
  titulo,
  docs,
  vacio,
}: {
  titulo: string
  docs: DocumentoDpo[]
  vacio: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {docs.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{vacio}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Punto DPO</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead className="w-28">Estado</TableHead>
                <TableHead className="w-28">Fecha</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="whitespace-nowrap font-medium tabular-nums">
                    {d.puntos.length ? d.puntos.join(" · ") : "—"}
                    {d.requisitos.length > 0 && (
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {d.requisitos.join(" · ")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={d.href}
                      target={d.tipo === "sop" ? "_blank" : undefined}
                      rel={d.tipo === "sop" ? "noreferrer" : undefined}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {d.nombre}
                    </Link>
                    {d.descripcion && (
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {d.descripcion}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("text-xs", ESTADO_BADGE[d.estado] ?? "")}
                    >
                      {d.estado}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {fmtFecha(d.fecha)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={d.href}
                      target={d.tipo === "sop" ? "_blank" : undefined}
                      rel={d.tipo === "sop" ? "noreferrer" : undefined}
                      className="text-muted-foreground hover:text-primary"
                      aria-label={`Abrir ${d.nombre}`}
                    >
                      <ExternalLink className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
