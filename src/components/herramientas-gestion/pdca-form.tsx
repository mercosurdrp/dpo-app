"use client"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2 } from "lucide-react"
import type { PdcaContenido, PdcaRevision } from "@/types/database"

export function pdcaVacio(): PdcaContenido {
  return {
    encuadre: {
      objetivo_estrategico: "",
      kpi_meta: "",
      equipo: "",
      sdca_verificado: false,
      sdca_notas: "",
    },
    plan: { problema: "", brechas: "", objetivos: "", causas: "", observacion: "" },
    hacer: { acciones: "" },
    verificar: { resultados: "" },
    actuar: { estandarizacion: "" },
    revisiones: [],
  }
}

const ENCUADRE_VACIO = {
  objetivo_estrategico: "",
  kpi_meta: "",
  equipo: "",
  sdca_verificado: false,
  sdca_notas: "",
}

/** Chip con el requisito del manual DPO que cubre el campo. */
function Req({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1.5 rounded bg-slate-200 px-1 py-px text-[10px] font-semibold text-slate-600">
      {children}
    </span>
  )
}

interface Props {
  value: PdcaContenido
  onChange: (v: PdcaContenido) => void
}

interface SectionProps {
  title: string
  badge: string
  badgeColor: string
  borderColor: string
  bgColor: string
  children: React.ReactNode
}

function PdcaSection({
  title,
  badge,
  badgeColor,
  borderColor,
  bgColor,
  children,
}: SectionProps) {
  return (
    <div className={`rounded-md border-2 ${borderColor} ${bgColor} overflow-hidden`}>
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${borderColor}`}>
        <span
          className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold text-white ${badgeColor}`}
        >
          {badge}
        </span>
        <span className="text-sm font-semibold text-slate-700">{title}</span>
      </div>
      <div className="p-3 space-y-3">{children}</div>
    </div>
  )
}

