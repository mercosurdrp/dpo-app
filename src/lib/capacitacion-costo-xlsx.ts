/**
 * Excel del panel «Presupuesto de Costo»: las mismas tablas que se ven en
 * pantalla, armadas con el resultado de `calcularCosto` (no recalcula nada).
 */
import type * as XLSXType from "xlsx"
import { PILARES_COSTO, type CostoConfig, type ResumenCosto } from "@/lib/capacitacion-costo"

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const r0 = (n: number) => Math.round(n)
const h1 = (n: number) => Math.round(n * 10) / 10
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) / 100 : null)

type Celda = string | number | null

function hoja(XLSX: typeof XLSXType, filas: Celda[][], anchos: number[], formatos: Record<number, string> = {}) {
  const ws = XLSX.utils.aoa_to_sheet(filas)
  ws["!cols"] = anchos.map((wch) => ({ wch }))
  // Formato por columna (sólo a celdas numéricas).
  const rango = XLSX.utils.decode_range(ws["!ref"] ?? "A1")
  for (let R = rango.s.r; R <= rango.e.r; R++) {
    for (const [c, z] of Object.entries(formatos)) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: Number(c) })]
      if (cell && cell.t === "n") cell.z = z
    }
  }
  return ws
}

const PESOS = '"$" #,##0;[Red]-"$" #,##0'
const PCT = "0%"

