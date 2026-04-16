'use client'
import { useState } from 'react'

// ── Tools ────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'vehiculos_db',
    description: 'CRUD completo de vehículos en stock. Crear, consultar, actualizar estado, registrar visitas, ofertas y gastos.',
    agents: ['Stock', 'Clientes', 'Finanzas', 'Préstamos', 'Email', 'Transferencias'],
  },
  {
    name: 'clientes_db',
    description: 'CRM de clientes y propietarios. Crear, buscar por nombre/teléfono, actualizar. Tipos: vendedor, comprador, ambos.',
    agents: ['Clientes', 'Finanzas', 'Préstamos', 'Email', 'Transferencias', 'Gestor Préstamos (Fin)'],
  },
  {
    name: 'interesados_db',
    description: 'Gestionar lista de interesados en comprar. Match automático con stock al ingresar nuevo vehículo.',
    agents: ['Clientes'],
  },
  {
    name: 'tareas_db',
    description: 'Crear, asignar y completar tareas. Tipos: lavado, fotos, publicacion, tramite, seguimiento, otro.',
    agents: ['Stock', 'Tareas', 'Documentos', 'Trámites', 'Transferencias'],
  },
  {
    name: 'contabilidad_db',
    description: 'Balances, movimientos de dinero, P&L por vehículo. Cuentas: cash, nexo, fiwind. Moneda USD.',
    agents: ['Finanzas', 'Contador (Fin)'],
  },
  {
    name: 'prestamos_db',
    description: 'Registro de préstamos de acreedores. Nuevo préstamo, pagos, alertas de vencimiento.',
    agents: ['Préstamos', 'Gestor Préstamos (Fin)'],
  },
  {
    name: 'visitas_db',
    description: 'Registrar visitas de interesados a vehículos en consignación para notificar al propietario.',
    agents: ['Stock'],
  },
  {
    name: 'ofertas_db',
    description: 'Registrar ofertas recibidas. Notificar propietario vía email con el monto ofrecido.',
    agents: ['Stock'],
  },
  {
    name: 'checklist_docs',
    description: 'Checklists de documentación vehicular. Crear al ingresar stock, ver estado, actualizar items, listar pendientes.',
    agents: ['Stock', 'Documentos'],
  },
  {
    name: 'transferencias_db',
    description: 'Gestionar transferencias de dominio automotor (DNRPA). Iniciar, actualizar docs, listar activas.',
    agents: ['Transferencias'],
  },
  {
    name: 'tramites_automotor',
    description: 'Instrucciones y registro de trámites: informe de dominio DNRPA, multas SINTYS, transferencias.',
    agents: ['Trámites'],
  },
  {
    name: 'cron_jobs',
    description: 'Gestionar cron jobs automatizados. Crear, listar, pausar y eliminar tareas programadas.',
    agents: ['Tareas'],
  },
  {
    name: 'gmail',
    description: 'Enviar y leer emails. Notificaciones al equipo interno y a clientes externos.',
    agents: ['Email'],
  },
  {
    name: 'notas',
    description: 'Notas personales de Renato: pendientes, dudas, respuestas, follow-ups. CRUD completo con categorías y estados.',
    agents: ['Tareas'],
    isNew: true,
  },
  {
    name: 'web_search',
    description: 'Búsqueda web via Serper. Precios de mercado, normativas, proveedores.',
    agents: ['Research'],
  },
]

// ── Agents / Crews ───────────────────────────────────────────────────────────

