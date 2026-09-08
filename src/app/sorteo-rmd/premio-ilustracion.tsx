/**
 * Ilustración del premio del bimestre (un bulto de Stella Artois y una bolsa
 * de merchandising) para cuando todavía no hay foto real en
 * public/sorteo-rmd/premio.jpg.
 */
export function PremioIlustracion({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 170"
      role="img"
      aria-label="Un bulto de Stella Artois y merchandising"
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
        <linearGradient id="bolsa" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e293b" />
          <stop offset="1" stopColor="#0f172a" />
        </linearGradient>
      </defs>

      {/* sombra */}
      <ellipse cx="160" cy="158" rx="140" ry="8" fill="#0f172a" opacity="0.12" />

      <Bulto x={16} ancho={150} />
      <Merch x={190} ancho={110} />
    </svg>
  )
}

function Bulto({ x, ancho }: { x: number; ancho: number }) {
  const base = 150
  const altoCaja = 50
  const yCaja = base - altoCaja
  const anchoLata = 15
  const altoLata = 48
  const gap = 4
  const n = Math.floor((ancho - 16) / (anchoLata + gap))
  const inicio = x + (ancho - n * (anchoLata + gap) + gap) / 2
  return (
    <g>
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
      <rect x={x} y={yCaja} width={ancho} height={altoCaja} rx="4" fill="url(#caja)" />
      <rect x={x} y={yCaja} width={ancho} height="9" rx="4" fill="#991b1b" />
      <rect x={x + 10} y={yCaja + 17} width={ancho - 20} height="20" rx="3" fill="#fef3c7" />
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
        1 BULTO
      </text>
    </g>
  )
}

/** Bolsa de regalo con merchandising asomando. */
function Merch({ x, ancho }: { x: number; ancho: number }) {
  const base = 150
  const alto = 78
  const y = base - alto
  const cx = x + ancho / 2
  return (
    <g>
      {/* cosas asomando: gorra y vaso */}
      <path
        d={`M ${cx - 34} ${y + 4} q 14 -22 30 -4 l -2 6 q -14 -6 -26 0 z`}
        fill="#f59e0b"
      />
      <rect x={cx + 4} y={y - 16} width="22" height="24" rx="3" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.8" />
      <rect x={cx + 7} y={y - 6} width="16" height="6" fill="#b91c1c" />
      {/* manijas */}
      <path
        d={`M ${cx - 22} ${y + 10} q 0 -18 14 -18 M ${cx + 22} ${y + 10} q 0 -18 -14 -18`}
        fill="none"
        stroke="#334155"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* bolsa */}
      <rect x={x} y={y + 8} width={ancho} height={alto - 8} rx="5" fill="url(#bolsa)" />
      <rect x={x + 10} y={y + 26} width={ancho - 20} height="22" rx="3" fill="#fef3c7" />
      <text
        x={cx}
        y={y + 42}
        textAnchor="middle"
        fontSize="10"
        fontWeight="800"
        fill="#0f172a"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        letterSpacing="1"
      >
        MERCH
      </text>
      <text
        x={cx}
        y={y + 62}
        textAnchor="middle"
        fontSize="7.5"
        fontWeight="700"
        fill="#fcd34d"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        letterSpacing="0.8"
      >
        + REGALOS
      </text>
    </g>
  )
}
