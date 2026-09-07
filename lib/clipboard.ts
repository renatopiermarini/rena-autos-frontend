/**
 * Copiar al portapapeles.
 *
 * `navigator.clipboard` no existe en contexto inseguro ni en algunos WebView
 * viejos de Android. Ahí cae al truco del textarea + execCommand, que es feo
 * pero es lo que separa "copiar de un toque" de "no anda". Devuelve si pudo,
 * para no mentir con el toast.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    // Sigue al fallback.
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
