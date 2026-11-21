// Íconos de línea simples (SVG inline, sin dependencias).
const RUTAS: Record<string, string> = {
  inicio: 'M3 11.5 12 4l9 7.5M5.5 10v10h5v-6h3v6h5V10',
  ejercicios: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  progreso: 'M3 20h18M5 16l4-5 4 3 6-8',
  historial: 'M5 6h14M5 12h14M5 18h10',
  perfil: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
  atras: 'M15 5l-7 7 7 7',
  adelante: 'M9 5l7 7-7 7',
  candado: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  play: 'M8 5.5v13l10.5-6.5z',
  telefono: 'M3 8h18v9H3zM6 8V7M18 12.5h.01',
  alerta: 'M12 4 2.5 20h19zM12 10v4.5M12 17.5h.01',
  escudo: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z',
  descarga: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
  mano: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4a1.5 1.5 0 0 1 3 0v8M14 11.5V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 0 1 2.5-1.6L8 14',
  calendario: 'M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4',
  pacientes: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5c2 .8 3.2 2.6 3.8 5.5',
  planes: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
  informes: 'M6 3h9l4 4v14H6zM9 17v-3M12.5 17v-6M16 17v-4',
  mas: 'M12 5v14M5 12h14',
  menos: 'M5 12h14',
  cerrar: 'M6 6l12 12M18 6 6 18',
  fuego: 'M12 21c4 0 7-2.8 7-7 0-3.5-2.5-6-4-8 0 2.5-1.5 4-3 4.5C12 7 10.5 4.5 9 3c0 4-4 6-4 11 0 4.2 3 7 7 7z',
  pausa: 'M8 5v14M16 5v14',
  reiniciar: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5',
  rotar: 'M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM21 9a9 9 0 0 1-3 7M10 18h4',
  camara: 'M3 7h4l2-3h6l2 3h4v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  luz: 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  regla: 'M3 16 16 3l5 5L8 21zM7 12l2 2M10 9l2 2M13 6l2 2',
  salir: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  buscar: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  campana: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  mensaje: 'M4 5h16v11H9l-5 4z',
  documento: 'M6 3h9l4 4v14H6zM14 3v5h5',
  objetivo: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
}

export function Icono({ nombre, tam = 22, grosor = 2, className }: { nombre: keyof typeof RUTAS | string; tam?: number; grosor?: number; className?: string }) {
  const d = RUTAS[nombre] ?? RUTAS.objetivo
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={grosor} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={d} />
    </svg>
  )
}

export function LogoMano({ tam = 40 }: { tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" aria-hidden="true">
      <path d="M32 44V16M23 42l-4-20M41 42l4-20M18 45l-7-12M46 45l7-12" />
      <path d="M20 44c3 8 21 8 24 0" />
    </svg>
  )
}
