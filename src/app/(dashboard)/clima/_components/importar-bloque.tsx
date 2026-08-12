"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckCircle2, FileSpreadsheet, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  actualizarRespondentes,
  eliminarClimaOla,
  importarClimaOla,
} from "@/actions/clima-importar"
import type { ClimaImportResumen, ClimaOla } from "@/actions/clima-tipos"

const FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
})

export function ImportarBloque({ olas }: { olas: ClimaOla[] }) {
  const router = useRouter()
  const anioActual = new Date().getFullYear()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [anio, setAnio] = useState(String(anioActual))
  const [semestre, setSemestre] = useState("1")
  const [respondentes, setRespondentes] = useState("")
  const [resultado, setResultado] = useState<ClimaImportResumen | null>(null)
  const [pending, startTransition] = useTransition()

  const importar = () => {
    if (!archivo) {
      toast.error("Elegí el Excel que mandó la consultora")
      return
    }
    const fd = new FormData()
    fd.set("archivo", archivo)
    fd.set("anio", anio)
    fd.set("semestre", semestre)
    fd.set("respondentes", respondentes)

    startTransition(async () => {
      const r = await importarClimaOla(fd)
      if ("error" in r) {
        toast.error(r.error, { duration: 12000 })
        return
      }
      setResultado(r.data)
      toast.success(
        `${r.data.codigo}: ${r.data.resultados} resultados y ${r.data.comentarios} comentarios`,
      )
      router.refresh()
    })
  }

  const borrar = (ola: ClimaOla) => {
    if (
      !confirm(
        `¿Borrar la ola ${ola.codigo} con todos sus resultados y comentarios? Los planes de acción NO se borran.`,
      )
    )
      return
    startTransition(async () => {
      const r = await eliminarClimaOla(ola.id)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success(`Ola ${ola.codigo} borrada`)
      router.refresh()
    })
  }

  const guardarRespondentes = (ola: ClimaOla, valor: string) => {
    const n = valor.trim() ? Number(valor) : null
    if (n != null && !Number.isFinite(n)) return
    startTransition(async () => {
      const r = await actualizarRespondentes(ola.id, n)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success("Respondentes actualizados")
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="size-4 text-emerald-600" />
            Importar una ola
          </CardTitle>
          <p className="text-xs text-slate-500">
            Subí el Excel tal cual lo manda la consultora (por ejemplo{" "}
            <code>CLIMA 2026.xlsx</code>). El archivo trae las dos razones
            sociales del grupo: se importa solamente la de esta empresa. Si la
            ola ya existe, se reemplazan sus datos; los planes de acción no se
            tocan.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Archivo Excel</Label>
              <Input
                type="file"
                accept=".xlsx,.xlsm,.xls"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Año</Label>
              <Input
                type="number"
                value={anio}
                onChange={(e) => setAnio(e.target.value)}
                min={2000}
                max={2100}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Semestre</Label>
              <Select
                value={semestre}
                onValueChange={(v) => v && setSemestre(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">H1 (primer semestre)</SelectItem>
                  <SelectItem value="2">H2 (segundo semestre)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Respondentes (opcional)</Label>
              <Input
                type="number"
                value={respondentes}
                onChange={(e) => setRespondentes(e.target.value)}
                placeholder="Cuántas personas contestaron"
              />
              <p className="text-[11px] text-slate-500">
                La planilla no publica el n de cada corte: este dato lo informa
                la consultora aparte.
              </p>
            </div>
          </div>

          <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            Ojo con el nombre del archivo: <code>CLIMA 2026.xlsx</code> es el año
            calendario del export, y adentro viene la ola{" "}
            <strong>H1 2026</strong>. Elegí el semestre a mano.
          </p>

          <Button onClick={importar} disabled={pending}>
            {pending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Importar
          </Button>

          {resultado && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-semibold text-emerald-900">
                <CheckCircle2 className="size-4" />
                {resultado.reemplazada
                  ? `Ola ${resultado.codigo} reemplazada`
                  : `Ola ${resultado.codigo} importada`}
              </p>
              <ul className="mt-1 space-y-0.5 text-emerald-900">
                <li>Razón social: {resultado.razon_social}</li>
                <li>
                  {resultado.resultados} resultados ·{" "}
                  {Object.entries(resultado.cortes)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </li>
                <li>{resultado.comentarios} comentarios de texto</li>
                {resultado.jefes.length > 0 && (
                  <li>Equipos: {resultado.jefes.join(" · ")}</li>
                )}
                {resultado.faltantes.length > 0 && (
                  <li className="text-amber-800">
                    Hojas que no aparecieron: {resultado.faltantes.join(", ")}
                  </li>
                )}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Olas cargadas</CardTitle>
        </CardHeader>
        <CardContent>
          {olas.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">
              Todavía no hay ninguna ola importada.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {olas.map((o) => (
                <div
                  key={o.id}
                  className="flex flex-wrap items-center gap-3 py-2"
                >
                  <span className="w-20 font-semibold text-slate-800">
                    {o.codigo}
                  </span>
                  <span className="text-xs text-slate-500">
                    {o.archivo_origen ?? "—"} · importada{" "}
                    {FMT.format(new Date(o.importada_at))}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <Label className="text-xs text-slate-500">
                      Respondentes
                    </Label>
                    <Input
                      type="number"
                      defaultValue={o.respondentes ?? ""}
                      className="w-24"
                      onBlur={(e) => {
                        if (
                          String(o.respondentes ?? "") !== e.target.value.trim()
                        ) {
                          guardarRespondentes(o, e.target.value)
                        }
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => borrar(o)}
                      disabled={pending}
                      title="Borrar la ola"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
