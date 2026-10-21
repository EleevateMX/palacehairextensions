# Benchmark de mercado — Software de gestión para salones

**Proyecto:** Palace Hair Extensions OS (salón de extensiones de cabello, México)
**Fecha de verificación:** 2026-10-21
**Alcance:** Fresha, GlossGenius, Boulevard, Vagaro, Booksy, Square Appointments, AgendaPro, Reservo, Bewe; breve: Timely, Zenoti, Phorest; nicho: herramientas "para extensionistas".

> **Convenciones de verificación**
> - ✅ **Verificado**: leído directamente en la página oficial de precios/funciones el 2026-10-21.
> - 🟡 **Fuente secundaria**: dato de reseñas/agregadores (Capterra, Pabau, SchedulingKit, Koalendar, etc.); puede estar desactualizado o sesgado (varios son competidores).
> - ❌ **No verificado**: no se encontró confirmación; tratar como hipótesis.
> - Los precios en USD no incluyen impuestos. En México los planes en MXN se muestran "+ IVA".
> - Ninguna función de este documento se atribuye a Palace: todo lo descrito en la sección de proveedores es de terceros. Las secciones "Oportunidades" describen **propuestas** para Palace, no funciones existentes.

---

## 1. Resumen ejecutivo

1. **El mercado resuelve bien lo genérico** (agenda, reservas online, recordatorios, POS, CRM básico, depósitos, comisiones). Fresha, Booksy y AgendaPro cubren eso en México a precios bajos (≈ US$15/miembro/mes en Fresha; desde $499 MXN/mes en Booksy MX; desde $299–$1,500 MXN/mes + IVA en AgendaPro MX).
2. **Ningún proveedor revisado modela el negocio de extensiones de cabello**: inventario con variantes por tono × largo × textura × técnica × gramos, apartado (reserva) de mechones para una clienta específica, cotizador que combine producto + mano de obra + número de sesiones, o seguimiento de mantenimiento (move-up / retiro / recolocación) ligado al lote de pelo instalado. Esta es la brecha principal (búsquedas específicas no encontraron estas funciones en ninguna plataforma mayor; solo un nicho estadounidense, Hair Pro Appointments, menciona "Hair Extension Inventory Tracking" sin detalle verificable).
3. **Capacidad por recursos** (sillas/estaciones/cabinas) existe en Fresha ("Recursos"), GlossGenius (Gold+, "Room & Resource Management"), Vagaro ("Calendar & resource management") y Boulevard; AgendaPro ofrece "Control de ocupación". Pero ninguno combina **staff + estación + disponibilidad de pelo en stock** como restricción de reserva.
4. **WhatsApp en México**: Fresha cobra notificaciones por WhatsApp (US$0.04–0.11/mensaje tras cuota) ✅; AgendaPro lo vende como complemento (desde $100 MXN/mes por 50 mensajes) y "Vínculo Agenda-WhatsApp" en Premium ✅; Bewe ofrece un agente IA sobre WhatsApp Business API 🟡. Ninguno ofrece un flujo conversacional nativo de **consulta → fotos → match de tono → cotización → anticipo** por WhatsApp.
5. **Pagos en MX**: los líderes estadounidenses (GlossGenius, Boulevard, Vagaro, Square Appointments) tienen disponibilidad o procesamiento en México **no confirmado** o inexistente. Fresha está expandiéndose activamente a México (hub en CDMX, reporte de sept-2026) 🟡. AgendaPro tiene terminal propia en MX (2.29% + IVA) ✅.
6. **Build vs buy (honesto)**: para operar *mañana*, Fresha o AgendaPro cubren ~70% de las necesidades genéricas con costo mensual bajo. El 30% restante —que es justamente el núcleo económico de un salón de extensiones (inventario caro, apartado, cotización, mantenimiento)— no lo cubren. Recomendación: **híbrido por fases** o **build enfocado** si el inventario de pelo representa una parte material del capital de trabajo (ver §8).

---

## 2. Tabla comparativa — Precios y disponibilidad en México

