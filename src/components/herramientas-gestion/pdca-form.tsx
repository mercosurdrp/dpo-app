"use client"

import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { PdcaContenido } from "@/types/database"

export function pdcaVacio(): PdcaContenido {
  return {
    plan: { problema: "", brechas: "", objetivos: "", causas: "" },
    hacer: { acciones: "" },
    verificar: { resultados: "" },
    actuar: { estandarizacion: "" },
  }
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
  return (
    <div className="space-y-3">
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
          <Label htmlFor="pdca-plan-causas" className="text-xs text-slate-600">
            Causas analizadas
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
    </div>
  )
}
