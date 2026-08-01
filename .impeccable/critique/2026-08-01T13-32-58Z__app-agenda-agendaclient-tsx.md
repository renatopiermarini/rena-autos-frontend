---
target: the Agenda surface
total_score: 16
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-01T13-32-58Z
slug: app-agenda-agendaclient-tsx
---
Method: dual-agent (A: design review, isolated · B: detector + static evidence, isolated)

Reviewed statically. Browser visualization unavailable — see provenance note at the end.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 1 | No current-time line. Header counts (`AgendaClient.tsx:51`) are all-time, not the rendered week — the numbers never match the screen. A failed fetch renders identically to an empty week. |
| 2 | Match System / Real World | 3 | Spanish AR, Monday-first weeks, correct `-03:00` handling, real business vocabulary. Legend says "Turno transferencia" while cells say "Verificación policial". |
| 3 | User Control and Freedom | 1 | No create, no edit, no drag, no undo. Every click is a one-way `router.push` off the calendar; `weekStart` resets on every tab switch (`AgendaClient.tsx:61`). |
| 4 | Consistency and Standards | 2 | Two different calendars in two tabs with different nav and different `Hoy` semantics. Raw `blue-600`/`amber-500` bypass the `--info`/`--warning` tokens. `MiniWeek` counts turnos differently than Agenda, so Inicio and Agenda disagree. |
| 5 | Error Prevention | 1 | `visitaConflict` (`lib/agenda.ts:40`) checks only `transferencias`, never the bot-written `turnos` table. Overlapping items paint on top of each other, so the double-book is invisible on the one surface that could catch it. |
| 6 | Recognition Rather Than Recall | 1 | The interesado's name is fetched, computed (`AgendaClient.tsx:37`), and never rendered — hover-only via native `title`. Block subtitles discarded entirely. |
| 7 | Flexibility and Efficiency | 1 | No keyboard nav, no shortcuts, no filters, no search, no day view. `Hoy` is the only accelerator. |
| 8 | Aesthetic and Minimalist Design | 3 | Genuinely restrained and dense; block-vs-pill is clean information design. Undercut by 10px as the primary read size and near-invisible fills. |
| 9 | Error Recovery | 1 | No `error.tsx` anywhere in the app. `if (height <= 2) return null` silently deletes out-of-window blocks; clamped events print their true time at the wrong row. |
| 10 | Help and Documentation | 2 | The legend is real help and honestly surfaces `BLOCK_HOURS`. But it misdescribes non-transferencia turnos and never says what "bloqueado" prevents. |
| **Total** | | **16/40** | **Poor — major UX work required** |

## Design Specificity Verdict

**LLM assessment: mostly generic. The product-specific thinking lives in the library layer and almost none of it reaches the pixels.**

What is genuinely *this business* sits in `lib/agenda.ts` and `lib/date.ts`: the `BLOCK_HOURS` window mirrored against the Python backend, the AR offset convention, comments recording that a bot writes the same rows. Exactly one of those facts surfaces visually — the legend string `Turno transferencia (bloque 2 h)`.

Translate the Spanish and `WeekTimeGrid.tsx` is a shadcn calendar demo. Nothing on screen knows that a **turno** is a government appointment that cannot be moved while a **visita** is a person driving across Buenos Aires who can be phoned and rescheduled — the code knows one is a span and one is a moment, then renders both in the same 10px tinted-pill idiom. Nothing marks that data arrived from the bot versus a human. Nothing compensates for three people sharing one login with no attribution. `lib/estados.ts` is never imported by the Agenda at all.

**Deterministic scan: 0 findings, and the zero is scope, not a pass.** `detect.mjs --json app/agenda components/calendar components/main-nav.tsx app/layout.tsx` → `[]`, exit 0. Same across all of `app` and `components`. Assessment B verified the detector is functional rather than trusting the zero: the same engine fired 3 findings on synthetic CSS. The ruleset is Tailwind/CSS-token oriented — `gray-on-color` matches only `text-(gray|slate|zinc|neutral|stone)-\d+`, `ai-color-palette` only `text-(purple|violet|indigo)-\d+`. The Agenda uses `blue-*` and `amber-*` exclusively, so no rule has a matching surface. **The ruleset contains no accessibility, contrast, semantics, touch-target, or keyboard rules** — which is where every real defect on this surface lives.

