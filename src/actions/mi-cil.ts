"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

/**
 * Mi CIL — el chofer u operador carga su propia tarea de Limpieza, Inspección y
 * Lubricación (DPO Flota 4.1).
 *
 * Existe porque hasta hoy la única forma de cargar una tarea CIL era
 * `/vehiculos/mantenimiento` → Check lists → Tareas CIL, y esa pantalla exige
 * rol admin o supervisor: el chofer figuraba sólo como texto en el campo
 * `operario`, es decir que alguien la cargaba POR él. Con 6 unidades y meta de
 * 30 tareas al mes, eso convierte al supervisor en transcriptor y hace que la
 * meta dependa de que se acuerde.
 *
 * Escribe en la MISMA tabla `mantenimiento_cil` que la pantalla de supervisión,
 * así que el KPI, el tablero y la evidencia del 4.1 no cambian en nada.
 *
 * 🚨 La foto es obligatoria acá y opcional del lado del supervisor: el requisito
 * R4.2.6 pide demostrar que la limpieza se ejecuta según el estándar, y una fila
 * cargada sin foto no lo demuestra.
 */

import {
  TAREAS_CIL,
  META_CIL_MENSUAL,
  CICLO_CIL_MENSUAL,
  TIPOS_CIL_OBLIGATORIOS,
  DOMINIOS_CIL_EXCLUIDOS,
  tareaDelCiclo,
} from "@/lib/flota/cil-tareas"

const BUCKET = "mantenimiento-evidencias"

export interface UnidadCil {
  dominio: string
  tipo: string | null
  numero: string | null
}

export interface MiTareaCil {
  id: string
  fecha: string
  dominio: string
  tarea: string
  descripcion: string | null
  foto_url: string | null
}

export interface UnidadPendiente {
  dominio: string
  numero: string | null
  /** Tareas del ciclo que le faltan a esta unidad en el mes. */
  faltan: string[]
}

export interface MiCilData {
  /** Unidades activas sobre las que se puede cargar una tarea. */
  unidades: UnidadCil[]
  /** Lo que cargó esta persona, de lo más nuevo a lo más viejo. */
  mias: MiTareaCil[]
  /** Tareas de TODA la operación en el mes en curso, contra la meta. */
  mesTotal: number
  metaMes: number
  /**
   * Unidades obligatorias a las que les falta alguna tarea del ciclo este mes.
   * Se muestra en la pantalla del chofer para que sepa qué agarrar, sin tener
   * que preguntarle al supervisor.
   */
  pendientes: UnidadPendiente[]
}

function ymActual(): string {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  return s.slice(0, 7)
}

