// Chequeo de contraste WCAG 2.1 para pares oklch, sin dependencias.
// Uso: node scripts/contrast.mjs "0.55 0.19 263" "0.985 0.004 263" [etiqueta]
//      node scripts/contrast.mjs --suite   (corre la lista de pares del design system)
// El alpha no se soporta: componer a mano el color efectivo antes de pasar el par.

function oklchToLinearSrgb([L, C, H]) {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v)))
}

function luminance(oklch) {
  const [r, g, b] = oklchToLinearSrgb(oklch)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function ratio(fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)]
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const parse = (s) => s.trim().split(/[\s,]+/).map(Number)

function report(label, fg, bg, minimo = 4.5) {
  const r = ratio(fg, bg)
  const ok = r >= minimo ? 'OK' : 'FALLA'
  console.log(`${r.toFixed(2).padStart(6)}:1  min ${minimo}  ${ok.padEnd(5)}  ${label}`)
  return r >= minimo
}

const args = process.argv.slice(2)
if (args[0] === '--suite') {
  // Pares del design system (mantener en sync con app/globals.css)
  const light = {
    background: [0.985, 0.003, 263], foreground: [0.145, 0.012, 263],
    muted: [0.96, 0.006, 263], mutedFg: [0.54, 0.016, 263],
    primary: [0.546, 0.215, 263], primaryFg: [0.985, 0.003, 263],
    success: [0.5, 0.13, 160], warning: [0.52, 0.15, 65],
    info: [0.5, 0.17, 255], destructive: [0.577, 0.245, 27.325],
    onStatusLight: [0.985, 0.003, 263],
  }
  const dark = {
    background: [0.155, 0.014, 263], foreground: [0.985, 0.004, 263],
    muted: [0.27, 0.018, 263], mutedFg: [0.715, 0.02, 263],
    primary: [0.55, 0.19, 263], primaryFg: [0.985, 0.004, 263],
    success: [0.72, 0.15, 162], warning: [0.8, 0.14, 78],
    info: [0.7, 0.15, 250], destructive: [0.704, 0.191, 22.216],
    onStatusDark: [0.205, 0.016, 263],
  }
  let ok = true
  console.log('--- light ---')
  ok &= report('foreground / background', light.foreground, light.background)
  ok &= report('muted-fg / muted', light.mutedFg, light.muted)
  ok &= report('muted-fg / background', light.mutedFg, light.background)
  ok &= report('primary-fg / primary', light.primaryFg, light.primary)
  ok &= report('primary / background (UI 3:1)', light.primary, light.background, 3)
  for (const k of ['success', 'warning', 'info', 'destructive'])
    ok &= report(`${k}-fg / ${k}`, light.onStatusLight, light[k])
  console.log('--- dark ---')
  ok &= report('foreground / background', dark.foreground, dark.background)
  ok &= report('muted-fg / muted', dark.mutedFg, dark.muted)
  ok &= report('muted-fg / background', dark.mutedFg, dark.background)
  ok &= report('primary-fg / primary', dark.primaryFg, dark.primary)
  ok &= report('primary / background (UI 3:1)', dark.primary, dark.background, 3)
  for (const k of ['success', 'warning', 'info', 'destructive'])
    ok &= report(`${k}-fg / ${k}`, dark.onStatusDark, dark[k])
  process.exit(ok ? 0 : 1)
} else if (args.length >= 2) {
  report(args[2] ?? 'par', parse(args[0]), parse(args[1]))
} else {
  console.log('Uso: node scripts/contrast.mjs "L C H" "L C H" [etiqueta] | --suite')
}
