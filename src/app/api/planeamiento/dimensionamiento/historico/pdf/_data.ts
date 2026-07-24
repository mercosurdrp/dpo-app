/**
 * Datos del histórico enero–junio del dimensionamiento (volumen PRESUPUESTADO).
 *
 * Reutiliza `getDatosDimensionamiento()` para tomar la ESTRUCTURA actual
 * (dotación, capacidad de flota, productividades, zonas) y la contrasta contra
 * el volumen PRESUPUESTADO de cada mes ene–jun, con el mismo modelo de la
 * solapa Proyección (índice hl_mes / hl_mes_base, pesos por día de semana,
 * camiones por zona). No toca `dimensionamiento.ts`: solo lo consume.
 *
 * "Cómo fue" = cómo hubiera respondido la estructura de hoy al presupuesto de
 * cada mes. Las horas extra dimensionadas se comparan contra las PRESUPUESTADAS
 * (dim_costo_hh, fila «Q Horas Extras» del EERR).
 */
import { getDatosDimensionamiento } from "@/actions/dimensionamiento"
import { createClient } from "@/lib/supabase/server"
import {
  HL_POR_PALETA_RETORNABLE,
  diasHabilesDelMes,
  hlRetornablePorDia,
} from "@/lib/dimensionamiento/retornable"

export type SectorHistorico = "flota" | "almacen"

export interface FilaFlotaHist {
  mes: number
  hlPresupuesto: number
  ceqDiaProm: number
  camionesNecPico: number
  choferesNecPico: number
  ayudantesNecPico: number
  diasRefuerzo: number
  segundaVuelta: boolean
  hhExtraDim: number
  hhExtraPpto: number
}

export interface FilaRolHist {
  rol: string
  horasExtra: number
}
export interface FilaAlmacenHist {
  mes: number
  hlPresupuesto: number
  hhExtraDim: number
  hhExtraPpto: number
  detalle: FilaRolHist[]
}

export interface HistoricoPayload {
  sector: SectorHistorico
  anio: number
  mesBase: number
  hlBase: number
  // flota
  camionesDisp: number
  choferesDisp: number
  ayudantesDisp: number
  capCamionViaje: number
  filasFlota: FilaFlotaHist[]
  // almacén
  dotacionAlmacen: { rol: string; dotacion: number; dotacionEfectiva: number }[]
  filasAlmacen: FilaAlmacenHist[]
  advertencias: string[]
}

const round1 = (x: number) => Math.round(x * 10) / 10
const DIAS_SEMANA = 6
const MESES_H1 = [1, 2, 3, 4, 5, 6]

/** Reparto de volumen por zona: base por peso; el excedente cae en las zonas que absorben. */
function volumenPorZona(
  volCeq: number,
  volBase: number,
  zonas: { zona: string; peso: number; absorbe_crecimiento: boolean }[],
): Map<string, number> {
  const out = new Map<string, number>()
  const absorben = zonas.filter((z) => z.absorbe_crecimiento)
  const pesoAbsorbente = absorben.reduce((s, z) => s + z.peso, 0)
  const base = Math.min(volCeq, volBase)
  const excedente = Math.max(0, volCeq - base)
  for (const z of zonas) {
    let v = base * z.peso
    if (excedente > 0) {
      if (absorben.length === 0 || pesoAbsorbente <= 0) v += excedente * z.peso
      else if (z.absorbe_crecimiento) v += excedente * (z.peso / pesoAbsorbente)
    }
    out.set(z.zona, v)
  }
  return out
}

function camionesPorZonas(
  volCeq: number,
  zonas: { zona: string; peso: number; camiones_minimos: number; absorbe_crecimiento: boolean }[],
  capCamionViaje: number,
  volBase: number,
): number {
  if (capCamionViaje <= 0 || zonas.length === 0) return 0
  const vol = volumenPorZona(volCeq, volBase, zonas)
  return zonas.reduce(
    (s, z) => s + Math.max(z.camiones_minimos, Math.ceil((vol.get(z.zona) ?? 0) / capCamionViaje)),
    0,
  )
}