**Visual overlays: none.** No user-visible overlay exists. `/agenda` is behind a middleware password gate (307 → `/login`), and Assessment B correctly declined to enter `DASHBOARD_PASSWORD` to get past it.

## Overall Impression

The foundations are better than the surface. Date handling is disciplined, the scheduling rule is honest and documented, and the block-vs-pill metaphor is genuinely good information design. Then the layer users touch throws most of it away.

The single biggest problem: **this calendar's stated job is catching problems, and it structurally cannot show the one problem it exists to catch.** Overlapping items paint on top of each other. The conflict checker ignores the table the bot writes to. Out-of-window blocks vanish silently. A failed fetch renders as a confident empty week. Every reassurance mechanism this system owns — the mirrored rule, the shared test vector, the 409, the Spanish toast — fires on *write*, and the read surface says nothing.

Second biggest, and it's your stated pain point: **there is no way to create or move anything from the Agenda.** Zero write affordances. Meanwhile the identical `CalendarView` component mounted on `/tareas` sits next to a working `NuevaTareaDialog` that the Agenda doesn't render.

## What's Working

**1. `lib/agenda.ts` makes a business rule visible instead of hiding it in validation.** `BLOCK_HOURS` is named, commented, deliberately duplicated against `flows/agenda_rules.py`, guarded by a shared test vector — and then *printed in the UI legend* as "(bloque 2 h)". Most dashboards bury scheduling constraints in a 400 response. Exposing the constant to the reader is the most product-specific decision on the surface and it's the right one.

**2. Block-vs-pill encodes semantics geometrically.** A transferencia is a span you can't schedule into; a visita is a point in time. Rendering them as different *shapes* — column-width band with a left rule vs. a thin pill — means the distinction survives being glanced at, being small, and being partly occluded. It maps a data-model truth onto a perceptual one.

**3. Date discipline.** `lib/date.ts` centralizes parsing with the AR offset documented, `localDayKey` as the only legal bucketing path, `tabular-nums` on every time so digits don't jitter, and comments recording three real past off-by-one bugs. Assessment B independently verified the weekday ordering in both grids is correct — `DIAS_CORTOS` Sunday-first matching `getDay()`, `DIAS_SEMANA` Monday-first matching `mondayOf`. No off-by-one. This is invisible work and it's the reason a calendar can be trusted.

## Priority Issues

### [P0] The grid renders fewer items than exist, and cannot display a conflict

**What.** Three compounding mechanisms in `components/calendar/WeekTimeGrid.tsx`:
- Overlapping blocks (`:100-105`, `absolute left-px right-px`) and overlapping events (`:119-124`, `absolute left-0.5 right-0.5`) share identical horizontal bounds. The later one paints over the earlier. Two turnos at 10:00 render as one turno.
- `if (height <= 2) return null` (`:98`) silently deletes any block outside the hardcoded 07:00–21:00 window.
- `visitaConflict` (`lib/agenda.ts:40`) iterates **only `transferencias`**. The `turnos` table — which the bot writes, and which `turnosBlocks` renders — is never conflict-checked.

**Why it matters.** The header advertises a turno count and the legend advertises a 2-hour block, so the surface makes a scheduling-safety promise it cannot keep. Three people share one password with zero attribution — if Fran books over the employee's turno, nothing anywhere catches it and the calendar actively conceals it.

**Fix.** Lane-split within each day column: compute overlap clusters, divide column width, offset `left`, so N stacked items are always N visible items. Add a conflict register — when an event's instant falls inside any block, or two blocks overlap, draw both with a `--destructive` left rule and a "Choca con {auto}" second line. Replace the silent `return null` with a "+2 antes de las 07:00" chip at the column head. Extend `visitaConflict` to accept `turnosBlocks` alongside `transferenciaBlocks`, coordinating with the Python side per PRODUCT.md principle 5. Add a "N conflictos esta semana" chip beside the `h1`.

**Suggested command:** `/impeccable harden`

### [P0] No way to create or move anything, and clicks misroute

