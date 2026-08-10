"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  CalendarDays,
  Copy,
  Download,
  Pencil,
  Plus,
  Trash2,
  Truck,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  copiarUltimaSalida,
  deleteSalida,
  upsertSalida,
  type DatosSalidas,
  type SalidaRow,
} from "@/actions/salidas"

const SIN_ASIGNAR = "" // value del option "—" en los selects nativos

interface FormState {
  id: string | null // null = alta; con id = editando esa fila
  patente: string
  chofer: string
  ayudante1: string
  ayudante2: string
  notas: string
}

const FORM_VACIO: FormState = {
  id: null,
  patente: "",
  chofer: SIN_ASIGNAR,
  ayudante1: SIN_ASIGNAR,
  ayudante2: SIN_ASIGNAR,
  notas: "",
}

function fmtFechaLarga(f: string): string {
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
  const d = new Date(`${f}T00:00:00Z`)
  const [y, m, dd] = f.split("-")
  return `${DIAS[d.getUTCDay()]} ${dd}/${m}/${y}`
}

const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"

export function SalidasClient({
  fecha,
  salidas,
  datos,
  error,
}: {
  fecha: string
  salidas: SalidaRow[]
  datos: DatosSalidas
  error: string | null
}) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(FORM_VACIO)
  const [isPending, startTransition] = useTransition()

  // Un empleado no puede ir dos veces en la misma fila.
  const opcionesEmpleado = (excluir: string[]) =>
    datos.empleados.filter((e) => !excluir.includes(e.id))

  function setFecha(f: string) {
    if (f) router.push(`/salidas?fecha=${f}`)
  }

  function editar(s: SalidaRow) {
    setForm({
      id: s.id,
      patente: s.patente,
      chofer: s.chofer_empleado_id ?? SIN_ASIGNAR,
      ayudante1: s.ayudante1_empleado_id ?? SIN_ASIGNAR,
      ayudante2: s.ayudante2_empleado_id ?? SIN_ASIGNAR,
      notas: s.notas ?? "",
    })
  }

  function guardar() {
    if (!form.patente.trim()) {
      toast.error("Elegí la patente")
      return
    }
    if (form.chofer === SIN_ASIGNAR) {
      toast.error("Elegí el chofer")
      return
    }
    startTransition(async () => {
      const res = await upsertSalida({
        fecha,
        patente: form.patente,
        chofer_empleado_id: form.chofer,
        ayudante1_empleado_id: form.ayudante1 || null,
        ayudante2_empleado_id: form.ayudante2 || null,
        notas: form.notas || null,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(form.id ? "Salida actualizada" : "Salida agregada")
      setForm(FORM_VACIO)
      router.refresh()
    })
  }

  function borrar(id: string, patente: string) {
    if (!confirm(`¿Sacar la salida de ${patente}?`)) return
    startTransition(async () => {
      const res = await deleteSalida(id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Salida borrada")
      router.refresh()
    })
  }

  function copiar() {
    startTransition(async () => {
      const res = await copiarUltimaSalida(fecha)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      if (res.copiadas === 0) {
        toast.info(res.desde ? "No había nada nuevo para copiar" : "No hay días anteriores cargados")
        return
      }
      toast.success(`${res.copiadas} salidas copiadas del ${res.desde}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-100 p-2.5">
            <Truck className="size-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Salidas</h1>
            <p className="text-sm text-muted-foreground">
              Formación del día: patente, chofer y ayudantes. Vale también para
              atribuir rechazos y bultos a cada persona.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-slate-500" />
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
          <Button variant="outline" onClick={copiar} disabled={isPending} className="gap-2">
            <Copy className="size-4" />
            Copiar última
          </Button>
          <a
            href={`/api/salidas/imagen?fecha=${fecha}`}
            download
            className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Download className="size-4" />
            Descargar imagen
          </a>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Form alta / edición */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            <span>
              {form.id ? `Editando ${form.patente}` : "Agregar salida"} · {fmtFechaLarga(fecha)}
            </span>
            {form.id && (
              <button
                onClick={() => setForm(FORM_VACIO)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-slate-900"
              >
                <X className="size-3.5" /> Cancelar edición
              </button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-[160px_1fr_1fr_1fr_1fr_auto]">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Patente</label>
              <input
                list="patentes-salidas"
                value={form.patente}
                onChange={(e) => setForm({ ...form, patente: e.target.value.toUpperCase() })}
                placeholder="AE908DH"
                disabled={form.id != null}
                className={selectCls}
              />
              <datalist id="patentes-salidas">
                {datos.patentes.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Chofer</label>
              <select
                value={form.chofer}
                onChange={(e) => setForm({ ...form, chofer: e.target.value })}
                className={selectCls}
              >
                <option value={SIN_ASIGNAR}>— Elegir —</option>
                {opcionesEmpleado([form.ayudante1, form.ayudante2]).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Ayudante 1</label>
              <select
                value={form.ayudante1}
                onChange={(e) => setForm({ ...form, ayudante1: e.target.value })}
                className={selectCls}
              >
                <option value={SIN_ASIGNAR}>— Sin ayudante —</option>
                {opcionesEmpleado([form.chofer, form.ayudante2]).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Ayudante 2</label>
              <select
                value={form.ayudante2}
                onChange={(e) => setForm({ ...form, ayudante2: e.target.value })}
                className={selectCls}
              >
                <option value={SIN_ASIGNAR}>— Sin ayudante —</option>
                {opcionesEmpleado([form.chofer, form.ayudante1]).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Notas</label>
              <input
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                placeholder="Opcional"
                className={selectCls}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={guardar} disabled={isPending} className="gap-2">
                <Plus className="size-4" />
                {form.id ? "Guardar" : "Agregar"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista del día */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {salidas.length} {salidas.length === 1 ? "camión" : "camiones"} · {fmtFechaLarga(fecha)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {salidas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin salidas cargadas. Agregá la primera o copiá la última formación.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Patente</th>
                    <th className="py-2 pr-2 font-medium">Chofer</th>
                    <th className="py-2 pr-2 font-medium">Ayudante 1</th>
                    <th className="py-2 pr-2 font-medium">Ayudante 2</th>
                    <th className="py-2 pr-2 font-medium">Notas</th>
                    <th className="py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {salidas.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 pr-2 font-semibold text-slate-900">{s.patente}</td>
                      <td className="py-2 pr-2">{s.chofer_nombre ?? "—"}</td>
                      <td className="py-2 pr-2 text-muted-foreground">{s.ayudante1_nombre ?? "—"}</td>
                      <td className="py-2 pr-2 text-muted-foreground">{s.ayudante2_nombre ?? "—"}</td>
                      <td className="max-w-[180px] truncate py-2 pr-2 text-muted-foreground">{s.notas ?? ""}</td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => editar(s)} title="Editar">
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => borrar(s.id, s.patente)}
                            disabled={isPending}
                            title="Borrar"
                          >
                            <Trash2 className="size-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