| Proveedor | Modelo de precio | Precio publicado | Procesamiento de pagos | Comisión marketplace | Disponible en MX | Verif. |
|---|---|---|---|---|---|---|
| **Fresha** | Por miembro reservable | Independiente US$19.95/mes; Equipo US$14.95/miembro/mes; Empresa (20+) a medida | Online 2.79% + US$0.20; presencial 2.29% + US$0.20 (+US$0.10 Tap to Pay); Klarna 5.99% + US$0.30; manual 3.30% + US$0.20 (tarifas de la página en español; **no confirmadas para MX**) | 20% único por cliente nuevo del marketplace, mínimo US$6 | Sí, con operación comercial local en CDMX (reporte sept-2026) | ✅ precios / 🟡 MX |
| **GlossGenius** | Plan plano por tamaño de equipo | Standard US$28 (US$24 anual); Gold US$56 (US$48); Platinum US$168 (US$148); +15% desc. por ubicación adicional | 2.4% + US$0.15 presencial (FAQ); facturas online 2.9% + US$0.30 | No tiene marketplace con comisión | ❌ No confirmado (enfoque EE. UU.) | ✅ precios / ❌ MX |
| **Boulevard** | Por ubicación | Essentials US$143/mes (≤5 proveedores); Premier US$234 promo (normal US$293); Prestige US$328 promo (normal US$410); Enterprise a medida | No publicado; "Offset" traslada 3% al cliente y el negocio paga 1% | No | ❌ No confirmado (enfoque EE. UU.) | ✅ precios / ❌ MX |
| **Vagaro** | Base + licencias de calendario | US$30/mes (promo US$23.99 primeros 6 meses) 1 calendario; +US$10 por calendario hasta 7, después sin costo | No publicado en la página revisada | Listado gratis en marketplace | ❌ Dudoso; instalaciones mayoritariamente EE. UU./CA/UK/AU | ✅ precios / ❌ MX |
| **Booksy (MX)** | Base + usuarios | Desde **$499 MXN/mes** + impuestos; **+$100 MXN/mes** por usuario adicional; prueba 14 días | Tarifas "estándar" no detalladas en la página MX | Página MX: "no cobramos comisiones a ningún cliente nuevo"; Boost (30% primera visita) documentado en otras regiones | Sí | ✅ |
| **Square Appointments** | Por ubicación (EE. UU.) | US$0 / US$29 / US$69 por ubicación/mes (EE. UU.) | MX (pagos Square, vía dLocal): 3.45%–2.79% + IVA según volumen | No | Pagos Square sí operan en MX; **Appointments en MX no confirmado** | 🟡 |
| **AgendaPro (MX)** | Plan + nº de profesionales | Individual **$299 MXN**; Básico **$550 MXN**; Premium **$1,500 MXN**; Pro **$4,500 MXN** (todos /mes + IVA; los planes multi-profesional escalan con un selector de 2–20 profesionales); anual = 2 meses gratis | Terminal propia: $250 MXN/mes o $2,500 MXN + IVA; tasa 2.29% + IVA | Presencia en marketplace incluida | Sí (empresa LatAm, +30,000 negocios) | ✅ |
| **Reservo** | Por profesional | ≈ US$30/usuario/mes; +US$10 por profesional extra (fuentes discrepan) | No verificado | No | Sí (CL, MX, CO, AR); orientación más médica | 🟡 |
| **Bewe** | No publicado | Desde ≈ US$25 (Capterra ES) | No verificado | No | Mercado hispanohablante | 🟡 |
| **Timely** | Por staff | ≈ US$26–69/mes | No verificado | No | ❌ No confirmado | 🟡 |
| **Zenoti** | Cotización | ≈ US$300–400+/mes (fuentes discrepan) | Cotización | No | Cotización | 🟡 |
| **Phorest** | Cotización | No publicado | No publicado | No | ❌ No confirmado | 🟡 |

**Ejemplo de costo para Palace (supuesto: 6 profesionales reservables, 1 sede), solo suscripción, sin pagos ni add-ons:**

| Opción | Cálculo | Aprox. mensual |
|---|---|---|
| Fresha Equipo | 6 × US$14.95 | ≈ US$90 (+ WhatsApp por mensaje tras 600 gratis) |
| Booksy MX | $499 + 5 × $100 | ≈ $999 MXN + impuestos (asume que la base incluye 1 usuario) |
| AgendaPro Premium MX | precio para 6 profesionales **no visible** en la captura (el selector parte de $1,500 MXN) | ≥ $1,500 MXN + IVA + paquetes WhatsApp |
| Boulevard Premier | por ubicación | US$234–293 (si estuviera disponible en MX) |
| GlossGenius Gold | plano ≤9 staff | US$48–56 (si estuviera disponible en MX) |

---

## 3. Tabla comparativa — Funciones

Leyenda: ✅ sí (verificado en sitio oficial) · 🟡 sí según fuente secundaria · ➖ parcial/limitado · ❌ no encontrado · ? sin datos

