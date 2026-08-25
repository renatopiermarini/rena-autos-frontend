/**
 * Branding del dashboard. Vive en config_negocio (branding_iniciales /
 * branding_titulo) para que otra agencia lo cambie sin tocar código; SIN la
 * tabla creada devuelve exactamente los literales que el dashboard tenía
 * hardcodeados, así el de Renato renderiza igual que siempre.
 */
export const BRANDING_FALLBACK = { iniciales: 'RP', titulo: 'Renato Piermarini Autos' }

export function brandingFrom(cfg: Record<string, string>) {
  return {
    iniciales: cfg?.branding_iniciales || BRANDING_FALLBACK.iniciales,
    titulo: cfg?.branding_titulo || BRANDING_FALLBACK.titulo,
  }
}
