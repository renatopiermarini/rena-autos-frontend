import { getOfertas, getVehicles, getInteresados } from '@/lib/kapso'
import OfertasClient from './OfertasClient'

export default async function Ofertas() {
  const [ofertas, vehicles, interesados] = await Promise.all([
    getOfertas(), getVehicles(), getInteresados(),
  ])
  return <OfertasClient ofertas={ofertas} vehicles={vehicles} interesados={interesados} />
}
