// Mensajes de error para personas. Los errores del servidor (PostgREST, Auth) y del navegador llegan en inglés técnico
// ("JWT expired", "new row violates row-level security policy…", "Failed to fetch"); mostrados tal cual a un paciente no
// dicen nada. Aquí se cambian por una frase en español. Los mensajes que ya escribe la app o la base (en español) pasan
// sin tocar: la base responde, por ejemplo, «sesión cerrada: es inmutable».

const REGLAS: [RegExp, string][] = [
  [/failed to fetch|networkerror|load failed|network request failed|err_internet|fetch failed/i, 'Sin conexión. Revisa tu internet e intenta de nuevo.'],
  [/jwt|token (is )?expired|invalid (refresh )?token|not authenticated|session (not found|missing)/i, 'Tu sesión venció. Vuelve a entrar e intenta de nuevo.'],
  [/row-level security|permission denied|not authorized|insufficient.privilege/i, 'Tu cuenta no tiene permiso para hacer esto.'],
  [/duplicate key|already exists/i, 'Esto ya estaba guardado.'],
  [/timeout|timed out|canceling statement/i, 'El servidor tardó demasiado en responder. Intenta de nuevo.'],
  [
    /violates|constraint|invalid input|syntax error|pgrst\d*|could not find|does not exist|unexpected|undefined|null value|typeerror|is not a function|cannot read/i,
    'Algo salió mal al guardar o leer los datos. Intenta de nuevo.',
  ],
]

/** Cambia un mensaje técnico por uno en español. Acepta también frases compuestas ("No pudimos guardar: JWT expired"). */
export function mensajeLegible(texto: string): string {
  for (const [patron, frase] of REGLAS) {
    if (!patron.test(texto)) continue
    // Si la app ya puso un encabezado en español antes de los dos puntos, se conserva: «No pudimos guardar. …».
    const corte = texto.indexOf(': ')
    const cabeza = corte > 0 ? texto.slice(0, corte) : ''
    return cabeza && !REGLAS.some(([p]) => p.test(cabeza)) ? `${cabeza}. ${frase}` : frase
  }
  return texto
}

export function mensajeDeError(e: unknown): string {
  return mensajeLegible(e instanceof Error ? e.message : String(e))
}

/** ¿El error es de un trozo de la app que no se pudo bajar? (mensajes de Chromium, Safari y Firefox) */
export function esFalloDeCarga(e: unknown): boolean {
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e)
  return /dynamically imported module|importing a module script failed|error loading dynamically|ChunkLoadError|Unable to preload CSS/i.test(m)
}
