/**
 * Lo que fija este suite (lib/ia.ts):
 *   · la IA llena sólo lo vacío, nunca pisa lo que el usuario escribió;
 *   · null/undefined/'' no borran nada; lo que el form no tiene se ignora;
 *   · dominio en mayúsculas sin espacios, strings recortados, tipo conservado;
 *   · tocar un campo lo saca del Set; limpiar restaura los iniciales.
 */
import { describe, it, expect } from 'vitest'
import { aplicarSugerencia, limpiarSugerencias, marcarTocado } from '@/lib/ia'

const INICIAL = { marca: '', modelo: '', anio: '', dominio: '', color: 'Gris', km: 0 }

describe('aplicarSugerencia', () => {
  it('llena los campos vacíos y los marca como IA', () => {
    const { form, camposIa } = aplicarSugerencia(INICIAL, { marca: 'Ford', modelo: 'Focus' })
    expect(form.marca).toBe('Ford')
    expect(form.modelo).toBe('Focus')
    expect(Array.from(camposIa).sort()).toEqual(['marca', 'modelo'])
  })

  it('NO pisa lo que el usuario ya escribió, salvo con pisar', () => {
    const base = { ...INICIAL, marca: 'Chevrolet' }
    const sin = aplicarSugerencia(base, { marca: 'Ford' })
    expect(sin.form.marca).toBe('Chevrolet')
    expect(sin.camposIa.has('marca')).toBe(false)

    const con = aplicarSugerencia(base, { marca: 'Ford' }, { pisar: true })
    expect(con.form.marca).toBe('Ford')
    expect(con.camposIa.has('marca')).toBe(true)
  })

  it('un valor no-vacío del inicial (color por defecto) también cuenta como escrito', () => {
    const { form, camposIa } = aplicarSugerencia(INICIAL, { color: 'Rojo' })
    expect(form.color).toBe('Gris')
    expect(camposIa.size).toBe(0)
  })

  it('ignora null, undefined y vacíos: la IA no borra nada', () => {
    const { form, camposIa } = aplicarSugerencia(INICIAL, { marca: null, modelo: undefined, anio: '  ' })
    expect(form).toEqual(INICIAL)
    expect(camposIa.size).toBe(0)
  })

  it('ignora claves que el form no tiene', () => {
    const { form, camposIa } = aplicarSugerencia(INICIAL, { titular_nombre: 'Juan' } as any)
    expect(form).toEqual(INICIAL)
    expect(camposIa.size).toBe(0)
    expect('titular_nombre' in form).toBe(false)
  })

  it('recorta strings y pone el dominio en mayúsculas sin espacios', () => {
    const { form } = aplicarSugerencia(INICIAL, { marca: '  Ford ', dominio: ' ab 123 cd ' })
    expect(form.marca).toBe('Ford')
    expect(form.dominio).toBe('AB123CD')
  })

  it('conserva el tipo del campo del form (string ↔ number)', () => {
    const { form } = aplicarSugerencia(INICIAL, { anio: 2019 })
    expect(form.anio).toBe('2019')
    // km: 0 no es "vacío" (un 0 puede ser real), así que sólo entra con pisar.
    const pisado = aplicarSugerencia(INICIAL, { km: '120000' }, { pisar: true })
    expect(pisado.form.km).toBe(120000)
    expect(aplicarSugerencia(INICIAL, { km: '120000' }).form.km).toBe(0)
  })

  it('no muta el form de entrada', () => {
    const copia = { ...INICIAL }
    aplicarSugerencia(copia, { marca: 'Ford' })
    expect(copia).toEqual(INICIAL)
  })
})

describe('marcarTocado', () => {
  it('devuelve un Set nuevo sin ese campo', () => {
    const antes = new Set<keyof typeof INICIAL>(['marca', 'modelo'])
    const despues = marcarTocado(antes, 'marca')
    expect(despues).not.toBe(antes)
    expect(Array.from(despues)).toEqual(['modelo'])
    expect(antes.has('marca')).toBe(true)
  })

  it('si el campo no estaba, devuelve el mismo Set (sin re-render gratuito)', () => {
    const antes = new Set<keyof typeof INICIAL>(['marca'])
    expect(marcarTocado(antes, 'km')).toBe(antes)
  })
})

describe('limpiarSugerencias', () => {
  it('restaura los campos de la IA y deja lo escrito a mano', () => {
    const { form: lleno, camposIa } = aplicarSugerencia(INICIAL, { marca: 'Ford', modelo: 'Focus' })
    const editado = { ...lleno, anio: '2019' }
    const { form, camposIa: vacio } = limpiarSugerencias(editado, camposIa, INICIAL)
    expect(form.marca).toBe('')
    expect(form.modelo).toBe('')
    expect(form.anio).toBe('2019')
    expect(vacio.size).toBe(0)
  })
})