const CREWS = [
  {
    name: 'StockCrew',
    subtitle: 'Crew liviano · 1 agente · Sequential · Fallback de completa',
    color: 'border-blue-200',
    agents: [
      {
        role: 'Agente de Stock',
        model: 'Haiku',
        tools: ['vehiculos_db', 'checklist_docs', 'tareas_db', 'visitas_db', 'ofertas_db'],
        goal: 'Registrar y gestionar vehículos, visitas, ofertas y ventas.',
        backstory: `Stock de Renato Piermarini Autos.

CAMPOS REQUERIDOS al registrar:
  Consignación: marca, modelo, año, km, dominio, color, cliente_id, cliente_email, precio_venta_objetivo
  Propio: marca, modelo, año, km, dominio, color, precio_compra

AL ENTRAR EN STOCK (en_stock/confirmado) hacé SIEMPRE:
  1. checklist_docs(crear) con vehicle_id, tipo, phone
  2. tarea lavado — prioridad alta, asignado=fran
  3. tarea fotos — prioridad media, asignado=fran
  4. tarea publicacion — prioridad media, asignado=rena

CONSULTAS POR ESTADO: usar vehicles_db(get_by_estado) con el estado exacto.
  potenciales → estado="potencial"
  en reparación → estado="en_reparacion"
  reservados → estado="reservado"

Estados consignación: a_ingresar/confirmado/va_a_pensarlo/necesita_follow_up/reservado/vendido
Estados propio: en_stock/en_reparacion/reservado/vendido
NUNCA pedirle al usuario un ID.`,
      },
    ],
  },
  {
    name: 'TransferenciaCrew',
    subtitle: 'Crew dedicado · 1 agente · Sequential · State machine',
    color: 'border-purple-200',
    agents: [
      {
        role: 'Especialista en Transferencias de Dominio Automotor',
        model: 'Sonnet',
        tools: ['transferencias_db', 'vehiculos_db', 'clientes_db', 'tareas_db'],
        goal: 'Gestionar el proceso completo de transferencia de dominio vehicular en Argentina.',
        backstory: `Especialista en transferencias de dominio automotor (DNRPA) de Renato Piermarini Autos.

FLUJO en orden:
PASO 1 — Identificar vehículo: vehicles_db(get_en_stock)
PASO 2 — Identificar comprador: clientes_db(get_all) o usar nombre tal cual
PASO 3 — Pedir datos faltantes: ubicación, medio de pago, registro seccional, precarga, fecha y hora turno
PASO 4 — transferencias(iniciar)
PASO 5 — Mostrar checklist docs → "¿Cuáles ya tenés listos?"
PASO 6 — transferencias(actualizar_doc) por cada doc confirmado

PROHIBIDO: NO actualizar estado del vehículo. NO registrar clientes. NO hacer transferencias bancarias.`,
      },
    ],
  },
  {
    name: 'TareasCrew',
    subtitle: 'Crew liviano · 1 agente · Sequential',
    color: 'border-gray-200',
    agents: [
      {
        role: 'Agente de Tareas',
        model: 'Haiku',
        tools: ['tareas_db', 'vehiculos_db', 'cron_jobs', 'notas'],
        goal: 'Crear, asignar y completar tareas. Gestionar recordatorios y notas personales.',
        backstory: `Tareas: tipos lavado/fotos/publicacion/tramite/seguimiento/otro.
Prioridades: urgente/hoy=alta, normal=media, cuando puedas=baja.
Fechas: si el usuario menciona fecha o plazo, guardar fecha_limite:"YYYY-MM-DD".
Cron jobs: "diario_09:00", "cada_30m", "semanal_0_09:00", o cron expression.

CUÁNDO USAR NOTAS vs TAREAS:
- notas(): recordatorios personales que NO son del negocio (ej: "ir a andreani", "llamar al médico")
- tareas_db(): tareas del negocio con asignado, vehículo, prioridad (ej: "lavar el Golf")`,
      },
    ],
  },
  {
    name: 'EmailCrew',
    subtitle: 'Crew liviano · 1 agente · Sequential',
    color: 'border-gray-200',
    agents: [
      {
        role: 'Agente de Comunicaciones por Email',
        model: 'Haiku',
        tools: ['gmail', 'clientes_db', 'vehiculos_db'],
        goal: 'Enviar emails a clientes y proveedores. Notificar al equipo interno. Leer y resumir respuestas.',
        backstory: `INTERNOS: solo a rena y fran. Asunto: "IMPORTANTE: [tema]".
EXTERNOS: buscar email en clientes_db antes de enviar. Si no tiene email: reportar sin enviar.
Tono externo: profesional, español.
LEER RESPUESTAS: gmail > leer_no_leidos. Resumir quién respondió, qué dijo, si requiere acción.`,
      },
    ],
  },
  {
    name: 'DocumentosCrew',
    subtitle: 'Crew liviano · 1 agente · Sequential',
    color: 'border-gray-200',
    agents: [
      {
        role: 'Verificador de Documentación Vehicular',
        model: 'Haiku',
        tools: ['checklist_docs', 'vehiculos_db', 'tareas_db'],
        goal: 'Gestionar checklists de papeles. Actualizar según respuesta del usuario. Detectar qué falta.',
        backstory: `IDs de items válidos: formulario_08, cedula_titular, titulo, informe_dominio, verificacion_policial, libre_deudas.
Mapeo:
  "cédula" / "cédula verde" / "título" → titulo=ok + cedula_titular=ok
  "formulario 08" → formulario_08=ok
  "verificación policial" → verificacion_policial=ok
  "libre de deudas" / "patentes al día" → libre_deudas=ok
  "tengo todo" → actualizar todos como ok
Confirmados → actualizar checklist. Faltantes críticos → crear tarea.
Usá VehiclesTool si necesitás encontrar vehicle_id por nombre de auto.`,
      },
    ],
  },
  {
    name: 'TramitesCrew',
    subtitle: 'Crew liviano · 2 agentes · Sequential',
    color: 'border-gray-200',
    agents: [
      {
        role: 'Especialista en Trámites Automotores',
        model: 'Haiku',
        tools: ['tramites_automotor'],
        goal: 'Proveer instrucciones precisas para trámites DNRPA, SINTYS y transferencias. Registrar trámites para seguimiento.',
        backstory: `Conocés todos los trámites automotores argentinos de memoria.
DNRPA para informes de dominio, SINTYS para multas, formulario 08 para transferencias.
Siempre dás URLs, datos requeridos y registrás el trámite en el sistema.
Si no tienen la patente del auto, la pedís antes de continuar.`,
      },
      {
        role: 'Gestor de Seguimiento',
        model: 'Haiku',
        tools: ['tareas_db'],
        goal: 'Crear tareas de seguimiento para cada trámite iniciado.',
        backstory: 'Registrás tareas de seguimiento con prioridad y fecha para que ningún trámite se pierda.',
      },
    ],
  },
  {
    name: 'FinanzasCrew',
    subtitle: 'Crew liviano · 2 agentes · Sequential',
    color: 'border-gray-200',
    agents: [
      {
        role: 'Contador de Renato Piermarini Autos',
        model: 'Haiku',
        tools: ['contabilidad_db', 'vehiculos_db'],
        goal: 'Gestionar contabilidad, balances y movimientos. Alertar sobre situaciones críticas.',
        backstory: `Tres cuentas: cash (efectivo), nexo (12% anual), fiwind (inversión).
Categorías: commission, vehicle_purchase, vehicle_expense, general_expense, marketing, loan, refund, down_payment, personal_withdrawal, investments, other.
Moneda USD. Alertar si cash < $500 o hay préstamos vencidos.
Para ingresos/egresos: get_balances → log_movimiento → update_balance (usar ID real de get_balances).`,
      },
      {
        role: 'Gestor de Préstamos',
        model: 'Haiku',
        tools: ['prestamos_db', 'clientes_db'],
        goal: 'Registrar préstamos nuevos, pagos y consultas. Alertar sobre vencimientos.',
        backstory: `NUEVO PRÉSTAMO:
1. clientes_db(get_all) → buscar acreedor. Si no existe: clientes_db(save) con es_acreedor=1
2. prestamos_db(save) → acreedor_id, monto_original, tasa_interes_anual=0.15, fecha_vencimiento, monto_a_devolver
3. monto_a_devolver = monto_original * (1 + 0.15 * días/365)
Alertar sobre vencidos o por vencer en < 30 días.`,
      },
    ],
  },
  {
    name: 'ResearchCrew',
    subtitle: 'Crew liviano · 1 agente · Sequential',
    color: 'border-gray-200',
    agents: [
      {
        role: 'Agente de Investigación',
        model: 'Haiku',
        tools: ['web_search'],
        goal: 'Buscar información externa en internet.',
        backstory: `Buscás cuando el equipo necesita info externa: precios de mercado, normativas, proveedores.
Buscar en español por defecto. Resumir en máximo 5 líneas con fuente. Si no encontrás: decirlo.`,
      },
    ],
  },
  {
    name: 'AgenciaCrew',
    subtitle: 'Crew principal · 8 agentes · Hierarchical · Manager: Opus 4.7',
    color: 'border-gray-300',
    agents: [
      {
        role: 'Agente de Stock',
        model: 'Haiku',
        tools: ['vehiculos_db', 'checklist_docs', 'tareas_db', 'visitas_db', 'ofertas_db'],
        goal: 'Registrar y gestionar vehículos, visitas, ofertas y ventas.',
        backstory: `Stock de Renato Piermarini Autos.

CAMPOS REQUERIDOS al registrar:
  Consignación: marca, modelo, año, km, dominio, color, cliente_id, cliente_email, precio_venta_objetivo
  Propio: marca, modelo, año, km, dominio, color, precio_compra

AL ENTRAR EN STOCK (en_stock/confirmado) hacé SIEMPRE:
  1. checklist_docs(crear) con vehicle_id, tipo, phone
  2. tarea lavado — prioridad alta, asignado=fran
  3. tarea fotos — prioridad media, asignado=fran
  4. tarea publicacion — prioridad media, asignado=rena

CONSULTAS POR ESTADO: usar vehicles_db(get_by_estado) con el estado exacto.
Estados consignación: a_ingresar/confirmado/va_a_pensarlo/necesita_follow_up/reservado/vendido
Estados propio: en_stock/en_reparacion/reservado/vendido
NUNCA pedirle al usuario un ID.`,
      },
      {
        role: 'Agente de Clientes',
        model: 'Haiku',
        tools: ['clientes_db', 'interesados_db', 'vehiculos_db'],
        goal: 'Gestionar clientes e interesados. Cruzar demanda con stock.',
        backstory: `CRM de Renato Piermarini Autos.
Tipos cliente: vendedor, comprador, ambos. Verificá duplicados por nombre/teléfono antes de crear.
Al ingresar stock nuevo: interesados_db(match_stock) para cruzar con demanda activa.
Estados interesados: activo/contactado/reservo/compro/perdido.`,
      },
      {
        role: 'Agente de Finanzas',
        model: 'Sonnet',
        tools: ['contabilidad_db', 'vehiculos_db'],
        goal: 'Balances, movimientos, P&L por vehículo. Alertar cash < $500.',
        backstory: `Contabilidad de Renato Piermarini Autos. Moneda USD.
Cuentas: cash, nexo (12% anual), fiwind.
Categorías: commission, vehicle_purchase, vehicle_expense, general_expense, marketing, loan, refund, down_payment, personal_withdrawal, investments, other.
Siempre incluí vehicle_id y cliente_id en movimientos cuando aplique. Sin tablas.`,
      },
      {
        role: 'Agente de Préstamos',
        model: 'Haiku',
        tools: ['prestamos_db', 'clientes_db', 'vehiculos_db'],
        goal: 'Préstamos: registro, pagos, alertas de vencimiento.',
        backstory: `NUEVO PRÉSTAMO:
1. clientes_db(get_all) → buscar acreedor por nombre. Si no existe: clientes_db(save) con es_acreedor=1
2. prestamos_db(save) → acreedor_id, monto_original, tasa_interes_anual=0.15, fecha_vencimiento, monto_a_devolver
3. Confirmar: "✓ Préstamo registrado. Acreedor: X | Monto: $Y | Vence: fecha"
NUNCA pedirle el ID al usuario.`,
      },
      {
        role: 'Agente de Tareas',
        model: 'Haiku',
        tools: ['tareas_db', 'vehiculos_db', 'cron_jobs', 'notas'],
        goal: 'Crear, asignar y completar tareas. Gestionar cron jobs. Gestionar notas personales.',
        backstory: `Tareas: tipos lavado/fotos/publicacion/tramite/seguimiento/otro.
Prioridades: urgente/hoy=alta, normal=media, cuando puedas=baja.
Cron jobs: "diario_09:00", "cada_30m", "semanal_0_09:00", o cron expression.
Notas: usar notas() para pendientes, dudas, respuestas y follow-ups personales de Renato.`,
      },
      {
        role: 'Agente de Documentación',
        model: 'Haiku',
        tools: ['checklist_docs', 'tareas_db', 'vehiculos_db'],
        goal: 'Checklists de papeles. Actualizar según respuesta del usuario.',
        backstory: `IDs válidos: formulario_08, cedula_titular, titulo, informe_dominio, verificacion_policial, libre_deudas.
Confirmados → actualizar checklist. Faltantes críticos → crear tarea.
Usá VehiclesTool si necesitás encontrar el vehicle_id por nombre de auto.`,
      },
      {
        role: 'Agente de Transferencias y Trámites',
        model: 'Opus',
        tools: ['tramites_automotor', 'tareas_db', 'vehiculos_db', 'clientes_db', 'transferencias_db'],
        goal: 'Gestionar transferencias de dominio automotor (DNRPA) y trámites vehiculares.',
        backstory: `"Transferencia" = SIEMPRE transferencia de dominio automotor (DNRPA). Nunca bancaria.
DATOS A RECOPILAR: comprador, ubicación, medio de pago, registro seccional, precarga, fecha/hora turno.
Con todos los datos → transferencias(iniciar) → checklist → actualizar docs.
OTROS TRÁMITES: DNRPA, SINTYS, formulario 08. Sin patente → pedirla.`,
      },
      {
        role: 'Agente de Email',
        model: 'Haiku',
        tools: ['gmail', 'clientes_db', 'vehiculos_db'],
        goal: 'Enviar y leer emails. Notificar equipo y clientes.',
        backstory: `INTERNOS: solo a rena y fran. Asunto: "IMPORTANTE: [tema]".
EXTERNOS: buscar email en clientes_db antes de enviar. Si no tiene email: reportar sin enviar.
Tono externo: profesional, español.`,
      },
    ],
  },
]

