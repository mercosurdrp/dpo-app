"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { CfgPC } from "./client"

export function ConfiguracionTab({ cfg }: { cfg: CfgPC }) {
  const router = useRouter()
  const [w_vol, setWvol] = useState(cfg.w_vol)
  const [w_otif, setWotif] = useState(cfg.w_otif)
  const [w_aus, setWaus] = useState(cfg.w_aus)
  const [umbral_alto, setUA] = useState(cfg.umbral_alto)
  const [umbral_medio, setUM] = useState(cfg.umbral_medio)
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
        body: JSON.stringify({
          w_vol,
          w_otif,
          w_aus,
          umbral_alto,
          umbral_medio,
          anio_vigente: anio,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      setMsg("Configuración actualizada. Refrescando…")
      router.refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pesos del score</CardTitle>
          <p className="text-xs text-slate-500">
            Score = w_vol · (HL/P90<sub>2025</sub>) + w_otif · % rechazo + w_aus · % ausentismo. La suma de los 3 debe ser 1.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field
            label="Volumen (w_vol)"
            value={w_vol}
            onChange={setWvol}
            step={0.05}
            min={0}
            max={1}
          />
          <Field
            label="OTIF (w_otif)"
            value={w_otif}
            onChange={setWotif}
            step={0.05}
            min={0}
            max={1}
          />
          <Field
            label="Ausentismo (w_aus)"
            value={w_aus}
            onChange={setWaus}
            step={0.05}
            min={0}
            max={1}
          />
          <div className="md:col-span-3 text-sm">
            Suma:{" "}
            <span className={sumaOk ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"}>
              {suma}
            </span>
            {!sumaOk && <span className="text-red-700"> — debe ser exactamente 1</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Umbrales de clasificación</CardTitle>
          <p className="text-xs text-slate-500">
            ALTO si score ≥ umbral_alto · MEDIO si score ≥ umbral_medio · BAJO en otro caso.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Umbral ALTO" value={umbral_alto} onChange={setUA} step={0.05} min={0} max={2} />
          <Field label="Umbral MEDIO" value={umbral_medio} onChange={setUM} step={0.05} min={0} max={2} />
          <Field
            label="Año vigente"
            value={anio}
            onChange={setAnio}
            step={1}
            min={2024}
            max={2030}
            integer
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Carga mensual de ausentismo</CardTitle>
          <p className="text-xs text-slate-500">
            Upload de Excel con (anio, mes, pct_ausentismo) — próximo paso.
          </p>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">
          Mientras tanto se puede insertar manualmente en la tabla{" "}
          <code className="text-slate-800">pc_ausentismo_mensual</code>.
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={guardar} disabled={guardando || !sumaOk}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </Button>
        {msg && (
          <span
            className={msg.toLowerCase().includes("actual") ? "text-sm text-emerald-700" : "text-sm text-red-700"}
          >
            {msg}
          </span>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  min,
  max,
  step,
  integer,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min: number
  max: number
  step: number
  integer?: boolean
}) {
  return (
    <div>
      <Label className="text-sm">{label}</Label>
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
      />
    </div>
  )
}
