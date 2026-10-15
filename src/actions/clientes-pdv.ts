"use server"

// ===== Buscador de clientes del chofer (DPO Entrega 4.1) =====
// El chofer busca por código (o nombre) y ve la ventana horaria del PDV, el
// teléfono del cliente y el celular de su vendedor.
//
// Fuentes, todas de solo lectura:
//  - `clientes` del dashboard Mercosur: datos de Chess + la ventana relevada por
//    el promotor (`horario`, la misma base única del 4.4). La VH de Chess
//    (`horario_entrega`) va sólo de referencia: son defaults cargados en masa.
//  - `ruta_clientes_dia` (misma base, sync diaria de Chess): qué vendedores
//    visitan al cliente — preventista y repositor, puede haber más de uno.
//  - `bot_vendedores_wa` (Supabase): los celulares del equipo que cargó Fausto
//    para el bot de rechazos. Se cruza por nombre porque `ruta_clientes_dia`
//    no trae el id de Chess (y `rutas_venta.id_vendedor` viene en 0).
//
// 🚨 Este archivo SOLO puede exportar funciones async ("use server").

import { requireAuth } from "@/lib/session"
import { getPool } from "@/lib/mercosur-dashboard"
import { createAdminClient } from "@/lib/supabase/admin"
import type { ClientePdv, HorarioPdv, VendedorPdv } from "@/lib/clientes-pdv"

const MAX_RESULTADOS = 10

/** "KEVIN BASSAN" y "BASSAN KEVIN" son la misma persona; sin tildes ni orden. */
function claveNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ")
}

interface FilaCliente {
  id_cliente: number
  razon_social: string | null
  nombre_fantasia: string | null
  calle: string | null
  altura: string | null
  localidad: string | null
  lat: number | null
  lng: number | null
  anulado: string | null
  horario: HorarioPdv | null
  horario_ciclo: string | null
  horario_actualizado: string | null
  horario_chess: string | null
  comentario_entrega: string | null
  telefono_movil: string | null
  telefono_fijo: string | null
  vendedores: string[] | null
}

export async function buscarClientesPdv(
  q: string,
): Promise<{ data: ClientePdv[] } | { error: string }> {
  await requireAuth()

  const texto = q.trim()
  const porCodigo = /^\d{1,9}$/.test(texto)
  if (!porCodigo && texto.length < 3) {
    return { error: "Escribí el código del cliente o al menos 3 letras del nombre." }
  }

  let filas: FilaCliente[]
  try {
    const pool = getPool()
    // Por código trae también los anulados (el chofer puede tener uno viejo en
    // la mano); por nombre, sólo los activos para no llenar la lista de bajas.
    const res = await pool.query<FilaCliente>(
      `SELECT c.id_cliente,
              c.razon_social,
              NULLIF(btrim(c.nombre_fantasia), '')                        AS nombre_fantasia,
              COALESCE(NULLIF(btrim(c.calle_entrega), ''), c.calle)       AS calle,
              COALESCE(NULLIF(btrim(c.altura_entrega), ''), c.altura)     AS altura,
              c.des_localidad                                             AS localidad,
              COALESCE(c.latitud_entrega, c.latitud)                      AS lat,
              COALESCE(c.longitud_entrega, c.longitud)                    AS lng,
              c.anulado,
              c.horario,
              c.horario_ciclo,
              to_char(c.horario_actualizado_at AT TIME ZONE 'America/Argentina/Buenos_Aires',
                      'YYYY-MM-DD')                                       AS horario_actualizado,
              NULLIF(btrim(c.horario_entrega), '')                        AS horario_chess,
              NULLIF(btrim(c.comentario_entrega), '')                     AS comentario_entrega,
              c.telefono_movil,
              c.telefono_fijo,
              (SELECT array_agg(DISTINCT r.promotor ORDER BY r.promotor)
                 FROM ruta_clientes_dia r
                WHERE r.id_cliente = c.id_cliente
                  AND NULLIF(btrim(r.promotor), '') IS NOT NULL)         AS vendedores
         FROM clientes c
        WHERE ${
          porCodigo
            ? "c.id_cliente = $1::int"
            : `c.anulado = 'NO'
               AND (c.razon_social ILIKE $1 OR c.nombre_fantasia ILIKE $1)`
        }
        ORDER BY c.anulado, c.razon_social
        LIMIT ${MAX_RESULTADOS}`,
      [porCodigo ? Number(texto) : `%${texto.replace(/[\\%_]/g, "\\$&")}%`],
    )
    filas = res.rows
  } catch (e) {
    console.error("[clientes-pdv] error consultando el dashboard Mercosur:", e)
    return { error: "No se pudo consultar la base de clientes. Probá de nuevo en un rato." }
  }

  // Celulares del equipo comercial. Si Supabase falla, se muestran los
  // vendedores igual, sin número: es mejor que no mostrar nada.
  const celulares = new Map<string, string>()
  if (filas.some((f) => (f.vendedores ?? []).length > 0)) {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("bot_vendedores_wa")
      .select("nombre, phone_number")
      .eq("activo", true)
    if (error) console.error("[clientes-pdv] bot_vendedores_wa:", error.message)
    for (const v of (data ?? []) as { nombre: string; phone_number: string }[]) {
      if (v.phone_number) celulares.set(claveNombre(v.nombre), v.phone_number)
    }
  }

  const data: ClientePdv[] = filas.map((f) => {
    const telefonos = [f.telefono_movil, f.telefono_fijo]
      .map((t) => (t ?? "").trim())
      .filter((t) => t.replace(/\D/g, "").length >= 6)
    const vendedores: VendedorPdv[] = (f.vendedores ?? []).map((nombre) => ({
      nombre,
      telefono: celulares.get(claveNombre(nombre)) ?? null,
    }))
    const altura = (f.altura ?? "").trim()
    const calle = (f.calle ?? "").trim()
    return {
      id_cliente: f.id_cliente,
      razon_social: (f.razon_social ?? "").trim() || `Cliente ${f.id_cliente}`,
      nombre_fantasia: f.nombre_fantasia,
      direccion: calle ? (altura && altura !== "0" ? `${calle} ${altura}` : calle) : null,
      localidad: f.localidad,
      lat: f.lat,
      lng: f.lng,
      anulado: f.anulado === "SI",
      horario: f.horario,
      horario_ciclo: f.horario_ciclo,
      horario_actualizado: f.horario_actualizado,
      horario_chess: f.horario_chess,
      comentario_entrega: f.comentario_entrega,
      // Chess suele repetir el mismo número en móvil y fijo.
      telefonos: [...new Set(telefonos)],
      vendedores,
    }
  })

  return { data }
}
