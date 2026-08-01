// KB entries are plain text typed by the team, but they are almost always a
// procedure: numbered steps, or a short list, or a couple of paragraphs. Rendering
// that inside a <pre> box made a document look like a code sample and left the most
// important text on the screen at 13px. This reads the shape back out and sets it.

type Block =
  | { kind: 'ol'; items: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'p'; text: string }

const OL = /^\s*(\d+)[.)]\s+(.*)$/
const UL = /^\s*[-*•]\s+(.*)$/

export function parseKbBody(text: string): Block[] {
  const out: Block[] = []
  for (const raw of (text ?? '').split(/\n/)) {
    const line = raw.trimEnd()
    if (!line.trim()) continue

    const ol = line.match(OL)
    if (ol) {
      const last = out[out.length - 1]
      if (last?.kind === 'ol') last.items.push(ol[2])
      else out.push({ kind: 'ol', items: [ol[2]] })
      continue
    }
    const ul = line.match(UL)
    if (ul) {
      const last = out[out.length - 1]
      if (last?.kind === 'ul') last.items.push(ul[1])
      else out.push({ kind: 'ul', items: [ul[1]] })
      continue
    }
    // Wrapped continuation of the previous list item, not a new paragraph.
    const last = out[out.length - 1]
    if (last && (last.kind === 'ol' || last.kind === 'ul') && /^\s{2,}/.test(raw)) {
      last.items[last.items.length - 1] += ' ' + line.trim()
      continue
    }
    out.push({ kind: 'p', text: line.trim() })
  }
  return out
}

export function KbBody({ text }: { text: string }) {
  const blocks = parseKbBody(text)
  if (blocks.length === 0) {
    return <p className="text-[15px] text-muted-foreground">Sin contenido.</p>
  }
  return (
    // ~70ch measure: this is the one screen in the app people actually read.
    <div className="max-w-[68ch] space-y-4 text-[15px] leading-[1.65]">
      {blocks.map((b, i) => {
        if (b.kind === 'p') return <p key={i}>{b.text}</p>
        if (b.kind === 'ul') {
          return (
            <ul key={i} className="space-y-1.5 pl-1">
              {b.items.map((t, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-[0.6em] size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          )
        }
        return (
          <ol key={i} className="space-y-2.5">
            {b.items.map((t, j) => (
              <li key={j} className="flex gap-3">
                <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {j + 1}
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        )
      })}
    </div>
  )
}
