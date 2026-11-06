"use client"

// Lo que antes vivía desparramado en la tarjeta (lapicito de la meta, párrafos
// de 11 px con la fórmula y el "por qué este PI") pasa a dos popovers: la
// tarjeta muestra el número y su lectura, el detalle está a un toque.

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Info, Pencil, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { updateFlotaMeta } from "@/actions/flota-indicadores"
import { hrefEvidencia, puntoFlota } from "@/lib/flota/dpo-puntos"
import { cn } from "@/lib/utils"
import { juzgarKpi } from "./estado-kpi"
import { fmtMesNombre } from "./formato"
import type { KpiDef } from "./kpi-defs"
import { EstadoPill } from "./semaforo"
import type { KpiVista } from "./vistas"

const chip =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs text-muted-foreground transition-colors"

// ==================== Meta ====================

export function MetaPopover({
  vista,
  puedeEditar,
  onSaved,
}: {
  vista: KpiVista
  puedeEditar: boolean
  onSaved: () => void
}) {
  const { def, meta } = vista
  const signo = meta?.comparador === "<=" ? "≤" : "≥"
  const texto =
    meta?.meta == null ? (
      <span className="italic">Meta sin definir</span>
    ) : (
      <>
        Meta{" "}
        <span className="font-semibold tabular-nums text-foreground">
          {signo} {def.fmt(Number(meta.meta))}
        </span>
      </>
    )
  const [open, setOpen] = useState(false)
  if (!puedeEditar) return <span className={cn(chip, "border-transparent bg-muted/60")}>{texto}</span>

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          chip,
          "hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        )}
        aria-label={`Editar la meta de ${def.label}`}
      >
        {texto}
        <Pencil className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent>
        <MetaForm
          vista={vista}
          onSaved={() => {
            setOpen(false)
            onSaved()
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function MetaForm({ vista, onSaved }: { vista: KpiVista; onSaved: () => void }) {
  const { def, meta, punto } = vista
  const [valor, setValor] = useState(meta?.meta != null ? String(meta.meta) : "")
  const [justif, setJustif] = useState(meta?.justificacion ?? "")
  const [saving, setSaving] = useState(false)
  const num = valor.trim() === "" ? null : Number(valor.replace(",", "."))
  const valido = num == null || !isNaN(num)

  // Vista previa: cómo quedaría el mes de la tarjeta con la meta nueva.
  const previa =
    valido && meta
      ? juzgarKpi(
          punto.valor,
          { ...meta, meta: num },
          {
            acumulativo: def.acumulativo,
            parcial: punto.parcial,
            cobertura: punto.cobertura,
            coberturaMinima: def.coberturaMinima,
          }
        )
      : null

  const guardar = async () => {
    if (!valido) {
      toast.error("Meta inválida")
      return
    }
    setSaving(true)
    const res = await updateFlotaMeta({ kpi: def.kpi, meta: num, justificacion: justif })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Meta actualizada")
    onSaved()
  }

  return (
    <div className="space-y-3">
      <PopoverTitle>Meta · {def.label}</PopoverTitle>
      <div className="space-y-1.5">
        <Label htmlFor={`meta-${def.kpi}`} className="text-xs text-muted-foreground">
          Valor ({meta?.comparador === "<=" ? "menos es mejor: ≤" : "más es mejor: ≥"})
        </Label>
        <Input
          id={`meta-${def.kpi}`}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
          placeholder="sin meta"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") guardar()
          }}
        />
        {previa && (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            Con esta meta, {fmtMesNombre(punto.ym)} quedaría
            <EstadoPill estado={previa.estado} motivo={previa.motivo} />
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`justif-${def.kpi}`} className="text-xs text-muted-foreground">
          Por qué este PI
        </Label>
        <Textarea
          id={`justif-${def.kpi}`}
          value={justif}
          onChange={(e) => setJustif(e.target.value)}
          rows={3}
          className="text-sm"
          placeholder="Por qué se eligió este PI y qué impacto ataca (el auditor lo pregunta)"
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={guardar} disabled={saving || !valido}>
          {saving ? "Guardando…" : "Guardar meta"}
        </Button>
      </div>
    </div>
  )
}

// ==================== Cómo se calcula ====================

export function InfoKpiPopover({ vista, def }: { vista: KpiVista; def: KpiDef }) {
  const punto = def.dpo ? puntoFlota(def.dpo) : undefined
  const p = vista.punto
  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={`Cómo se calcula ${def.label}`}
      >
        <Info className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-96 space-y-3" align="end">
        <div className="space-y-1">
          <PopoverTitle>Cómo se calcula</PopoverTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">{def.descripcion}</p>
        </div>
        {p.motivo === "poca_cobertura" && p.cobertura != null && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            Sin semáforo: se calculó sobre el {Math.round(p.cobertura)} % de las tareas del plan
            (mínimo {def.coberturaMinima} %). El valor no representa al plan completo hasta que
            se registren las tareas que faltan.
          </p>
        )}
        {p.excluidos != null && p.excluidos > 0 && (
          <p className="text-xs text-muted-foreground">
            {p.excluidos} {p.excluidos === 1 ? "caso quedó" : "casos quedaron"} fuera del promedio
            por no tener medible el momento de la observación.
          </p>
        )}
        <div className="space-y-1 border-t border-border pt-3">
          <p className="text-sm font-semibold text-foreground">Por qué este PI</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {vista.meta?.justificacion || (
              <span className="italic">Sin justificación cargada: el auditor la pregunta.</span>
            )}
          </p>
        </div>
        {punto && def.dpo && (
          <Link
            href={hrefEvidencia(def.dpo)}
            className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              <span className="font-semibold text-foreground">
                DPO Flota {def.dpo} — {punto.titulo}
              </span>
              <span className="block text-muted-foreground">
                {punto.bloque}
                {punto.mandatorio ? " · Mandatorio" : ""} · Ver evidencia cargada
              </span>
            </span>
          </Link>
        )}
      </PopoverContent>
    </Popover>
  )
}
