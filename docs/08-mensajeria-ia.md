# 08 · Mensajería omnicanal e IA

Fuentes y cifras: [`research/integraciones-costos-legal.md`](research/integraciones-costos-legal.md) §1–3 y §7.4 (verificación 2026-10-21; varias tarifas de Meta provienen de fuentes secundarias y **deben confirmarse** antes de presupuestar).

## 1. Hechos que condicionan el diseño
- **WhatsApp Cloud API**: desde 2026-10-01 las respuestas dentro de la ventana de 24 h vuelven a cobrarse (1,000 gratis por número al mes) y las plantillas *utility* dentro de la ventana dejan de ser gratuitas (fuente secundaria). Fuera de la ventana solo plantillas aprobadas.
- **Política de IA de Meta**: desde 2026-01-15 se prohíben los asistentes de IA de propósito general en WhatsApp; los bots de reservas/soporte que usan IA de forma incidental están permitidos. → El bot de Palace se limita a temas del salón y siempre ofrece una persona.
- **Messenger/Instagram**: ventana de 24 h; etiqueta `HUMAN_AGENT` permite 7 días solo para respuestas humanas. El *Handover Protocol* está siendo reemplazado por *Conversation Routing*.
- **Manychat** (planes desde 2026-03-02): Essential US$17, Pro US$39 (External Request, token de API), Business US$99, Advanced US$199. Un *External Request* con *timeout* detiene el flujo.

## 2. Comparación de alternativas
| Criterio | A. Manychat integrado | B. Bandeja propia (Cloud API + Graph API) |
|---|---|---|
| Tiempo a producción | Semanas | 1–2 meses adicionales |
| Costo mensual extra | +US$39 a +US$128 | US$0 (solo tarifas de Meta) |
| Fuente de verdad | Palace (vía webhooks/External Request) | Palace |
| Control de transferencia bot↔humano | Limitado a Live Chat de Manychat; riesgo de doble respuesta entre sistemas | Total, garantizado en BD |
| Historial unificado con expediente | Requiere sincronización | Nativo |
| Dependencia de proveedor | Alta | Baja |
| Requisitos Meta (verificación de negocio, número, plantillas) | Iguales | Iguales |

**Recomendación (alineada con la clienta)**: empezar con **Manychat como puente** para validar procesos de recepción, con Palace como fuente de verdad (precios, horarios, disponibilidad, reservas vía API propia), y medir costo y fricción real 2–3 meses. Si el volumen o la fricción lo justifican, migrar a la **bandeja propia** (el esquema ya está listo). ❓ Decisión final de la clienta.

## 3. Garantías ya implementadas en la base de datos
- `webhook_events` con `unique (provider, event_id)` y `ingest_webhook_event()` (solo servidor; rechaza firmas inválidas): duplicados ignorados — escenario 12.
- `conversations.state`: `automatic → pending_human → assigned → in_progress → resolved`.
- Disparador `BOT_SILENCED`: un mensaje del bot se rechaza si la conversación no está en `automatic` — escenarios 10–11.
- Un mensaje de una persona del equipo cambia la conversación a `in_progress` y la asigna.
- Índice único: **una sola respuesta saliente por mensaje entrante** (bot y humano no pueden contestar el mismo mensaje).
- `escalate_conversation()` crea alerta interna; `reactivate_bot()` solo si el caso está resuelto, por una persona autorizada.
- `last_inbound_at` para respetar la ventana de 24 h.
- Máquina de estados equivalente en TypeScript (`@palace/domain/handover`) con pruebas.

## 4. Recepcionista virtual: funciones controladas
El modelo de IA **no** accede a la base de datos ni inventa datos: solo puede llamar herramientas del servidor con permisos mínimos.

| Herramienta | Fuente | Responde |
|---|---|---|
| `list_services()` | `services` (online, activos) | Servicios, duración, precio o "desde" |
| `quote_extensions(largo, volumen, técnica, tono?)` | `quoteExtensions` + existencias | Rango estimado + "requiere valoración" |
| `list_tones(técnica, largo)` | `v_stock_availability` (solo disponibilidad en rangos, sin cantidades exactas) | Tonos y largos disponibles |
| `find_slots(servicio, fecha, especialista?)` | Motor de disponibilidad | Horarios válidos |
| `create_hold(...)` | `create_appointment` con apartado y anticipo | Liga de pago; confirmación solo tras el pago |
| `get_my_appointment(teléfono verificado)` | Citas de la clienta | Consulta, reprogramación según política |
| `business_info()` | `locations`, horarios, políticas | Dirección, horarios, cuidados |
| `handover(motivo)` | `escalate_conversation` | Transfiere a recepción |

Reglas: sin datos → transferir; 2 fallos → transferir (`MAX_BOT_FAILURES`); temas delicados (quejas, alergias, reacciones, reembolsos) → transferir; nunca confirmar precio final de extensiones; confirmar citas solo cuando la BD lo confirma.

## 5. Flujo de transferencia humana

```mermaid
sequenceDiagram
  actor C as Clienta
  participant M as Meta / Manychat
  participant API as Webhook Palace (firma verificada)
  participant DB as PostgreSQL
  participant B as Bot (Edge Function)
  actor H as Recepción
  C->>M: "¿Puedo hablar con una persona?"
  M->>API: evento (id único)
  API->>DB: ingest_webhook_event → nuevo
  API->>DB: insert message (inbound)
  API->>B: procesar
  B->>DB: escalate_conversation('customer_request')
  DB-->>H: alerta + conversación en pending_human
  B--xDB: intento de respuesta del bot → BOT_SILENCED
  H->>DB: asigna y responde (in_progress)
  DB->>M: envío del mensaje humano
  H->>DB: resolve; reactivar bot solo por regla explícita
```

## 6. Proveedor de IA
Configurable por interfaz. Propuesta: modelo pequeño y económico (p. ej. Claude Haiku) para el primer nivel y uno mayor para casos complejos; costo estimado ≈ US$2–10/mes para ~600 conversaciones (docs/10). Requisitos: registro de cada llamada a herramienta, sin datos sensibles en los *prompts*, límite de contexto por conversación.

## 7. Pendientes
- ❓ Número de WhatsApp a usar y verificación del negocio en Meta.
- ❓ Cuenta de Manychat existente.
- 🟦 Plantillas: confirmación, recordatorio, cuidados posteriores, mantenimiento, reseña (sometidas a aprobación de Meta).
- Confirmar tarifas de Meta para México en la documentación oficial.
