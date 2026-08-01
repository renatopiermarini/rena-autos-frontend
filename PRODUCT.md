# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Confirmed:** three people use this dashboard — Renato (owner), Fran (partner), and one employee.

**Confirmed:** all three see the same view. No roles, no per-user surfaces — Finanzas included. This matches the code: `middleware.ts` gates the whole app behind one shared password and there is no permission logic anywhere.

The design consequence is load-bearing: **every screen is read by someone who is not Renato.** Labels, states, and empty states cannot rely on the owner's context.

`[unconfirmed]` Each user's situation and device. `[inferred]` Renato uses it on desktop (recorded preference); the other two are unknown.

## Product Purpose

`[inferred from code]` An internal operations dashboard for a used-car resale business in Argentina. It tracks vehicles from lead to sale and the money, people, appointments, and paperwork around them. It is the team's shared view of business state, not a customer-facing product.

## Operating Context

`[confirmed from code]` Twelve surfaces, all internal:

| Surface | Job |
|---|---|
| Inicio | Home. Metrics, alerts, next 48h of activity |
| Agenda | Calendar: tareas, visitas, transferencias, turnos |
| Stock | Vehicles and their `estado` in the pipeline |
| Interesados | Leads |
| Ofertas | Offers made/received, pending responses |
| Visitas | Scheduled vehicle viewings |
| Clientes | People, incl. deudor/acreedor standing |
| Finanzas | Balances, movimientos, préstamos, cost vs sale |
| Tareas | To-dos with priority |
| KB | Knowledge base entries |
| Transferencias | Title-transfer appointments (turnos) |
| Verificaciones | Mechanical verification appointments |

`[confirmed from code]` A WhatsApp bot writes to the same database. `lib/kapso.ts` and `lib/agenda.ts` both carry comments about keeping the dashboard in sync with the bot — scheduling rules are deliberately duplicated in the backend (`rena-autos-api flows/agenda_rules.py`) because the dashboard writes to Kapso directly while the bot writes through its own tools.

**Confirmed:** the bot carries most of the data entry. The dashboard is read-first — its main job is seeing state and catching problems.

**Confirmed pain point:** manual input in the dashboard is weak and the team wants it improved. So the dashboard is read-first *by circumstance, not by intent* — the write path is underbuilt rather than deliberately minimal. Treat "make manual entry good" as an active goal, not a nice-to-have. The bot stays the primary capture path; the dashboard should be the better path for anything careful, bulk, or corrective.

## Capabilities and Constraints

- **Language:** Spanish (Argentina). `<html lang="es">`. Domain vocabulary is Spanish throughout (`estado`, `dominio`, `seña`, `turno`, `préstamo`).
- **Backend:** Kapso platform DB over REST (`KAPSO_DB_URL` + `KAPSO_API_KEY`). Server components fetch with per-table `revalidate` windows (15s for volatile tables, 60s for slow ones). Mutations go through a `/api/db` proxy that returns actionable Spanish error messages.
- **Pagination constraint:** Kapso caps each request at ~100 rows and defaults to ~50. `lib/kapso.ts` paginates in 200-row pages up to a 50-iteration cap. Silently dropping rows past page one was a real past bug; do not regress it.
- **Auth:** single shared password (`DASHBOARD_PASSWORD`) via `middleware.ts`. No per-user identity, so no attribution or audit trail of who changed what.
- **Timezone:** dates are Argentina-offset; `lib/date.ts` centralizes parsing. Date-only fields have caused UTC-parse bugs before — always parse through the helper.
- **Scheduling rule:** a transferencia turno blocks a 2-hour window (`BLOCK_HOURS`) against which visitas are conflict-checked. Duplicated in the Python backend and guarded by a shared test vector. Changing one side without the other is a correctness bug.
- **Status vocabulary:** `lib/estados.ts` is the single source of truth mapping vehicle `estado` → Spanish label + badge variant. Note the labels are not literal translations — `confirmado` displays as "Consignación", `en_stock` as "Propios". These are business terms, not UI decoration.

## Brand Commitments

- **Name:** Renato Piermarini Autos. Monogram mark "RP" in the nav.
- `[inferred]` No formal brand guide exists. The current look is a dark-first shadcn/Tailwind system with a cobalt primary and semantic status colors, tokens in `app/globals.css`. Treat it as the incumbent system until told otherwise.

## Evidence on Hand

- Real production data via Kapso — no fixtures or seed data in the repo.
- **No** logo files, photography, marketing copy, testimonials, or brand assets beyond the "RP" text monogram. Future work must not fabricate any.

## Product Principles

1. **Three people, one shared truth.** No roles and no per-user identity, so the interface itself has to make state unambiguous. Anything only Renato would understand is a defect.
2. **Read-first, but the write path is a stated goal.** The bot captures; the dashboard is where you see state, catch problems, and — increasingly — fix them. Manual entry being awkward is a known deficiency to design away, not a constraint to honor.
3. **The dashboard is one of two writers.** The bot writes the same rows. Design for state that changed while you weren't looking.
4. **Business vocabulary is not UI copy.** `estado` labels are the company's own terms ("Consignación", "Propios"). Never "improve" them for readability.
5. **Correctness rules are duplicated on purpose.** Scheduling and date logic mirror the Python backend. Touching them is a backend concern, not a design one.

## Accessibility & Inclusion

`[unconfirmed]` No product-specific requirement established. No stated standard to meet.
