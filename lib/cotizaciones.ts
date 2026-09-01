/**
 * Cotizaciones con el colega cotizador — feature de la instancia de RENATO,
 * no del producto: el reactor del bot que llena la tabla `cotizaciones` sólo
 * existe en su instancia (PHONE_COLEGA_COTIZADOR). TM Motors y cualquier
 * agencia futura no tienen colega ni tabla, y un ítem de nav que lleva a una
 * pantalla siempre vacía es peor que no tenerlo.
 *
 * Módulo PURO (sin Next, sin fetch): lo usan el layout, la page y el test.
 */

/**
 * La clave de config_negocio que enciende la pantalla en una instancia con la
 * config ya cargada. Valor "1" = visible; cualquier otra cosa = oculta.
 */
export const COTIZACIONES_CONFIG_KEY = 'cotizaciones_colega'

/**
 * ¿Esta instancia muestra "Cotizaciones"? Misma regla que mensajesHabilitados
 * (lib/mensajes.ts), por la misma razón:
 *
 *   · config_negocio SIN cargar (`{}`) ⇒ SÍ. Es la instancia de Renato
 *     pre-DDL de config, donde el fallback deja el dashboard como está.
 *   · config_negocio cargada ⇒ sólo si `cotizaciones_colega` vale "1".
 */
export function cotizacionesHabilitadas(cfg: Record<string, string> | null | undefined): boolean {
  if (!cfg || Object.keys(cfg).length === 0) return true
  return (cfg[COTIZACIONES_CONFIG_KEY] ?? '').trim() === '1'
}
