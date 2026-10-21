# Backlog — historias de usuario

Actualizado 2026-10-22 tras la entrega 2 (MVP).

Estado: ✅ hecho · 🔶 parcial (base de datos/lógica lista, falta UI) · ⬜ pendiente. Requisito: ✅ confirmado · 🟦 propuesto · ❓ por validar.

| ID | Historia | Criterios de aceptación | Depende de | Fase | Req. | Estado |
|---|---|---|---|---|---|---|
| AUTH-1 | Como propietaria quiero dar de alta personal con un rol para controlar qué ve cada persona | Sin registro público; rol obligatorio; usuario sin expediente no ve datos | — | MVP | ✅ | ✅ |
| AUTH-2 | Como recepción quiero entrar con PIN en la tablet del salón | PIN con hash, límite de intentos por usuario y por IP, sesión real de Supabase | AUTH-1 | V2 | 🟦 | ⬜ |
| CONF-1 | Como admin quiero configurar horarios, festivos y días especiales | Cita fuera de horario rechazada (`OUTSIDE_BUSINESS_HOURS`) | — | MVP | ✅ | ✅ |
| CONF-2 | Como admin quiero configurar servicios con duración, preparación, limpieza, margen, recursos, materiales, anticipo y cancelación | Valores usados por motor y BD | CONF-1 | MVP | ✅ | ✅ |
| CONF-3 | Como admin quiero registrar unidades de recursos (estaciones, lavacabezas, cabinas) | Cada unidad reservable una vez por horario | — | MVP | ✅ | ✅ |
| CONF-4 | Como admin quiero personalizar marca (colores, logo, tipografía) sin desplegar | `business_settings.brand` aplicado a tokens | — | V2 | ✅ | ⬜ |
| AG-1 | Como recepción quiero ver horarios válidos y agendar en un clic | Solo horarios válidos; doble reserva imposible | CONF-* | MVP | ✅ | ✅ |
| AG-2 | Como recepción quiero ver la agenda del día por especialista | Citas, apartados, bloqueos y ausencias | AG-1 | MVP | ✅ | ✅ |
| AG-3 | Vistas semanal, mensual y por recurso; arrastrar para reprogramar | Reprogramación revalidada en BD | AG-2 | MVP/V2 | ✅ | ✅ |
| AG-4 | Cancelar cita liberando agenda y material | Escenario 3 | AG-1 | MVP | ✅ | ✅ |
| AG-5 | Cambiar de especialista | Escenario 4 | AG-1 | MVP | ✅ | ✅ |
| AG-6 | Bloqueos manuales | Bloqueo impide citas | AG-1 | MVP | ✅ | ✅ |
| AG-7 | Lista de espera | Ofrecer hueco liberado | AG-4 | MVP | ✅ | ✅ |
| AG-8 | Apartados con expiración y anticipo | Escenario 15 | PAY-1 | MVP/V2 | ✅ | ✅ |
| AG-9 | Llegó / en servicio / completar con consumo real | Consumo real descuenta; programa mantenimiento | INV-3 | MVP | ✅ | ✅ |
| AG-10 | Servicios consecutivos en una visita | Motor asigna cadena sin huecos | AG-1 | MVP | ✅ | ✅ |
| STAFF-1 | Como estilista quiero solicitar vacaciones | Escenario 5 | AUTH-1 | MVP | ✅ | ✅ |
| STAFF-2 | Como propietaria quiero ver comisiones por periodo | Base neta de descuentos/devoluciones; escenario 9 | POS-1 | MVP | ✅ | ✅ |
| STAFF-3 | Productividad por estilista | Citas, ventas, ocupación | STAFF-2 | V2 | ✅ | ✅ |
| INV-1 | Alta de productos con variantes (tono, largo, textura, técnica) | SKU único; costo oculto a roles no autorizados | — | MVP | ✅ | ✅ |
| INV-2 | Entradas, mermas, ajustes con motivo, transferencias | Ledger inmutable | INV-1 | MVP | ✅ | ✅ |
| INV-3 | Reservar material para cita / clienta | Reservado no vendible; escenario 6 | INV-1 | MVP | ✅ | ✅ |
| INV-4 | Conteo físico | Diferencias como movimientos | INV-1 | MVP | ✅ | ✅ |
| INV-5 | Órdenes de compra y recepción parcial | Recepción genera entradas | INV-1 | MVP | ✅ | ✅ |
| INV-6 | Alertas de existencias bajas | Dashboard muestra críticos | INV-1 | MVP | ✅ | ✅ |
| INV-7 | Lotes y costo promedio | — | INV-2 | V4 | 🟦 | ⬜ |
| POS-1 | Cobrar servicios + productos con pagos divididos y propina | Precio en servidor; escenarios 2, 7 | INV-1 | MVP | ✅ | ✅ |
| POS-2 | Descuentos autorizados y cupones | Solo owner/admin descuentan | POS-1 | MVP | ✅ | ✅ |
| POS-3 | Devoluciones y cancelaciones | Escenario 8 | POS-1 | MVP | ✅ | ✅ |
| POS-4 | Corte de caja | Diferencia registrada | POS-1 | MVP | ✅ | ✅ |
| POS-5 | Saldos pendientes | Abonos | POS-1 | MVP | ✅ | ✅ |
| CRM-1 | Expediente de clienta | Separación comercial/sensible | AUTH-1 | MVP | ✅ | ✅ |
| CRM-2 | Consentimientos y fotos | Fotos solo con consentimiento | CRM-1 | MVP | ✅ | 🔶 consentimientos ✅; subida de fotos requiere Storage |
| CRM-3 | Anonimización (ARCO) | Conserva contabilidad | CRM-1 | MVP | ✅ | ✅ (falta borrar archivos de Storage) |
| CRM-4 | Segmentos: frecuentes, inactivas, nuevas | — | CRM-1 | V2 | ✅ | ✅ |
| QUOTE-1 | Cotizador de extensiones | Rango + valoración obligatoria si falta info | INV-1 | V2 | ✅ | ✅ |
| PORTAL-1 | Portal de reservas | Flujo de 9 pasos; valoración previa | AG-8, PAY-1 | V2 | ✅ | 🔶 reserva ✅; pago del anticipo pendiente de pasarela |
| SHOP-1 | Tienda en línea | Existencias reales; sin sobreventa | INV-3, PAY-1 | V2 | ✅ | ⬜ |
| PAY-1 | Pagos en línea con webhooks firmados | Idempotente; escenario 12 | — | V2 | ✅ | 🔶 tablas e idempotencia; adaptador pendiente |
| MSG-1 | Bandeja / Manychat | Escenarios 10–12 | CRM-1 | V3 | ✅ | 🔶 esquema |
| MSG-2 | Recepcionista virtual con funciones controladas | No inventa datos | MSG-1 | V3 | ✅ | ⬜ |
| FIN-1 | Gastos, utilidad, rentabilidad por servicio | Exportación Excel/CSV | POS-1 | V2 | ✅ | ✅ |
| FIN-2 | CFDI vía PAC | Sin facturación ficticia | FIN-1 | V3 | ✅ | ⬜ |
| OPS-1 | Respaldos y restauración probada | Prueba trimestral | — | MVP | ✅ | ⬜ (procedimiento en docs/06) |
| OPS-2 | E2E con Playwright | Flujos principales | MVP UI | MVP | ✅ | ✅ |