// ── Routing table ─────────────────────────────────────────────────────────────

const ROUTING = [
  { keyword: 'transferencia', crew: 'TransferenciaCrew', trigger: '"iniciar transferencia", "transferencias activas", "ver transferencias"' },
  { keyword: 'bienvenida', crew: '(respuesta directa)', trigger: '"hola", "buenas", "qué podés hacer" — mensajes < 60 chars' },
  { keyword: 'tareas', crew: 'TareasCrew', trigger: '"anotá", "recordatorio:", "tareas para", "no olvidar"' },
  { keyword: 'stock', crew: 'StockCrew', trigger: '"el corolla", "modificar", "en stock", "consignación", "nueva visita", marca/modelo, estado verbs' },
  { keyword: 'research', crew: 'ResearchCrew', trigger: '"buscá", "googleá", "averiguá", "información sobre"' },
  { keyword: 'email', crew: 'EmailCrew', trigger: '"mail", "email", "notificá", "avisá al cliente"' },
  { keyword: 'documentos', crew: 'DocumentosCrew', trigger: '"cédula", "checklist", "papeles", "tengo el/la"' },
  { keyword: 'finanzas', crew: 'FinanzasCrew', trigger: '"balance", "caja", "nexo", "plata", "/entra-dinero"' },
  { keyword: 'completa', crew: 'StockCrew', trigger: 'todo lo demás no clasificado' },
]

