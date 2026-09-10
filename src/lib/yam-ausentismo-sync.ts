// Sincroniza ausencias/licencias APROBADAS de YAM Capital Humano hacia
// `ausentismo_eventos`, la tabla que alimenta el módulo /ausentismo y (con
// el filtro de sector de MOTIVOS_TABLERO en actions/ausentismo.ts) el
// indicador de Ausentismo del tablero de reuniones.
//
// Port del mismo sync que ya corre en Misiones (dpo-distribuciones,
// 10/09/2026) a raíz de una licencia médica de Figueroa que no replicaba.
// Acá `YAM_CODIGO_EMPRESA` ya es "MPAMP" (válido — a diferencia de Misiones,
// donde "MMIS" no existía como codigo_empresa real y hubo que pasar a
// "MERCOSUR" + filtrar por DNI). En Pampeana el filtro de tenant ya lo hace
// la propia API de YAM al recibir MPAMP, así que no hace falta la capa
// extra de cruce por tenant — sólo el cruce por DNI para resolver
// empleado_id, igual que en Misiones.
//
// Cruce de persona: por DNI (empleados.numero_id ↔ YAM dni), NUNCA por
// legajo (sucio en los dos lados). YamAusentismo.persona sólo trae
// id_personal/legajo/nombre — el dni sale de cruzar ese id_personal contra
// la nómina completa (/Personal/Listar).
//
// Mapeo categoria/motivo → motivo de DPO: heurística por palabras clave,
// CON normalización de acentos (bug real encontrado en Misiones: YAM manda
// "Licencia Médica" con tilde, un .includes("MEDIC") sin normalizar nunca
// matchea). Cada corrida loguea categoria/motivo/estado de TODO lo que
// trajo YAM y a qué motivo de DPO lo mapeó — revisar `[yam-ausentismo-sync]`
// en los runtime logs de Vercel para auditar el mapeo contra casos reales.
//
// Nunca toca una fila cargada a mano: cada fila que crea/actualiza este sync
// lleva la marca "Sincronizado desde YAM — período <id>" al principio del
// comentario, y sólo esas se actualizan o se borran en corridas futuras
// (si YAM desaprueba/elimina el período).

import { createAdminClient } from "@/lib/supabase/admin"
import { yamAusentismos, yamListarPersonal, type YamAusentismo } from "@/lib/yam"
import { AUSENTISMO_MOTIVOS, type AusentismoMotivo } from "@/types/database"

const MARCA_PREFIJO = "Sincronizado desde YAM"
const MARCA_RE = /Sincronizado desde YAM — período (\d+)/

function soloDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "")
}

/** Sin acentos y en mayúsculas — ver nota del archivo sobre "Licencia Médica". */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
}

/** Heurística categoria/motivo YAM → motivo de DPO. Ver nota del archivo. */
function mapearMotivo(a: YamAusentismo): AusentismoMotivo | null {
  const cat = normalizar(a.categoria.codigo ?? "")
  const catDesc = normalizar(a.categoria.descripcion ?? "")
  const mot = normalizar(a.motivo?.codigo ?? "")
  const motDesc = normalizar(a.motivo?.descripcion ?? "")
  const junto = `${cat} ${catDesc} ${mot} ${motDesc}`

  if (cat === "VACACIONES") return null // no es dominio de ausentismo_eventos
  if (junto.includes("MEDIC") || junto.includes("ENFERM") || junto.includes("SALUD")) {
    return "licencia_medica"
  }
  if (junto.includes("GREMIAL") || junto.includes("SINDIC")) return "licencia_gremial"
  if (cat === "SANCION" || junto.includes("SUSPENS")) return "suspension"
  if (junto.includes("ACCIDENTE") || junto.includes("LABORAL")) return "accidente"
  if (junto.includes("AUSENCIA") || junto.includes("INJUSTIF") || junto.includes("FALTA")) {
    return "ausencia"
  }
  if (cat === "LICENCIA") return "otras_licencias"
  return null // categoría desconocida: se loguea y se salta, no se inventa
}

export interface ResultadoSync {
  ventana: { desde: string; hasta: string }
  nominaTotal: number
  nominaConDni: number
  empleadosDpoConDni: number
  ausentismosRecibidos: number
  sinDni: number
  sinEmpleado: number
  sinMapeo: number
  insertados: number
  actualizados: number
  sinCambios: number
  eliminados: number
  detalle: {
    id_periodo: string
    persona: string
    categoria: string
    motivo_yam: string | null
    estado: string
    mapeo: AusentismoMotivo | null
    accion: string
  }[]
}

