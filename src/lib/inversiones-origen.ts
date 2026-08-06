/**
 * Inversiones que llegan de otra app (hoy: Plan de Mantenimiento Edilicio).
 *
 * `presupuestos_inversiones` no tiene columnas para marcar el origen y en esta
 * base no se puede aplicar DDL desde la VM, así que la marca viaja como PRIMERA
 * LÍNEA de `observaciones` — visible y legible, no un código oculto:
 *
 *   Plan de mantenimiento edilicio · Rubro: Eléctrico · Responsable: Esteban Altube · Avance: 60% · https://…
 *   <acá abajo sigue lo que haya escrito el usuario en dpo-app>
 *
 * La vinculación con el plan de origen NO depende de este texto: vive del otro
 * lado, en `pda.dpo_inversion_id` (Neon), que guarda el uuid de esta fila. Si
 * alguien edita o borra la marca, el sync sigue actualizando la fila correcta;
 * lo único que se pierde es el cartelito en la tabla.
 */

export const MARCA_ORIGEN = "Plan de mantenimiento edilicio"

export interface OrigenInversion {
  rubro: string | null
  responsable: string | null
  avancePct: number | null
  url: string | null
}

/** Arma la primera línea de observaciones a partir de los datos del plan. */
export function construirLineaOrigen(o: OrigenInversion): string {
  const partes = [MARCA_ORIGEN]
  if (o.rubro) partes.push(`Rubro: ${o.rubro}`)
  if (o.responsable) partes.push(`Responsable: ${o.responsable}`)
  if (o.avancePct !== null) partes.push(`Avance: ${o.avancePct}%`)
  if (o.url) partes.push(o.url)
  return partes.join(" · ")
}

/**
 * Separa la marca de origen de lo que escribió el usuario.
 * Devuelve `origen: null` cuando la inversión se cargó a mano en dpo-app.
 */
export function leerObservaciones(observaciones: string | null): {
  origen: OrigenInversion | null
  notaUsuario: string | null
} {
  const texto = (observaciones ?? "").trim()
  if (!texto.startsWith(MARCA_ORIGEN)) {
    return { origen: null, notaUsuario: texto === "" ? null : texto }
  }

  const salto = texto.indexOf("\n")
  const linea = salto === -1 ? texto : texto.slice(0, salto)
  const resto = salto === -1 ? "" : texto.slice(salto + 1).trim()

  // La marca queda fuera; el resto son "Campo: valor" salvo la URL, que va suelta.
  const campos = linea
    .split("·")
    .slice(1)
    .map((s) => s.trim())
    .filter(Boolean)

  const buscar = (etiqueta: string): string | null => {
    const hit = campos.find((c) => c.toLowerCase().startsWith(`${etiqueta}:`))
    if (!hit) return null
    const valor = hit.slice(hit.indexOf(":") + 1).trim()
    return valor === "" ? null : valor
  }

  const avanceRaw = buscar("avance")
  const avance = avanceRaw ? Number(avanceRaw.replace("%", "").trim()) : null

  return {
    origen: {
      rubro: buscar("rubro"),
      responsable: buscar("responsable"),
      avancePct: avance !== null && Number.isFinite(avance) ? avance : null,
      url: campos.find((c) => c.startsWith("http")) ?? null,
    },
    notaUsuario: resto === "" ? null : resto,
  }
}

/**
 * Reescribe la marca dejando intacto lo que el usuario haya anotado debajo.
 * Se usa en cada push del origen: la línea 1 se regenera, el resto se conserva.
 */
export function actualizarLineaOrigen(
  observacionesActuales: string | null,
  origen: OrigenInversion,
): string {
  const { notaUsuario } = leerObservaciones(observacionesActuales)
  const linea = construirLineaOrigen(origen)
  return notaUsuario ? `${linea}\n${notaUsuario}` : linea
}