**What.** `AgendaClient.tsx` has zero write affordances. `onEventClick={() => router.push('/visitas')}` (`:66`) discards its `CalendarEvent` argument — no id, no deep link — landing on a list whose default filter is `proximas`, which will not contain a past visita you just clicked. `onBlockClick={() => router.push('/transferencias')}` (`:67`) sends *every* block there, including `turnosBlocks` verificaciones whose rows live on `/verificaciones`. The root cause is `lib/agenda.ts:98` hardcoding `kind: 'transferencia'` for verificaciones, so the type system can't distinguish them.

**Why it matters.** This is your stated pain point, verbatim. A calendar with no direct manipulation is a report. And the one write path that does exist — navigate, find, expand, edit — dead-ends for verificación turnos on a page that doesn't contain them.

**Fix.** (a) Click empty grid space → popover pre-filled with that day and a snapped time, tabbed Visita / Turno / Tarea, reusing the `NuevaVisitaForm` and `NuevaTareaDialog` field sets — the click coordinate supplies the two fields people get wrong. (b) Click an existing item → same popover in edit mode, in place, never a navigation. (c) Drag to reschedule with the block rule live: highlight blocked windows in `--destructive` during the drag, refuse the drop with the existing Spanish message. (d) Ship immediately as a floor: route by `kind` and deep-link to `/visitas?id=`, `/transferencias?id=`, `/verificaciones?id=`.

**Suggested command:** `/impeccable shape`

### [P1] Nothing in the calendar is reachable without a mouse

**What.** Assessment B enumerated every interactive element. The visita pill (`WeekTimeGrid.tsx:119`), the turno block (`:100`), and the month day cell (`MonthGrid.tsx:109`) are all bare `<div onClick>` — **not focusable, no role, no accessible name, no focus-visible styling**. That is every data-bearing target on the surface. The only description is a native `title`, which on a roleless div is not exposed as a control and is unreachable by keyboard or touch. All four chevron buttons are focusable but **icon-only with no `aria-label`** — they announce as unlabeled buttons. Neither grid has `role="grid"`/`row`/`gridcell`/`columnheader`, so a screen reader gets an undifferentiated pile of text with no day association. Today and selected-day are communicated by **color alone** in both grids. The tablist is real (base-ui emits `role="tab"` + `aria-selected`) but **no `TabsContent` is rendered** — the view swaps via a ternary outside the `Tabs` root, so `aria-controls` points at nothing.

**Why it matters.** No formal a11y standard is set for this project, but this is also pure efficiency debt: nobody can tab to today's first appointment or arrow between weeks. Everything requires precise pointer work on 20px targets.

**Fix.** `<button>` for every event and block with `aria-label` reading "Visita, jueves 6, 15:00, Nico Farías, Amarok". Roving-tabindex arrow movement across the grid. `role="grid"` with `columnheader` on the day row. `aria-label` on the four chevrons. `focus-visible:ring-2 ring-ring` throughout. `←`/`→` for week nav, `t` for Hoy. `aria-current="date"` so today isn't color-only.

**Suggested command:** `/impeccable adapt`

### [P1] The most important field on a visita — who is coming — is fetched, computed, and never drawn

**What.** `AgendaClient.tsx:37` builds `subtitle` from `interLabel(interesados, v.interesado_id)`, and `app/agenda/page.tsx` pays for a full `getInteresados()` fetch to do it. `WeekTimeGrid` renders `subtitle` nowhere except inside the native `title` tooltip (`:122`), and for blocks not even there — `comprador_nombre` is discarded completely. The visible pill is `HH:MM` + `marca modelo` at `text-[10px]` in a 20px box.

Contrast measurements from Assessment B compound it: the pill fill sits at **1.07:1** against the card in dark and **1.09:1** in light (3:1 needed for UI boundaries); hour gridlines at `border-border/70` are **1.20:1** dark / **1.17:1** light. The pills are legible only via their text and left border, floating on rules that effectively vanish.

**Why it matters.** Nobody on this team thinks in vehicles-at-times. They think *"Nico viene a ver la Amarok a las 3."* A week of visits on the same Amarok renders as five identical pills. The employee reading this has no memory of which lead maps to which car, and the answer sits behind a hover that keyboard and touch never reach.

