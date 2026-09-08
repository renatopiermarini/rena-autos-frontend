/**
 * Lo que fija este suite (lib/archivos.ts):
 *   · un archivo se rechaza acá antes de subir 10MB por la red;
 *   · los tipos son EXACTAMENTE los del backend, con fallback por extensión
 *     para los celulares que no mandan mime;
 *   · imagen vs documento se decide por tipo, mime o extensión, en ese orden.
 */
import { describe, it, expect } from 'vitest'
import { ACCEPT_ARCHIVO, MAX_BYTES_ARCHIVO, esImagen, validarArchivo, validarFile } from '@/lib/archivos'

describe('validarArchivo', () => {
  it('acepta los tipos que acepta el backend', () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']) {
      expect(validarArchivo({ nombre: 'x', mime, bytes: 1024 })).toBeNull()
    }
  })

  it('rechaza por tamaño diciendo cuánto pesa', () => {
    const err = validarArchivo({ nombre: 'foto.jpg', mime: 'image/jpeg', bytes: 12 * 1024 * 1024 })
    expect(err).toContain('12.0MB')
    expect(err).toContain('10MB')
  })

  it('acepta 10MB clavados y rechaza un byte más', () => {
    expect(validarArchivo({ nombre: 'x.pdf', mime: 'application/pdf', bytes: MAX_BYTES_ARCHIVO })).toBeNull()
    expect(validarArchivo({ nombre: 'x.pdf', mime: 'application/pdf', bytes: MAX_BYTES_ARCHIVO + 1 })).not.toBeNull()
  })

  it('rechaza un archivo vacío', () => {
    expect(validarArchivo({ nombre: 'x.jpg', mime: 'image/jpeg', bytes: 0 })).toBe('El archivo está vacío.')
  })

  it('cae a la extensión cuando el celular no manda mime (HEIC en Android)', () => {
    expect(validarArchivo({ nombre: 'IMG_0042.HEIC', mime: '', bytes: 2048 })).toBeNull()
    expect(validarArchivo({ nombre: 'boleto.pdf', mime: 'application/octet-stream', bytes: 2048 })).toBeNull()
  })

  it('rechaza lo que no es foto ni PDF', () => {
    const err = validarArchivo({ nombre: 'planilla.xlsx', mime: 'application/vnd.ms-excel', bytes: 2048 })
    expect(err).toContain('Sólo se pueden mandar fotos')
  })

  it('validarFile lee nombre/mime/tamaño del File', () => {
    expect(validarFile(new File([new Uint8Array(4)], 'cedula.jpg', { type: 'image/jpeg' }))).toBeNull()
    expect(validarFile(new File([], 'vacio.jpg', { type: 'image/jpeg' }))).toBe('El archivo está vacío.')
  })

  it('el accept del input cubre imágenes y PDF', () => {
    expect(ACCEPT_ARCHIVO).toContain('image/*')
    expect(ACCEPT_ARCHIVO).toContain('application/pdf')
  })
})

describe('esImagen', () => {
  it('mira el tipo explícito, después el mime y al final la extensión', () => {
    expect(esImagen({ tipo: 'imagen', mime: '' })).toBe(true)
    expect(esImagen({ tipo: 'documento', mime: 'image/png' })).toBe(true)
    expect(esImagen({ mime: 'application/pdf' })).toBe(false)
    expect(esImagen({ mime: '', nombre: 'IMG_0042.HEIC' })).toBe(true)
    expect(esImagen({ mime: '', nombre: 'boleto.pdf' })).toBe(false)
    expect(esImagen(null)).toBe(false)
  })
})
