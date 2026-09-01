# DESIGN.md — sistema visual de rena-autos-frontend

Contrato anti-regresión. Las decisiones de acá abajo son **deliberadas**; ante
la duda, este archivo manda sobre el default de shadcn/Tailwind. Si un cambio
las contradice, es un cambio de diseño y se discute, no se "arregla".

## Identidad en una línea

Herramienta de operaciones seria: IBM Plex, neutros teñidos de cobalto,
superficies planas con borde, esquinas filosas, plata en mono tabular.
Dark es el tema primario (`defaultTheme="dark"`, `enableSystem={false}`).

## Tokens (app/globals.css)

- **Neutros teñidos, nunca gris puro.** Todos los neutros llevan chroma en hue
  263 (el del `--primary` cobalto): 0.002–0.016 en light, 0.014–0.030 en dark.
  Un `oklch(x 0 0)` nuevo es regresión al default shadcn.
- **`--radius: 0.375rem`** (6px). Filoso = serio. Las primitivas usan
  `rounded-lg` (= el token). Excepciones permitidas y ninguna más: Badge pill
  (`rounded-4xl`), burbujas de `/chat` (`rounded-2xl`), `rounded-full`,
  skeletons con `rounded` pelado.
- **Bordes dark en alpha** (`oklch(0.92 0.030 263 / 12%)`): un solo token
  composita bien sobre background (0.155), card (0.205) y popover (0.225).
  Popover va levantado sobre card para leer como capa.
- **Dos decisiones AA documentadas en comments de globals.css**: primary dark
  a 0.55 (texto 4.81:1) y destructive-foreground dark oscuro-sobre-claro
  (6.20:1). No tocarlas sin re-derivar.
- **Verificación**: `node scripts/contrast.mjs --suite` después de tocar
  cualquier token de color. Toda la suite debe pasar; el par más justo del
  sistema es muted-fg/muted light (4.51:1).

## Tipografía

- **IBM Plex Sans** (UI, 400–700) + **IBM Plex Mono** (números, 400–600),
  cargadas en `app/layout.tsx` vía next/font. `--font-heading` queda aliased a
  sans: los títulos se diferencian por peso/tracking, no por tercera familia.
- **Prohibido `font-family` en `body`** (ver comment en globals.css: la pila
  -apple-system pisaba a la fuente cargada y no se pintaba nunca).
- **Plata y números de datos: `font-mono tabular-nums`**, siempre alineados a
  la derecha en tablas. KPIs display: `text-2xl font-semibold font-mono
  tabular-nums` (2xl y no 3xl: con 4-up y montos de 6 cifras, 3xl desborda).
- **h1 de página**: `text-2xl font-semibold tracking-tight` — igual en las 14
  pantallas.
- **Piso: 11px** (`text-2xs`). `text-[10px]` no existe más y no vuelve.

## Superficies

- **Plano con borde**: `border border-border`. Nunca `ring-1
  ring-foreground/10` (era el idioma viejo de Card/Dialog).
- **Sombra solo en lo que flota**: `shadow-overlay` (token) en menús,
  popovers, tooltips y la campana. Cards y tablas jamás llevan sombra.
- **Scrim del Dialog: `bg-black/30`** + blur. La modalidad se tiene que leer.

## Tablas (las 9 son `<table>` crudas)

- Receta única en `components/table-cells.tsx` (`Th`/`Td`/`TdMoney` o sus
  clases exportadas): headers `text-2xs uppercase tracking-wide
  text-muted-foreground`, celdas `py-2` sobre tabla `text-[13px]`, plata
  `text-right font-mono tabular-nums`.
- **Toda la plata pasa por `money()`** (`lib/money.ts`): prefijo USD siempre,
  enteros sin decimales, centavos con dos. Números no-plata (km) por `fmtN`
  del mismo módulo. `toLocaleString` inline es regresión.

## Color semántico

- Estados: tokens `success` / `warning` / `info` / `destructive` +
  variants tinted de Badge. Mapeo vehículo→variant en `lib/estados.ts`.
- Lenguaje de hue: ámbar/warning = esperando o higiene de datos, azul/info =
  en curso, verde/success = resultado positivo, rojo/destructive = perdido o
  fuego de verdad, muted = archivado.
- **Colores de persona SOLO en `lib/equipo.ts`**: badge tinted (`border
  X-600/30 bg-X-600/10 text-X-800 dark:...text-X-300`) + avatar sólido. Los
  hues por persona son identidad: no se cambian. Texto light en `*-800` (con
  `*-700` el verde fallaba AA). Clases literales, nunca template strings — el
  scanner de Tailwind no las vería.
- La sección violeta del Tablero usa la fórmula tinted del equipo a propósito
  (identidad de sección); tiene ignore en `.impeccable/config.json`.

## No tocar

- Idioma de burbujas de `/chat` (`rounded-2xl`, colores propios).
- Badge pill (`rounded-4xl`, h-5).
- Tarjetas móviles de Stock (split deliberado tabla/tarjetas).
- Comportamiento de `money()` (locale es-AR, regla de decimales).
- `defaultTheme="dark"` + `enableSystem={false}`.

## Herramientas

- `node scripts/contrast.mjs "L C H" "L C H"` — un par; `--suite` — todo el
  sistema. Reproduce los ratios AA documentados; alpha se composita a mano.
- Grep de regresiones: `grep -rn "text-\[10px\]\|ring-foreground/10\|toLocaleString('es-AR')" app components lib`
  debe volver vacío (salvo `lib/money.ts` y fechas `toLocaleDateString`).