export function PdcaForm({ value, onChange }: Props) {
  const encuadre = value.encuadre ?? ENCUADRE_VACIO
  const revisiones = value.revisiones ?? []

  function setEncuadre(patch: Partial<typeof ENCUADRE_VACIO>) {
    onChange({ ...value, encuadre: { ...encuadre, ...patch } })
  }

  function setRevision(i: number, patch: Partial<PdcaRevision>) {
    onChange({
      ...value,
      revisiones: revisiones.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    })
  }

  return (
    <div className="space-y-3">
      {/* ENCUADRE — requisitos previos del manual DPO 4.3 */}
      <div className="rounded-md border-2 border-slate-200 bg-slate-50/60 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200">
          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-600 text-xs font-bold text-white">
            0
          </span>
          <span className="text-sm font-semibold text-slate-700">
            Encuadre — antes de arrancar
          </span>
        </div>
        <div className="p-3 space-y-3">
          <div>
            <Label htmlFor="pdca-objetivo-estrategico" className="text-xs text-slate-600">
              Objetivo estratégico al que se conecta
              <Req>R4.3.1</Req>
            </Label>
            <Textarea
              id="pdca-objetivo-estrategico"
              value={encuadre.objetivo_estrategico}
              onChange={(e) => setEncuadre({ objetivo_estrategico: e.target.value })}
              placeholder="¿A qué objetivo estratégico / nodo del Árbol del Sueño responde este PDCA?"
              rows={2}
              className="mt-1 text-sm bg-white"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pdca-kpi-meta" className="text-xs text-slate-600">
                KPI y meta
              </Label>
              <Input
                id="pdca-kpi-meta"
                value={encuadre.kpi_meta}
                onChange={(e) => setEncuadre({ kpi_meta: e.target.value })}
                placeholder="Ej.: Rechazo ≤ 1,7 % de bultos"
                className="mt-1 text-sm bg-white"
              />
            </div>
            <div>
              <Label htmlFor="pdca-equipo" className="text-xs text-slate-600">
                Equipo del PDCA
              </Label>
              <Input
                id="pdca-equipo"
                value={encuadre.equipo}
                onChange={(e) => setEncuadre({ equipo: e.target.value })}
                placeholder="Líder y participantes"
                className="mt-1 text-sm bg-white"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="pdca-sdca"
                checked={encuadre.sdca_verificado}
                onCheckedChange={(c) => setEncuadre({ sdca_verificado: c === true })}
              />
              <Label htmlFor="pdca-sdca" className="text-xs text-slate-600">
                Se verificó el checklist SDCA antes de iniciar
                <Req>R4.3.2</Req>
              </Label>
            </div>
            <Textarea
              value={encuadre.sdca_notas}
              onChange={(e) => setEncuadre({ sdca_notas: e.target.value })}
              placeholder="¿Qué estándar/rutina ya existe? ¿Se cumple? (evitar reinventar la rueda)"
              rows={2}
              className="mt-2 text-sm bg-white"
            />
          </div>
        </div>
      </div>

      {/* PLAN */}
      <PdcaSection
        title="PLAN — Planificar"
        badge="P"
        badgeColor="bg-blue-600"
        borderColor="border-blue-200"
        bgColor="bg-blue-50/40"
      >
        <div>
          <Label htmlFor="pdca-plan-problema" className="text-xs text-slate-600">
            Descripción del problema
          </Label>
          <Textarea
            id="pdca-plan-problema"
            value={value.plan.problema}
            onChange={(e) =>
              onChange({
                ...value,
                plan: { ...value.plan, problema: e.target.value },
              })
            }
            placeholder="¿Cuál es el problema o situación de mejora?"
            rows={2}
            className="mt-1 text-sm bg-white"
          />
        </div>
        <div>
          <Label htmlFor="pdca-plan-brechas" className="text-xs text-slate-600">
            Brechas identificadas
          </Label>
          <Textarea
            id="pdca-plan-brechas"
            value={value.plan.brechas}
            onChange={(e) =>
              onChange({
                ...value,
                plan: { ...value.plan, brechas: e.target.value },
              })
            }
            placeholder="¿Qué diferencia hay entre la situación actual y la deseada?"
            rows={2}
            className="mt-1 text-sm bg-white"
          />
        </div>
        <div>
          <Label htmlFor="pdca-plan-objetivos" className="text-xs text-slate-600">
            Objetivos del plan
          </Label>
          <Textarea
            id="pdca-plan-objetivos"
            value={value.plan.objetivos}
            onChange={(e) =>
              onChange({
                ...value,
                plan: { ...value.plan, objetivos: e.target.value },
              })
            }
            placeholder="¿Qué se quiere lograr? (Metas medibles)"
            rows={2}
            className="mt-1 text-sm bg-white"
          />
        </div>
        <div>
          <Label htmlFor="pdca-plan-observacion" className="text-xs text-slate-600">
            Observación — el problema partido en problemas menores
            <Req>R4.3.3</Req>
          </Label>
          <Textarea
            id="pdca-plan-observacion"
            value={value.plan.observacion ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                plan: { ...value.plan, observacion: e.target.value },
              })
            }
            placeholder="Estratificación con datos: ¿por motivo, zona, turno, cliente, mes? ¿Dónde se concentra?"
            rows={3}
            className="mt-1 text-sm bg-white"
          />
        </div>
        <div>
          <Label htmlFor="pdca-plan-causas" className="text-xs text-slate-600">
            Causas analizadas
            <Req>R4.3.4</Req>
          </Label>
          <Textarea
            id="pdca-plan-causas"
            value={value.plan.causas}
            onChange={(e) =>
              onChange({
                ...value,
                plan: { ...value.plan, causas: e.target.value },
              })
            }
            placeholder="¿Cuáles son las causas raíz identificadas?"
            rows={2}
            className="mt-1 text-sm bg-white"
          />
        </div>
      </PdcaSection>

      {/* HACER */}
      <PdcaSection
        title="HACER — Ejecutar"
        badge="H"
        badgeColor="bg-emerald-600"
        borderColor="border-emerald-200"
        bgColor="bg-emerald-50/40"
      >
        <div>
          <Label htmlFor="pdca-hacer-acciones" className="text-xs text-slate-600">
            Acciones implementadas
          </Label>
          <Textarea
            id="pdca-hacer-acciones"
            value={value.hacer.acciones}
            onChange={(e) =>
              onChange({
                ...value,
                hacer: { acciones: e.target.value },
              })
            }
            placeholder="¿Qué acciones concretas se ejecutaron o se ejecutarán?"
            rows={3}
            className="mt-1 text-sm bg-white"
          />
        </div>
      </PdcaSection>

      {/* VERIFICAR */}
      <PdcaSection
        title="VERIFICAR — Controlar"
        badge="V"
        badgeColor="bg-amber-500"
        borderColor="border-amber-200"
        bgColor="bg-amber-50/40"
      >
        <div>
          <Label htmlFor="pdca-verificar-resultados" className="text-xs text-slate-600">
            Resultados observados
          </Label>
          <Textarea
            id="pdca-verificar-resultados"
            value={value.verificar.resultados}
            onChange={(e) =>
              onChange({
                ...value,
                verificar: { resultados: e.target.value },
              })
            }
            placeholder="¿Qué resultados se obtuvieron? ¿Se alcanzaron los objetivos?"
            rows={3}
            className="mt-1 text-sm bg-white"
          />
        </div>
      </PdcaSection>

      {/* ACTUAR */}
      <PdcaSection
        title="ACTUAR — Estandarizar"
        badge="A"
        badgeColor="bg-rose-600"
        borderColor="border-rose-200"
        bgColor="bg-rose-50/40"
      >
        <div>
          <Label
            htmlFor="pdca-actuar-estandarizacion"
            className="text-xs text-slate-600"
          >
            Estandarización y próximos pasos
          </Label>
          <Textarea
            id="pdca-actuar-estandarizacion"
            value={value.actuar.estandarizacion}
            onChange={(e) =>
              onChange({
                ...value,
                actuar: { estandarizacion: e.target.value },
              })
            }
            placeholder="¿Cómo se estandariza lo aprendido? ¿Qué queda pendiente o se repite?"
            rows={3}
            className="mt-1 text-sm bg-white"
          />
        </div>
      </PdcaSection>

      {/* REVISIONES — el manual pide revisar el avance al menos una vez por mes */}
      <div className="rounded-md border-2 border-slate-200 bg-slate-50/60 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200">
          <span className="text-sm font-semibold text-slate-700">
            Revisiones del avance
            <span className="ml-1.5 text-xs font-normal text-slate-500">
              (mínimo una por mes)
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                ...value,
                revisiones: [...revisiones, { fecha: "", avance: "" }],
              })
            }
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Agregar
          </Button>
        </div>
        <div className="p-3 space-y-2">
          {revisiones.length === 0 && (
            <p className="text-xs text-slate-500">
              Sin revisiones registradas. El auditor verifica que el avance del PDCA se
              revise al menos mensualmente.
            </p>
          )}
          {revisiones.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <Input
                type="date"
                value={r.fecha}
                onChange={(e) => setRevision(i, { fecha: e.target.value })}
                className="w-36 text-sm bg-white"
              />
              <Textarea
                value={r.avance}
                onChange={(e) => setRevision(i, { avance: e.target.value })}
                placeholder="¿Cómo viene el indicador? ¿Qué se decidió?"
                rows={2}
                className="flex-1 text-sm bg-white"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-slate-400 hover:text-rose-600"
                onClick={() =>
                  onChange({
                    ...value,
                    revisiones: revisiones.filter((_, idx) => idx !== i),
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
