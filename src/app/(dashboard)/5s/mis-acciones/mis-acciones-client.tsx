"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient as createBrowserSupabase } from "@/lib/supabase/client"
import { resolverAccion } from "@/actions/s5"
import {
  S5_ACCION_ESTADO_COLORS,
  S5_ACCION_ESTADO_LABELS,
  s5SectorAlmacenLabel,
  type S5AccionConMeta,
  type UserRole,
} from "@/types/database"

const BUCKET = "s5-auditorias"
const MAX_PHOTO_BYTES = 15 * 1024 * 1024

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120)
}

function formatFecha(iso?: string | null) {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

function formatFechaHora(iso?: string | null) {
  if (!iso) return "—"
  const d = new Date(iso)
  const day = String(d.getDate()).padStart(2, "0")
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const y = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${day}/${m}/${y} ${hh}:${mm}`
}

function accionContexto(a: S5AccionConMeta): string {
  if (a.auditoria_tipo === "almacen" && a.auditoria_sector_numero) {
    return `Almacén · ${s5SectorAlmacenLabel(a.auditoria_sector_numero)}`
  }
  if (a.auditoria_tipo === "flota") return "Flota"
  return "Auditoría"
}

export function MisAccionesClient({
  acciones: initial,
}: {
  acciones: S5AccionConMeta[]
  currentUserId: string
  currentRole: UserRole
}) {
  const router = useRouter()
  const [acciones] = useState<S5AccionConMeta[]>(initial)

  const pendientes = useMemo(
    () => acciones.filter((a) => a.estado === "pendiente"),
    [acciones]
  )
  const resueltas = useMemo(
    () => acciones.filter((a) => a.estado === "resuelto"),
    [acciones]
  )

  async function handleResolver(
    accionId: string,
    auditoriaId: string,
    notas: string,
    file: File | null
  ): Promise<boolean> {
    try {
      let fotoPath: string | null = null
      if (file) {
        if (file.size > MAX_PHOTO_BYTES) {
          toast.error("La foto supera 15MB")
          return false
        }
        const supabase = createBrowserSupabase()
        const safe = sanitizeFileName(file.name || "resolucion.jpg")
        const path = `${auditoriaId}/acciones/${accionId}/${crypto.randomUUID()}-${safe}`
        const mime = file.type || "image/jpeg"
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: mime, upsert: false })
        if (upErr) {
          toast.error(upErr.message)
          return false
        }
        fotoPath = path
      }
      const res = await resolverAccion({
        accionId,
        notasResolucion: notas,
        fotoResolucionPath: fotoPath,
      })
      if ("error" in res) {
        toast.error(res.error)
        return false
      }
      toast.success("Punto resuelto")
      router.refresh()
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error resolviendo")
      return false
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/5s"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a 5S
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <ClipboardList className="size-6 text-indigo-600" />
        <h1 className="text-2xl font-bold text-slate-900">Mis acciones 5S</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="rounded-md bg-amber-100 p-2">
              <ClipboardList className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pendientes</p>
              <p className="text-2xl font-bold">{pendientes.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="rounded-md bg-emerald-100 p-2">
              <ClipboardCheck className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Resueltas</p>
              <p className="text-2xl font-bold">{resueltas.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pendientes">
        <TabsList>
          <TabsTrigger value="pendientes">
            Pendientes ({pendientes.length})
          </TabsTrigger>
          <TabsTrigger value="resueltas">
            Resueltas ({resueltas.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes" className="space-y-3">
          {pendientes.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No tenés acciones pendientes. 🎉
              </CardContent>
            </Card>
          )}
          {pendientes.map((a) => (
            <AccionCard
              key={a.id}
              accion={a}
              onResolver={handleResolver}
              canResolve
            />
          ))}
        </TabsContent>

        <TabsContent value="resueltas" className="space-y-3">
          {resueltas.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Todavía no resolviste ninguna acción.
              </CardContent>
            </Card>
          )}
          {resueltas.map((a) => (
            <AccionCard
              key={a.id}
              accion={a}
              onResolver={handleResolver}
              canResolve={false}
            />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )

  // helpers scoped
  function AccionCard({
    accion,
    onResolver,
    canResolve,
  }: {
    accion: S5AccionConMeta
    onResolver: (
      id: string,
      auditoriaId: string,
      notas: string,
      file: File | null
    ) => Promise<boolean>
    canResolve: boolean
  }) {
    const [notas, setNotas] = useState("")
    const [file, setFile] = useState<File | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [resolving, setResolving] = useState(false)
    const color = S5_ACCION_ESTADO_COLORS[accion.estado]

    async function submit() {
      setResolving(true)
      const ok = await onResolver(accion.id, accion.auditoria_id, notas, file)
      setResolving(false)
      if (ok) {
        setShowForm(false)
        setNotas("")
        setFile(null)
      }
    }

    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                {accionContexto(accion)}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Auditoría del {formatFecha(accion.auditoria_fecha)}
              </p>
            </div>
            <Badge
              variant="secondary"
              style={{ backgroundColor: color + "20", color }}
            >
              {S5_ACCION_ESTADO_LABELS[accion.estado]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-slate-900">{accion.descripcion}</p>
          <div className="text-xs text-muted-foreground">
            Asignado por {accion.creado_por_nombre} ·{" "}
            {formatFechaHora(accion.created_at)}
          </div>

          {accion.notas_resolucion && (
            <p className="rounded-md bg-muted/50 p-2 text-xs text-slate-700">
              <span className="font-semibold">Resolución: </span>
              {accion.notas_resolucion}
            </p>
          )}
          {accion.foto_resolucion_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={accion.foto_resolucion_url}
              alt="Resolución"
              className="max-h-48 rounded-md border object-cover"
            />
          )}
          {accion.estado === "resuelto" && (
            <p className="text-xs text-muted-foreground">
              Resuelto {formatFechaHora(accion.fecha_resolucion)} por{" "}
              {accion.resuelto_por_nombre ?? "—"}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Link href={`/5s/auditoria/${accion.auditoria_id}`}>
              <Button size="sm" variant="outline">
                <ExternalLink className="mr-1.5 size-4" />
                Ver auditoría
              </Button>
            </Link>
            {canResolve && !showForm && (
              <Button size="sm" onClick={() => setShowForm(true)}>
                <CheckCircle2 className="mr-1.5 size-4" />
                Marcar como resuelto
              </Button>
            )}
          </div>

          {showForm && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <Label className="text-xs text-muted-foreground">
                Notas de resolución (opcional)
              </Label>
              <Textarea
                rows={2}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Qué se hizo para resolver"
              />
              <Label className="text-xs text-muted-foreground">
                Foto evidencia (opcional)
              </Label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false)
                    setNotas("")
                    setFile(null)
                  }}
                  disabled={resolving}
                >
                  Cancelar
                </Button>
                <Button size="sm" onClick={submit} disabled={resolving}>
                  {resolving ? "Resolviendo..." : "Confirmar resolución"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }
}
