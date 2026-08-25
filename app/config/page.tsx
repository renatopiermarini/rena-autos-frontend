import { redirect } from 'next/navigation'

// /config no tiene pantalla propia: la primera es Negocio.
export default function ConfigIndex() {
  redirect('/config/negocio')
}
