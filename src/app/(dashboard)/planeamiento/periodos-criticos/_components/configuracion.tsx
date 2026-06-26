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
import type { CfgPC, UmbralesPC, PlanAccion } from "./client"

const CODIGOS = ["PPPP", "PPP", "PP", "P", ""]

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
      <PesosCard cfg={cfg} />
      <UmbralesCard umbrales={umbrales} />
      <AusentismoUploadCard />
      <PlanesAccionCard planes={planes} />
    </div>
  )
}

// -------------------------------------------------------------------- pesos
function PesosCard({ cfg }: { cfg: CfgPC }) {
  const router = useRouter()
  const [w_vol, setWvol] = useState(cfg.w_vol)
  const [w_otif, setWotif] = useState(cfg.w_otif)
  const [w_aus, setWaus] = useState(cfg.w_aus)
  const [anio, setAnio] = useState(cfg.anio)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const suma = +(w_vol + w_otif + w_aus).toFixed(3)
  const sumaOk = Math.abs(suma - 1) < 0.001

  async function guardar() {
    setGuardando(true)
    setMsg(null)
    try {
      const res = await fetch("/api/planeamiento/periodos-criticos/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ w_vol, w_otif, w_aus, anio_vigente: anio }),
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
        <CardTitle className="text-base">Pesos del score (continuo)</CardTitle>
        <p className="text-xs text-slate-500">
          Score = w_vol · (HL/P90) + w_otif · % rechazo + w_aus · % ausentismo. Solo afecta el simulador.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <NumField label="Vol (w_vol)" value={w_vol} onChange={setWvol} step={0.05} min={0} max={1} />
        <NumField label="OTIF (w_otif)" value={w_otif} onChange={setWotif} step={0.05} min={0} max={1} />
        <NumField label="Aus (w_aus)" value={w_aus} onChange={setWaus} step={0.05} min={0} max={1} />
        <NumField label="Año vigente" value={anio} onChange={setAnio} step={1} min={2024} max={2030} integer />
        <div className="md:col-span-4 flex items-center gap-3 text-sm">
          Suma:{" "}
          <span className={sumaOk ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"}>
            {suma}
          </span>
          {!sumaOk && <span className="text-red-700 text-xs">— debe ser exactamente 1</span>}
          <div className="ml-auto flex items-center gap-2">
            {msg && (
              <span className={msg.toLowerCase().includes("actual") ? "text-sm text-emerald-700" : "text-sm text-red-700"}>
                {msg}
              </span>
            )}
            <Button onClick={guardar} disabled={guardando || !sumaOk} size="sm">
              <Save className="w-4 h-4 mr-1" /> Guardar pesos
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// --------------------------------------------------------------- umbrales
function UmbralesCard({ umbrales }: { umbrales: UmbralesPC }) {
  const router = useRouter()
  const [vol_pico, setVP] = useState(umbrales.vol_pico)
  const [vol_alto, setVA] = useState(umbrales.vol_alto)
  const [vol_medio, setVM] = useState(umbrales.vol_medio)
  const [clientes, setCli] = useState(umbrales.clientes)
  const [otif_min, setOtif] = useState(umbrales.otif_min)
  const [aus_max, setAus] = useState(umbrales.ausentismo_max)
  const [min_trig, setMinTrig] = useState(umbrales.min_triggers)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const volOk = vol_pico >= vol_alto && vol_alto >= vol_medio

  async function guardar() {
    setGuardando(true)
    setMsg(null)
    try {
      const res = await fetch("/api/planeamiento/periodos-criticos/umbrales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vol_pico, vol_alto, vol_medio,
          clientes,
          otif_min,
          ausentismo_max: aus_max,
          min_triggers: min_trig,
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
        <CardTitle className="text-base">Umbrales (modelo Mercosur)</CardTitle>
        <p className="text-xs text-slate-500">
          Cada variable gatilla &quot;A&quot; cuando cruza su umbral. CRITICO si trigger_count ≥ min_triggers.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <NumField label="Vol PICO (HL)" value={vol_pico} onChange={setVP} step={100} min={0} max={20000} />
        <NumField label="Vol ALTO (HL)" value={vol_alto} onChange={setVA} step={100} min={0} max={20000} />
        <NumField label="Vol MEDIO (HL)" value={vol_medio} onChange={setVM} step={100} min={0} max={20000} />
        <NumField label="Clientes" value={clientes} onChange={setCli} step={10} min={0} max={2000} integer />
        <NumField label="Rechazo máx" value={otif_min} onChange={setOtif} step={0.01} min={0} max={1} suffix="(0–1)" />
        <NumField label="Ausentismo max" value={aus_max} onChange={setAus} step={0.005} min={0} max={1} suffix="(0–1)" />
        <NumField label="Min triggers" value={min_trig} onChange={setMinTrig} step={1} min={1} max={4} integer suffix="(1–4)" />
        <div className="flex items-end">
          <Button onClick={guardar} disabled={guardando || !volOk} size="sm" className="w-full">
            <Save className="w-4 h-4 mr-1" /> Guardar
          </Button>
        </div>
        {!volOk && (
          <div className="md:col-span-4 text-xs text-red-700">PICO ≥ ALTO ≥ MEDIO debe cumplirse</div>
        )}
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
          Texto que se sugiere en los períodos críticos según los triggers gatillados. Editable libremente.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {CODIGOS.map((codigo) => (
          <PlanRow
            key={codigo || "vacio"}
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
  codigo: string
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

  const label = codigo === "" ? "Día normal (sin triggers)" : `Código ${codigo}`

  return (
    <div className="border border-slate-200 rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <Badge variant="outline" className="font-mono text-sm">
          {codigo || "—"}
        </Badge>
        <span className="text-xs text-slate-500">{label}</span>
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
