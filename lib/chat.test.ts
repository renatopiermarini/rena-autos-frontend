/**
 * Lo que fija este suite (lib/chat.ts, el módulo puro del chat y la campana):
 *   · los botones Sí/No aparecen SÓLO ante el prompt del gate del backend;
 *   · el polling fusiona sin duplicar y sabe desde dónde pedir la próxima vez;
 *   · el "escribiendo…" mira la fila del usuario, no la última del hilo;
 *   · el agrupado por día dice "Hoy"/"Ayer" y respeta el orden;
 *   · un archivo se rechaza acá antes de subir 10MB por la red del celular.
 */
import { describe, it, expect } from 'vitest'
import {
  ID_TEMPORAL_BASE, type ChatMensaje, type Notificacion,
  agruparPorDia, esImagen, esPromptConfirmacion, esTemporal, estaEscribiendo,
  etiquetaDia, hastaIdVisible, idTemporal, mergeMensajes, ofreceSiNo, textoBadge,
  tiempoRelativo, ultimoIdServidor, validarArchivo,
} from '@/lib/chat'

const msg = (p: Partial<ChatMensaje> & { id: number }): ChatMensaje => ({
  rol: 'bot', texto: '', ...p,
})

// El prompt EXACTO que arma rena-autos-api flows/confirmation.build_confirmation_prompt.
const PROMPT_GATE = '📝 ¿Confirmás esto?\n\negreso $200 de cash — nafta\n\nRespondé *sí* o *no*.'
const PROMPT_GATE_MULTI =
  '📝 ¿Confirmás estas 2 acciones?\n\n1) uno\n2) dos\n\nRespondé *sí* o *no*.'

describe('esPromptConfirmacion', () => {
  it('reconoce el prompt del gate, en singular y en plural', () => {
    expect(esPromptConfirmacion(PROMPT_GATE)).toBe(true)
    expect(esPromptConfirmacion(PROMPT_GATE_MULTI)).toBe(true)
  })

  it('NO alcanza con un "¿Confirmás?" suelto en medio de la charla', () => {
    expect(esPromptConfirmacion('Anoto: egreso $200 de cash — nafta. ¿Confirmás?')).toBe(false)
  })

  it('NO alcanza con un "sí o no" sin el ¿Confirmás', () => {
    expect(esPromptConfirmacion('Esto quedó SIN guardar.\n\nRespondé *sí* o *no*.')).toBe(false)
  })

  it('tolera que los asteriscos se hayan limpiado al pintar', () => {
    expect(esPromptConfirmacion('¿Confirmás esto?\n\nx\n\nRespondé sí o no.')).toBe(true)
  })

  it('no explota con vacío ni con null', () => {
    expect(esPromptConfirmacion('')).toBe(false)
    expect(esPromptConfirmacion(null)).toBe(false)
    expect(esPromptConfirmacion(undefined)).toBe(false)
  })
})

describe('ofreceSiNo', () => {
  it('sí cuando el ÚLTIMO mensaje es el prompt del bot', () => {
    expect(ofreceSiNo([
      msg({ id: 1, rol: 'user', texto: 'anotá 200 de nafta' }),
      msg({ id: 2, rol: 'bot', texto: PROMPT_GATE }),
    ])).toBe(true)
  })

  it('no si después vino cualquier otra cosa — la pregunta ya no está abierta', () => {
    expect(ofreceSiNo([
      msg({ id: 2, rol: 'bot', texto: PROMPT_GATE }),
      msg({ id: 3, rol: 'user', texto: 'sí' }),
    ])).toBe(false)
    expect(ofreceSiNo([
      msg({ id: 2, rol: 'bot', texto: PROMPT_GATE }),
      msg({ id: 3, rol: 'sistema', texto: 'Hubo un error.' }),
    ])).toBe(false)
  })

  it('no si el prompt lo dijo el sistema y no el bot', () => {
    expect(ofreceSiNo([msg({ id: 1, rol: 'sistema', texto: PROMPT_GATE })])).toBe(false)
  })

  it('no con el hilo vacío', () => {
    expect(ofreceSiNo([])).toBe(false)
  })
})

