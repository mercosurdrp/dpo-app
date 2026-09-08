/**
 * Ilustración de los dos bultos del sorteo (lata y latón) para cuando todavía
 * no hay foto real en public/sorteo-rmd/premio.jpg.
 */
export function PremioIlustracion({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 170"
      role="img"
      aria-label="Un bulto de Stella Artois lata y un bulto de Stella Artois latón"
      className={className}
    >
      <defs>
        <linearGradient id="lata" x1="0" x2="1">
          <stop offset="0" stopColor="#f8fafc" />
          <stop offset="0.5" stopColor="#cbd5e1" />
          <stop offset="1" stopColor="#94a3b8" />
        </linearGradient>
        <linearGradient id="caja" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b91c1c" />
          <stop offset="1" stopColor="#7f1d1d" />
        </linearGradient>
      </defs>

      {/* sombra */}
      <ellipse cx="160" cy="158" rx="140" ry="8" fill="#0f172a" opacity="0.12" />

      <Bulto x={20} ancho={130} altoLata={44} anchoLata={14} etiqueta="LATA" />
      <Bulto x={170} ancho={130} altoLata={58} anchoLata={17} etiqueta="LATÓN" />
    </svg>
  )
}

function Bulto({
  x,
  ancho,
  altoLata,
  anchoLata,
  etiqueta,
}: {
  x: number
  ancho: number
  altoLata: number
  anchoLata: number
  etiqueta: string
}) {
  const base = 150
  const altoCaja = 50
  const yCaja = base - altoCaja
  const gap = 4
  const n = Math.floor((ancho - 16) / (anchoLata + gap))
  const inicio = x + (ancho - n * (anchoLata + gap) + gap) / 2
  return (
    <g>
      {/* latas asomando */}
      {Array.from({ length: n }).map((_, i) => {
        const lx = inicio + i * (anchoLata + gap)
        const ly = yCaja - altoLata + 10
        return (
          <g key={i}>
            <rect
              x={lx}
              y={ly}
              width={anchoLata}
              height={altoLata}
              rx={anchoLata / 4}
              fill="url(#lata)"
              stroke="#64748b"
              strokeWidth="0.6"
            />
            <rect
              x={lx + 1.5}
              y={ly + altoLata * 0.3}
              width={anchoLata - 3}
              height={altoLata * 0.36}
              fill="#b91c1c"
            />
            <rect
              x={lx + 1.5}
              y={ly + altoLata * 0.42}
              width={anchoLata - 3}
              height={altoLata * 0.1}
              fill="#fef3c7"
            />
            <ellipse
              cx={lx + anchoLata / 2}
              cy={ly}
              rx={anchoLata / 2}
              ry={2.2}
              fill="#e2e8f0"
              stroke="#64748b"
              strokeWidth="0.6"
            />
          </g>
        )
      })}
      {/* caja */}
      <rect
        x={x}
        y={yCaja}
        width={ancho}
        height={altoCaja}
        rx="4"
        fill="url(#caja)"
      />
      <rect
        x={x}
        y={yCaja}
        width={ancho}
        height="9"
        rx="4"
        fill="#991b1b"
      />
      <rect
        x={x + 10}
        y={yCaja + 17}
        width={ancho - 20}
        height="20"
        rx="3"
        fill="#fef3c7"
      />
      <text
        x={x + ancho / 2}
        y={yCaja + 31}
        textAnchor="middle"
        fontSize="11"
        fontWeight="800"
        fill="#7f1d1d"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        letterSpacing="0.5"
      >
        STELLA ARTOIS
      </text>
      <text
        x={x + ancho / 2}
        y={yCaja + 46}
        textAnchor="middle"
        fontSize="8"
        fontWeight="700"
        fill="#fef3c7"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        letterSpacing="1"
      >
        1 BULTO · {etiqueta}
      </text>
    </g>
  )
}