| Función | Fresha | GlossGenius | Boulevard | Vagaro | Booksy | Square Appts | AgendaPro | Bewe |
|---|---|---|---|---|---|---|---|---|
| Agenda multi-staff | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | 🟡 |
| Reserva online 24/7 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | 🟡 |
| Recursos (sillas/cabinas/equipos) | ✅ "Recursos" (auto-asignación por tipo) | ✅ Gold+ | 🟡 | ✅ | ? | 🟡 | ➖ "Control de ocupación" | ? |
| Tiempo de procesamiento / gap | ✅ "Tiempos de espera" | ✅ | 🟡 | 🟡 | ? | 🟡 | ? | ? |
| Depósitos / política no-show | ✅ | ✅ (+card on file) | ✅ | 🟡 | 🟡 | 🟡 | ➖ "Pago de citas en línea" | ? |
| POS | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ "Sistema de caja" | 🟡 |
| Inventario retail | ✅ | ✅ (código de barras, alertas) | 🟡 | ✅ | ? | 🟡 | ✅ Básico+ (alertas stock) | ? |
| Variantes de producto (tono/largo) | ❌ no documentado | ❌ | ❌ | ❌ | ❌ | 🟡 (Square POS soporta variantes en catálogo) | ❌ | ❌ |
| Reserva de stock por cliente | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cotizaciones / presupuestos | ✅ "Presupuestos y facturas" | ➖ facturas | ❌ | ➖ facturas | ❌ | ➖ facturas | ✅ "Gestión de presupuesto" | 🟡 "envía cotizaciones" (agente IA) |
| Formularios de consulta | ✅ | ✅ Gold+ | ✅ add-on US$65/ubic. | ✅ | ✅ | 🟡 | ✅ Premium (ficha) | ? |
| Comisiones | ✅ plan Equipo | ✅ Platinum | 🟡 | 🟡 | ? | 🟡 | ✅ Básico+ | ? |
| Nómina | ❌ | ✅ add-on US$40 + US$6/seat (EE. UU.) | ❌ | ✅ (EE. UU.) | ❌ | 🟡 | ❌ | ? |
| CRM / historial cliente | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | 🟡 |
| Email/SMS marketing | ✅ (cuotas + pago por uso) | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ? |
| Recordatorio de rebooking | 🟡 | ✅ | ✅ campañas automatizadas | 🟡 | ? | ? | ➖ cumpleaños, encuestas | ? |
| WhatsApp | ✅ notificaciones (pago por mensaje) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ add-on + "Vínculo Agenda-WhatsApp" (Premium) | 🟡 agente IA vía WhatsApp Business API |
| Recepcionista IA | ✅ US$29.95–99.95/centro | ✅ US$50/mes | ? | ✅ "Vera" | ? | ? | ➖ "Charly" (marketing) | 🟡 "Linda" |
| Tienda online de productos | ✅ | ? | ? | ✅ "Online shopping cart" | ? | 🟡 (Square Online) | ❌ | ? |
| Membresías / paquetes / gift cards | ✅ | ✅ | 🟡 | ✅ | ✅ gift cards | 🟡 | ✅ Premium (giftcards) | ? |
| App móvil negocio | ✅ | ✅ | ✅ (iOS) | ✅ | ✅ | ✅ | 🟡 | ? |
| API / integraciones | ➖ Data sync US$295/centro | ? | ✅ Enterprise API | ✅ APIs y webhooks | ? | ✅ (Square APIs) | ✅ solo plan Pro | ? |
| Facturación CFDI (MX) | ❌ no encontrado | ❌ | ❌ | ❌ | ❌ | ❌ | ➖ "Próximamente" | ? |

> Nota: las casillas ❌ significan "no encontrado en la investigación", no necesariamente "no existe".

---

## 4. Notas por proveedor

### 4.1 Fresha ✅ (página de precios oficial, versión en español)
- **Precio:** Independiente US$19.95/mes (1 columna de calendario); Equipo US$14.95 por miembro reservable/mes; Empresa a medida para >20 miembros. Prueba de 7 días. Precios sin impuestos. Ya **no hay plan gratuito** (algunos agregadores aún lo citan; la página oficial muestra solo planes de pago).
- **Pagos:** online 2.79% + US$0.20; presencial 2.29% + US$0.20; manual 3.30% + US$0.20; Klarna 5.99% + US$0.30; datáfonos desde US$139. El uso de pagos es opcional. **No se pudo confirmar** si estas tarifas aplican tal cual a comercios mexicanos ni si Fresha procesa en MXN.
- **Marketplace:** 20% único sobre la primera visita de un cliente nuevo que llega por el marketplace (mínimo US$6). Clientes recurrentes y reservas por enlace propio/Instagram/Facebook: gratis.
- **Comunicaciones:** email automático ilimitado; SMS/WhatsApp: 100 gratis por miembro/mes, después US$0.02 por SMS o **US$0.04–0.11 por WhatsApp**.
- **Funciones listadas:** calendario, listas de espera, TPV, gestión de clientes, formularios de consulta, reseñas, chat con clientes, ventas e inventario, tienda online, presupuestos y facturas, marketing, tarjetas regalo, bonos, membresías, reservas de grupo, tiempos de espera, **recursos**, pruebas cutáneas (patch tests). Equipo: comisiones, salarios, fichaje, precio/duración por miembro.
- **Recursos:** los recursos (salas, equipos) se asignan al servicio y quedan ocupados durante la cita; asignación automática por tipo de recurso (centro de ayuda Fresha) 🟡.
- **Add-ons:** Recepcionista IA US$29.95 (mensajería) / US$99.95 (llamadas) por centro; fidelidad US$59.95/centro; Insights US$9.95/miembro; Data sync US$295/centro; sitio web US$15.95.
- **México:** reporte de sept-2026 indica operación comercial local con sede en CDMX 🟡.
- **Extensiones:** sin funciones específicas. Inventario por variantes y apartado por cliente no documentados.

