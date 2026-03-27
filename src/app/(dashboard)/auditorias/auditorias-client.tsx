"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PlusCircle, ClipboardList, Trash2, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { deleteAuditoria } from "@/actions/auditorias"
import {
  ESTADO_AUDITORIA_LABELS,
  ESTADO_AUDITORIA_COLORS,
} from "@/lib/constants"
import { getScoreColor } from "@/lib/scoring"
import type { Auditoria } from "@/types/database"

interface AuditoriaRow {
  auditoria: Auditoria
  totalAnswered: number
  totalQuestions: number
  overallScore: number
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function AuditoriasClient({
  auditorias,
}: {
  auditorias: AuditoriaRow[]
}) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm("Eliminar esta auditoria? Esta accion no se puede deshacer."))
      return
    setDeleting(id)
    const result = await deleteAuditoria(id)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success("Auditoria eliminada")
      router.refresh()
    }
    setDeleting(null)
  }

  if (auditorias.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <ClipboardList className="h-16 w-16 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold text-slate-700">
          No hay auditorias
        </h2>
        <p className="text-sm text-muted-foreground">
          Crea tu primera auditoria para comenzar.
        </p>
        <Button render={<Link href="/auditorias/nueva" />}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Nueva Auditoria
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auditorias</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Listado de todas las auditorias DPO
          </p>
        </div>
        <Button render={<Link href="/auditorias/nueva" />}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Nueva Auditoria
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Fecha inicio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Progreso</TableHead>
              <TableHead>Score</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditorias.map(({ auditoria, totalAnswered, totalQuestions, overallScore }) => (
              <TableRow
                key={auditoria.id}
                className="cursor-pointer"
                onClick={() => router.push(`/auditorias/${auditoria.id}`)}
              >
                <TableCell className="font-medium">
                  {auditoria.nombre}
                </TableCell>
                <TableCell>{formatDate(auditoria.fecha_inicio)}</TableCell>
                <TableCell>
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{
                      backgroundColor:
                        ESTADO_AUDITORIA_COLORS[auditoria.estado] ?? "#94A3B8",
                    }}
                  >
                    {ESTADO_AUDITORIA_LABELS[auditoria.estado] ??
                      auditoria.estado}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {totalAnswered}/{totalQuestions}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: getScoreColor(overallScore) }}
                  >
                    {overallScore}%
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div
                    className="flex items-center justify-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      render={<Link href={`/auditorias/${auditoria.id}`} />}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={deleting === auditoria.id}
                      onClick={() => handleDelete(auditoria.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
