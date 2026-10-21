# 12 · Criterios de aceptación y pruebas

Comandos: `pnpm test` (dominio) · `pnpm test:db` (migraciones + RLS + concurrencia en PostgreSQL real) · `pnpm --filter @palace/web build`.

**Resultado verificado el 2026-10-22 en este entorno:** dominio 26/26 ✅ · base de datos 83/83 ✅ (PostgreSQL 16.15; CI usa 17) · build de Next.js ✅ · **E2E 73/73 ✅** (Playwright + Chromium contra los binarios oficiales de Supabase Auth v2.185.0 y PostgREST v13.0.7; `pnpm --filter @palace/e2e exec playwright test` tras `bash scripts/local-stack/start.sh`), repetido en corridas consecutivas sobre la misma BD.

## 1. Escenarios obligatorios
| # | Escenario | Criterio | Prueba | Estado |
|---|---|---|---|---|
| 1 | Dos clientas reservan simultáneamente el último horario | Exactamente una cita; la otra recibe `SLOT_TAKEN` | `booking.test.ts` (dos conexiones concurrentes) | ✅ |
| 2 | Dos ventas consumen la última unidad | Una venta; la otra `INSUFFICIENT_STOCK`; existencias 0 | `inventory-pos.test.ts` (concurrente) | ✅ |
| 3 | Cancelar cita con material reservado | Reservado vuelve a 0; horario libre | `booking.test.ts` | ✅ |
| 4 | Cambiar cita de estilista | Valida capacitación y disponibilidad; libera a la anterior | `booking.test.ts` | ✅ |
| 5 | Empleada solicita vacaciones | No se aprueba con citas en conflicto; aprobada bloquea agenda; no puede autoaprobarse | `booking.test.ts` | ✅ |
| 6 | Se agota un producto asociado a una reserva | Lo reservado no se vende; nueva cita falla o queda "material faltante" con alerta | `inventory-pos.test.ts` | ✅ |
| 7 | Venta con anticipo | Anticipo aplicado una sola vez; cita pagada | `inventory-pos.test.ts` | ✅ |
| 8 | Devolución | Reingreso a inventario; solo owner/admin; no se devuelve dos veces | `inventory-pos.test.ts` | ✅ |
| 9 | Se genera una comisión | Base neta de descuento y devolución; estilista ve solo lo suyo | `inventory-pos.test.ts` + `commissions.test.ts` | ✅ |
| 10 | El bot no sabe y transfiere | Conversación `pending_human`; bot silenciado; alerta | `handover.test.ts` + `security-messaging.test.ts` | ✅ (lógica y BD; integración con Meta pendiente) |
| 11 | El humano toma control y el bot deja de intervenir | Mensaje del bot rechazado (`BOT_SILENCED`); reactivación solo tras resolver | ídem | ✅ (ídem) |
| 12 | Webhooks duplicados | Segundo evento ignorado; firma inválida rechazada; pago duplicado no se registra | `security-messaging.test.ts`, `booking.test.ts` | ✅ (BD; verificación de firma HTTP pendiente con el adaptador) |
| 13 | Acceso sin permiso | Estilista solo ve sus clientas; no cobra ni ve costos; inventarios no ve clientas; anon sin RPC; notas sensibles restringidas | `security-messaging.test.ts` | ✅ |
| 14 | Agendar fuera de horario | `OUTSIDE_BUSINESS_HOURS`, `STAFF_NOT_WORKING`, festivo | `booking.test.ts` + `availability.test.ts` | ✅ |
| 15 | Pago confirmado tras expirar la reserva | Si el horario sigue libre: se confirma; si no: `needs_refund` + alerta crítica | `booking.test.ts` | ✅ |

## 2. Pruebas adicionales incluidas
Limpieza de estación (15:00 → 15:20), idempotencia de citas y ventas, precio calculado en servidor, descuentos no autorizados, pagos divididos/parciales con propina y saldo, referencia de terminal duplicada, corte de caja, movimientos inmutables y ajustes con motivo, consumo real y mantenimiento al completar, consentimiento de fotos, usuario sin expediente, una respuesta por mensaje entrante, motor de disponibilidad (turnos, descansos, festivos, servicios consecutivos, duración por especialista, anticipación mínima), cotizador, conversión de zona horaria.

## 3. Criterios por módulo (MVP)
- **Agenda**: solo se ofrecen horarios válidos; ninguna combinación de acciones concurrentes produce traslape (garantizado por BD); cada cambio queda en `audit_log`.
- **Inventario**: `disponible = existencias − reservado` en POS, citas y tienda; ningún saldo negativo; todo cambio de existencias tiene movimiento.
- **POS**: el total lo calcula el servidor; la suma de pagos nunca supera el total; reintentos no duplican; devoluciones y descuentos requieren rol.
- **CRM**: el personal ve solo lo que su rol permite; fotos solo con consentimiento; anonimización conserva registros contables.
- **Seguridad**: RLS en todas las tablas; ninguna función pública ejecutable por `anon`; llaves secretas solo en servidor.
- **UX**: estados de carga, error y vacío en cada pantalla; usable a 360 px de ancho; botones de al menos 44 px de alto.

## 4. Cobertura E2E (flujos en el navegador)
Agenda (agendar desde horarios válidos, dos servicios, tono con reserva, completar con consumo real y mantenimiento, cancelar, reprogramar, cambiar especialista, bloqueos, lista de espera, material faltante, vista de estilista, 360 px), recepción, configuración (servicios, recursos, comisiones, horarios, cotizador, permisos), personal (alta que inicia sesión, vacaciones, conflictos, candado de propietaria), clientas (alta con consentimientos, revocación, notas sensibles, apartado, anonimización, móvil), cotizador, inventario (alta, entradas, mermas, ajustes, kardex, conteos, compras, permisos de costo, CSV), POS (pago dividido, propina, doble clic, descuentos por rol, cupón, saldo, tarjeta de regalo, anticipo de cita), caja (corte con desglose), ventas (devolución, cancelación, CSV), reportes y finanzas (comisiones, gastos, rentabilidad, CSV, permisos) y portal público (sin anticipo, con anticipo, privacidad, honeypot).

## 5. Pendiente de automatizar
Verificación HTTP de firmas de webhooks (con el adaptador real de pagos/Meta) y políticas de Storage (requieren Supabase real).
