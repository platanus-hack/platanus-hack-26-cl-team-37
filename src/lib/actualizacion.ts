// Actualización sola de la PWA. El service worker nuevo ya se instala y toma el control solo (vite.config.ts:
// skipWaiting + clientsClaim), pero la pantalla abierta sigue con el código viejo hasta recargarla: un teléfono que ya
// tenía la app mostraba la versión anterior la primera vez después de cada deploy. Aquí se recarga en cuanto cambia el
// service worker, salvo en pantallas donde recargar haría perder algo (una sesión en curso, un formulario a medio llenar):
// ahí se espera a que la persona salga de esa pantalla.

/** Pantallas donde no se recarga: la sesión (preparar → calibrar → jugar → sensación → resumen), el acceso, la
 *  privacidad (confirmaciones) y el plan que edita el terapeuta. */
const NO_RECARGAR = /^\/(sesion\/|acceso|privacidad|terapeuta\/pacientes\/[^/]+\/plan)/

export function puedeRecargar(ruta: string): boolean {
  return !NO_RECARGAR.test(ruta)
}

export function actualizarSola(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const sw = navigator.serviceWorker
  // Sin controlador al cargar = primera visita: el service worker que se instala ahora no es una versión nueva.
  const habiaVersion = sw.controller !== null
  let pendiente = false

  const recargarSiSePuede = () => {
    if (puedeRecargar(location.pathname)) location.reload()
    else pendiente = true
  }

  sw.addEventListener('controllerchange', () => {
    if (habiaVersion) recargarSiSePuede()
  })
  // Si llegó durante una sesión, recargar apenas se salga de esas pantallas (la app navega sin recargar).
  setInterval(() => {
    if (pendiente && puedeRecargar(location.pathname)) location.reload()
  }, 2_000)
  // Una PWA que vuelve del segundo plano no navega, así que el navegador no busca versión nueva: se le pide aquí.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sw.getRegistration().then((r) => r?.update()).catch(() => {})
  })
}
