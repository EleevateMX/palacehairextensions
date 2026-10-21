# 02 · Investigación de mercado

Documento completo con tablas, notas por proveedor y fuentes: [`research/market-benchmark.md`](research/market-benchmark.md) (fecha de verificación 2026-10-21; cada dato marcado como verificado en sitio oficial, fuente secundaria o no verificado).

## Resumen
1. **Lo genérico está resuelto y es barato**: Fresha (US$14.95 por miembro/mes; comisión de 20% por clienta nueva del marketplace), Booksy México (desde $499 MXN/mes) y AgendaPro México ($299–$4,500 MXN/mes + IVA) cubren agenda, reservas en línea, recordatorios, POS básico y depósitos.
2. **Nadie modela el negocio de extensiones**: no se encontró en los proveedores principales inventario por tono × largo × textura × técnica × gramos, apartado de cabello para una clienta, cotizador producto + mano de obra, ni mantenimiento ligado a la técnica.
3. **Capacidad por recursos** existe (Fresha, GlossGenius Gold+, Vagaro, Boulevard, AgendaPro "control de ocupación"), pero ninguno combina personal + estación + **material en existencia** como restricción de la reserva.
4. **WhatsApp en México**: se vende como complemento (Fresha por mensaje; AgendaPro desde $100 MXN/50 mensajes; Bewe con agente IA). Ninguno ofrece consulta → fotos → tono → cotización → anticipo por WhatsApp.
5. **Pagos en México**: GlossGenius, Boulevard, Vagaro y Square Appointments sin disponibilidad confirmada en México.

## Clasificación de funcionalidades
| Indispensables (MVP) | Competitivas (V2–V3) | Avanzadas (V3–V4) |
|---|---|---|
| Agenda por especialista con estaciones como restricción | Formulario de valoración para extensiones | Reserva que verifica existencias del tono |
| Reglas de horario, descansos, festivos | Cotizador de extensiones | Pedidos especiales a proveedor |
| Anticipos y política de cancelación | Inventario apartado por clienta | Trazabilidad de lote instalado por clienta |
| POS de servicios + productos | Recordatorios de mantenimiento | Asistente de igualación de color |
| Expediente de clienta | Tienda en línea con inventario real | Flujo completo por WhatsApp con IA |
| Inventario con variantes | Campañas segmentadas con consentimiento | CFDI integrado |
| Comisiones y propinas | Portal de reservas | Analítica de margen y demanda |
| Reportes básicos y corte de caja | | |

## Oportunidades para Palace (propuestas, no funciones de terceros)
1. **Inventario de cabello como restricción de la agenda**: una instalación no se confirma si el tono elegido no está disponible; el material queda reservado para esa clienta.
2. **Cotizador de extensiones** con rango estimado y valoración obligatoria cuando falta información (implementado en `@palace/domain/extension-quote`).
3. **Recurrencia por mantenimiento**: al completar el servicio se genera la fecha sugerida y el recordatorio (implementado en `complete_appointment`).
4. **Recepción asistida**: panel de llegadas, estaciones libres, retrasos y conversaciones pendientes.
5. **WhatsApp como canal principal** en México, con la plataforma como fuente de verdad.

## Comprar vs construir
Fresha o AgendaPro resolverían rápido y barato ~70% genérico, pero no el núcleo económico de un salón de extensiones (inventario de alto valor, apartado, cotización, mantenimiento). **Recomendación**: construir Palace OS enfocado en ese núcleo y apoyarse en servicios estándar para pagos, WhatsApp y CFDI. Alternativa de menor riesgo (**pendiente de decisión de la clienta**): operar 3–6 meses con AgendaPro o Fresha mientras se construye el MVP, y migrar después.

## Pendientes de verificación
Comisiones de Fresha para México, precio de AgendaPro para 6 profesionales, si el "Boost" de Booksy aplica en México, tarifas de Square en México, precios de Bewe y Reservo.

> Nota de método: las páginas oficiales se leyeron mediante el conector Apify del usuario (consumo mínimo de créditos) porque el proxy del entorno bloqueó la descarga directa.
