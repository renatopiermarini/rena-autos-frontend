import { getInteresados, getVehicles, getOfertas } from '@/lib/kapso'
import InteresadosClient from './InteresadosClient'

export default async function Interesados() {
  const [interesados, vehicles, ofertas] = await Promise.all([
    getInteresados(), getVehicles(), getOfertas(),
  ])
  return <InteresadosClient interesados={interesados} vehicles={vehicles} ofertas={ofertas} />
}
