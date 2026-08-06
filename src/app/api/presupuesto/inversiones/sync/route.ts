/**
 * Ingesta de inversiones desde apps externas.
 *
 * Hoy la usa Plan de Mantenimiento Edilicio (FastAPI + Neon): cada vez que un
 * plan de acción se guarda con tipo="inversion", esa app hace POST acá y la
 * inversión aparece en la solapa Inversiones de /presupuesto.
 *
 * Autenticación por header `x-api-key` contra PRESUPUESTO_API_KEY — mismo
 * patrón que /api/asistencia/marcas. Escribe con service role (sin RLS) porque
 * no hay sesión de usuario del otro lado.
 *
 * IDEMPOTENCIA SIN COLUMNAS NUEVAS: en esta Supabase no se puede aplicar DDL
 * desde la VM, así que `presupuestos_inversiones` no tiene un campo de origen.
 * La vinculación la guarda el llamador: manda `inversion_id` (el uuid que este
 * endpoint devolvió la primera vez) y nosotros actualizamos esa fila. Si no lo
 * manda, o si la fila ya no existe, se inserta una nueva y se devuelve el uuid
 * para que el origen lo persista. Ver `pda.dpo_inversion_id` del otro lado.
 *
 * Los datos del plan que no tienen columna propia (rubro, avance) viajan en la
 * primera línea de `observaciones`; ver src/lib/inversiones-origen.ts.
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  actualizarLineaOrigen,
  construirLineaOrigen,
  type OrigenInversion,
} from "@/lib/inversiones-origen"
import type { EstadoInversion } from "@/types/database"

const API_KEY = process.env.PRESUPUESTO_API_KEY

// Un plan edilicio es siempre infraestructura; el rubro fino (Eléctrico,
// Plomería, ...) va en la línea de origen de observaciones.
const CATEGORIA_MANTENIMIENTO = "infraestructura"

// Estados de plan-mantenimiento → estados de presupuesto.
// 'cerrado' es legacy del origen y significa lo mismo que 'ejecutado'.
const MAPA_ESTADO: Record<string, EstadoInversion> = {
  planificado: "programada",
  en_curso: "en_curso",
  ejecutado: "realizada",
  cerrado: "realizada",
}

interface InversionExternaInput {
  /** uuid de la fila espejo, si el origen ya lo tiene guardado. */
  inversion_id?: string | null
  titulo: string
  descripcion?: string | null
  rubro?: string | null
  responsable?: string | null
  proveedor?: string | null
  fecha_programada?: string | null // YYYY-MM-DD
  fecha_realizada?: string | null
  monto_estimado?: number | null
  monto_real?: number | null
  estado?: string | null
  avance_pct?: number | null
  origen_url?: string | null
  anio?: number | null
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function texto(v: unknown): string | null {
  const s = String(v ?? "").trim()
  return s === "" ? null : s
}

/** Año del presupuesto: fecha programada → fecha de ejecución → año en curso. */
function resolverAnio(item: InversionExternaInput): number {
  const explicito = num(item.anio)
  if (explicito && explicito >= 2000 && explicito <= 2100) return explicito
  for (const f of [item.fecha_programada, item.fecha_realizada]) {
    const anio = Number(String(f ?? "").slice(0, 4))
    if (anio >= 2000 && anio <= 2100) return anio
  }
  return new Date().getFullYear()
}

