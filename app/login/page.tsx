import { getConfigNegocio } from '@/lib/kapso'
import { brandingFrom } from '@/lib/branding'
import LoginForm from './LoginForm'

// El form es cliente (estado + fetch), así que el título del branding se lee
// acá en el server y baja como prop. Sin config_negocio → 'Renato Piermarini
// Autos', igual que el literal que estaba hardcodeado.
export default async function Login() {
  const { titulo } = brandingFrom(await getConfigNegocio())
  return <LoginForm titulo={titulo} />
}
