// Helpers de mapeo para evaluaciones de proveedores (DPO 2.4 · R2.4.4).

export const EVAL_SELECT =
  "*, proveedor:mant_proveedores(nombre), puntajes:mant_eval_puntajes(id, criterio_id, puntaje, comentario, criterio:mant_eval_criterios(texto))"

/* eslint-disable @typescript-eslint/no-explicit-any */
export function evaluacionToOut(e: any) {
  const puntajes = (e.puntajes ?? []).map((p: any) => ({
    id: p.id,
    criterio_id: p.criterio_id,
    puntaje: p.puntaje,
    comentario: p.comentario,
    criterio_texto: p.criterio?.texto ?? null,
  }))
  const valores = puntajes.map((p: any) => p.puntaje).filter((v: any) => v != null)
  const promedio = valores.length
    ? Math.round((valores.reduce((a: number, b: number) => a + b, 0) / valores.length) * 100) / 100
    : null
  return {
    id: e.id,
    proveedor_id: e.proveedor_id,
    proveedor_nombre: e.proveedor?.nombre ?? null,
    fecha: e.fecha,
    evaluador: e.evaluador,
    observaciones: e.observaciones,
    creada_en: e.creada_en,
    promedio,
    puntajes,
  }
}