describe('mergeMensajes', () => {
  it('fusiona por id sin duplicar y deja todo ordenado', () => {
    const out = mergeMensajes(
      [msg({ id: 3 }), msg({ id: 1 })],
      [msg({ id: 2 }), msg({ id: 3, texto: 'nuevo' })],
    )
    expect(out.map(m => m.id)).toEqual([1, 2, 3])
    expect(out[2].texto).toBe('nuevo')
  })

  it('el server pisa a la burbuja optimista con su estado autoritativo', () => {
    const optimista = msg({ id: 7, rol: 'user', texto: 'hola', pendienteLocal: true, estado: 'pendiente' })
    const [fila] = mergeMensajes([optimista], [msg({ id: 7, rol: 'user', texto: 'hola', estado: 'listo' })])
    expect(fila.estado).toBe('listo')
    expect(fila.pendienteLocal).toBeUndefined()
  })

  it('los ids temporales ordenan al final, que es donde va lo recién escrito', () => {
    const out = mergeMensajes([msg({ id: 5 })], [msg({ id: idTemporal(1) }), msg({ id: 9 })])
    expect(out.map(m => m.id)).toEqual([5, 9, ID_TEMPORAL_BASE + 1])
  })

  it('descarta filas sin id numérico en vez de meter basura en la lista', () => {
    const out = mergeMensajes([], [{ id: undefined } as unknown as ChatMensaje, msg({ id: 4 })])
    expect(out.map(m => m.id)).toEqual([4])
  })

  it('tolera listas nulas', () => {
    expect(mergeMensajes(null as unknown as ChatMensaje[], [msg({ id: 1 })])).toHaveLength(1)
    expect(mergeMensajes([msg({ id: 1 })], null as unknown as ChatMensaje[])).toHaveLength(1)
  })
})

describe('ultimoIdServidor / esTemporal', () => {
  it('ignora los temporales: el after_id se arma con ids reales', () => {
    expect(ultimoIdServidor([msg({ id: 4 }), msg({ id: idTemporal(2) }), msg({ id: 11 })])).toBe(11)
  })

  it('cero con la lista vacía', () => {
    expect(ultimoIdServidor([])).toBe(0)
  })

  it('un rowid de D1 nunca cae en el rango temporal', () => {
    expect(esTemporal(999_999)).toBe(false)
    expect(esTemporal(idTemporal(1))).toBe(true)
  })
})

describe('estaEscribiendo', () => {
  it('sí mientras la fila del usuario está pendiente o procesando', () => {
    expect(estaEscribiendo([msg({ id: 1, rol: 'user', estado: 'pendiente' })])).toBe(true)
    expect(estaEscribiendo([msg({ id: 1, rol: 'user', estado: 'procesando' })])).toBe(true)
  })

  it('sí con la burbuja optimista que todavía no volvió de /enviar', () => {
    expect(estaEscribiendo([msg({ id: idTemporal(1), rol: 'user', pendienteLocal: true })])).toBe(true)
  })

  it('no una vez que el turno terminó', () => {
    expect(estaEscribiendo([
      msg({ id: 1, rol: 'user', estado: 'listo' }),
      msg({ id: 2, rol: 'bot', texto: 'listo' }),
    ])).toBe(false)
  })

  it('no si el envío falló del lado del browser', () => {
    expect(estaEscribiendo([
      msg({ id: idTemporal(1), rol: 'user', errorLocal: 'sin red' }),
    ])).toBe(false)
  })

  it('sigue diciendo que sí mientras llegan notas de progreso del sistema', () => {
    // El turno todavía corre: las notas 'sistema' no lo cierran.
    expect(estaEscribiendo([
      msg({ id: 1, rol: 'user', estado: 'procesando' }),
      msg({ id: 2, rol: 'sistema', texto: 'Buscando en el stock…' }),
    ])).toBe(true)
  })

  it('no si el usuario nunca habló', () => {
    expect(estaEscribiendo([msg({ id: 1, rol: 'bot', texto: 'hola' })])).toBe(false)
    expect(estaEscribiendo([])).toBe(false)
  })
})