### 4.2 GlossGenius ✅
- **Precio:** Standard US$28/mes (US$24 anual), Gold US$56 (US$48), Platinum US$168 (US$148). Medspa: Practice Essentials US$148–168, Advanced US$248–298. Sedes adicionales: precio del plan con 15% de descuento. Prueba 14 días.
- **Pagos:** 2.4% + US$0.15 presencial (según FAQ); facturas online 2.9% + US$0.30; payouts instantáneos +1.8%.
- **Funciones:** depósitos integrados, políticas de cancelación/no-show, card-on-file, waitlist automática, **Room & Resource Management (Gold+)**, inventario con código de barras y alertas, comisiones personalizables (Platinum), recordatorios de rebooking, fotos antes/después, formularios. Add-ons: Payroll (US$40 + US$6/seat), Reception IA (US$50/mes).
- **México:** no hay evidencia de operación en México ❌. Producto pensado para EE. UU.
- **Extensiones:** nada específico.

### 4.3 Boulevard ✅
- **Precio (por ubicación):** Essentials US$143/mes (hasta 5 proveedores, 1 sede); Premier US$234 promo "fall pricing" (normal US$293); Prestige US$328 promo (normal US$410); Enterprise a medida. Add-ons: Forms desde US$65/mes/ubicación, QuickBooks US$45/mes/ubicación; emails extra US$0.01. Reseñas reportan cuota de onboarding ≈ US$495 🟡.
- **Pagos:** hardware Duo + iPad; "Boulevard Offset": el cliente paga 3% y el negocio 1% en tarjetas de crédito (modelo de traslado de comisión, regulado en EE. UU.).
- **Fortalezas:** experiencia premium, campañas automatizadas, API enterprise.
- **México:** no confirmado ❌.

### 4.4 Vagaro ✅ (precio) / ❌ (MX)
- **Precio:** US$30/mes (promo US$23.99 primeros 6 meses) para 1 calendario; US$10 por calendario adicional hasta 7; después sin costo adicional. Prueba 30 días.
- **Incluye:** pagos, calendario y **gestión de recursos**, waitlist, membresías/paquetes, inventario, facturas, marketplace gratis, notificaciones ilimitadas, SOAP notes, carrito de compra online, app con marca propia, APIs y webhooks, Data Lake, nómina, BNPL Affirm, IA "Vera".
- **México:** sin confirmación oficial; datos de instalación muestran ~92% EE. UU. 🟡.

### 4.5 Booksy (MX) ✅
- **Precio México:** desde **$499 MXN/mes** + impuestos; **$100 MXN/mes** por usuario adicional; 14 días gratis; sin contrato.
- **Incluye:** reservas ilimitadas, confirmaciones/recordatorios, email marketing, 100 SMS de marketing/mes, formularios personalizados, Reservar con Google, informes, waitlist, gift cards.
- **Comisiones:** la página MX dice que no cobra comisiones por clientes nuevos. En otras regiones existe **Boost** (30% de la primera visita de clientes captados por Boost) — no confirmado en MX.
- **Debilidades para Palace:** inventario y variantes poco documentados; sin WhatsApp nativo encontrado.

### 4.6 Square Appointments 🟡
- **Precio (EE. UU.):** Free / Plus US$29 / Premium US$69 por ubicación.
- **Pagos en MX:** Square opera en México (liquidación vía dLocal) con tarifas de 3.45% a 2.79% + IVA según volumen 🟡 (resultado de búsqueda sobre la página MX; la descarga directa falló).
- **Disponibilidad de Appointments en MX:** **no confirmada**.
- **Interés:** el catálogo de Square POS soporta variantes de artículo (útil como referencia de modelo de datos), pero no apartado por cliente.

