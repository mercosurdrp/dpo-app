/**
 * Imagen de la salida del día (?fecha=YYYY-MM-DD) — PNG vertical 1080px,
 * pensada para mandar al grupo de WhatsApp. Render server-side con next/og,
 * sin librerías nuevas. Requiere sesión (el link se abre desde /salidas).
 */
import { NextRequest } from "next/server"
import { ImageResponse } from "next/og"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

function fechaLarga(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response("No autenticado", { status: 401 })

  const fecha = request.nextUrl.searchParams.get("fecha") ?? ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return new Response("Fecha inválida", { status: 400 })
  }

  const { data: salidas } = await supabase
    .from("salidas_programadas")
    .select("patente, chofer_empleado_id, ayudante1_empleado_id, ayudante2_empleado_id, notas")
    .eq("fecha", fecha)
    .order("patente")
  const rows = salidas ?? []

  const ids = new Set<string>()
  for (const r of rows) {
    for (const id of [r.chofer_empleado_id, r.ayudante1_empleado_id, r.ayudante2_empleado_id]) {
      if (id) ids.add(id)
    }
  }
  const nombres = new Map<string, string>()
  if (ids.size > 0) {
    const { data: emps } = await supabase
      .from("empleados")
      .select("id, nombre")
      .in("id", [...ids])
    for (const e of emps ?? []) nombres.set(e.id, e.nombre)
  }
  const nombre = (id: string | null) => (id ? (nombres.get(id) ?? "—") : null)

  const alto = Math.max(700, 300 + rows.length * 148 + 90)

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0a1628",
          color: "#ffffff",
          padding: "48px 44px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 34 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 30, color: "#93c5fd", letterSpacing: 6 }}>MERCOSUR</span>
            <span style={{ fontSize: 24, color: "#64748b" }}>Distribución</span>
          </div>
          <span style={{ fontSize: 64, fontWeight: 700, marginTop: 14 }}>Salida de camiones</span>
          <span style={{ fontSize: 36, color: "#93c5fd", marginTop: 6 }}>{fechaLarga(fecha)}</span>
        </div>

        {/* Filas */}
        {rows.length === 0 ? (
          <div
            style={{
              display: "flex",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 18,
              padding: "40px 36px",
              fontSize: 32,
              color: "#94a3b8",
            }}
          >
            Sin salidas cargadas para este día.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {rows.map((r) => {
              const ayudantes = [nombre(r.ayudante1_empleado_id), nombre(r.ayudante2_empleado_id)]
                .filter(Boolean)
                .join("  ·  ")
              return (
                <div
                  key={r.patente}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderRadius: 18,
                    padding: "24px 30px",
                    gap: 28,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#1d4ed8",
                      borderRadius: 12,
                      padding: "14px 20px",
                      fontSize: 34,
                      fontWeight: 700,
                      minWidth: 220,
                    }}
                  >
                    {r.patente}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
                    <span style={{ fontSize: 34, fontWeight: 700 }}>
                      {nombre(r.chofer_empleado_id) ?? "Sin chofer"}
                    </span>
                    <span style={{ fontSize: 27, color: "#94a3b8", marginTop: 4 }}>
                      {ayudantes ? `Ayudantes: ${ayudantes}` : "Sin ayudantes"}
                    </span>
                    {r.notas ? (
                      <span style={{ fontSize: 24, color: "#fbbf24", marginTop: 4 }}>{r.notas}</span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "auto",
            paddingTop: 30,
            fontSize: 22,
            color: "#475569",
          }}
        >
          <span>{rows.length} {rows.length === 1 ? "camión" : "camiones"}</span>
          <span>App DPO · Mercosur</span>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: alto,
      headers: {
        "Content-Disposition": `attachment; filename="salida-${fecha}.png"`,
        "Cache-Control": "no-store",
      },
    },
  )
}