export async function sincronizarAusentismoYam(
  desde: string,
  hasta: string,
  dryRun = false,
): Promise<ResultadoSync> {
  const admin = createAdminClient()
  const detalle: ResultadoSync["detalle"] = []
  let sinDni = 0
  let sinEmpleado = 0
  let sinMapeo = 0
  let insertados = 0
  let actualizados = 0
  let sinCambios = 0
  let eliminados = 0

  const [nomina, ausentismos, empleadosRes] = await Promise.all([
    yamListarPersonal(),
    yamAusentismos(desde, hasta),
    admin.from("empleados").select("id, numero_id, sector, activo"),
  ])

  const dniPorIdPersonal = new Map<number, string>()
  for (const p of nomina) {
    const dni = soloDigitos(p.dni)
    if (dni) dniPorIdPersonal.set(p.id_personal, dni)
  }

  const empleadoPorDni = new Map<string, { id: string; sector: string | null }>()
  for (const e of empleadosRes.data ?? []) {
    const dni = soloDigitos(e.numero_id as string | null)
    if (dni) empleadoPorDni.set(dni, { id: e.id as string, sector: e.sector as string | null })
  }

  // Períodos vistos en esta corrida, para poder borrar los que ya no estén
  // (dejaron de estar APROBADOS o desaparecieron de la ventana).
  const idPeriodosVigentes = new Set<string>()

  for (const a of ausentismos) {
    const fila = {
      id_periodo: a.id_periodo,
      persona: `${a.persona.nombre} (#${a.persona.legajo})`,
      categoria: a.categoria.codigo,
      motivo_yam: a.motivo?.descripcion ?? null,
      estado: a.estado.codigo,
      mapeo: null as AusentismoMotivo | null,
      accion: "",
    }

    if (a.estado.codigo !== "APROBADO") {
      fila.accion = "salteado: estado no aprobado"
      detalle.push(fila)
      continue
    }

    const dni = dniPorIdPersonal.get(a.persona.id_personal)
    if (!dni) {
      sinDni++
      fila.accion = "salteado: sin DNI en nómina YAM"
      detalle.push(fila)
      continue
    }
    const empleado = empleadoPorDni.get(dni)
    if (!empleado) {
      sinEmpleado++
      fila.accion = "salteado: DNI no cruza con empleados DPO"
      detalle.push(fila)
      continue
    }

    const motivo = mapearMotivo(a)
    fila.mapeo = motivo
    if (!motivo) {
      sinMapeo++
      fila.accion = "salteado: categoría/motivo sin mapeo conocido"
      detalle.push(fila)
      continue
    }
    if (!AUSENTISMO_MOTIVOS.includes(motivo)) {
      fila.accion = "salteado: motivo mapeado inválido (bug)"
      detalle.push(fila)
      continue
    }

    idPeriodosVigentes.add(a.id_periodo)

    const comentario = `${MARCA_PREFIJO} — período ${a.id_periodo} · ${a.categoria.descripcion}${a.motivo ? " / " + a.motivo.descripcion : ""}`

    const { data: existentes } = await admin
      .from("ausentismo_eventos")
      .select("id, fecha_inicio, fecha_fin, dias, motivo, comentario")
      .eq("empleado_id", empleado.id)
      .like("comentario", `${MARCA_PREFIJO}%período ${a.id_periodo}%`)
      .limit(1)

    const existente = existentes?.[0]
    if (dryRun) {
      fila.accion = existente ? "dry-run: actualizaría/sin cambios" : "dry-run: insertaría"
    } else if (!existente) {
      const { error } = await admin.from("ausentismo_eventos").insert({
        empleado_id: empleado.id,
        fecha_inicio: a.periodo.fecha_desde,
        fecha_fin: a.periodo.fecha_hasta,
        dias: a.periodo.cantidad,
        motivo,
        comentario,
      })
      if (error) {
        fila.accion = `error al insertar: ${error.message}`
      } else {
        insertados++
        fila.accion = "insertado"
      }
    } else {
      const cambio =
        existente.fecha_inicio !== a.periodo.fecha_desde ||
        existente.fecha_fin !== a.periodo.fecha_hasta ||
        existente.dias !== a.periodo.cantidad ||
        existente.motivo !== motivo
      if (cambio) {
        const { error } = await admin
          .from("ausentismo_eventos")
          .update({
            fecha_inicio: a.periodo.fecha_desde,
            fecha_fin: a.periodo.fecha_hasta,
            dias: a.periodo.cantidad,
            motivo,
            comentario,
          })
          .eq("id", existente.id)
        if (error) {
          fila.accion = `error al actualizar: ${error.message}`
        } else {
          actualizados++
          fila.accion = "actualizado"
        }
      } else {
        sinCambios++
        fila.accion = "sin cambios"
      }
    }
    detalle.push(fila)
  }

  // Borrar sincronizados de esta ventana que ya no vinieron vigentes (YAM los
  // desaprobó/eliminó). Sólo toca filas con nuestra marca — jamás una carga
  // manual — y sólo dentro de la ventana consultada. No corre en dry-run.
  if (!dryRun) {
    const { data: sincronizadosEnVentana } = await admin
      .from("ausentismo_eventos")
      .select("id, comentario")
      .like("comentario", `${MARCA_PREFIJO}%`)
      .lte("fecha_inicio", hasta)
      .gte("fecha_fin", desde)

    for (const row of sincronizadosEnVentana ?? []) {
      const m = MARCA_RE.exec((row.comentario as string) ?? "")
      const idPeriodo = m?.[1]
      if (idPeriodo && !idPeriodosVigentes.has(idPeriodo)) {
        const { error } = await admin.from("ausentismo_eventos").delete().eq("id", row.id)
        if (!error) eliminados++
      }
    }
  }

  return {
    ventana: { desde, hasta },
    nominaTotal: nomina.length,
    nominaConDni: dniPorIdPersonal.size,
    empleadosDpoConDni: empleadoPorDni.size,
    ausentismosRecibidos: ausentismos.length,
    sinDni,
    sinEmpleado,
    sinMapeo,
    insertados,
    actualizados,
    sinCambios,
    eliminados,
    detalle,
  }
}
