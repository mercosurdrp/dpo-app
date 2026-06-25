import { ImageResponse } from "next/og"

// Tarjeta de KPI a renderizar en la imagen de evidencia.
export interface EvidenciaKpi {
  label: string
  value: string
  sub?: string
}

export interface EvidenciaOpts {
  tipo: "rmd" | "nps"
  titulo: string
  // Fecha de la reunión en ISO (YYYY-MM-DD) o ISO completo.
  fecha: string
  kpis: EvidenciaKpi[]
  // Texto chico al pie (p. ej. "Actualizado al ...").
  pie?: string
}

const TEMAS = {
  rmd: { primario: "#7c3aed", claro: "#f5f3ff", borde: "#ddd6fe" },
  nps: { primario: "#0284c7", claro: "#f0f9ff", borde: "#bae6fd" },
} as const

function fmtFecha(iso: string): string {
  const d = (iso ?? "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return ""
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y}`
}

/**
 * Genera un PNG (imagen-resumen) con los KPIs del día de la sección RMD/NPS,
 * para dejarlo como evidencia automática en la reunión Ventas-Logística.
 * No es un screenshot del dashboard: es una tarjeta con los números reales.
 */
export async function renderEvidenciaDiaPng(
  opts: EvidenciaOpts,
): Promise<Uint8Array> {
  const t = TEMAS[opts.tipo]
  const resp = new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* Barra superior con el color del tema */}
        <div style={{ display: "flex", height: "14px", backgroundColor: t.primario }} />

        {/* Encabezado */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            padding: "40px 56px 24px 56px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: "30px", color: "#64748b" }}>
              Reunion Ventas-Logistica
            </div>
            <div
              style={{
                display: "flex",
                fontSize: "62px",
                fontWeight: 700,
                color: t.primario,
              }}
            >
              {opts.titulo}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
            }}
          >
            <div style={{ display: "flex", fontSize: "26px", color: "#94a3b8" }}>
              Captura del dia
            </div>
            <div
              style={{
                display: "flex",
                fontSize: "44px",
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              {fmtFecha(opts.fecha)}
            </div>
          </div>
        </div>

        {/* Grilla de KPIs */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "20px",
            padding: "8px 56px 0 56px",
          }}
        >
          {opts.kpis.slice(0, 6).map((k, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                width: "352px",
                padding: "22px 26px",
                borderRadius: "18px",
                backgroundColor: t.claro,
                border: `2px solid ${t.borde}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: "24px",
                  color: "#64748b",
                  textTransform: "uppercase",
                }}
              >
                {k.label}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: "60px",
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {k.value}
              </div>
              {k.sub ? (
                <div style={{ display: "flex", fontSize: "22px", color: "#94a3b8" }}>
                  {k.sub}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flex: 1 }} />

        {/* Pie */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "24px 56px 36px 56px",
            fontSize: "22px",
            color: "#94a3b8",
          }}
        >
          <div style={{ display: "flex" }}>
            Evidencia automatica - dpo-app
          </div>
          <div style={{ display: "flex" }}>{opts.pie ?? ""}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
  const buf = await resp.arrayBuffer()
  return new Uint8Array(buf)
}
