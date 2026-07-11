// Conformidad documental de la flota (DPO Flota 1.1): una unidad activa es NO
// conforme si tiene al menos un documento vencido en requisitos legales de
// tipo vehículo. Helper puro, compartido entre la card del tablero (client) y
// el snapshot del cron (server).

export const normDominio = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "")

export interface DocVencidoUnidad {
  dominio: string
  diasRestantes: number
}

export interface ConformidadDocumental {
  pct: number | null
  /** dominio (tal como figura en el catálogo) → cantidad de docs vencidos */
  vencidosPorDominio: Map<string, number>
}

/**
 * % de unidades activas sin documentos vencidos. El dominio del requisito
 * puede venir con formato libre ("AE TOYOTA 3"), así que matchea normalizado
 * por igualdad o por inclusión del dominio del catálogo.
 */
export function conformidadDocumental(
  dominiosActivos: string[],
  docs: DocVencidoUnidad[]
): ConformidadDocumental {
  const activos = dominiosActivos.map((d) => ({ d, n: normDominio(d) }))
  const vencidosPorDominio = new Map<string, number>()
  for (const doc of docs) {
    if (doc.diasRestantes >= 0) continue
    const n = normDominio(doc.dominio)
    const u = activos.find((a) => a.n === n || (a.n.length >= 5 && n.includes(a.n)))
    if (u) vencidosPorDominio.set(u.d, (vencidosPorDominio.get(u.d) ?? 0) + 1)
  }
  const pct =
    activos.length > 0
      ? ((activos.length - vencidosPorDominio.size) / activos.length) * 100
      : null
  return { pct, vencidosPorDominio }
}
