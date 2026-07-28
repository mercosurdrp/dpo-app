"use client"

import { useState, useTransition } from "react"
import { FileText, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SubirArchivoReunionDialog } from "@/components/reuniones/subir-archivo-reunion-dialog"
import { eliminarArchivoReunion, getSignedUrl } from "@/actions/reuniones"
import type { ReunionArchivo } from "@/types/database"

function formatFechaHora(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Minuta y adjuntos de la reunión. La reunión de Presupuesto suele convocarse
 * por un tema puntual y lo que queda es el documento de lo que se habló: acá se
 * sube, se descarga y se borra. El texto libre sigue estando en "Notas / Minuta"
 * de la reunión.
 */
export function SeccionArchivosReunion({
  reunionId,
  archivos,
  puedeEditar,
  nombrePorProfile,
  onCambio,
}: {
  reunionId: string
  archivos: ReunionArchivo[]
  puedeEditar: boolean
  /** id de profile → nombre, para mostrar quién subió cada archivo. */
  nombrePorProfile: Record<string, string>
  onCambio: () => void
}) {
  const [abrirSubir, setAbrirSubir] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function abrir(archivoUrl: string) {
    setError(null)
    const result = await getSignedUrl(archivoUrl)
    if ("error" in result) {
      setError(`No se pudo abrir el archivo: ${result.error}`)
      return
    }
    window.open(result.data.url, "_blank", "noopener,noreferrer")
  }

  function borrar(a: ReunionArchivo) {
    if (!confirm(`¿Eliminar "${a.archivo_nombre}"? No se puede deshacer.`)) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await eliminarArchivoReunion(a.id)
      if ("error" in result) {
        setError(result.error)
        return
      }
      onCambio()
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-5 text-blue-600" />
          Minuta y archivos
          {archivos.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({archivos.length})
            </span>
          )}
        </CardTitle>
        {puedeEditar && (
          <Button size="sm" onClick={() => setAbrirSubir(true)}>
            <Plus className="mr-2 size-4" />
            Subir archivo
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-2">
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {archivos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay archivos.{" "}
            {puedeEditar
              ? "Subí acá la minuta de lo que se habló (PDF, Word o foto)."
              : "La minuta se sube desde esta misma pantalla."}
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {archivos.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => abrir(a.archivo_url)}
                    className="truncate text-sm font-medium text-blue-700 underline-offset-2 hover:underline"
                  >
                    {a.archivo_nombre}
                  </button>
                  {a.descripcion && (
                    <p className="text-xs text-muted-foreground">
                      {a.descripcion}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {formatFechaHora(a.created_at)}
                    {a.uploaded_by && nombrePorProfile[a.uploaded_by]
                      ? ` · ${nombrePorProfile[a.uploaded_by]}`
                      : ""}
                  </p>
                </div>
                {puedeEditar && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => borrar(a)}
                    aria-label={`Eliminar ${a.archivo_nombre}`}
                  >
                    <Trash2 className="size-4 text-red-600" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <SubirArchivoReunionDialog
        open={abrirSubir}
        onOpenChange={setAbrirSubir}
        reunionId={reunionId}
        titulo="Subir la minuta o un archivo"
        onSaved={onCambio}
      />
    </Card>
  )
}
