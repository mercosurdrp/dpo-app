import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"

// Endpoint máquina-a-máquina (lo consume el Árbol de KPI del Depósito Esteban).
// Devuelve las HORAS TRABAJADAS DE AUTOELEVADOR por mes, calculadas desde el
// horómetro que los maquinistas cargan en el checklist de inicio de jornada.
//
// 🚨 El horómetro es un CONTADOR ACUMULADO, no las horas del día: las horas de
// un período son la DIFERENCIA entre lecturas consecutivas de la misma máquina.
// Por eso un día sin checklist no pierde horas (se acumulan y aparecen en la
// lectura siguiente), pero sí corre las horas de día: para totales mensuales da
// igual, para "horas por día" no.
//
// Alimenta el indicador DPO #7 (Número de Horas Trabajadas de Autoelevador),
// que hasta junio 2026 se cargaba a mano. Bearer + service role.

/** Reset del horómetro o lectura mal tipeada hacia abajo: la diferencia
 *  negativa NO resta, se descarta y se arranca de nuevo desde esa lectura. */
const DIFERENCIA_MINIMA = 0

/** Techo de cordura: una máquina no puede trabajar más de 24 h por día
 *  transcurrido entre lecturas. Un dígito de más (158 → 1580) se descarta acá
 *  en vez de inflar el mes. Se informa aparte en `descartes`. */
const HORAS_MAX_POR_DIA = 24

type Lectura = { fecha: string; dominio: string; odometro: number }

function diasEntre(a: string, b: string): number {
  const ms = new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()
  return Math.max(1, Math.round(ms / 86_400_000))
}

export async function GET(request: NextRequest) {
  if (IS_MISIONES) {
    return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  }

  const expected = process.env.TV_DPO_READ_TOKEN
  const auth = request.headers.get("authorization")
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const anio = Number(request.nextUrl.searchParams.get("anio")) || new Date().getFullYear()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: vehiculos, error: errVeh } = await supabase
    .from("catalogo_vehiculos")
    .select("dominio")
    .eq("tipo", "autoelevador")

  if (errVeh) {
    return NextResponse.json({ error: errVeh.message }, { status: 500 })
  }
  const dominios = (vehiculos || []).map((v) => v.dominio as string)
  if (!dominios.length) {
    return NextResponse.json({ anio, meses: [], maquinas: [], descartes: [] })
  }

  // Se arranca desde diciembre del año anterior: la primera lectura de enero
  // sola no dice cuántas horas se trabajaron, hace falta la anterior.
  const { data: filas, error } = await supabase
    .from("checklist_vehiculos")
    .select("fecha,dominio,odometro")
    .in("dominio", dominios)
    .not("odometro", "is", null)
    .gte("fecha", `${anio - 1}-12-01`)
    .lte("fecha", `${anio}-12-31`)
    .order("fecha", { ascending: true })
    .limit(5000)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Una lectura por (máquina, día): si hay dos checklists el mismo día se toma
  // la MAYOR, que es la del final de la jornada.
  const porMaquina = new Map<string, Map<string, number>>()
  for (const f of (filas || []) as Lectura[]) {
    if (f.odometro == null) continue
    const dias = porMaquina.get(f.dominio) ?? new Map<string, number>()
    dias.set(f.fecha, Math.max(Number(f.odometro), dias.get(f.fecha) ?? 0))
    porMaquina.set(f.dominio, dias)
  }

  const horasPorMes = new Map<number, number>()
  const maquinas: Array<{
    dominio: string; horas: number; lecturas: number; desde: string | null; hasta: string | null
  }> = []
  const descartes: Array<{ dominio: string; fecha: string; motivo: string; diferencia: number }> = []

  for (const [dominio, dias] of [...porMaquina.entries()].sort()) {
    const fechas = [...dias.keys()].sort()
    let horasMaquina = 0
    for (let i = 1; i < fechas.length; i++) {
      const anterior = fechas[i - 1]
      const actual = fechas[i]
      const diferencia = (dias.get(actual) as number) - (dias.get(anterior) as number)

      if (diferencia <= DIFERENCIA_MINIMA) {
        if (diferencia < 0) {
          descartes.push({ dominio, fecha: actual, motivo: "lectura menor que la anterior", diferencia })
        }
        continue
      }
      const tope = HORAS_MAX_POR_DIA * diasEntre(anterior, actual)
      if (diferencia > tope) {
        descartes.push({ dominio, fecha: actual, motivo: `más de ${tope} h desde la lectura anterior`, diferencia })
        continue
      }
      // La diferencia se imputa al mes de la lectura de CIERRE.
      const mes = Number(actual.slice(5, 7))
      const anioLectura = Number(actual.slice(0, 4))
      if (anioLectura !== anio) continue
      horasPorMes.set(mes, (horasPorMes.get(mes) ?? 0) + diferencia)
      horasMaquina += diferencia
    }
    const delAnio = fechas.filter((f) => f.startsWith(`${anio}-`))
    maquinas.push({
      dominio,
      horas: Math.round(horasMaquina * 10) / 10,
      lecturas: delAnio.length,
      desde: delAnio[0] ?? null,
      hasta: delAnio[delAnio.length - 1] ?? null,
    })
  }

  return NextResponse.json({
    anio,
    fuente: "checklist_vehiculos.odometro (horómetro del checklist de inicio de jornada)",
    meses: [...horasPorMes.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([mes, horas]) => ({ mes, horas: Math.round(horas * 10) / 10 })),
    maquinas,
    descartes,
  })
}
