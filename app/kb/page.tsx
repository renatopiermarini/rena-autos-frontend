import { getKbEntries } from '@/lib/kapso'
import KbClient from './KbClient'

export default async function KbPage() {
  const entries = await getKbEntries()
  return <KbClient entries={entries} />
}
