// Objetivos/incentivos mostrados en "Visibilidad de Resultados" (DPO Entrega
// 2.1 — R2.1.2/R2.1.4: el empleado ve el incentivo y sabe cómo lograrlo).
// Fase 1: constante. Fase 2: tabla configurable por mes/sector desde admin.

export interface ObjetivoVisibilidad {
  titulo: string
  descripcion: string
  /** Meta de bultos del mes para la barra de progreso (null = sin barra). */
  objetivo_bultos_mes: number | null
}

export const OBJETIVO_VISIBILIDAD: ObjetivoVisibilidad = {
  titulo: "Cómo se pagan tus horas extras",
  descripcion:
    "De lunes a viernes, las horas después de las 15:00 se pagan al 50% " +
    "(desde las 15:22 suma media hora, desde las 15:45 suma la hora completa). " +
    "Los sábados se pagan al 100%: por venir ya tenés 2 horas, y después de " +
    "las 13:00 sigue sumando por la misma escala. Los bultos que ves son los " +
    "que repartió tu camión en el mes.",
  objetivo_bultos_mes: null,
}