**Fix.** Two-line pill, 36–40px minimum height: line 1 `15:00 · Nico Farías` at 12px, line 2 `Amarok 2019` at 11px muted. Person first — the vehicle is recoverable from context, the person is not. Blocks get the tipo label plus their subtitle, replacing the constant "Turno · bloqueado". Raise base type from `text-[10px]` to `text-xs`. Lift hour rules to full `border-border` with added weight every third line. Route the calendar's raw `blue-*`/`amber-*` through the existing `--info`/`--warning` tokens so theme changes reach the Agenda at all.

**Suggested command:** `/impeccable typeset`

### [P2] It's two calendars pretending to be one, and it loses your place between them

**What.** The "Visitas + Turnos" tab is a week time-grid; the "Tareas" tab is a month grid with its own separate navigation and a different `Hoy` (week: resets the week; month: resets the month *and* selects today). The branches are conditionally rendered (`AgendaClient.tsx:61`), so `weekStart` unmounts and resets every time you return. The tab labels name *data tables*, not questions. A tarea due Thursday and a visita on Thursday are never on screen together — which is the only thing an agenda is for. `MiniWeek.tsx:35` counts only `transferenciaBlocks` while `AgendaClient.tsx:42` adds `turnosBlocks`, so Inicio and Agenda report different turno counts for the same week.

**Why it matters.** PRODUCT.md principle 1: anything only Renato would understand is a defect. This tab split is a schema artifact leaking into the interface. The employee opens Agenda to answer "what's happening Thursday" and must query two screens at two zoom levels and hold the union in their head.

**Fix.** One week grid, everything on it. Timed tareas render as pills in their hour; date-only tareas render in an **all-day row pinned above hour 07** — the native calendar convention and the missing piece. Replace tabs with filter chips that dim rather than unmount, so the week never resets. Lift `weekStart` into `AgendaClient`. Make `MiniWeek` use the same `[...transferenciaBlocks(t), ...turnosBlocks(t)]` expression as the Agenda.

**Suggested command:** `/impeccable distill`

### [P2] A failed fetch is indistinguishable from an empty week

**What.** `lib/kapso.ts:17` — inside the pagination loop, `if (!res.ok) return all` returns the accumulated array. If the first page fails, `all` is `[]`, so `getVisitas()`/`getTurnos()`/`getTransferencias()` resolve to `[]` on a 401, 500, or timeout. `page.tsx` awaits them in a `Promise.all` with no status channel, and `AgendaClient` branches only on array length. **A partial failure is worse:** pages 1..n-1 return and the calendar displays truncated data as complete. Assessment B measured a live 401 from `api.kapso.ai` — this exact failure class is reachable today. There is **no `error.tsx`, `global-error.tsx`, or `not-found.tsx` anywhere in the app**. `EmptyState` exists and is used by seven other clients; the Agenda is the only one that doesn't import it.

**Why it matters.** The surface reports "0 visitas pendientes · 0 turnos" with total confidence when it actually knows nothing. On a shared operational calendar, a silently empty Thursday is how someone misses a government appointment.

**Fix.** Give `get()` a status channel — return `{ rows, ok, partial }` rather than a bare array. Render a distinct "No pudimos cargar la agenda" state with a retry, separate from a real empty week. Add `app/agenda/error.tsx` at minimum, ideally a root `app/error.tsx`. Import `EmptyState` for the genuine zero case. Fix the loading skeleton's `h-[480px]` to match the ~616px lane it stands in for, and give it `role="status"`.

**Suggested command:** `/impeccable harden`

## Persona Red Flags

**Alex (impatient power user).** No now-line, so "what's next" requires visual scanning. No keyboard week nav; `Hoy` is a mouse target at 36×24px. Clicking a visita loses his week and lands him on a filtered list that may not contain it. Switching to Tareas and back resets `weekStart`. Header counts are all-time so they never reconcile with the screen and he learns to ignore them. Hover-only subtitles mean he can't read the week without dragging the mouse across every pill. No filter, no search, no jump-to-date, no day view. The 12-item nav puts Visitas, Tareas, Transferencias and Verificaciones one click away — he will abandon the Agenda for those lists within a week, which is this surface's real failure mode.