### 4.7 AgendaPro (MX) ✅
- **Precio (MXN + IVA/mes):** Individual $299 (1 profesional); Básico $550; Premium $1,500 ("más popular"); Pro $4,500. Básico/Premium/Pro escalan por número de profesionales (selector 2–20); el precio exacto por profesional no se pudo leer. Anual: 2 meses gratis.
- **Incluye por plan:** Individual: agenda, sitio de reservas, recordatorios, pago de citas en línea, control de ingresos/gastos, sistema de caja, CRM, control de ocupación, **gestión de presupuesto**, 1 paquete WhatsApp. Básico: + **comisiones**, **inventario**, alertas de stock. Premium: + **Vínculo Agenda-WhatsApp**, fichas/expedientes, consentimiento informado, encuestas, email de cumpleaños, giftcards, 2 paquetes WhatsApp. Pro: + API, Google Analytics/Meta Pixel, 4 paquetes WhatsApp.
- **Add-ons:** WhatsApp desde $100 MXN/mes (50 mensajes); videoconferencia desde $240 MXN; asistente de marketing "Charly" desde $1,000 MXN; **facturación electrónica: "Próximamente"**.
- **Pagos:** Terminal AgendaPro $250 MXN/mes o $2,500 MXN, tasa 2.29% + IVA (reducible).
- **Lectura:** es la opción "local" más completa para México; fuerte en LatAm (financiamiento US$35M reportado en 2025 🟡). Aun así, inventario genérico sin variantes ni apartado.

### 4.8 Reservo 🟡
- Software chileno con presencia en MX/CO/AR, más orientado a clínicas (mencionan NOM-024/COFEPRIS). Precio ≈ US$30/usuario/mes según reseñas; no verificado. Poco relevante para extensiones.

### 4.9 Bewe 🟡
- Plataforma hispana para salones/estética; destaca **"Linda"**, agente IA sobre WhatsApp Business API + Instagram + web que agenda, califica leads y "envía cotizaciones" (texto del proveedor en GetApp). Precio no publicado (≈ US$25 inicio según Capterra ES). Es el competidor conceptual más cercano en "WhatsApp-first" para el mundo hispano; conviene pedir demo.

### 4.10 Timely, Zenoti, Phorest (breve) 🟡
- **Timely:** ≈ US$26–69/mes; fuerte en NZ/AU/UK. Sin presencia MX confirmada.
- **Zenoti:** enterprise multi-sede, seguimiento de fórmulas de color, cotización (≈ US$300–400+/mes). Sobredimensionado para un salón.
- **Phorest:** precio por cotización; fuerte en Irlanda/UK. Sin presencia MX confirmada.
- **Treatwell:** marketplace europeo; no relevante para México.

### 4.11 Nicho "extensiones"
- **Hair Pro Appointments** (EE. UU.): se presenta como software para especialistas en extensiones e indica "Hair Extension Inventory Tracking", depósitos y cargos de cancelación 🟡 (la página no pudo leerse completa; no se verificó si maneja variantes o apartados).
- **SetTime / Anolla / SimplyBook.me / Yocale**: permiten depósitos por servicio, formularios de consulta y reservar servicios de extensiones, pero como reservas genéricas 🟡.
- **SalonScale** (app del marketplace de Square): control de costo de color/fórmulas, no extensiones 🟡.

---

## 5. Cómo manejan las extensiones de cabello (análisis de brecha)

| Necesidad específica de extensiones | Lo que ofrece el mercado | Brecha |
|---|---|---|
| **Consulta previa** (fotos, densidad, largo deseado, técnica) | Formularios de consulta genéricos (Fresha, GlossGenius, Boulevard add-on, AgendaPro Premium) | Sin estructura de datos específica (tono base, tono objetivo, gramos estimados, técnica recomendada) |
| **Match de color** | Ninguno. Zenoti/SalonScale manejan fórmulas de **tinte**, no tonos de extensión | Total |
| **Cotización a medida** (pelo × gramos + mano de obra + sesiones) | Presupuestos genéricos (Fresha "Presupuestos y facturas", AgendaPro "Gestión de presupuesto"), facturas (GlossGenius/Vagaro) | No calculan desde inventario por variante; no vinculan cotización → anticipo → apartado → cita |
| **Inventario por tono/largo/textura/técnica** | Inventario retail plano con alertas (GlossGenius, Vagaro, AgendaPro, Fresha) | Sin matriz de variantes ni unidades mixtas (piezas/gramos/paquetes) |
| **Apartar pelo para una clienta** | No encontrado en ningún proveedor | Total |
| **Pedido especial al proveedor** (tono no en stock, tiempo de entrega) | No encontrado | Total |
| **Agenda con capacidad real** (estilista + estación + pelo disponible) | Staff + recursos (Fresha, GlossGenius Gold, Vagaro) | El stock no es restricción de reserva |
| **Mantenimiento** (move-up cada 6–8 semanas, retiro, reutilización del pelo) | Recordatorios de rebooking genéricos (GlossGenius, Boulevard campañas) | No ligados al tipo de técnica ni al lote instalado |
| **Historial del lote instalado** (qué pelo lleva la clienta, garantía) | Notas de cliente | Sin trazabilidad lote → clienta |
| **Comisiones mixtas** (servicio + venta de pelo + producto de cuidado) | Comisiones por servicio/producto (Fresha, AgendaPro, GlossGenius Platinum) | Probablemente suficientes; validar reglas por técnica y por margen |

