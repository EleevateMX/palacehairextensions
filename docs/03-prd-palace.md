# 03 · PRD — Palace Hair Extensions OS

**Estado de requisitos:** ✅ confirmado (pedido explícitamente por la clienta) · 🟦 propuesto (recomendación del equipo) · ❓ pendiente de validación con la clienta.

## 1. Visión
Una sola plataforma que conecte toda la experiencia de una clienta: **primer mensaje → cotización → reserva → pago → servicio → consumo de inventario → próxima visita**, y que le permita a la propietaria saber en todo momento cuánto vendió, qué tiene, qué necesita comprar, quién está disponible y qué es rentable.

## 2. Usuarias y necesidades
| Persona | Necesidad principal | Dispositivo |
|---|---|---|
| Propietaria | Ventas, utilidad por servicio, inventario crítico, productividad del equipo | Teléfono y laptop |
| Administración | Configuración, compras, comisiones, cortes | Laptop |
| Recepción | Agendar sin errores, cobrar, atender mensajes, ver quién llega | Tablet/laptop en mostrador |
| Estilista | Su agenda, sus clientas, registrar consumo real, sus comisiones | Teléfono |
| Inventarios | Entradas, conteos, mermas, órdenes de compra | Teléfono/laptop |
| Clienta | Reservar, pagar anticipo, reprogramar, comprar productos | Teléfono |

## 3. Preguntas que el sistema debe responder (✅)
| Pregunta de la propietaria | Dónde se responde | Fase |
|---|---|---|
| ¿Cuánto vendí? | Dashboard (ventas del día, ticket promedio) | MVP |
| ¿Qué productos tengo? | Inventario (existencias, reservado, disponible) | MVP |
| ¿Qué necesito comprar? | Inventario crítico + órdenes de compra | MVP / V4 sugerido |
| ¿Cuáles son mis próximas citas? | Dashboard + Agenda | MVP |
| ¿Qué estilistas están disponibles? | Agenda / Nueva cita (motor de disponibilidad) | MVP |
| ¿Cuántas clientas puedo atender? | Ocupación por personal y recurso | MVP básico / V4 |
| ¿Cuánto gané por servicio? | Rentabilidad por servicio (materiales + mano de obra + costos) | V2 |
| ¿Qué clientas necesitan seguimiento? | Recordatorios de mantenimiento, inactivas | MVP (datos) / V2 (envío) |
| ¿Qué conversaciones requieren atención? | Bandeja + estados de transferencia | V3 |
| ¿Qué empleadas generan mejores resultados? | Productividad y comisiones | V2 |

## 4. Alcance por módulo

### Inventario
- ✅ Productos con variantes: SKU, código de barras, tono, largo, textura, técnica, presentación, unidad, costo, precio, promoción, mínimo, ubicación física.
- ✅ Entradas, salidas, compras, ajustes, mermas, devoluciones, transferencias, conteos físicos, órdenes de compra, historial.
- ✅ Inventario reservado vs disponible; una sola fuente de existencias para POS, servicios y tienda.
- ✅ Consumo por servicio: estimar → reservar → consumir real.
- 🟦 Lotes de cabello con trazabilidad por clienta (V4).
- ❓ ¿Se venden extensiones por paquete, por gramo o por mechón? Define unidades y cotizador.

### Agenda y capacidad
- ✅ Servicios con duración, preparación, limpieza, margen, personal capacitado, recursos, materiales, anticipo y cancelación.
- ✅ Duración por empleada; recursos con unidades; turnos, descansos, ausencias, festivos.
- ✅ Protección contra doble reserva y condiciones de carrera.
- ✅ Estados separados de reserva, asistencia y pago.
- ✅ Apartados provisionales con expiración; lista de espera; servicios consecutivos.
- 🟦 Vista por recurso, arrastrar y reprogramar en UI (V2; la función `reschedule_appointment` ya existe).
- ❓ Número real de estaciones, lavacabezas y cabinas; horarios; plantilla de personal.

### POS
- ✅ Productos, servicios, paquetes, anticipos, tarjetas de regalo; descuentos autorizados, cupones, pagos parciales y divididos, propinas, devoluciones, cancelaciones, cortes de caja, saldos pendientes.
- ❓ Terminal de tarjeta actual (Clip, Mercado Pago Point, banco) y si se requiere impresión de tickets.

### CRM
- ✅ Expediente: contacto, nacimiento opcional, canal, historial, preferencias, tono, tipo y largo de extensiones, mantenimiento, próxima visita, notas, fotos con consentimiento.
- ✅ Separación de información comercial vs sensible.
- ✅ Automatizaciones con consentimiento (V2–V3).

### Personal
- ✅ Roles mínimos: propietaria, administración, recepción, estilista, inventarios, ventas.
- ✅ Horarios, ausencias y vacaciones con aprobación.
- ✅ Comisiones: % por servicio, fijo por servicio, % por venta, escalonadas, bono por objetivo (motor en `@palace/domain`).
- ❓ Esquema real de comisión del salón y si se calcula con o sin IVA.

### Finanzas
- ✅ Ingresos, egresos, gastos, CMV, costo de servicios, márgenes, anticipos, saldos, devoluciones, comisiones, flujo operativo, exportación Excel/CSV (V2).
- ✅ CFDI mediante PAC autorizado (sin sistema fiscal ficticio) — V2/V3.

### Portal, tienda y mensajería
- ✅ Portal de reservas móvil con valoración previa para extensiones (V2).
- ✅ Tienda en línea con existencias reales (V2).
- ✅ WhatsApp/Messenger con bot que consulta datos reales y transferencia humana (V3).

### Diferenciadores propuestos por la clienta (✅)
1. **Cotizador de extensiones** — motor implementado (`quoteExtensions`), UI en V2.
2. **Seguimiento de mantenimiento** — implementado al completar la cita.
3. **Inventario asignado por clienta** — implementado (`stock_reservations` con `client_id` / cita).
4. **Recepción digital asistida** — dashboard base en MVP; panel completo en V2.

## 5. No objetivos (por ahora)
- Multiempresa (solo una empresa con `location_id` listo para sucursales).
- Nómina o cumplimiento laboral (solo reportes auditables).
- Almacenar datos de tarjetas (solo referencias de proveedor).
- Marketplace de terceros.

## 6. Métricas de éxito (🟦, a validar)
- 0 dobles reservas y 0 sobreventas (garantizado por la base de datos y probado).
- Tiempo de agendar una cita en recepción < 60 s.
- ≥ 80% de clientas con fecha de mantenimiento sugerida tras su instalación.
- Diferencias de corte de caja registradas y explicadas al 100%.

## 7. Identidad visual
❓ Pendiente. La interfaz usa tokens neutros provisionales (`apps/web/app/globals.css`, `apps/web/config/brand.ts`) y `business_settings.brand` para personalizar colores, tipografía y logotipo sin cambiar código.