**Sam (keyboard + screen reader).** Cannot reach a single event or block — bare `<div onClick>` with no tabindex, role, or key handler. No grid semantics, so the day↔event relationship is lost entirely; the reader emits times and car names in DOM order with no column context. `MiniWeek`'s seven day cells announce as seven links all going to `/agenda`. Four unlabeled chevron buttons. No `aria-current="page"` in the nav. Today and selected-day are color-only. The one accessible affordance on the surface is the base-ui `Tabs`, and its `aria-controls` points at a panel that was never rendered.

**Nico (project-specific: the employee who didn't build this).** Works the lot, opens the dashboard to know what's happening today, zero context on the schema or the bot.
- **"Turno · bloqueado"** — blocked for whom, against what? It never says a visita can't be scheduled there. He reads it as "cancelled", which is wrong.
- The legend says **"Turno transferencia"** while a cell says **"Verificación policial"**. The key contradicts the content and he has no way to learn they're the same category.
- Clicking a verificación block dumps him on `/transferencias`, which doesn't contain it, while `/verificaciones` sits right there in the nav. He concludes the calendar is broken — roughly correct.
- **He can't tell who a visita is with** without hovering every pill, and he doesn't know cars by `marca modelo` the way Renato does.
- **No provenance, no attribution.** He can't tell whether Renato already called the client, whether the bot booked it, or whether it's confirmed or merely proposed. With one shared password there's no other channel for this, and the design supplies no substitute.
- Header says "8 turnos" while he counts three on screen. Nothing tells him the number is all-time.
- If he needs to book something there's no button. He must know visitas live on `/visitas`, turnos on `/transferencias` *or* `/verificaciones` depending on tipo, and tareas on `/tareas` — schema knowledge the interface never teaches.

## Minor Observations

- `interLabel` returns `''` on no match, so `subtitle` silently falls back to `v.notas` (`AgendaClient.tsx:37`) — an unrecognized interesado surfaces raw internal notes in the tooltip.
- Event pills set `cursor-pointer`; blocks with an identical `onClick` do not. Blocks look non-interactive.
- No pluralization guard: "1 visitas pendientes", "1 turnos". `MonthGrid.tsx:26` already exports a `plural()` helper the Agenda ignores.
- The legend's "(bloque 2 h)" is wrong for any `turnosBlocks` row with a `duracion_horas` other than 2 — a case `lib/agenda.ts:91-92` explicitly supports.
- Visita duration isn't modeled: events are a fixed `height: 20`. A one-hour test drive and a ten-minute key handover look identical, and at `HOUR_PX = 44` a 20px pill under-reads even a 30-minute slot. A `duracion_horas: 0.25` turno renders 11px tall.
- No weekend or business-hours shading. 07:00 Sunday looks as available as 15:00 Tuesday, on a lot whose Saturday is its busiest day.
- `text-blue-700 dark:text-blue-400` for the today header is a second "active blue" competing with the cobalt `--primary` at a different hue.
- The week-nav row and legend sit outside the `Card` wrapping the grid — three floating strata rather than one instrument.
- `MiniWeek` caps dots at `Math.min(nv, 3)` with no overflow indicator: 3 visitas and 9 visitas render identically.
- `MonthGrid`'s selected-day detail panel (`:138-152`) is exactly the progressive-disclosure pattern the week grid needs — already written, in this repo, unused by the Agenda.
- `MonthGrid` has no overflow container and no min-width. At 375px each column computes to ~49px, leaving ~37px of content width. Zero breakpoint prefixes exist in any Agenda or calendar file; the week grid's `min-w-[640px]` inside `overflow-x-auto` is the only responsive accommodation on the surface.
- The Agenda header row has no `flex-wrap`, so the h1, counter, and `whitespace-nowrap` tabs compete on one line at narrow widths.
- Light theme only: the `amber-500` legend bar hits 2.15:1 (needs 3:1) and the nav active `text-primary` on `bg-primary/10` hits 4.48:1 (needs 4.5:1). Both pass in dark.

## Cognitive Load: 5 of 8 failed — high, critical fix needed

**FAIL — Single focus:** two tabs at two time zooms, plus a legend and header stats scoped differently from the grid.
**PASS — Chunking:** day columns × hour rows is clean; block-vs-pill is a legible two-category split.
**FAIL — Grouping:** grouped by *data table*, not by day. The week-nav row, the Card, and the legend are three unattached strata.
**FAIL — Visual hierarchy:** inverted. Event text 10px, hour labels 10px, day headers 12px, h1 20px — the most important object is the smallest type. Today's column tint sits at nearly the same value as a visita pill's fill, so events on today are the *least* visible events on screen.
**PASS — One thing at a time:** no modal stacking, no competing overlays.
**PASS — Minimal choices** on the surface itself (2 tabs, 3 week controls).
**FAIL — Working memory:** who the visita is with is hover-only; clicking ejects you to `/visitas` to re-find the row from memory; the week position resets.
**FAIL — Progressive disclosure:** there is none. Flat, then navigate away.

**>4-option decision point:** the 12-item top nav, present at every moment, behind `scrollbar-hide` and a mask gradient that fades the tail with no affordance signalling more exists. **Five of the twelve** (Agenda, Visitas, Tareas, Transferencias, Verificaciones) are views of the same calendar — the nav itself advertises that the Agenda consolidated nothing.

## Emotional Journey

**Peak:** the block-vs-pill metaphor landing. A shaded amber band with a 3px left rule reads as "this time is spoken for" before any label is processed. That's correct pre-attentive design and it's the surface's one moment of confidence.

**Valley — arrival.** Monday 08:00. The grid opens on 07:00–21:00 mostly empty, two or three 20px pills scattered across ~616px of ruling measured at 1.20:1. No now-line, so the first question — *what's next?* — is answered by manually locating the today column and guessing which pill is still ahead. The primary view does not answer the primary question.

**Valley — the ejection.** Every interaction is a one-way exit, and two of them land you somewhere that doesn't contain what you clicked.

**High-stakes moment — the double-booked turno — is where this fails hardest.** The system has a mirrored cross-language conflict rule, a shared test vector, a 409 in the API proxy, and a toast naming the exact conflicting auto and hours. All of it fires on *write*. On *read* — the surface whose stated job is catching problems — two overlapping blocks paint one on top of the other and the user is told nothing. The reassurance machinery exists and is pointed away from the moment that needs it.

**End:** you leave the Agenda by being thrown out of it.

## Questions to Consider

1. **If the bot already knows every turno and visita, why is a human being asked to *look* for the conflict?** What if the Agenda opened with "2 problemas esta semana" and showed nothing else until they were cleared — a queue that empties rather than a canvas that's scanned?
2. **What if the default view were a single day at full width, with the week reduced to a strip above it?** A week time-grid is optimized for *planning*. The question this team actually asks ten times a day is "what's in the next four hours" — and the week grid answers it worst of all the views buildable from this data.
3. **Three people, one password, no identity — so what if the calendar showed *provenance* instead?** "Agendado por el bot" vs. "agendado acá" is the one distinction the system genuinely possesses, and it's the one that tells you whether the client has actually been told. Right now it's thrown away.
4. **Manual entry is the stated weakness, and the write path lives on five other pages and none of them here.** What would it take to invert it — the Agenda becomes the only place anyone schedules anything, and Visitas/Transferencias/Verificaciones/Tareas demote to read-only lists? That deletes four nav items, collapses the tab split, and makes the conflict rule enforceable at the moment of the gesture rather than the moment of the POST.

## Provenance

Assessment A (design review) and Assessment B (detector + static evidence) ran as two isolated parallel sub-agents; neither saw the other's output, and B's findings entered synthesis only after A completed.

Browser visualization was attempted and is unavailable: `/agenda` returns 307 → `/login` (`middleware.ts:17-23`, cookie `ra_auth` must equal `hashPassword(DASHBOARD_PASSWORD)`). Assessment B declined to enter the password credential to get past the gate and did not modify `middleware.ts`. No overlay was injected and none exists.

Two premises corrected during the run: the dev server starts cleanly (`npx next dev` → ready in 2.5s, `/login` compiles, HTTP 200), and `api.kapso.ai` is network-reachable (returns a real 401, not a connection failure). A rendered pass is available whenever someone logs in locally.