---

## 6. Clasificación de funciones para Palace Hair Extensions OS

### 6.1 Indispensables (sin esto no se puede operar ni competir)
1. Agenda multi-estilista con duración por servicio y por estilista, bloques y descansos.
2. Recursos/estaciones como restricción de agenda (silla de colocación, lavacabezas).
3. Reserva online (enlace propio, Instagram/Facebook, Google) con confirmación.
4. Recordatorios automáticos (WhatsApp prioritario en MX; email de respaldo).
5. Depósitos/anticipos y política de cancelación/no-show.
6. POS: cobro de servicios + productos, pagos mixtos, efectivo, tarjeta, transferencia/SPEI, propinas.
7. Ficha de clienta (CRM) con historial, notas, fotos antes/después, consentimiento.
8. Inventario con **variantes** (tono, largo, textura, técnica, peso/gramos) y alertas de stock.
9. Comisiones por estilista (servicio y venta) y reportes de corte.
10. Roles y permisos (dueña, recepción, estilista).
11. Reportes básicos: ventas, citas, ocupación, inventario valuado.

### 6.2 Competitivas (paridad con Fresha/AgendaPro/Booksy y diferenciación inicial)
1. **Formulario de consulta de extensiones** estructurado (tono actual/objetivo, densidad, largo, técnica, fotos).
2. **Cotizador de extensiones** (gramos × precio por variante + mano de obra + sesiones) con envío por WhatsApp y aceptación con anticipo.
3. **Apartado de inventario por clienta** (reserva con vencimiento, liberación automática).
4. Recordatorios de mantenimiento según técnica (p. ej., cinta/tape-in, queratina, microlink, cosidas) — intervalos configurables.
5. Tienda online (e-commerce) con el mismo inventario que el salón.
6. Lista de espera y reprogramación por WhatsApp.
7. Paquetes/membresías de mantenimiento; gift cards.
8. Campañas segmentadas (por técnica, por fecha de instalación, por tono).
9. Reseñas Google post-cita.
10. App/PWA móvil para estilistas (agenda del día, ficha, fotos).

### 6.3 Avanzadas (diferenciadoras, fases posteriores)
1. **Agenda consciente de stock**: no confirmar una instalación si el pelo no está apartado o en tránsito.
2. **Pedidos especiales a proveedor** con fecha estimada de llegada que propone automáticamente la fecha de cita.
3. **Trazabilidad lote → clienta** (garantía, reutilización en move-up, calidad por proveedor).
4. **Asistente de match de color** (fotos + carta de tonos; sugerencia revisada por estilista — no sustituye criterio humano).
5. Flujo conversacional WhatsApp end-to-end (consulta → cotización → anticipo → cita → recordatorios → mantenimiento).
6. Facturación CFDI 4.0 integrada (vía PAC).
7. Análisis de margen por servicio (costo real del pelo + tiempo de estación + comisión).
8. Pronóstico de compras de inventario por tono/largo según demanda histórica.
9. Multi-sede y transferencias de inventario.
10. Recepcionista IA (como ya ofrecen Fresha, GlossGenius, Vagaro, Bewe — paridad futura).

---

## 7. Oportunidades y brechas que Palace puede explotar

> Propuestas para Palace; no son funciones existentes de ningún proveedor.