describe('etiquetaDia / agruparPorDia', () => {
  const HOY = '2026-08-27'

  it('nombra hoy, ayer y el resto por fecha', () => {
    expect(etiquetaDia('2026-08-27', HOY)).toBe('Hoy')
    expect(etiquetaDia('2026-08-26', HOY)).toBe('Ayer')
    expect(etiquetaDia('2026-08-20', HOY)).toBe('20/08/26')
  })

  it('el "ayer" del primero de mes es el último del mes anterior', () => {
    expect(etiquetaDia('2026-07-31', '2026-08-01')).toBe('Ayer')
  })

  it('parte el hilo en días y respeta el orden de entrada', () => {
    const grupos = agruparPorDia([
      msg({ id: 1, created_at: '2026-08-26T10:00:00-03:00', texto: 'a' }),
      msg({ id: 2, created_at: '2026-08-26T11:00:00-03:00', texto: 'b' }),
      msg({ id: 3, created_at: '2026-08-27T09:00:00-03:00', texto: 'c' }),
    ], HOY)
    expect(grupos.map(g => g.etiqueta)).toEqual(['Ayer', 'Hoy'])
    expect(grupos[0].mensajes.map(m => m.texto)).toEqual(['a', 'b'])
    expect(grupos[1].mensajes.map(m => m.texto)).toEqual(['c'])
  })

  it('la burbuja optimista sin created_at cae en hoy, que es donde el ojo la espera', () => {
    const grupos = agruparPorDia([msg({ id: idTemporal(1), rol: 'user', texto: 'hola' })], HOY)
    expect(grupos).toHaveLength(1)
    expect(grupos[0].etiqueta).toBe('Hoy')
  })

  it('sin mensajes no hay separadores', () => {
    expect(agruparPorDia([], HOY)).toEqual([])
  })
})

describe('tiempoRelativo', () => {
  const AHORA = new Date('2026-08-27T12:00:00-03:00').getTime()
  const hace = (ms: number) => new Date(AHORA - ms).toISOString()

  it('escalona minutos, horas y días', () => {
    expect(tiempoRelativo(hace(10_000), AHORA)).toBe('recién')
    expect(tiempoRelativo(hace(5 * 60_000), AHORA)).toBe('hace 5 min')
    expect(tiempoRelativo(hace(3 * 3_600_000), AHORA)).toBe('hace 3 h')
    expect(tiempoRelativo(hace(2 * 86_400_000), AHORA)).toBe('hace 2 d')
  })

  it('de una semana en adelante muestra la fecha', () => {
    expect(tiempoRelativo('2026-08-01T12:00:00-03:00', AHORA)).toBe('01/08/26')
  })

  it('un reloj adelantado del cliente no muestra "hace -3 min"', () => {
    expect(tiempoRelativo(new Date(AHORA + 180_000).toISOString(), AHORA)).toBe('recién')
  })

  it('vacío si no hay fecha', () => {
    expect(tiempoRelativo(null, AHORA)).toBe('')
    expect(tiempoRelativo('mañana', AHORA)).toBe('')
  })
})

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
    const max = 10 * 1024 * 1024
    expect(validarArchivo({ nombre: 'x.pdf', mime: 'application/pdf', bytes: max })).toBeNull()
    expect(validarArchivo({ nombre: 'x.pdf', mime: 'application/pdf', bytes: max + 1 })).not.toBeNull()
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
})

describe('esImagen', () => {
  it('mira el tipo del backend y, si no, el mime', () => {
    expect(esImagen({ url: '', tipo: 'imagen', nombre: '', mime: '' })).toBe(true)
    expect(esImagen({ url: '', tipo: 'documento', nombre: '', mime: 'image/png' })).toBe(true)
    expect(esImagen({ url: '', tipo: 'documento', nombre: '', mime: 'application/pdf' })).toBe(false)
    expect(esImagen(null)).toBe(false)
  })
})

describe('campana', () => {
  const noti = (p: Partial<Notificacion> & { id: number }): Notificacion => ({
    texto: '', nivel: 'info', link: null, leida: false, ...p,
  })

  it('hastaIdVisible es el id más alto PINTADO, no el de la tabla', () => {
    expect(hastaIdVisible([noti({ id: 3 }), noti({ id: 9 }), noti({ id: 5 })])).toBe(9)
    expect(hastaIdVisible([])).toBe(0)
  })

  it('el globito se capa en 99+ y desaparece en cero', () => {
    expect(textoBadge(0)).toBe('')
    expect(textoBadge(1)).toBe('1')
    expect(textoBadge(99)).toBe('99')
    expect(textoBadge(120)).toBe('99+')
    expect(textoBadge(NaN)).toBe('')
  })
})