// ── Component ─────────────────────────────────────────────────────────────────

function Badge({ text, variant = 'default' }: { text: string; variant?: 'default' | 'new' | 'sonnet' | 'haiku' | 'opus' }) {
  const styles: Record<string, string> = {
    default:  'bg-gray-100 text-gray-600',
    new:      'bg-green-100 text-green-700',
    sonnet:   'bg-blue-100 text-blue-700',
    haiku:    'bg-gray-100 text-gray-500',
    opus:     'bg-purple-100 text-purple-700',
  }
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${styles[variant]}`}>{text}</span>
  )
}

function AgentCard({ agent }: { agent: typeof CREWS[0]['agents'][0] }) {
  const [open, setOpen] = useState(false)
  const modelVariant = agent.model === 'Sonnet' ? 'sonnet' : agent.model === 'Opus' ? 'opus' : 'haiku'
  return (
    <div className="border border-gray-100 rounded">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">{agent.role}</span>
          <Badge text={agent.model} variant={modelVariant} />
          {agent.tools.map(t => (
            <Badge key={t} text={t} />
          ))}
        </div>
        <span className="text-gray-300 ml-4 shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 space-y-3 pt-3">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Goal</p>
            <p className="text-sm text-gray-700">{agent.goal}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Backstory / System Prompt</p>
            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-gray-50 rounded p-3 leading-relaxed">
              {agent.backstory}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Setup() {
  const [section, setSection] = useState<'tools' | 'crews' | 'routing'>('tools')
  const totalAgents = CREWS.reduce((a, c) => a + c.agents.length, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Setup</h1>
        <span className="text-sm text-gray-400">{TOOLS.length} tools · {totalAgents} agentes · {CREWS.length} crews</span>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['tools', 'crews', 'routing'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-4 py-2 text-sm capitalize transition-colors ${
              section === s
                ? 'text-gray-900 border-b-2 border-gray-900 -mb-px'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Tools */}
      {section === 'tools' && (
        <div className="space-y-2">
          {TOOLS.map(tool => (
            <div key={tool.name} className="border border-gray-200 rounded px-4 py-3 flex gap-4">
              <div className="w-44 shrink-0">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-gray-900">{tool.name}</code>
                  {tool.isNew && <Badge text="nuevo" variant="new" />}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-600">{tool.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {tool.agents.map(a => (
                    <span key={a} className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">{a}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Crews */}
      {section === 'crews' && (
        <div className="space-y-8">
          {CREWS.map(crew => (
            <section key={crew.name}>
              <div className="flex items-baseline gap-3 mb-3">
                <p className="text-sm font-semibold">{crew.name}</p>
                <p className="text-xs text-gray-400">{crew.subtitle}</p>
              </div>
              <div className={`border rounded divide-y divide-gray-100 ${crew.color}`}>
                {crew.agents.map(agent => (
                  <AgentCard key={agent.role} agent={agent} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Routing */}
      {section === 'routing' && (
        <div className="space-y-6">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">AgenciaFlow — Routing por dominio</p>
            <div className="border border-gray-200 rounded divide-y divide-gray-100">
              {ROUTING.map(r => (
                <div key={r.keyword} className="flex items-start gap-4 px-4 py-3">
                  <code className="text-sm font-mono text-gray-500 w-28 shrink-0">{r.keyword}</code>
                  <div className="flex-1 flex items-center gap-3">
                    <span className="text-gray-300">→</span>
                    <span className="text-sm font-medium">{r.crew}</span>
                  </div>
                  <p className="text-xs text-gray-400 text-right max-w-xs">{r.trigger}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Phone map</p>
            <div className="border border-gray-200 rounded divide-y divide-gray-100">
              {[
                { phone: '5492216699450', alias: 'rena' },
                { phone: '5492213589822', alias: 'fran' },
                { phone: '5491161590852', alias: 'negocio' },
              ].map(p => (
                <div key={p.phone} className="flex items-center gap-4 px-4 py-2">
                  <code className="text-sm font-mono text-gray-500">{p.phone}</code>
                  <span className="text-gray-300">→</span>
                  <span className="text-sm">{p.alias}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Emails automáticos</p>
            <div className="border border-gray-200 rounded divide-y divide-gray-100">
              {[
                'Tarea lavado creada → avisa a Dual Team',
                'Visita registrada → notifica propietario',
                'Auto reservado → notifica propietario',
                'Oferta recibida/respondida → notifica propietario/interesado',
              ].map((e, i) => (
                <p key={i} className="px-4 py-2 text-sm text-gray-600">{e}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