1. **Cotizador de extensiones ("Extension Quote Builder")** — Ninguna plataforma revisada calcula una cotización a partir de una variante concreta de pelo + gramos + técnica + mano de obra. Es el paso donde hoy se pierde tiempo (cotizaciones manuales por WhatsApp) y donde se fuga margen.
2. **Inventario apartado por clienta** — El pelo es caro y de rotación lenta por tono. Apartar con anticipo y vencimiento reduce compras duplicadas, stock "fantasma" y conflictos entre estilistas. No encontrado en el mercado.
3. **Reserva consciente de recursos + stock** — Fresha/GlossGenius/Vagaro modelan estaciones; nadie usa el stock como restricción. Para instalaciones de 2–4 horas el costo de un error es alto.
4. **WhatsApp-nativo en México** — WhatsApp es el canal dominante en MX. Fresha cobra por mensaje y AgendaPro por paquetes; ninguno ofrece el embudo completo de consulta-cotización-anticipo en el chat. Bewe es el más cercano (agente IA) y debe vigilarse.
5. **Mantenimiento como motor de recurrencia** — Recordatorios ligados a la técnica y a la fecha de instalación (move-up, retiro, recolocación) convierten una venta única en ingresos recurrentes; los competidores ofrecen rebooking genérico.
6. **E-commerce unificado** — Venta de pelo y productos de cuidado online con el mismo inventario del salón (Fresha y Vagaro tienen tienda, pero sin variantes de extensiones).
7. **Localización MX real** — MXN nativo, IVA, CFDI, SPEI/transferencia, OXXO/links de pago vía pasarelas locales (p. ej., Mercado Pago, Stripe MX, Conekta, Clip — **a evaluar; no verificado en este estudio**). Los líderes de EE. UU. no están en MX y AgendaPro aún tiene la facturación electrónica como "Próximamente".
8. **Sin comisión de marketplace** — Fresha cobra 20% (mín. US$6) por cliente nuevo del marketplace; en un ticket de extensiones de miles de pesos, el 20% de la primera visita es muy costoso. Un canal propio evita ese costo (a cambio de perder el descubrimiento del marketplace).

---

## 8. Build vs Buy — evaluación honesta

**¿Podría Palace simplemente usar Fresha o AgendaPro?** Sí, para la operación genérica:

| Criterio | Fresha | AgendaPro | Palace OS (a construir) |
|---|---|---|---|
| Tiempo para operar | Días | Días | Meses |
| Costo mensual (6 staff) | ≈ US$90 + pagos + WhatsApp | ≥ $1,500 MXN + IVA + paquetes WhatsApp | Hosting + mantenimiento + desarrollo (CAPEX inicial alto) |
| Agenda, POS, CRM, depósitos, comisiones | ✅ maduro | ✅ maduro | A construir |
| Recursos/estaciones | ✅ | ➖ | A construir |
| Inventario con variantes de extensiones | ❌ | ❌ | Núcleo del diseño |
| Apartado por clienta / cotizador | ❌ / ➖ presupuestos genéricos | ❌ / ➖ presupuestos genéricos | Núcleo del diseño |
| WhatsApp | Notificaciones pagadas por mensaje | Add-on por paquetes | Flujo nativo (costo Meta por conversación aplica igual) |
| CFDI | ❌ no encontrado | Próximamente | Integrable vía PAC |
| Riesgo | Dependencia de proveedor; cambios de precio (Fresha eliminó su plan gratuito) | Dependencia de proveedor | Riesgo de ejecución, mantenimiento propio, seguridad PCI (mitigar usando pasarela tokenizada) |

**Conclusión:**
- Si el objetivo inmediato es **solo agendar y cobrar**, comprar (Fresha o AgendaPro) es más barato y rápido; construir eso desde cero no aporta ventaja.
- El valor diferencial de Palace está en **inventario de pelo + apartado + cotización + mantenimiento + WhatsApp**. Eso no lo ofrece nadie, y forzarlo en Fresha/AgendaPro implicaría hojas de cálculo paralelas (el problema que se quiere resolver).
- **Ruta recomendada:** construir Palace OS centrado en el núcleo diferencial, reutilizando servicios estándar (pasarela de pagos MX, API de WhatsApp Business, PAC para CFDI) en lugar de reinventarlos. Alternativa de menor riesgo: operar con AgendaPro/Fresha durante 3–6 meses mientras se construye el módulo de inventario/cotizador, y migrar después — teniendo en cuenta el costo de migración de datos y de doble captura en la transición.
- Antes de decidir, **validar con demo** Bewe (WhatsApp IA) y AgendaPro Premium (inventario real, exportación de datos/API), y confirmar con Fresha las tarifas de pago para México.

---

## 9. Preguntas abiertas / por verificar
- Tarifas de procesamiento de Fresha para comercios mexicanos y si liquida en MXN.
- Precio exacto de AgendaPro Premium para 6 profesionales.
- Disponibilidad oficial de Square Appointments, Vagaro, GlossGenius y Boulevard en México (no confirmada).
- Si Booksy MX aplica Boost (30%) y sus tarifas de procesamiento en MX.
- Funciones reales de inventario de Hair Pro Appointments (variantes, apartado).
- Precio y alcance de Bewe (agente "Linda", costo de WhatsApp API).

