"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Upload, Save, FileSpreadsheet } from "lucide-react"
import { ExplicacionUmbrales } from "./explicacion-umbrales"
import type { CfgPC, UmbralesPC, PlanAccion, Intensidad } from "./client"
import { INTENSIDAD_BG, INTENSIDAD_LABEL } from "./client"

// Un plan por escalón de la escala del calendario, del más al menos exigente.
const CODIGOS: Intensidad[] = ["CRITICO", "ATENCION", "NORMAL"]
const CODIGO_DESC: Record<Intensidad, string> = {
  CRITICO: "El volumen supera la capacidad de distribución (con o sin clientes, rechazo o ausentismo en alerta)",
  ATENCION: "No supera el volumen, pero cruza clientes, rechazo o ausentismo",
  NORMAL: "Día normal",
}

export function ConfiguracionTab({
  cfg,
  umbrales,
  planes,
}: {
  cfg: CfgPC
  umbrales: UmbralesPC
  planes: PlanAccion[]
}) {
  return (
    <div className="space-y-4">
      <AnioCard cfg={cfg} />
      <UmbralesCard umbrales={umbrales} />
      <AusentismoUploadCard />
      <PlanesAccionCard planes={planes} />
    </div>
  )
}

// ----------------------------------------------------------- año vigente
function AnioCard({ cfg }: { cfg: CfgPC }) {
  const router = useRouter()
  const [anio, setAnio] = useState(cfg.anio)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function guardar() {
    setGuardando(true)
    setMsg(null)
    try {
      const res = await fetch("/api/planeamiento/periodos-criticos/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anio_vigente: anio }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      setMsg("Configuración actualizada")
      router.refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Año vigente</CardTitle>
        <p className="text-xs text-slate-500">
          Año que abre el calendario por defecto. El criterio de día crítico es uno solo y se
          define abajo: el volumen del día contra la capacidad de distribución.
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="w-32">
          <NumField label="Año vigente" value={anio} onChange={setAnio} step={1} min={2024} max={2030} integer />
        </div>
        <Button onClick={guardar} disabled={guardando || anio === cfg.anio} size="sm">
          <Save className="w-4 h-4 mr-1" /> Guardar
        </Button>
        {msg && (
          <span className={msg.toLowerCase().includes("actual") ? "text-sm text-emerald-700" : "text-sm text-red-700"}>
            {msg}
          </span>
        )}
      </CardContent>
    </Card>
  )
}

// --------------------------------------------------------------- umbrales
function UmbralesCard({ umbrales }: { umbrales: UmbralesPC }) {
  const router = useRouter()
  const [camiones, setCamiones] = useState(umbrales.camiones)
  const [hlCam, setHlCam] = useState(umbrales.hl_por_camion)
  const [ocup, setOcup] = useState(umbrales.pct_ocupacion)
  const [clientes, setCli] = useState(umbrales.clientes)
  const [otif_min, setOtif] = useState(umbrales.otif_min)
  const [aus_max, setAus] = useState(umbrales.ausentismo_max)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Mismo cálculo que la columna generada de la base.
  const capacidad = Math.round(camiones * hlCam * ocup)

  async function guardar() {
    setGuardando(true)
    setMsg(null)
    try {
      const res = await fetch("/api/planeamiento/periodos-criticos/umbrales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          camiones,
          hl_por_camion: hlCam,
          pct_ocupacion: ocup,
          clientes,
          otif_min,
          ausentismo_max: aus_max,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      setMsg("Umbrales actualizados")
      router.refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Capacidad de distribución y contexto</CardTitle>
        <p className="text-xs text-slate-500">
          Un día es CRÍTICO cuando sus HL superan la capacidad. Clientes, rechazo y ausentismo se
          cruzan igual en el calendario, pero sólo agravan el día: no lo vuelven crítico.
        </p>
        <ExplicacionUmbrales />
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <NumField label="Camiones" value={camiones} onChange={setCamiones} step={1} min={1} max={200} integer />
        <NumField label="HL por camión" value={hlCam} onChange={setHlCam} step={1} min={1} max={1000} />
        <NumField label="Ocupación bodega" value={ocup} onChange={setOcup} step={0.05} min={0.05} max={3} suffix="(0–3)" />
        <div className="flex flex-col justify-end pb-1">
          <span className="text-xs text-slate-500">Capacidad</span>
          <span className="text-lg font-semibold text-slate-900">
            {capacidad.toLocaleString("es-AR")} HL
          </span>
        </div>
        <NumField label="Clientes" value={clientes} onChange={setCli} step={10} min={0} max={2000} integer />
        <NumField label="Rechazo máx" value={otif_min} onChange={setOtif} step={0.01} min={0} max={1} suffix="(0–1)" />
        <NumField label="Ausentismo max" value={aus_max} onChange={setAus} step={0.005} min={0} max={1} suffix="(0–1)" />
        <div className="flex items-end">
          <Button onClick={guardar} disabled={guardando} size="sm" className="w-full">
            <Save className="w-4 h-4 mr-1" /> Guardar
          </Button>
        </div>
        {msg && (
          <div
            className={`md:col-span-4 text-xs ${
              msg.toLowerCase().includes("actual") ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {msg}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ----------------------------------------------- ausentismo (upload Excel)
function AusentismoUploadCard() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function upload(file: File) {
    setSubiendo(true)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/planeamiento/periodos-criticos/ausentismo", {
        method: "POST",
        body: fd,
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setMsg(
        `✓ ${j.insertadas} fila${j.insertadas === 1 ? "" : "s"} cargadas (${j.rangos.desde} → ${j.rangos.hasta})`,
      )
      router.refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setSubiendo(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" /> Carga de ausentismo mensual
        </CardTitle>
        <div className="text-xs text-slate-500 space-y-1">
          <p>Se aceptan 2 formatos (el endpoint detecta cuál usar):</p>
          <p>
            <b>1) Licencias (export Quilmes):</b> 1 fila por licencia con <code>Sector · Fecha inicio · Fecha fin</code>.
            Filtra automático Sector = &ldquo;Distribución&rdquo;, excluye domingos, agrupa por mes y calcula
            % con universo por temporada (Alta=32, Media=25, Baja=18).
          </p>
          <p>
            <b>2) Simple:</b> 1 fila por mes con <code>anio · mes · pct_ausentismo</code> (decimal 0.045 o porcentaje 4.5).
          </p>
          <p className="text-slate-400">Upsert por (anio, mes).</p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload(f)
          }}
          className="hidden"
        />
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
        >
          <Upload className="w-4 h-4 mr-1" /> {subiendo ? "Subiendo…" : "Subir Excel"}
        </Button>
        {msg && (
          <span className={msg.startsWith("✓") ? "text-sm text-emerald-700" : "text-sm text-red-700"}>
            {msg}
          </span>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------- planes de acción
function PlanesAccionCard({ planes }: { planes: PlanAccion[] }) {
  const router = useRouter()
  const planByCodigo: Record<string, PlanAccion> = {}
  for (const p of planes) planByCodigo[p.codigo] = p

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Planes de acción por código</CardTitle>
        <p className="text-xs text-slate-500">
          Texto que se sugiere en cada período crítico según su escalón en el calendario. Editable libremente.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {CODIGOS.map((codigo) => (
          <PlanRow
            key={codigo}
            codigo={codigo}
            plan={planByCodigo[codigo]}
            onSaved={() => router.refresh()}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function PlanRow({
  codigo,
  plan,
  onSaved,
}: {
  codigo: Intensidad
  plan: PlanAccion | undefined
  onSaved: () => void
}) {
  const [descripcion, setDescripcion] = useState(plan?.descripcion ?? "")
  const [texto, setTexto] = useState(plan?.plan_texto ?? "")
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function guardar() {
    setGuardando(true)
    setMsg(null)
    try {
      const res = await fetch("/api/planeamiento/periodos-criticos/planes-accion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, descripcion, plan_texto: texto }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      setMsg("Guardado")
      onSaved()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="border border-slate-200 rounded p-3">
      <div className="flex items-center justify-between mb-2 gap-3">
        <Badge className={`${INTENSIDAD_BG[codigo]} text-sm`}>
          {INTENSIDAD_LABEL[codigo]}
        </Badge>
        <span className="text-xs text-slate-500 text-right">{CODIGO_DESC[codigo]}</span>
      </div>
      <div className="space-y-2">
        <Input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Descripción corta"
          className="text-sm"
        />
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Plan de acción (líneas con • o -)"
          rows={4}
          className="text-xs font-mono"
        />
        <div className="flex items-center gap-3">
          <Button onClick={guardar} disabled={guardando} size="sm">
            <Save className="w-4 h-4 mr-1" /> Guardar
          </Button>
          {msg && (
            <span className={msg === "Guardado" ? "text-xs text-emerald-700" : "text-xs text-red-700"}>
              {msg}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// --------------------------------------------------- helper
function NumField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  integer,
  suffix,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min: number
  max: number
  step: number
  integer?: boolean
  suffix?: string
}) {
  return (
    <div>
      <Label className="text-xs flex items-center gap-1">
        {label}
        {suffix && <span className="text-slate-400 text-[10px]">{suffix}</span>}
      </Label>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!Number.isFinite(n)) return
          onChange(integer ? Math.round(n) : n)
        }}
        className="h-9"
      />
    </div>
  )
}