export async function construirHistorico(sector: SectorHistorico): Promise<HistoricoPayload> {
  const res = await getDatosDimensionamiento()
  if ("error" in res) throw new Error(res.error)
  const { config, metricas, almacen, reparto, flota, zonas } = res.data

  const supabase = await createClient()
  const now = new Date()
  const anio = now.getFullYear()
  const mesBase = now.getMonth() + 1

  // Volumen PRESUPUESTADO por mes (HL). Sin ajuste de escenario: es el presupuesto puro.
  const { data: vol } = await supabase
    .from("dim_volumen_proyectado")
    .select("mes, hl")
    .eq("anio", anio)
  const hlPorMes = new Map<number, number>()
  for (const r of vol ?? []) hlPorMes.set(Number(r.mes), Number(r.hl))
  const hlBase = hlPorMes.get(mesBase) ?? 0

  // Horas extra PRESUPUESTADAS por mes (EERR).
  const { data: ch } = await supabase
    .from("dim_costo_hh")
    .select("mes, hh_ppto_almacen, hh_ppto_entrega")
    .eq("anio", anio)
  const pptoPorMes = new Map<number, { alm: number; ent: number }>()
  for (const r of ch ?? [])
    pptoPorMes.set(Number(r.mes), {
      alm: Number((r as { hh_ppto_almacen?: number }).hh_ppto_almacen ?? 0),
      ent: Number((r as { hh_ppto_entrega?: number }).hh_ppto_entrega ?? 0),
    })

  const advertencias: string[] = []
  if (hlBase <= 0)
    advertencias.push(
      "No hay volumen presupuestado cargado para el mes base; los índices no pueden calcularse.",
    )

  // Pesos de volumen por día de semana (lun..sáb), normalizados.
  const pesos = [config.peso_lun, config.peso_mar, config.peso_mie, config.peso_jue, config.peso_vie, config.peso_sab]
  const sumaPesos = pesos.reduce((s, x) => s + x, 0) || 1
  const pesoDe = (wd: number) => (wd === 0 ? 0 : (pesos[wd - 1] ?? 0) / sumaPesos)
  const weekdaysDelMes = (m: number) => {
    const out: number[] = []
    const last = new Date(anio, m, 0).getDate()
    for (let d = 1; d <= last; d++) out.push(new Date(anio, m - 1, d).getDay())
    return out
  }
  const indiceDe = (m: number) => {
    const hl = hlPorMes.get(m) ?? 0
    return hlBase > 0 ? hl / hlBase : 0
  }

  // ─── FLOTA / ENTREGA ───
  const dispCap = flota.filter((f) => f.activo && f.capacidad_ceq > 0)
  const camionesDisp = dispCap.length
  const capCamion = camionesDisp > 0 ? dispCap.reduce((s, f) => s + f.capacidad_ceq, 0) / camionesDisp : 0
  const viajes = config.viajes_por_dia || 1
  const capCamionViaje = capCamion * viajes
  const choferesDisp = Math.round(reparto?.choferes.dotacionProm ?? 0)
  const ayudantesDisp = Math.round(reparto?.ayudantes.dotacionProm ?? 0)
  const ceqProm = metricas?.volumenCeqPromedio ?? 0
  const chofPorCam = config.choferes_por_camion
  const ayuPorCam = config.ayudantes_por_camion

  const filasFlota: FilaFlotaHist[] = MESES_H1.map((m) => {
    const indice = indiceDe(m)
    const ceqMes = ceqProm * indice
    let picoCam = 0, picoChof = 0, picoAyu = 0, dias = 0, sv = false, pdChof = 0, pdAyu = 0
    for (const wd of weekdaysDelMes(m)) {
      const w = pesoDe(wd)
      if (w <= 0) continue
      const ceqDia = ceqMes * DIAS_SEMANA * w
      const camDia = zonas.length > 0
        ? camionesPorZonas(ceqDia, zonas, capCamionViaje, ceqProm)
        : capCamionViaje > 0 ? Math.ceil(ceqDia / capCamionViaje) : 0
      if (camDia > camionesDisp) sv = true
      const chofNec = camDia * chofPorCam
      const ayuNec = camDia * ayuPorCam
      picoCam = Math.max(picoCam, camDia)
      picoChof = Math.max(picoChof, chofNec)
      picoAyu = Math.max(picoAyu, ayuNec)
      const faltaChof = Math.max(0, chofNec - choferesDisp)
      const faltaAyu = Math.max(0, ayuNec - ayudantesDisp)
      if (faltaChof > 0 || faltaAyu > 0) dias++
      pdChof += faltaChof
      pdAyu += faltaAyu
    }
    const hhExtraDim = round1((pdChof + pdAyu) * config.horas_vuelta_extra)
    return {
      mes: m,
      hlPresupuesto: Math.round(hlPorMes.get(m) ?? 0),
      ceqDiaProm: Math.round(ceqMes),
      camionesNecPico: picoCam,
      choferesNecPico: picoChof,
      ayudantesNecPico: picoAyu,
      diasRefuerzo: dias,
      segundaVuelta: sv,
      hhExtraDim,
      hhExtraPpto: round1(pptoPorMes.get(m)?.ent ?? 0),
    }
  })

  // ─── ALMACÉN ───
  const efAlmacen = (d: number) => Math.round(d * (1 - config.ausentismo_almacen) * 10) / 10
  const rolesAlm = [
    { rol: "Pickeros", rf: almacen?.pickeros, prodH: config.prod_bul_hh, dot: config.dotacion_almacen },
    { rol: "Clasificadores", rf: almacen?.clasificadores, prodH: config.prod_clasif_pal_h * HL_POR_PALETA_RETORNABLE, dot: config.dotacion_clasif },
    { rol: "Tareas grales.", rf: almacen?.reempaque, prodH: config.prod_reempaque_bul_hh, dot: config.dotacion_reempaque },
    { rol: "Maquinistas", rf: almacen?.maquinistas, prodH: config.prod_pal_h, dot: config.dotacion_maquinistas },
  ]
  const dotacionAlmacen = rolesAlm.map((r) => ({
    rol: r.rol,
    dotacion: r.dot,
    dotacionEfectiva: efAlmacen(r.dot),
  }))

  const filasAlmacen: FilaAlmacenHist[] = MESES_H1.map((m) => {
    const indice = indiceDe(m)
    const detalle: FilaRolHist[] = []
    let hhTotal = 0
    for (const r of rolesAlm) {
      const capDiaria = (r.rf?.capDiariaFte ?? 0) * efAlmacen(r.dot)
      let hh = 0
      if (r.rol === "Clasificadores") {
        // Demanda del retornable PRESUPUESTADO del mes (Excel de acarreo), repartido
        // uniforme entre días hábiles → igual que la proyección del mes en curso.
        const volDia = hlRetornablePorDia(m, anio)
        const diasHab = diasHabilesDelMes(anio, m)
        if (volDia > capDiaria && r.prodH > 0) hh = ((volDia - capDiaria) / r.prodH) * diasHab
      } else {
        const volMes = (r.rf?.volumenProm ?? 0) * indice
        for (const wd of weekdaysDelMes(m)) {
          const w = pesoDe(wd)
          if (w <= 0) continue
          const volDia = volMes * DIAS_SEMANA * w
          if (volDia > capDiaria && r.prodH > 0) hh += (volDia - capDiaria) / r.prodH
        }
      }
      hh = round1(hh)
      hhTotal += hh
      detalle.push({ rol: r.rol, horasExtra: hh })
    }
    return {
      mes: m,
      hlPresupuesto: Math.round(hlPorMes.get(m) ?? 0),
      hhExtraDim: round1(hhTotal),
      hhExtraPpto: round1(pptoPorMes.get(m)?.alm ?? 0),
      detalle,
    }
  })

  return {
    sector,
    anio,
    mesBase,
    hlBase: Math.round(hlBase),
    camionesDisp,
    choferesDisp,
    ayudantesDisp,
    capCamionViaje: Math.round(capCamionViaje),
    filasFlota,
    dotacionAlmacen,
    filasAlmacen,
    advertencias,
  }
}
