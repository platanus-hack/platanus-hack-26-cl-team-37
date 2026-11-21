// Miniaturas SVG propias de cada juego (catálogo /ejercicios). La clave es `Juego.miniatura` del registro.
import type { ReactNode } from 'react'

// Solo colores del brandbook (brandbook/paleta.css): pasteles de relleno y marino para líneas y detalles.
const MADERA = 'var(--kuwu-amarillo-suave)'
const C = {
  rojo: 'var(--kuwu-rojo)',
  amarillo: 'var(--kuwu-amarillo)',
  azul: 'var(--kuwu-azul)',
  menta: 'var(--kuwu-menta)',
  marino: 'var(--kuwu-marino)',
  blanco: 'var(--kuwu-blanco)',
  linea: 'var(--kuwu-control)',
}

const DIBUJOS: Record<string, ReactNode> = {
  caja: (
    <>
      <path d="M0 46h100v38a16 16 0 0 1-16 16H16A16 16 0 0 1 0 84z" fill={MADERA} />
      <rect x="14" y="42" width="26" height="26" rx="5" fill={C.rojo} />
      <circle cx="58" cy="62" r="12" fill={C.amarillo} />
      <rect x="68" y="32" width="20" height="30" rx="10" fill={C.azul} />
      <rect x="30" y="70" width="26" height="16" rx="8" fill={C.menta} />
    </>
  ),
  torre: (
    <>
      <path d="M0 78h100v6a16 16 0 0 1-16 16H16A16 16 0 0 1 0 84z" fill={MADERA} />
      <rect x="35" y="56" width="30" height="22" rx="3" fill={C.azul} />
      <rect x="37" y="35" width="26" height="21" rx="3" fill={C.amarillo} />
      <rect x="40" y="16" width="20" height="19" rx="3" fill={C.rojo} />
    </>
  ),
  pinza: (
    <>
      <line x1="35" y1="44" x2="65" y2="58" stroke={C.linea} strokeWidth="2.5" strokeDasharray="4 4" strokeLinecap="round" />
      <circle cx="35" cy="44" r="9" fill={C.amarillo} />
      <circle cx="65" cy="58" r="9" fill={C.azul} />
    </>
  ),
  burbujas: (
    <g fill="none" strokeWidth="3">
      <circle cx="31" cy="36" r="14" stroke={C.azul} />
      <circle cx="68" cy="56" r="10.5" stroke={C.menta} />
      <circle cx="39" cy="72" r="7.5" stroke={C.amarillo} />
    </g>
  ),
  movilidad: (
    <>
      <g fill={C.azul}>
        <rect x="33" y="48" width="34" height="30" rx="12" />
        <rect x="34" y="22" width="8" height="34" rx="4" />
        <rect x="44" y="16" width="8" height="38" rx="4" />
        <rect x="54" y="19" width="8" height="36" rx="4" />
        <rect x="63" y="27" width="7" height="30" rx="3.5" />
      </g>
      <line x1="38" y1="68" x2="23" y2="50" stroke={C.azul} strokeWidth="8" strokeLinecap="round" />
      <path d="M22 88q28 10 56 0" fill="none" stroke={C.amarillo} strokeWidth="3" strokeLinecap="round" />
      <path d="M72 83l6 5-7 3" fill="none" stroke={C.amarillo} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  naranja: (
    <>
      <circle cx="40" cy="56" r="20" fill={C.amarillo} />
      <path d="M40 36c2-7 8-10 14-9-2 6-7 9-14 9z" fill={C.menta} />
      <path d="M64 50h20l-3 32H67z" fill={C.blanco} stroke={C.marino} strokeWidth="2" />
      <path d="M65.5 62h17l-1.8 20H67.3z" fill={C.amarillo} />
    </>
  ),
  memoria: (
    <>
      <rect x="18" y="18" width="28" height="30" rx="4" fill={C.blanco} />
      <circle cx="32" cy="33" r="7" fill={C.amarillo} />
      <rect x="54" y="18" width="28" height="30" rx="4" fill={C.marino} />
      <rect x="18" y="54" width="28" height="30" rx="4" fill={C.marino} />
      <rect x="54" y="54" width="28" height="30" rx="4" fill={C.blanco} />
      <path d="M68 62l7 13H61z" fill={C.rojo} />
    </>
  ),
  piano: (
    <>
      {[C.azul, C.menta, C.amarillo, C.rojo, C.azul].map((c, i) => (
        <rect key={i} x={16 + i * 14} y={i === 2 ? 30 : 24} width="12" height={i === 2 ? 54 : 60} rx="3" fill={c} opacity={i === 2 ? 1 : 0.8} />
      ))}
    </>
  ),
}

export function Miniatura({ clave, tam = 92 }: { clave: string; tam?: number }) {
  return (
    <svg className="miniatura" width={tam} height={tam} viewBox="0 0 100 100" aria-hidden="true" data-miniatura={clave}>
      {DIBUJOS[clave] ?? <circle cx="50" cy="50" r="16" fill="none" stroke={C.linea} strokeWidth="3" />}
    </svg>
  )
}
