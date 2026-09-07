/**
 * Comprimir una foto en el browser ANTES de subirla a la IA.
 *
 * Una foto de cédula sacada con el celular pesa 4–8 MB y mide 4000 px de lado;
 * a la visión le alcanza con 2000 px y JPEG 0.85, que pesa ~10 veces menos. Se
 * gana tiempo de subida y se esquiva el tope de 10 MB sin pedirle nada al
 * usuario.
 *
 * CLIENT-ONLY: usa `createImageBitmap`, `<canvas>` y `Blob`. No tiene test
 * (vitest acá corre en node, sin DOM — ver vitest.config.ts) y no se importa
 * desde server components.
 *
 * Nunca lanza: si el archivo no es imagen, el browser no puede decodificarla
 * (HEIC en Chrome, por ejemplo) o cualquier paso falla, devuelve el `File`
 * original y el backend se arregla con él.
 */

export type OpcionesCompresion = {
  /** Lado mayor máximo en píxeles. */
  maxLado?: number
  /** Calidad JPEG 0–1. */
  calidad?: number
}

export async function comprimirImagen(
  file: File,
  { maxLado = 2000, calidad = 0.85 }: OpcionesCompresion = {},
): Promise<File> {
  if (typeof window === 'undefined') return file
  if (!(file.type || '').startsWith('image/')) return file
  // Un PNG/WebP chico ya está bien; recomprimir a JPEG le sacaría la
  // transparencia sin ganar nada.
  if (file.type !== 'image/jpeg' && file.size < 512 * 1024) return file

  try {
    const bitmap = await decodificar(file)
    if (!bitmap) return file
    const { width, height } = bitmap
    const escala = Math.min(1, maxLado / Math.max(width, height))
    // Ya cabe y ya es JPEG liviano: no vale la pena tocarla.
    if (escala === 1 && file.type === 'image/jpeg' && file.size < 1024 * 1024) {
      cerrar(bitmap)
      return file
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * escala))
    canvas.height = Math.max(1, Math.round(height * escala))
    const ctx = canvas.getContext('2d')
    if (!ctx) { cerrar(bitmap); return file }
    // Fondo blanco: un PNG con transparencia se vería negro en JPEG.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    cerrar(bitmap)

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', calidad))
    if (!blob || blob.size === 0) return file
    // Si comprimir no achicó (foto ya optimizada), el original es mejor.
    if (blob.size >= file.size && escala === 1) return file

    const nombre = file.name.replace(/\.[^.]+$/, '') || 'foto'
    return new File([blob], `${nombre}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}

type Decodificada = ImageBitmap | HTMLImageElement

/** createImageBitmap (rápido, respeta EXIF en Chrome/Safari) con fallback a <img>. */
async function decodificar(file: File): Promise<Decodificada | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    } catch {
      // Cae al <img>.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement | null>(resolve => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function cerrar(b: Decodificada) {
  if ('close' in b && typeof b.close === 'function') b.close()
}