export async function POST(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: "Integración no configurada (falta PRESUPUESTO_API_KEY)." },
      { status: 503 },
    )
  }
  if (request.headers.get("x-api-key") !== API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const items: InversionExternaInput[] = Array.isArray(body) ? body : [body]

    if (items.length === 0) {
      return NextResponse.json({ error: "Sin inversiones en el body" }, { status: 400 })
    }

    const supabase = createAdminClient()

    // El origen manda el responsable como texto libre; acá es un FK a profiles.
    // Se resuelve por nombre y, si no hay match, queda sólo en la línea de origen.
    const { data: perfiles } = await supabase
      .from("profiles")
      .select("id, nombre")
    const porNombre = new Map<string, string>(
      (perfiles ?? [])
        .filter((p) => p.nombre)
        .map((p) => [String(p.nombre).trim().toLowerCase(), p.id as string]),
    )

    const resultados: { titulo: string; inversion_id: string; creada: boolean }[] = []
    const errores: string[] = []

    for (const item of items) {
      const titulo = texto(item.titulo)
      if (!titulo) {
        errores.push("Falta el título de la inversión")
        continue
      }

      const avanceRaw = num(item.avance_pct)
      const origen: OrigenInversion = {
        rubro: texto(item.rubro),
        responsable: texto(item.responsable),
        avancePct:
          avanceRaw === null
            ? null
            : Math.min(100, Math.max(0, Math.round(avanceRaw))),
        url: texto(item.origen_url),
      }

      const responsableTexto = origen.responsable?.toLowerCase() ?? ""
      const estadoRaw = String(item.estado ?? "").trim().toLowerCase()

      const campos = {
        anio: resolverAnio(item),
        titulo,
        categoria: CATEGORIA_MANTENIMIENTO,
        descripcion: texto(item.descripcion),
        proveedor: texto(item.proveedor),
        responsable_id: porNombre.get(responsableTexto) ?? null,
        fecha_programada: texto(item.fecha_programada),
        fecha_realizada: texto(item.fecha_realizada),
        monto_estimado: num(item.monto_estimado),
        monto_real: num(item.monto_real),
        estado: MAPA_ESTADO[estadoRaw] ?? "programada",
      }

      // ¿Ya existe la fila espejo? Sólo si el origen mandó su uuid y sigue viva.
      const idPrevio = texto(item.inversion_id)
      let existente: { id: string; observaciones: string | null } | null = null
      if (idPrevio) {
        const { data } = await supabase
          .from("presupuestos_inversiones")
          .select("id, observaciones")
          .eq("id", idPrevio)
          .maybeSingle()
        existente = data ?? null
      }

      if (existente) {
        const { error } = await supabase
          .from("presupuestos_inversiones")
          .update({
            ...campos,
            // Se regenera la línea de origen y se respeta lo que anotó el usuario.
            observaciones: actualizarLineaOrigen(existente.observaciones, origen),
          })
          .eq("id", existente.id)
        if (error) errores.push(`${titulo}: ${error.message}`)
        else resultados.push({ titulo, inversion_id: existente.id, creada: false })
      } else {
        const { data, error } = await supabase
          .from("presupuestos_inversiones")
          .insert({ ...campos, observaciones: construirLineaOrigen(origen) })
          .select("id")
          .single()
        if (error || !data) {
          errores.push(`${titulo}: ${error?.message ?? "no se pudo insertar"}`)
        } else {
          resultados.push({ titulo, inversion_id: data.id, creada: true })
        }
      }
    }

    const creadas = resultados.filter((r) => r.creada).length
    console.log(
      `[presupuesto/inversiones/sync] recibidas=${items.length} creadas=${creadas} actualizadas=${resultados.length - creadas} errores=${errores.length}`,
    )

    return NextResponse.json({
      success: errores.length === 0,
      total: items.length,
      creadas,
      actualizadas: resultados.length - creadas,
      // El origen guarda estos uuid para poder actualizar en vez de duplicar.
      inversiones: resultados,
      errores: errores.length > 0 ? errores : undefined,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error procesando inversiones" },
      { status: 500 },
    )
  }
}

/**
 * Baja: el plan se borró en el origen o dejó de ser inversión.
 * DELETE /api/presupuesto/inversiones/sync?inversion_id=<uuid>
 */
export async function DELETE(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: "Integración no configurada (falta PRESUPUESTO_API_KEY)." },
      { status: 503 },
    )
  }
  if (request.headers.get("x-api-key") !== API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const inversionId = texto(new URL(request.url).searchParams.get("inversion_id"))
  if (!inversionId) {
    return NextResponse.json({ error: "inversion_id es obligatorio" }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error, count } = await supabase
    .from("presupuestos_inversiones")
    .delete({ count: "exact" })
    .eq("id", inversionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log(
    `[presupuesto/inversiones/sync] DELETE ${inversionId} borradas=${count ?? 0}`,
  )
  return NextResponse.json({ success: true, borradas: count ?? 0 })
}

// GET: health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "presupuesto-inversiones-sync",
    configurada: Boolean(API_KEY),
  })
}
