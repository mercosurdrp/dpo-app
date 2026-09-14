/**
 * Las hojas de Excel de asistencia y de adherencia por persona.
 *
 * Viven acá, y no en la ruta de export, para que se puedan armar sin levantar
 * Next: así el archivo que se revisa fuera de la app sale del mismo código que
 * baja el botón "Descargar Excel", y no puede divergir.
 */
import * as XLSX from "xlsx"
import {
  META_ASISTENCIA_PCT,
  adherenciaPorPersona,
  asistenciaPorEmpleado,
  calcularAsistencia,
  normalizePilar,
  type EmpleadoRef,
  type FilaAsistenciaEmpleado,
  type ItemAsistencia,
} from "@/lib/capacitacion-asistencia"

const MESES_CORTOS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]


/**
 * Hoja de asistencia: mismos números y mismas definiciones que el panel de
 * /capacitaciones (`calcularAsistencia` / `asistenciaPorEmpleado`), para que la
 * pantalla y este Excel no se contradigan.
 */
export function hojaAsistencia(
  items: ItemAsistencia[],
  filas: FilaAsistenciaEmpleado[],
  empleados: EmpleadoRef[],
  today: string
) {
  const a = calcularAsistencia(items, today)
  const porEmpleado = asistenciaPorEmpleado(filas, empleados, items, today)

  const cuerpo: (string | number | null)[][] = [
    [`ASISTENCIA A LAS CAPACITACIONES ${a.anio}`],
    [`Corte al ${today}. Meta: ${META_ASISTENCIA_PCT} % de presentismo.`],
    [],
    ["INDICADOR", "VALOR", "DETALLE"],
    [
      "Asistencia YTD (%)",
      a.pctYtd,
      `${a.presentes} presentes de ${a.convocados} convocados en ${a.dictadas} capacitaciones dictadas`,
    ],
    ["Ausencias", a.ausentes, "Convocados que no asistieron"],
    [
      `Capacitaciones al ${META_ASISTENCIA_PCT} % (%)`,
      a.pctEnMeta,
      `${a.enMeta} de ${a.dictadas} dictadas llegan a la meta`,
    ],
    [
      `Presencias que faltaron para el ${META_ASISTENCIA_PCT} %`,
      a.faltanParaMeta,
      a.faltanParaMeta === 0 ? "Meta alcanzada" : `Sobre ${a.convocados} convocados`,
    ],
    [],
    ["MES A MES"],
    ["Mes", "Dictadas", "En meta", "Convocados", "Presentes", "Ausentes", "Asistencia %"],
    ...a.porMes.map((m) => [
      MESES_CORTOS[m.mes],
      m.dictadas,
      m.enMeta,
      m.convocados,
      m.presentes,
      m.ausentes,
      m.pct,
    ]),
    [],
    ["POR PILAR"],
    ["Pilar", "Dictadas", "En meta", "Convocados", "Presentes", "Ausentes", "Asistencia %"],
    ...a.porPilar.map((p) => [
      p.pilar,
      p.dictadas,
      p.enMeta,
      p.convocados,
      p.presentes,
      p.ausentes,
      p.pct,
    ]),
    [],
    ["POR CAPACITACIÓN — DICTADAS"],
    ["Capacitación", "Pilar", "Fecha", "Convocados", "Presentes", "Ausentes", "Asistencia %", "En meta"],
    ...a.detalle.map((c) => [
      c.titulo,
      c.pilar ?? "",
      c.fecha,
      c.convocados,
      c.presentes,
      c.ausentes,
      c.pct,
      c.enMeta ? "Sí" : "No",
    ]),
    [],
    ["POR EMPLEADO — DE PEOR A MEJOR ASISTENCIA"],
    ["Empleado", "Legajo", "Sector", "Convocado a", "Asistió", "Faltó", "Asistencia %", "En meta"],
    ...porEmpleado.map((e) => [
      e.nombre,
      e.legajo,
      e.sector ?? "",
      e.convocado,
      e.presente,
      e.ausente,
      e.pct,
      e.enMeta ? "Sí" : "No",
    ]),
    [],
    ["Definiciones: Convocados = asistentes cargados en la capacitación · Presentes = marcados presentes"],
    ["(a mano o al rendir el examen en la app) · Dictada = no cancelada, fecha ≤ hoy y con al menos un convocado ·"],
    [`En meta = la capacitación llega al ${META_ASISTENCIA_PCT} % de asistencia · La asistencia YTD pondera por tamaño.`],
  ]

  const ws = XLSX.utils.aoa_to_sheet(cuerpo)
  ws["!cols"] = [
    { wch: 42 },
    { wch: 14 },
    { wch: 22 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
  ]
  return ws
}

/**
 * Hoja de adherencia por persona: de las capacitaciones dictadas a las que se
 * convocó a cada empleado, a cuántas fue y cuántas completó (aprobó).
 *
 * Son dos lecturas distintas y por eso van las dos: se puede ir a la charla y
 * no rendir el examen. La adherencia individual usa el mismo criterio con el
 * que el módulo da una capacitación por cumplida (aprobados), pero por persona.
 * Las columnas de pilar muestran el cumplimiento de cada uno: aprobadas sobre
 * convocadas de ese pilar.
 */
export function hojaAdherenciaPersona(
  items: ItemAsistencia[],
  filas: FilaAsistenciaEmpleado[],
  empleados: EmpleadoRef[],
  today: string
) {
  const personas = adherenciaPorPersona(filas, empleados, items, today)
  const anio = Number(today.slice(0, 4))

  // Los pilares que realmente tienen capacitaciones dictadas este año.
  const pilares = [
    ...new Set(
      items
        .filter(
          (c) =>
            c.fecha?.slice(0, 4) === String(anio) &&
            c.estadoReal !== "cancelada" &&
            c.fecha <= today &&
            c.convocados > 0
        )
        .map((c) => normalizePilar(c.pilar))
    ),
  ].sort((a, b) => a.localeCompare(b))

  const totales = personas.reduce(
    (acc, p) => {
      acc.convocado += p.convocado
      acc.asistio += p.asistio
      acc.aprobado += p.aprobado
      acc.pendiente += p.pendiente
      return acc
    },
    { convocado: 0, asistio: 0, aprobado: 0, pendiente: 0 }
  )
  const pctTotalAsist =
    totales.convocado > 0 ? Math.round((totales.asistio / totales.convocado) * 100) : null
  const pctTotalAdh =
    totales.convocado > 0 ? Math.round((totales.aprobado / totales.convocado) * 100) : null

  const cuerpo: (string | number | null)[][] = [
    [`ADHERENCIA POR PERSONA ${anio}`],
    [
      `Corte al ${today}. Meta: ${META_ASISTENCIA_PCT} %. ${personas.length} empleados con al menos una convocatoria a capacitaciones dictadas.`,
    ],
    [],
    ["INDICADOR", "VALOR", "DETALLE"],
    [
      "Asistencia del plantel (%)",
      pctTotalAsist,
      `${totales.asistio} asistencias sobre ${totales.convocado} convocatorias`,
    ],
    [
      "Adherencia del plantel (%)",
      pctTotalAdh,
      `${totales.aprobado} capacitaciones completadas (aprobadas) sobre ${totales.convocado} convocatorias`,
    ],
    [
      `Empleados al ${META_ASISTENCIA_PCT} % de adherencia`,
      personas.filter((p) => p.enMetaAdherencia).length,
      `De ${personas.length} · bajo la meta: ${personas.filter((p) => !p.enMetaAdherencia).length}`,
    ],
    ["Pendientes de rendir", totales.pendiente, "Convocatorias sin examen rendido todavía"],
    [],
    ["DETALLE POR PERSONA — DE PEOR A MEJOR ADHERENCIA"],
    [
      "Empleado",
      "Legajo",
      "Sector",
      "Convocado a",
      "Asistió",
      "Faltó",
      "% Asistencia",
      "Rindió",
      "Aprobó",
      "Desaprobó",
      "Pendiente",
      "% Adherencia",
      "En meta",
      ...pilares.map((p) => `${p} %`),
    ],
    ...personas.map((p) => {
      const porPilar = new Map(p.porPilar.map((x) => [x.pilar, x]))
      return [
        p.nombre,
        p.legajo,
        p.sector ?? "",
        p.convocado,
        p.asistio,
        p.falto,
        p.pctAsistencia,
        p.rindio,
        p.aprobado,
        p.desaprobado,
        p.pendiente,
        p.pctAdherencia,
        p.enMetaAdherencia ? "Sí" : "No",
        // Celda vacía = a esa persona no la convocaron a ese pilar.
        ...pilares.map((nombre) => porPilar.get(nombre)?.pct ?? null),
      ]
    }),
    [],
    ["Definiciones: Convocado a = capacitaciones dictadas en las que figura como asistente ·"],
    ["Asistió = marcado presente · Aprobó = rindió y aprobó el examen ·"],
    ["% Adherencia = aprobadas / convocadas: el mismo criterio con el que una capacitación se da por cumplida, mirado por persona ·"],
    ["Columnas de pilar = aprobadas sobre convocadas de ese pilar; vacío = no lo convocaron a ese pilar ·"],
    ["Dictada = no cancelada, fecha ≤ hoy y con al menos un convocado."],
  ]

  const ws = XLSX.utils.aoa_to_sheet(cuerpo)
  ws["!cols"] = [
    { wch: 32 },
    { wch: 10 },
    { wch: 18 },
    { wch: 12 },
    { wch: 9 },
    { wch: 8 },
    { wch: 13 },
    { wch: 9 },
    { wch: 9 },
    { wch: 11 },
    { wch: 11 },
    { wch: 13 },
    { wch: 9 },
    ...pilares.map(() => ({ wch: 13 })),
  ]
  return ws
}