function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export async function getMiCil(): Promise<{ data: MiCilData } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    const ym = ymActual()

    const [vehRes, misRes, mesRes] = await Promise.all([
      supabase
        .from("catalogo_vehiculos")
        .select("dominio, tipo")
        .eq("active", true)
        .order("dominio"),
      supabase
        .from("mantenimiento_cil")
        .select("id, fecha, dominio, tarea, descripcion, foto_url")
        .eq("created_by", profile.id)
        .order("fecha", { ascending: false })
        .limit(20),
      supabase
        .from("mantenimiento_cil")
        .select("dominio, tarea")
        .gte("fecha", `${ym}-01`),
    ])

    if (vehRes.error) return { error: vehRes.error.message }
    if (misRes.error) return { error: misRes.error.message }

    // El número de flota vive en la ficha, no en el catálogo: se muestra junto
    // al dominio porque es como el chofer llama a su unidad.
    const dominios = (vehRes.data || []).map((v) => v.dominio)
    const { data: fichas } = await supabase
      .from("vehiculos_ficha")
      .select("dominio, numero_asignado")
      .in("dominio", dominios)
    const numeros = new Map(
      (fichas || []).map((f: { dominio: string; numero_asignado: string | null }) => [
        f.dominio,
        f.numero_asignado,
      ]),
    )

    // Qué le falta a cada unidad obligatoria para cerrar el ciclo del mes.
    const delMes = (mesRes.data || []) as Array<{ dominio: string; tarea: string }>
    const obligatorios = TIPOS_CIL_OBLIGATORIOS as readonly string[]
    const ciclo = CICLO_CIL_MENSUAL as readonly string[]
    const pendientes: UnidadPendiente[] = (vehRes.data || [])
      .filter(
        (v) =>
          obligatorios.includes(v.tipo ?? "") &&
          !(v.dominio in DOMINIOS_CIL_EXCLUIDOS),
      )
      .map((v) => ({
        dominio: v.dominio,
        numero: numeros.get(v.dominio) ?? null,
        // 🚨 `tareaDelCiclo` y no `d.tarea` a secas: las tareas viejas cargadas
        // como `limpieza` cierran la misma letra que `limpieza_profunda`.
        faltan: ciclo.filter(
          (t) =>
            !delMes.some(
              (d) => d.dominio === v.dominio && tareaDelCiclo(d.tarea) === t,
            ),
        ),
      }))
      .filter((u) => u.faltan.length > 0)

    return {
      data: {
        unidades: (vehRes.data || []).map((v) => ({
          dominio: v.dominio,
          tipo: v.tipo,
          numero: numeros.get(v.dominio) ?? null,
        })),
        mias: (misRes.data || []) as MiTareaCil[],
        mesTotal: delMes.length,
        metaMes: META_CIL_MENSUAL,
        pendientes,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Registra en UNA sola carga todos los trabajos que se le hicieron a la unidad.
 *
 * 🚨 `tarea` viene REPETIDO en el FormData (`getAll`), no una sola vez: el que
 * lava el camión aprovecha y controla fluidos y engrasa en la misma parada, y
 * obligarlo a repetir el formulario entero —con su foto— tres veces es lo que
 * hacía que se cargara una sola de las tres. Se inserta una fila por trabajo
 * porque el KPI `cil_tareas` cuenta tareas y la cobertura mira las tres letras
 * del ciclo por separado; lo que se comparte es la foto, no la fila.
 */
export async function createMiTareaCil(
  formData: FormData,
): Promise<{ success: true; creadas: number } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const dominio = String(formData.get("dominio") || "").trim().toUpperCase()
    const descripcion = String(formData.get("descripcion") || "").trim()
    // 🚨 El nombre se ESCRIBE y arranca VACÍO, no se elige de una lista ni se
    // precarga con el usuario logueado: la tarea la puede haber hecho un ayudante
    // o alguien sin usuario en la app, y quien carga no siempre es quien la hizo.
    // Precargarlo hacía que el nombre de quien estaba logueado quedara pegado por
    // descuido (Francisco, 07/08/2026).
    //
    // Pueden ser VARIAS personas: la pantalla las manda separadas por coma en una
    // sola fila. Una fila por tarea y no una por persona, porque el KPI `cil_tareas`
    // cuenta tareas contra una meta de 30 — dos choferes lavando el mismo camión
    // es una tarea hecha, no dos.
    const operario = String(formData.get("operario") || "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .join(", ")

    // Se ordenan como el catálogo y se deduplican: si la pantalla manda la misma
    // tarea dos veces, no se cargan dos filas iguales.
    const pedidas = new Set(formData.getAll("tarea").map((t) => String(t).trim()))
    const tareas = TAREAS_CIL.filter((t) => pedidas.has(t.id))

    if (!dominio) return { error: "Elegí la unidad." }
    if (tareas.length === 0) return { error: "Marcá qué trabajos le hiciste." }
    if (!operario) return { error: "Escribí el nombre de quien hizo la tarea." }

    const foto = formData.get("foto")
    if (!(foto instanceof File) || foto.size === 0) {
      return { error: "Falta la foto: sin foto la tarea no queda registrada." }
    }

    // La unidad tiene que existir y estar activa: un dominio tipeado a mano que
    // no está en el catálogo queda huérfano y no suma al KPI de su unidad.
    const { data: veh } = await supabase
      .from("catalogo_vehiculos")
      .select("dominio")
      .eq("dominio", dominio)
      .eq("active", true)
      .maybeSingle()
    if (!veh) return { error: "Esa unidad no está activa en el maestro de flota." }

    const limpio = foto.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const path = `cil/${dominio}/${Date.now()}-${limpio}`
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, await foto.arrayBuffer(), {
        contentType: foto.type || "image/jpeg",
        upsert: false,
      })
    if (upErr) return { error: upErr.message }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)

    // Una foto, varias filas: las tres letras del ciclo se hacen en la misma
    // parada y pedir una foto por trabajo sólo suma fricción. `foto_path`
    // compartido es deliberado — ver `deleteTareaCil`, que no borra el archivo
    // mientras otra fila lo siga usando.
    const { error } = await supabase.from("mantenimiento_cil").insert(
      tareas.map((t) => ({
        fecha: hoyArgentina(),
        dominio,
        // 🚨 El `id`, nunca el `label`: la columna tiene un CHECK y el label lo
        // viola. Ver el comentario de `lib/flota/cil-tareas.ts`.
        tarea: t.id,
        operario,
        descripcion: descripcion || null,
        foto_url: pub.publicUrl,
        foto_path: path,
        created_by: profile.id,
      })),
    )
    if (error) {
      // Si las filas no entran, la foto no queda colgada en el bucket.
      await supabase.storage.from(BUCKET).remove([path])
      return { error: error.message }
    }

    // 🚨 Ídem: la Cobertura del CIL vive en /vehiculos/mantenimiento y es la que
    // pinta los cuadros verde/rojo por unidad. Sin esto, el supervisor no ve la
    // tarea que el chofer acaba de cargar.
    revalidatePath("/mi-cil")
    revalidatePath("/vehiculos/mantenimiento")
    return { success: true, creadas: tareas.length }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