---

## 10. Fuentes

**Fecha de verificación: 2026-10-21.** "Oficial" = página del proveedor leída directamente; "secundaria" = reseñas/agregadores (no verificadas contra el sitio oficial).

Oficiales (✅ leídas):
- Fresha — Precios (ES): https://www.fresha.com/es/pricing
- GlossGenius — Pricing: https://glossgenius.com/pricing
- Boulevard — Pricing: https://www.joinblvd.com/pricing
- Vagaro — Pricing: https://www.vagaro.com/pro/pricing
- Booksy México — Precios: https://biz.booksy.com/es-mx/precios
- AgendaPro México — Planes: https://agendapro.com/mx/planes

Oficiales (vía resultados de búsqueda, no leídas completas):
- Fresha — Recursos reservables (centro de ayuda): https://www.fresha.com/help-center/knowledge-base/calendar/101215-create-and-manage-resources
- Fresha — Blog "bookable resources": https://www.fresha.com/en-GB/blog/fresha-bookable-resources-feature
- Fresha — Academy pagos: https://www.fresha.com/help-center/academy/accept-payments/set-up-and-explore-payments/lessons/100263
- Square México: https://squareup.com/mx/en (la página de precios MX `https://squareup.com/mx/es/pricing` no pudo descargarse; tarifas 3.45%–2.79% + IVA tomadas del extracto de búsqueda — **no verificado directamente**)
- Hair Pro Appointments: https://hairproappointments.com/ (contenido no legible; **no verificado**)

Secundarias (🟡):
- Fresha en México (IntelligentCIO LatAm, 2026-09-04): https://www.intelligentcio.com/latam/2026/09/04/fresha-makes-mexico-launchpad-for-latin-american-growth/
- Pabau — Fresha pricing: https://pabau.com/blog/fresha-pricing/
- SchedulingKit — Fresha pricing: https://schedulingkit.com/pricing-guides/fresha-pricing
- Koalendar — GlossGenius pricing: https://koalendar.com/blog/gloss-genius-pricing
- Capterra — Boulevard pricing: https://www.capterra.com/p/180087/Boulevard/pricing/
- Pabau — Boulevard pricing: https://pabau.com/blog/boulevard-pricing/
- Koalendar — Booksy pricing: https://koalendar.com/blog/booksy-pricing
- SchedulingKit — Square Appointments pricing: https://schedulingkit.com/es/pricing-guides/square-appointments-pricing
- TheirStack — Vagaro (distribución por país): https://theirstack.com/en/technology/vagaro
- The Salon Business — Vagaro vs Fresha: https://thesalonbusiness.com/vagaro-vs-fresha/
- GetApp — Bewe: https://www.getapp.ca/software/2043199/bewe
- Capterra ES — Bewe: https://www.capterra.es/reviews/168884/bewe
- Pabau — Bewe vs Booksy: https://pabau.com/es/blog/bewe-vs-booksy/
- Comparasoftware — Reservo: https://www.comparasoftware.com/reservo
- Medesk — Reseña Reservo: https://www.medesk.net/es/blog/reservo-review/
- Axios — AgendaPro US$35M (2025): https://www.axios.com/pro/enterprise-software-deals/2025/08/20/latam-salon-software-agendapro-35-million
- SchedulingKit — Timely pricing: https://schedulingkit.com/pricing-guides/timely-pricing
- SchedulingKit — Zenoti pricing: https://schedulingkit.com/pricing-guides/zenoti-pricing
- Pulse Signal — Phorest pricing: https://getpulsesignal.com/pricing/phorest
- Square App Marketplace — SalonScale: https://squareup.com/us/es/app-marketplace/app/salonscale
- Zenoti — Hair salon software: https://zenoti.com/salon-management-software/hair-salon-software
- SetTime — Hair salon booking: https://settime.io/industries/beauty/hair-salon-booking-software
- Anolla — Hair salon software: https://anolla.com/en/hair-salon-software
- Yocale — Hair salon software: https://www.yocale.com/industries/hair-salon-software
- SimplyBook.me — Beauty salons: https://simplybook.me/en/scheduling-system-for-hair-and-beauty-services/online-booking-system-for-beauty-salons

**Afirmaciones explícitamente no verificadas:** disponibilidad en México de GlossGenius, Boulevard, Vagaro y Square Appointments; tarifas de pago de Fresha para MX; tarifas Square MX (solo extracto); Boost de Booksy en MX; precios de Reservo, Bewe, Timely, Zenoti, Phorest; funciones de inventario de Hair Pro Appointments; pasarelas locales sugeridas (Mercado Pago, Stripe MX, Conekta, Clip) no fueron investigadas en este estudio.