export function libroCosto(XLSX: typeof XLSXType, r: ResumenCosto, cfg: CostoConfig, hoy: string) {
  const wb = XLSX.utils.book_new()
  const p = r.pac
  const nota = (t: string): Celda[] => [t]

  // 1) PAC vs Real
  const pacFilas: Celda[][] = [
    [`PAC (presupuesto oficial) vs. REAL dictado — Capacitaciones DPO ${r.anio} · corte ${hoy}`],
    nota(
      "PAC = caps previstas × horas por capacitación (prep + búsqueda + test + presentación) × valor/hora del pilar. " +
        "Real = capacitaciones dictadas (cumplidas o con algún presente): horas de preparación del PAC + duración real, al mismo valor/hora. " +
        "Desvío = PAC − Real (positivo = se gastó menos)."
    ),
    [],
    ["POR PILAR"],
    ["Pilar", "Caps PAC", "Caps reales", "Horas PAC", "Horas reales", "Desvío horas", "$ PAC", "$ Real", "Desvío $", "Ejecución %"],
    ...[...p.porPilar, { pilar: "TOTAL", ...p.total }].map((x) => [
      x.pilar,
      x.capsPac,
      x.capsReal,
      h1(x.horasPac),
      h1(x.horasReal),
      h1(x.horasPac - x.horasReal),
      r0(x.pac),
      r0(x.real),
      r0(x.pac - x.real),
      pct(x.real, x.pac),
    ]),
    [],
    ["POR MES"],
    ["Mes", "Caps PAC", "Caps reales", "Horas PAC", "Horas reales", "Desvío horas", "$ PAC", "$ Real", "Desvío $", "Ejecución %", "Desvío acumulado"],
    ...p.porMes.map((m) => [
      MESES[m.mes],
      m.capsPac,
      m.capsReal,
      h1(m.horasPac),
      h1(m.horasReal),
      h1(m.horasPac - m.horasReal),
      r0(m.pac),
      r0(m.real),
      r0(m.pac - m.real),
      pct(m.real, m.pac),
      r0(m.desvioAcumulado),
    ]),
  ]
  for (const [titulo, campoA, campoB, redondeo] of [
    ["HORAS POR PILAR Y MES", "horasPac", "horasReal", h1],
    ["$ POR PILAR Y MES", "pac", "real", r0],
  ] as const) {
    pacFilas.push([], [`${titulo} — PAC / Real / Desvío (PAC − Real)`])
    pacFilas.push(["Pilar", "Concepto", ...p.meses.map((m) => MESES[m]), "Total"])
    for (const x of p.porPilar) {
      const a = x.porMes.map((c) => c[campoA])
      const b = x.porMes.map((c) => c[campoB])
      const sa = a.reduce((s, v) => s + v, 0)
      const sb = b.reduce((s, v) => s + v, 0)
      pacFilas.push([x.pilar, "PAC", ...a.map(redondeo), redondeo(sa)])
      pacFilas.push([null, "Real", ...b.map(redondeo), redondeo(sb)])
      pacFilas.push([null, "Desvío", ...a.map((v, i) => redondeo(v - b[i])), redondeo(sa - sb)])
    }
  }
  XLSX.utils.book_append_sheet(
    wb,
    hoja(XLSX, pacFilas, [16, 12, 12, 12, 12, 12, 14, 14, 14, 12, 16], { 6: PESOS, 7: PESOS, 8: PESOS, 9: PCT, 10: PESOS }),
    "PAC vs Real"
  )

  // 2) Por mes y pilar (presupuesto por horas de instructor)
  XLSX.utils.book_append_sheet(
    wb,
    hoja(
      XLSX,
      [
        [`Presupuesto de costo por horas de instructor — ${r.anio}`],
        nota("Costo = duración × costo/hora del capacitador + horas de preparación × costo/hora (+ logística y material). Presupuesto = calendarizadas · Ejecutado = cumplidas."),
        [],
        ["POR MES"],
        ["Mes", "Capacitaciones", "Presupuesto", "Ejecutado", "Oficial PxQ", "Oficial − Presupuesto"],
        ...r.porMes
          .filter((m) => m.caps > 0 || m.oficial > 0)
          .map((m) => [MESES[m.mes], m.caps, r0(m.presupuesto), r0(m.ejecutado), r0(m.oficial), r0(m.oficial - m.presupuesto)]),
        ["TOTAL", r.filas.length, r0(r.presupuesto), r0(r.ejecutado), r0(r.oficial), r0(r.oficial - r.presupuesto)],
        [],
        ["POR PILAR"],
        ["Pilar", "Capacitador", "Capacitaciones", "Asistentes", "Presupuesto", "Ejecutado"],
        ...r.porPilar.map((x) => [x.pilar, x.capacitador, x.caps, x.asistentes, r0(x.presupuesto), r0(x.ejecutado)]),
      ],
      [14, 20, 14, 14, 14, 18],
      { 2: PESOS, 3: PESOS, 4: PESOS, 5: PESOS }
    ),
    "Por mes y pilar"
  )

  // 3) Escenario
  const e = r.escenario
  XLSX.utils.book_append_sheet(
    wb,
    hoja(
      XLSX,
      [
        [`Escenario: ${cfg.capsPorMes} capacitaciones por capacitador por mes (${MESES[cfg.mesDesde]}→${MESES[cfg.mesHasta]})`],
        [],
        ["Capacitador", "Pilares", ...e.meses.map((m) => MESES[m]), "Real", "Meta", "Brecha"],
        ...e.capacitadores.map((c) => [c.nombre, c.pilares.join(" + "), ...c.porMes, c.real, c.meta, c.real - c.meta]),
        ["TOTAL", null, ...e.totalMes, e.real, e.meta, e.real - e.meta],
        [],
        ["Capacitador", "Costo/hora", "Costo x capacitación", "Escenario", "Real", "Escenario − Real"],
        ...e.capacitadores.map((c) => [c.nombre, r0(c.costoHora), r0(c.costoPorCap), r0(c.costoEscenario), r0(c.costoReal), r0(c.costoEscenario - c.costoReal)]),
        ["TOTAL", null, null, r0(e.costoEscenario), r0(e.costoReal), r0(e.costoEscenario - e.costoReal)],
      ],
      [22, 22, 14, 14, 14, 14, 10, 10, 10, 10, 10, 10, 10]
    ),
    "Escenario"
  )

  // 4) Detalle
  XLSX.utils.book_append_sheet(
    wb,
    hoja(
      XLSX,
      [
        ["Fecha", "Mes", "Pilar", "Capacitación", "Capacitador", "Duración (h)", "Asistentes", "Costo/hora", "Dictado", "Preparación", "Logística", "Material", "Costo total", "Estado"],
        ...r.filas.map((f) => [
          f.fecha,
          MESES[f.mes],
          f.pilarN,
          f.titulo,
          f.capacitador,
          Number(f.duracion_horas) || 0,
          f.total_asistentes,
          r0(f.costoHora),
          r0(f.dictado),
          r0(f.preparacion),
          r0(f.logistica),
          r0(f.material),
          r0(f.total),
          f.cumplida ? "Cumplida" : f.estadoReal === "en_curso" ? "En curso" : "Programada",
        ]),
      ],
      [11, 6, 13, 50, 20, 11, 10, 11, 11, 11, 10, 10, 12, 11],
      { 7: PESOS, 8: PESOS, 9: PESOS, 10: PESOS, 11: PESOS, 12: PESOS }
    ),
    "Detalle"
  )

  // 5) Parámetros
  XLSX.utils.book_append_sheet(
    wb,
    hoja(
      XLSX,
      [
        ["PARÁMETROS"],
        ["Horas laborales por mes", cfg.horasMes],
        ["Horas de preparación por capacitación", cfg.horasPreparacion],
        ["Logística fija por capacitación", cfg.logisticaFija],
        ["Material por asistente", cfg.materialPorAsistente],
        ["Escenario: capacitaciones por mes", cfg.capsPorMes],
        ["Escenario: duración estándar (h)", cfg.duracionEstandar],
        [],
        ["Pilar", "Capacitador", "Sueldo mensual", "Costo/hora"],
        ...PILARES_COSTO.map((x) => [x, cfg.instructores[x].nombre, cfg.instructores[x].sueldo, r0(cfg.instructores[x].sueldo / cfg.horasMes)]),
        [],
        ["PAC", "Hs x cap", "Presentación", "Valor/hora", ...MESES, "Total caps"],
        ...PILARES_COSTO.map((x) => {
          const q = cfg.pac[x]
          return [x, q.horasPorCap, q.presentacion, Math.round(q.valorHora * 100) / 100, ...q.cant, q.cant.reduce((s, v) => s + v, 0)]
        }),
        [],
        ["Oficial PxQ", ...MESES, "Total"],
        ["$", ...cfg.oficialPxQ, cfg.oficialPxQ.reduce((s, v) => s + v, 0)],
      ],
      [36, 20, 14, 12, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 10]
    ),
    "Parámetros"
  )

  return wb
}
