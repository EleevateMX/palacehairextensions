# Palace Hair Extensions OS: integraciones, costos operativos y obligaciones legales (México)

> **Fecha de investigación:** 2026-10-21
> **Stack supuesto:** Next.js + Supabase, hospedado en Vercel. Mensajería por WhatsApp, Instagram y Messenger. Pagos en línea y en sitio. Facturación CFDI 4.0.
> **Escenario base de volumen:** ~400 citas/mes, ~600 conversaciones/mes y ~150 ventas en línea/mes.

## 0. Cómo leer este documento (importante)

- **Restricción del entorno de investigación.** Desde este entorno **no se pudo abrir directamente** `developers.facebook.com`, `supabase.com`, `vercel.com`, `stripe.com`, `mercadopago.com.mx`, `manychat.com` ni `facturapi.io`: el proxy devolvió 403 o DNS fallido. Las cifras vienen de **resultados de búsqueda web**, que citan esas páginas oficiales o fuentes secundarias. Cada dato lleva su nivel de confianza:
  - ✅ **Oficial**: el texto citado proviene de la página oficial del proveedor y apareció en el resultado de búsqueda.
  - 🟡 **Secundario**: el dato aparece en blogs o resellers, varias fuentes coinciden y no hay confirmación directa en la página oficial.
  - ⚠️ **No verificado**: hay una sola fuente, las fuentes se contradicen o el dato viene de conocimiento previo al 2026-10-21. **Hay que confirmarlo antes de presupuestar o de lanzar.**
- **Tipo de cambio supuesto: 1 USD = 18.50 MXN.** No está verificado. Ajústenlo al día de cálculo.
- **IVA:** en México las comisiones de las pasarelas suelen publicarse **sin IVA**, y sobre la comisión se cobra un 16% adicional. Esta regla se aplicó en todos los cálculos donde la fuente dice "+ IVA".
- Nada de este documento es asesoría legal ni fiscal. Las secciones 5 y 6 deben revisarlas un contador y un abogado en México.

---

## 1. WhatsApp Business Platform (Cloud API)

### 1.1 Modelo de precios vigente (octubre 2026)

| Fecha | Cambio | Confianza |
|---|---|---|
| 2025-07-01 | Pasa de cobro **por conversación** a cobro **por mensaje de plantilla entregado**, según su categoría (marketing, utility, authentication). Las plantillas *utility* enviadas **dentro** de la ventana de 24 h quedan gratis. Se crean tiers de volumen para utility y authentication. | 🟡 (360dialog, SleekFlow, Respond.io, WATI) |
| 2025-10-01 | México: **baja** la tarifa de marketing. | 🟡 (lo indica el changelog de Meta según un snippet; la cifra no aparece) |
| **2026-10-01** | (a) Los **mensajes de servicio**, es decir las respuestas libres dentro de la ventana de 24 h, **se vuelven a cobrar**. Hay **1,000 gratis por número por mes**, que no se acumulan, y el excedente se cobra a la tarifa utility/authentication del mercado, **sin tiers de volumen**. (b) Las **utility dentro de la ventana dejan de ser gratis**. (c) **Sube el marketing en México.** | 🟡 (Twilio Help Center, WATI, YCloud, Chatfuel, Mitto, Zenvia) |

**Tarifas por mensaje en México (USD, lista de Meta, sin IVA ni markup de BSP) desde 2026-10-01:**

| Categoría | Tarifa | Confianza / nota |
|---|---|---|
| Marketing | **$0.0397** (antes $0.0305) | 🟡 Varias fuentes coinciden. Hay valores discordantes ($0.0436, $0.0456 y $0.03477) en páginas desactualizadas o de BSP con markup. |
| Utility | **$0.0085** | 🟡 Varias fuentes coinciden. Una fuente da $0.0080 y otra $0.0098. |
| Authentication | **$0.0085** | 🟡 Mismo caso. |
| Service (respuesta libre dentro de las 24 h) | **$0.0085** a partir del mensaje 1,001 del mes por número | 🟡 |
| Entrada gratuita (*free entry point*: anuncios Click-to-WhatsApp o botón de la página de Facebook) | La ventana de 72 h es gratuita para todos los mensajes | ⚠️ Conocimiento previo. Confirmar si sigue igual después del 2026-10-01. |

> ⚠️ Meta publica *rate cards* en CSV, en USD y otras monedas (incluido MXN), en `developers.facebook.com/docs/whatsapp/pricing`. **Descarguen el CSV vigente antes de presupuestar.** No fue posible abrirlo desde aquí.

### 1.2 Reglas operativas clave

- **Ventana de atención al cliente de 24 h.** Se abre o se renueva cada vez que el cliente escribe. Dentro de la ventana se puede responder con texto libre o multimedia. Fuera de ella **solo se pueden enviar plantillas aprobadas**. La regla de la ventana no cambió en 2026; lo único que cambió es su costo. 🟡
- **Plantillas.** Cada una lleva nombre, idioma, categoría (utility, marketing o authentication) y variables `{{1}}`. Meta las revisa y **puede recategorizarlas**: una "confirmación" con tono promocional pasa a marketing y se cobra más caro. 🟡 Para no perder dinero, conviene redactar los recordatorios de cita como utility puros, sin promociones.
- **Verificación del negocio.** El *Meta Business Verification* y la revisión del *display name* los hace Meta, **también** cuando se contrata un BSP. El BSP solo acelera el papeleo. 🟡
- **Límites de mensajería.** Se calculan a nivel de *business portfolio*, cuentan usuarios únicos por 24 h en mensajes iniciados por el negocio y empiezan en **250**. Se sube a 2,000 al completar la verificación o al enviar 2,000 plantillas de calidad en 30 días, y luego escalan automáticamente si la calidad es buena. 🟡 (Meta Messaging Limits, citado por los resultados)
- **Throughput.** Hasta **80 mensajes por segundo** por número (entrada y salida) por defecto. Baja a 20 mps si el número también se usa en la app WhatsApp Business (*coexistence*). Para 80 mps conviene que el webhook responda en menos de 200 ms. 🟡 Para un salón esto sobra.
- **Seguridad de webhooks.** Meta firma cada POST con el header `X-Hub-Signature-256: sha256=<HMAC-SHA256(body_crudo, APP_SECRET)>`. Se valida con comparación en tiempo constante **sobre el body sin parsear**. En Next.js eso implica leer `await req.text()` antes de `JSON.parse`. El registro del webhook usa `hub.mode`, `hub.verify_token` y `hub.challenge`. ⚠️ Conocimiento previo; la búsqueda no devolvió la página oficial.
- **Idempotencia.** Meta reintenta las entregas de webhook. Hay que deduplicar por `messages[].id` (wamid) y `statuses[].id`, por ejemplo con una tabla con `UNIQUE(wamid)` en Supabase. ⚠️ Práctica recomendada.

### 1.3 Política de IA: "general-purpose AI chatbots"

- Desde el **15-oct-2025** para cuentas nuevas y el **15-ene-2026** para todas, los Términos de WhatsApp Business Solution **prohíben a los proveedores de IA** distribuir asistentes de propósito general (ChatGPT, Perplexity, Copilot, Luzia, Poke y otros) cuando la IA es la **funcionalidad principal**. Meta decide a su discreción qué cuenta como "principal". 🟡 (TechCrunch, respond.io)
- **Siguen permitidos** los bots de negocio que usan IA de forma **incidental**: agendar, dar soporte o rastrear pedidos. El caso de Palace (agendar citas, cotizar extensiones, resolver dudas del salón) **entra en el uso permitido**. 🟡
- **Recomendaciones de diseño para no caer en la prohibición:**
  1. Limitar el bot al dominio del salón (servicios, precios, agenda, cuidados de extensiones) y rechazar preguntas generales.
  2. Ofrecer siempre la opción de hablar con una persona.
  3. Identificar al bot como asistente automatizado.
  4. No ofrecer "pregúntale lo que quieras a la IA".
- ⚠️ Hay investigaciones antimonopolio en curso en la UE, Italia y Brasil. Los términos podrían cambiar, así que conviene revisarlos cada trimestre.

### 1.4 Cloud API directa vs BSP

| Criterio | Cloud API directa (Meta) | BSP (360dialog, Twilio, Gupshup, YCloud, etc.) |
|---|---|---|
| Costo de plataforma | $0; solo se pagan las tarifas de Meta | Fee mensual y/o markup por mensaje (ej.: Chatfuel reporta 10%) 🟡 |
| Onboarding | De días a semanas (verificación en paralelo) | De horas a días 🟡 |
| Inbox/UI | Hay que construirlo | Suele incluirlo |
| Control de datos | Total (webhook → Supabase) | Depende del BSP |
| Recomendado para Palace | **Sí**, si el OS ya incluye un inbox propio | Solo si se quiere salir rápido sin construir inbox |

---

## 2. Messenger Platform e Instagram Messaging API

| Tema | Detalle | Confianza |
|---|---|---|
| Costo por mensaje | Meta **no cobra** los mensajes de Messenger ni de Instagram DM. | ⚠️ Conocimiento previo; no se vio ningún cargo en las fuentes |
| Ventana estándar | **24 h** desde el último mensaje del usuario. Dentro se puede enviar cualquier mensaje, incluido contenido automatizado. | 🟡 |
| Etiqueta `HUMAN_AGENT` | Permite que **una persona** responda **hasta 7 días** después del último mensaje del usuario, solo cuando el caso no pudo resolverse en 24 h (fin de semana o seguimiento). **No sirve para mensajes automáticos ni promocionales**; usarla así arriesga el bloqueo. | ✅ (overview oficial de Messenger e Instagram) |
| Ventana de 7 días por anuncios | Un blog afirma que desde el 28-sep-2026 las conversaciones iniciadas por anuncios Click-to-Messenger o Click-to-Direct tienen ventana de hasta 7 días. | ⚠️ No verificado en el changelog de Meta |
| Permisos de Instagram (Instagram Login) | `instagram_business_basic` + `instagram_business_manage_messages`. "Human Agent" es una **feature** que se solicita aparte. | ✅ |
| App Review | **No se requiere** si la app solo da servicio a cuentas que el negocio **posee o administra** (Standard Access). Se necesita **Advanced Access, con App Review y Business Verification**, para servir a cuentas de terceros, por ejemplo si Palace OS se vende como SaaS a otros salones. | ✅ (App Review for Instagram API) |
| Permisos de Messenger | `pages_messaging` (y `pages_manage_metadata` para webhooks). Aplica la misma lógica de Standard Access para páginas propias. | ⚠️ Conocimiento previo |
| Handover | El **Handover Protocol** (Primary/Secondary Receiver, Pass/Take Thread Control) **se está reemplazando por Conversation Routing**, y Meta pide migrar "lo antes posible". La bandeja de entrada de la página o de Instagram no puede ser Primary Receiver. | ✅ (página oficial de Handover Protocol) |

**Implicación para Palace OS:** si el inbox es propio, el bot y el humano conviven en la **misma app**. El *handover* se resuelve internamente con un flag `conversation.mode = 'bot' | 'human'` y no hacen falta los protocolos de Meta. Solo hay que configurar Conversation Routing si coexisten **dos apps** sobre la misma página, por ejemplo Manychat y Palace OS.

---

## 3. Manychat

### 3.1 Planes y precios

Manychat **cambió de estructura el 2-mar-2026**, y las cuentas antiguas migran por país. Las fuentes secundarias no coinciden del todo. 🟡/⚠️

| Plan (estructura 2026) | Precio mensual / anual por mes | Contactos activos incluidos | Notas |
|---|---|---|---|
| Free | $0 | Limitado | Funciones básicas |
| Essential | $17 / $14 | 250 | Sin IA y, según una fuente, sin WhatsApp ⚠️ |
| Pro | $39 / $29 | 2,500 | WhatsApp, External Request y token de API en Pro o superior 🟡. Excedente ≈ $0.05 por contacto ⚠️ |
| Business | $99 / $69 | 7,500 | Asignación por equipo, ruteo de leads, inbox avanzado 🟡 |
| Advanced | $199 / $139 | 25,000 | Una fuente ubica aquí la API ⚠️ |
| Add-on de IA | ≈ $29/mes | — | ⚠️ Las fuentes discrepan sobre si va incluido en Business o Advanced |
| Estructura legada (Free/Pro/Elite) | Pro desde $15/mes según contactos | — | Algunas cuentas antiguas aún la ven 🟡 |

**WhatsApp en Manychat:** las tarifas de Meta se pagan **además** de la suscripción. Una ayuda de Manychat lista México en **$0.0456 / $0.0098 / $0.0085**, cifras que probablemente incluyen markup o son anteriores al cambio. ⚠️ **No se confirmó si Manychat aplica markup.** Pregúntenlo a soporte antes de decidir.

### 3.2 Capacidades técnicas relevantes

| Capacidad | Estado | Confianza |
|---|---|---|
| External Request (llamada HTTP desde un flujo) | Pro o superior. **Si la petición excede el timeout, el flujo completo se aborta.** | 🟡 (moderador de la comunidad de Manychat) |
| API (token en Settings → API) | Pro o superior según la integración; Advanced según otra fuente | ⚠️ |
| Ejecutar código dentro del flujo | **No es posible.** La lógica debe vivir en el servidor (Next.js API route o Supabase Edge Function) o en Make o n8n. | 🟡 |
| Dynamic Block (el servidor responde JSON con mensajes) | Existe en la plataforma | ⚠️ No verificado en esta búsqueda |
| Live Chat / toma humana (pausar la automatización) | Existe | ⚠️ No verificado en esta búsqueda |
| Canales | Instagram, Messenger, WhatsApp, SMS y email | 🟡 |

### 3.3 Manychat vs inbox propio

| Criterio | Manychat Pro/Business | Inbox propio (Cloud API + Graph API + Supabase) |
|---|---|---|
| Costo fijo | $39 a $99/mes (+ IA ≈ $29) | $0 adicional (ya se paga Supabase y Vercel) |
| Costo de WhatsApp | Tarifa de Meta + posible markup | Tarifa de Meta directa |
| Tiempo de salida | Días | 3 a 6 semanas de desarrollo |
| Datos del cliente | Duplicados en Manychat; requiere sincronización | Fuente única en Supabase (CRM, citas, ventas) |
| IA (Claude) | Solo vía External Request, con riesgo de timeout | Control total: tools para agenda, caché de prompts y logs |
| Riesgo de plataforma | Dependencia de Manychat y de sus cambios de plan | Dependencia directa de Meta |
| Cumplimiento (aviso de privacidad, ARCO) | Manychat es un **encargado** adicional que hay que declarar y con el que hay que firmar contrato | Menos terceros |

**Recomendación:** **arrancar con inbox propio** para WhatsApp (Cloud API directa) e Instagram/Messenger (Graph API, Standard Access), porque el OS ya tiene Supabase como CRM y la agenda es el núcleo del negocio. Manychat solo tiene sentido como **puente temporal** de 1 a 3 meses, si se necesita lanzar ya. En ese caso, plan Pro con External Request hacia `/api/manychat/*` y sin duplicar lógica.

---

## 4. Pasarelas de pago en México

### 4.1 Comisiones (pagos en línea)

| Pasarela | Tarjeta en línea | OXXO / efectivo | SPEI | MSI | Confianza |
|---|---|---|---|---|---|
| **Mercado Pago** (Checkout Pro / Link) | **3.49% + $4** (dinero al instante) · 3.19% + $4 (7 días) · 2.95% + $4 (30 días), **+ IVA** | 3.79% + $4 (acreditación en 3 días) | Incluido en el esquema de tarjeta según la página de Link; una fuente dice que puede variar ⚠️ | Comisión adicional: 3 MSI 4.69%, 6 MSI 7.69%, 9 MSI 11.19%, 12 MSI 12.89%, 18 MSI 19.39%, 24 MSI 27.29% (+ IVA) | ✅ (páginas oficiales de Link de Pago y Hot Sale 2026) |
| **Stripe México** | 3.6% + $3 MXN + IVA | 3.6% + $3 MXN + IVA | $7 MXN + IVA por transferencia | Hasta 18 MSI en las principales redes (comisión MSI no verificada) | ⚠️ Tarifas tomadas de Wise (artículo antiguo); MSI y OXXO de la nota oficial de lanzamiento |
| **Openpay (BBVA)** | 2.9% + $2.5 MXN + IVA (Visa, MC y Amex) | 2.9% + $2.5 MXN + IVA (Paynet; la tienda puede cobrar comisión al cliente) | $8 MXN + IVA | No verificado | ✅ Página de precios de Openpay, sin fecha de vigencia |
| **Conekta** | 3.4% + $3 MXN + IVA (otra fuente: 2.9% + $2.5) | 2.6% + $3 + IVA (otra: ~$9 por pago); OXXO Pay se vendió a FEMSA ⚠️ | $12.50 + IVA (otra: 1%) | No verificado | ⚠️ Fuentes contradictorias; mínimo $30 MXN por compra |
| **Clip** (link o checkout) | 3.6% + IVA (≈ 4.18% efectivo), sin cargo fijo | No verificado | No verificado | Disponible en terminal (comisión no verificada) | 🟡 (Tiendanube, Xataka) |

### 4.2 Terminales punto de venta

| Terminal | Comisión | Equipo | Depósito | Confianza |
|---|---|---|---|---|
| **Mercado Pago Point** (Smart/Pro) | **3.50% + IVA** (≈ 4.06%) en crédito y débito estándar. Hay promociones de 3.20% + IVA que luego se ajustan por volumen (ej.: 2.99% con $100k/mes) | Compra única, sin renta | Al instante en la cuenta de MP | ✅ Blog oficial de MP y tienda oficial en Mercado Libre |
| **Clip** (Mini/Plus/Total) | **3.6% + IVA** (≈ 4.18%) | Desde ~$299 MXN (lector), sin renta | 24 h (ventas después de las 20:00 al día siguiente); depósito instantáneo en planes superiores | 🟡/⚠️ |

### 4.3 Escenario: 150 ventas en línea/mes

**Supuesto no verificado:** ticket promedio de **$2,000 MXN**, lo que da un GMV en línea de **$300,000 MXN/mes**, todo con tarjeta y sin MSI.

| Pasarela (tarifa) | Comisión + IVA por venta | **Costo mensual** | % efectivo |
|---|---|---|---|
| Openpay 2.9% + $2.5 | $70.18 | **$10,527 MXN** | 3.51% |
| Mercado Pago 30 días 2.95% + $4 | $73.08 | **$10,962 MXN** | 3.65% |
| Conekta 3.4% + $3 ⚠️ | $82.36 | **$12,354 MXN** | 4.12% |
| Clip 3.6% | $83.52 | **$12,528 MXN** | 4.18% |
| Mercado Pago al instante 3.49% + $4 | $85.61 | **$12,841 MXN** | 4.28% |
| Stripe 3.6% + $3 ⚠️ | $87.00 | **$13,050 MXN** | 4.35% |

> Una diferencia de ~0.8 puntos entre la opción más barata y la más cara equivale a **≈ $2,500 MXN/mes** con este GMV. Con MSI a 3 meses en Mercado Pago, a una venta de $2,000 se le suman 4.69% + IVA ≈ $108.8 adicionales.

### 4.4 Integración técnica

| Aspecto | Mercado Pago | Stripe | Openpay / Conekta / Clip |
|---|---|---|---|
| Firma de webhook | Header `x-signature` (`ts`, `v1`). HMAC-SHA256 del manifiesto `id:{data.id en minúsculas};request-id:{x-request-id};ts:{ts};` con el secreto de la app. Hay un validador en los SDK. ✅ | `Stripe-Signature` con `constructEvent` ⚠️ (conocimiento previo) | ⚠️ No verificado; revisar la documentación de cada uno |
| Idempotencia | Header `X-Idempotency-Key` al crear pagos ⚠️ (no se encontró la fuente oficial; conocimiento previo) | Header `Idempotency-Key` ⚠️ (conocimiento previo) | ⚠️ |
| Tokenización / alcance PCI | Checkout Pro (redirección) o Bricks/Card Form tokenizan en el navegador. Con eso el comercio queda en **SAQ A / A-EP** y **no toca el PAN** ⚠️ | Checkout o Elements, misma lógica ⚠️ | Openpay.js y Conekta.js tokenizan ⚠️ |
| Pagos diferidos (OXXO/SPEI) | El estado `pending` se vuelve `approved` por webhook. Las citas deben bloquearse con **expiración** | Igual | Igual |

**Regla de oro para Palace OS:** nunca marcar una venta o un anticipo como pagado a partir del *redirect* del navegador. Solo vale el **webhook verificado**, reconciliado con `GET /payments/{id}` y guardado de forma idempotente, con `UNIQUE(provider, provider_payment_id)`.

### 4.5 Recomendación

1. **En línea: Mercado Pago (Checkout Pro o Bricks).** Lo conocen la mayoría de las clientas mexicanas y cubre tarjeta, OXXO, saldo MP, crédito MP sin tarjeta y MSI con un solo contrato. Elijan el plazo de **acreditación a 30 días** si el flujo de caja lo permite: baja de 4.28% a 3.65% efectivo.
2. **En sitio: Mercado Pago Point.** Con una sola cuenta se concilia online y POS (3.50% + IVA, y promociones por volumen). Clip es la alternativa si ya lo usan.
3. **Alternativa de menor costo:** Openpay, con el **2.9% + $2.5** más bajo. Su UX es menos conocida y hay que confirmar la vigencia de la tarifa con ventas.
4. **Stripe** solo conviene si en el futuro se venden **suscripciones o membresías** con lógica compleja (Billing) o hay clientes internacionales.
5. **Anticipos de cita:** cobrar un depósito (ej. 30%) con link de pago y **expirar** la reserva si el pago OXXO o SPEI no llega en X horas.

---

## 5. Facturación CFDI 4.0

### 5.1 Requisitos

- Todo CFDI debe **timbrarse por un PAC autorizado por el SAT** (CFF art. 29). Para eso se usa una API de PAC o de proveedor de facturación. ⚠️ Conocimiento previo; principio general.
- **Datos que se piden a la clienta (factura nominativa):** RFC, **nombre o razón social exactamente como aparece en la Constancia de Situación Fiscal**, **código postal del domicilio fiscal**, **régimen fiscal** y **uso de CFDI**. El 4.0 valida todo esto contra el padrón. 🟡
- **Datos del salón (emisor):** RFC, régimen, CP del lugar de expedición, CSD (.cer/.key + contraseña) cargado en el PAC, y claves SAT de producto/servicio y de unidad por cada servicio o producto. Para mano de obra o servicios suele usarse `E48`, y para extensiones como producto `H87`. ⚠️ Confirmar las claves de producto con el contador.
- **Factura global (público en general):**
  - Receptor `XAXX010101000` con nombre "PUBLICO EN GENERAL", **régimen 616**, uso **S01** y **CP igual al del emisor**.
  - Nodo `InformacionGlobal` con **periodicidad** (diaria, semanal, quincenal o mensual; la bimestral solo aplica a RIF), mes y año.
  - Las ventas deben estar respaldadas por tickets o notas previos.
  - Forma de pago: la de la operación de mayor monto. Método: PUE. 🟡
- ⚠️ **A confirmar con el contador:** el plazo para emitir la global después del cierre del periodo, la regla de facturar en el mismo mes cuando la clienta pide factura de una venta ya incluida en la global (y la cancelación o sustitución correspondiente), y las reglas de cancelación con motivo y aceptación del receptor. Un blog afirma que el **Anexo 20 se actualizó el 1-ene-2026**; **no está verificado**.

### 5.2 Proveedores PAC/API para desarrolladores

| Proveedor | Modelo | Precio | Confianza |
|---|---|---|---|
| **Facturapi** (API) | Suscripción + consumo, multi-RFC, modo test de 14 días | **$299 MXN/mes + $0.60 MXN por timbre** (IVA incluido) | ✅ facturapi.io/pricing (vía búsqueda) |
| Facturapi: autofacturación / e-recibos | Portal para que la clienta se facture sola desde su ticket | $599 MXN/mes por organización + $0.40 por recibo + $0.60 por timbre | ✅ |
| **Facturama** (API) | Plan anual + folios API | **$1,650 MXN/año** + folios de API (precio por cotización) | 🟡 Precio del folio no encontrado |
| Facturama (portal web) | Paquetes de folios | 10 por $55, 25 por $110, 40 por $165 MXN (IVA incluido, vigencia anual) | 🟡 |
| SW Sapien (SmarterWeb) | API de timbrado con SDKs | **No se encontró precio público**; cotizar | ⚠️ |
| Edifact (referencia) | Timbre unitario | ~$1.00 MXN por timbre | 🟡 |

### 5.3 Escenario mensual

**Supuesto:** ~120 facturas nominativas (≈ 30% de 400 citas) + ~45 de ventas en línea + 4 globales (semanales) + ~15 complementos o cancelaciones y sustituciones, lo que da **≈ 185 timbres/mes**.

| Opción | Cálculo | Costo mensual |
|---|---|---|
| Facturapi API | $299 + 185 × $0.60 | **≈ $410 MXN** |
| Facturapi con autofacturación | $599 + 185 × ($0.60 + $0.40) | **≈ $784 MXN** (reduce trabajo manual) |
| Facturama API | $1,650 / 12 = $137.50 + folios (precio desconocido) | **≥ $140 MXN + folios** ⚠️ |

**Recomendación: Facturapi.** Tiene SDK oficial para Node (`facturapi`), modo test, multi-RFC (útil si el salón y la venta de producto facturan con RFCs distintos o si en el futuro hay varias sucursales) y factura global por API. Hay que guardar en Supabase el `facturapi_invoice_id`, el UUID fiscal, el XML y el PDF.

---

## 6. Obligaciones legales: datos personales, consumidor y anti-spam

### 6.1 Nueva LFPDPPP (DOF 20-mar-2025)

| Punto | Lo que dice la nueva ley | Confianza |
|---|---|---|
| Vigencia | Publicada en el DOF el **20-mar-2025** y **vigente desde el 21-mar-2025**. **Abroga la ley de 2010.** | 🟡 (Garrigues, KPMG, Hogan Lovells, IAPP) |
| Autoridad | El **INAI desaparece**. La autoridad pasa a ser la **Secretaría Anticorrupción y Buen Gobierno**. Sus resoluciones se impugnan por **amparo** ante jueces especializados. | 🟡 |
| Reforma posterior | Una guía dice que la ley se reformó por última vez el **14-nov-2025**. | ⚠️ No verificado en el DOF |
| Reglamento | La ley ordenaba armonizarlo en 90 días. **No se encontró un reglamento nuevo publicado**; la Cámara de Diputados sigue mostrando el de 2011 (aplicable en lo que no contradiga la ley). | ⚠️ Revisar el DOF |
| Aviso de privacidad | Obligatorio, en versión integral, simplificada o corta. Contenido mínimo: identidad y domicilio del responsable, **datos tratados identificando los sensibles**, **finalidades separando las que requieren consentimiento de las que no**, mecanismos para limitar uso y divulgación, y medios para ejercer **ARCO**. **Ya no es indispensable informar las transferencias** en el aviso. | 🟡 |
| Consentimiento | **El tácito es la regla general**, salvo que una norma exija el expreso. Debe ser libre, específico e informado. Si cambia la finalidad, hay que recabarlo de nuevo. | 🟡 |
| Responsable | La definición se amplía: cualquier persona que trate datos, decida o no sobre el tratamiento. | 🟡 |
| Datos sensibles | Deben identificarse en el aviso. **Bajo la ley de 2010 se exigía consentimiento expreso y por escrito**. No se confirmó si la nueva ley mantiene ese requisito con la misma redacción. | ⚠️ **Tratar como expreso** por prudencia |
| Derechos ARCO | Se mantienen. El plazo de respuesta (20 días hábiles más 15 para hacerlo efectivo, según la ley de 2010) **no se confirmó** para la nueva ley. | ⚠️ |
| Sanciones | Multas en **UMA**, que pueden **duplicarse con datos sensibles**. Una fuente estima un máximo de ~320,000 UMA (≈ $37.5 M MXN). | ⚠️ |

**Mapeo a Palace OS:**

| Dato | Clasificación probable | Base / acción |
|---|---|---|
| Nombre, teléfono, WhatsApp, email, historial de citas y compras | Personal (identificación y contacto) | Necesario para el servicio, que es una finalidad primaria. Informarlo en el aviso. |
| **Alergias, condición del cuero cabelludo, alopecia, embarazo, tratamientos médicos** | **Sensible (salud)** | Consentimiento **expreso**, con checkbox **no premarcado** y registro de fecha, IP, versión del aviso y texto aceptado. Acceso restringido por RLS. |
| **Fotos antes/después** del cabello o rostro | Personal. Pasa a **biométrico o sensible** si se procesa para identificar (reconocimiento facial) | Consentimiento **separado y expreso para uso en marketing o redes**, revocable. Sin consentimiento, solo uso interno del expediente. |
| Datos fiscales (RFC, CSF) | Personal | Obligación legal (CFDI); no requiere consentimiento. Conservar según los plazos fiscales (⚠️ contabilidad: 5 años según CFF art. 30, a confirmar). |
| Conversaciones de WhatsApp, IG y Messenger | Personal; pueden contener datos sensibles | Informar del bot y de los **encargados** (Meta, Anthropic, Supabase, Vercel, pasarela, PAC, Resend). Contratos de encargo o DPA. ⚠️ Transferencias o remisiones internacionales: Supabase/Vercel/Anthropic procesan fuera de México. |
| Datos de tarjeta | No los almacena Palace (tokenización) | Mantener fuera de alcance. |

**Retención (propuesta, a validar con abogado):** las conversaciones se purgan o anonimizan a los 12 a 24 meses de inactividad. El expediente de la clienta se conserva mientras exista la relación y luego se bloquea antes de suprimirse. Lo fiscal se conserva según el plazo del CFF. Hace falta un *job* de borrado (por ejemplo, un cron de Supabase) y una bitácora de solicitudes ARCO.

### 6.2 PROFECO y comercio electrónico

- **LFPC arts. 76 Bis y 76 Bis 1.** En ventas por medios electrónicos el proveedor debe dar información clara: identidad, domicilio y medios de contacto, precio total, condiciones, **políticas de privacidad**, cancelación y devolución. El art. 76 Bis 1 remite a la Norma Mexicana de comercio electrónico. 🟡
- **NMX-COE-001-SCFI-2018.** Vigente desde el 1-may-2019 (DOF 30-abr-2019). Es **voluntaria** como NMX, pero el art. 76 Bis 1 la hace exigible de hecho. Pide datos claros del proveedor, políticas visibles y condiciones de venta transparentes. 🟡/✅ (catálogo de Normas de la SE)
- **Precio total con IVA** visible en el checkout y en las cotizaciones del bot. ⚠️ Principio LFPC (art. 7 Bis), conocimiento previo.
- **NOM-151-SCFI-2016.** Regula la **conservación de mensajes de datos** y la digitalización de documentos, con constancias de conservación de un PSC. **No es obligatoria para un salón**, pero da **valor probatorio fuerte** a consentimientos firmados electrónicamente, por ejemplo la carta de consentimiento informado para aplicar extensiones o la política de anticipos no reembolsables. Opcional y recomendable si hay disputas frecuentes. 🟡
- Recomendado en el sitio: términos y condiciones, política de cancelación y reprogramación de citas, política de anticipos y reembolsos, garantía de las extensiones, aviso de privacidad y datos de contacto.

### 6.3 Anti-spam: REPEP y consentimiento comercial

- **REPEP (Profeco).** Las empresas de **comercio**, turismo y telecom deben abstenerse de hacer **llamadas o enviar SMS publicitarios** a los números inscritos, y tienen **30 días** para retirarlos de sus bases. Quedan excluidas la cobranza, las encuestas y otras. 🟡 **No se encontró** confirmación de que el REPEP cubra WhatsApp expresamente. ⚠️
- **Iniciativa en el Senado (oct-2026):** se aprobó crear un "Registro Público contra el Acoso Telefónico Comercial" con multas. **Sigue pendiente.** ⚠️ Darle seguimiento.
- **Práctica recomendada para Palace OS:**
  1. **Opt-in explícito y separado** para marketing por WhatsApp, SMS y email (checkbox no premarcado en reserva o checkout, y palabra clave en chat). Meta también lo exige para enviar plantillas de marketing.
  2. Guardar el registro del consentimiento: canal, fecha, texto y fuente.
  3. Ofrecer una **baja de un paso** ("BAJA" en WhatsApp, link en email) que se refleje en una tabla `marketing_suppressions`.
  4. Cruzar las campañas de SMS o llamadas con el REPEP. ⚠️ Revisar si Profeco da acceso a la lista a empresas.
  5. Los recordatorios de cita (utility) **no son publicidad** si no incluyen promociones.

---

## 7. Infraestructura y costos de plataforma

### 7.1 Supabase

| Concepto | Free | Pro |
|---|---|---|
| Precio | $0 | **$25 USD/mes** por organización 🟡 |
| Compute | Compartido | Incluye **$10 de crédito**, que cubre **Micro**. Small ≈ $15 y Medium ≈ $60/mes 🟡 |
| Límites incluidos | 500 MB de DB; **pausa tras 1 semana de inactividad** ✅ | 8 GB de disco, 100k MAU, 250 GB de egress y 100 GB de storage 🟡. **Sin pausa** ✅ |
| Backups | **Sin backups automáticos ni PITR** ✅ | Diarios, 7 días 🟡 (una fuente lo contradice; verificar) |
| PITR | No | Add-on de **$100/mes por 7 días de retención** ✅ (pricing.md vía búsqueda). Requisito de compute mínimo no verificado ⚠️ |
| Branching | — | ≈ $0.01344 por rama por hora (~$9.7/mes por rama siempre activa) 🟡 |
| Spend cap | — | Activo por defecto en Pro 🟡 |

**Recomendación:** **Pro desde el día 1** en producción, porque el Free se pausa y no tiene backups. PITR ($100) solo cuando el volumen de pagos lo justifique. Mientras tanto, programar un `pg_dump` diario a almacenamiento externo.

### 7.2 Vercel

- **Hobby es solo para uso personal y no comercial.** Un salón que cobra **no puede** usarlo. 🟡
- **Pro:** según la documentación oficial, **$20/mes de plataforma**, que incluye $20 de crédito de uso y **un asiento de despliegue**; los asientos extra se cobran aparte. Incluye ~1 TB de Fast Data Transfer y ~10M Edge Requests. Excedentes: ~$0.15/GB y $2 por millón de requests. ✅/🟡
- Para Palace OS, con un desarrollador, se estima **≈ $20/mes**.

### 7.3 Email transaccional

| Proveedor | Plan | Precio | Confianza |
|---|---|---|---|
| **Resend** | Free | 3,000 emails/mes, **máximo 100/día**, 1 dominio (otra fuente dice 3) | 🟡 |
| Resend | Pro | **$20/mes por 50,000 emails** (excedente ≈ $0.90 por 1,000) | 🟡 |
| Postmark | Basic | ≈ **$15/mes por 10,000 emails** (reestructurado en 2026; fuentes contradictorias) | ⚠️ |

Volumen estimado: 400 citas × 2 (confirmación y recordatorio) + 150 ventas × 2 (recibo y envío o factura) ≈ **1,100 emails/mes**, unos 37 por día. **Resend Free alcanza** para empezar. Hay que pasar a Pro ($20) cuando se manden campañas o se superen 100 al día.

### 7.4 IA: Anthropic Claude API

Precios por millón de tokens (MTok), USD. Fuente: skill oficial `claude-api`, con datos *cacheados al 2026-10-06*. 🟡 Verificar en `platform.claude.com` o `anthropic.com/pricing`.

| Modelo | Input | Output | Notas |
|---|---|---|---|
| **Claude Haiku 5.5** (`claude-haiku-5-5`) | **$0.10** | **$0.50** | Para prompts de hasta 100K tokens; por encima, $0.50 / $2.50 |
| Claude Haiku 4.5 | $1.00 | $5.00 | Generación anterior |
| **Claude Sonnet 5.5** (`claude-sonnet-5-5`) | **$2.00** | **$10.00** | Lectura de caché **$0.20/MTok** |
| Claude Opus 5.5 | $4.00 | $20.00 | Innecesario para este caso |
| Descuentos | Prompt caching: lecturas ≈ 0.1× del input y escrituras ≈ 1.25×. **Batch API: 50%** (solo tareas no urgentes como resúmenes nocturnos o etiquetado). | | |

**Escenario de 600 conversaciones/mes.** Supuesto: 6 turnos con IA por conversación, ~4,000 tokens de entrada por turno (system prompt, catálogo de servicios, historial y resultados de herramientas) y ~300 de salida. Total: **14.4 M tokens de entrada y 1.08 M de salida al mes**.

| Modelo | Sin caché | Con caché (~70% del input cacheado) |
|---|---|---|
| Haiku 5.5 | 14.4 × 0.10 + 1.08 × 0.50 = **$1.98/mes** | ≈ $1.5/mes |
| Sonnet 5.5 | 14.4 × 2 + 1.08 × 10 = **$39.60/mes** | 4.32 × 2 + 10.08 × 0.20 + 10.8 ≈ **$21.5/mes** |
| Haiku 4.5 | **$19.80/mes** | ≈ $8/mes |

**Recomendación:** usar **Haiku 5.5** en el bot de primera línea (FAQ, cotizaciones y agenda vía tools), y escalar a **Sonnet 5.5** solo en casos complejos (quejas, cotizaciones personalizadas con fotos) o pasar a un humano. El costo de IA es **marginal**: menos de $25 USD/mes incluso con Sonnet.

### 7.5 Google Calendar API

- **Sin costo** por debajo de **1,000,000 de requests/día por proyecto**. Google anunció que dará detalles de facturación "más adelante en 2026", con **al menos 90 días de aviso**. ✅ (developers.google.com/calendar/pricing)
- Cuotas: **600 requests/min por usuario por proyecto** y **10,000/min por proyecto**. Un error 403 o 429 `usageLimits` indica exceso. Una *service account* cuenta como un solo usuario, así que conviene usar backoff y sincronización incremental (`syncToken`) o push notifications (`watch`). ✅/🟡
- Recomendación: que **Supabase sea la fuente de verdad** de la agenda y Google Calendar sea **solo un espejo** para las estilistas.

---

## 8. Costo mensual total estimado

### 8.1 Escenario A: plataforma propia (recomendado)

| Rubro | Supuesto | USD/mes | MXN/mes (×18.5) |
|---|---|---|---|
| Supabase Pro (Micro) | Sin PITR | 25.00 | 463 |
| Vercel Pro | 1 asiento | 20.00 | 370 |
| Resend | Free → Pro | 0 – 20.00 | 0 – 370 |
| WhatsApp, servicio | 600 conversaciones × ~8 mensajes del salón = 4,800. Menos 1,000 gratis, quedan **3,800 × $0.0085** | 32.30 | 598 |
| WhatsApp, utility | 400 citas × 2 plantillas (confirmación y recordatorio) = **800 × $0.0085** | 6.80 | 126 |
| WhatsApp, marketing | 1 campaña al mes a **500** contactos con opt-in × $0.0397 | 19.85 | 367 |
| Instagram / Messenger | Sin cargo por mensaje ⚠️ | 0 | 0 |
| Claude (Haiku 5.5 + escalamientos a Sonnet) | Mezcla 80/20 | ≈ 6 – 10 | 111 – 185 |
| Google Calendar API | Bajo el umbral gratuito | 0 | 0 |
| Facturapi | ≈ 185 timbres | ≈ 22 | **410** |
| **Subtotal de plataforma** | | **≈ $132 – 156 USD** | **≈ $2,445 – 2,890 MXN** |
| Comisiones de pago en línea | GMV $300k con MP a 30 días (3.65% efectivo) | — | **≈ $10,962** |
| Comisiones POS | Variable: ≈ 4.06% (MP Point) del cobro con tarjeta en sitio | — | Variable |

> El escenario conservador de WhatsApp (5 mensajes por conversación, sin campaña) baja la línea de WhatsApp a ≈ $24 USD/mes. El escenario alto (12 mensajes por conversación, 2 campañas a 1,000 contactos) la sube a ≈ $130 USD/mes. **La mayor sensibilidad del costo de plataforma está en el marketing por WhatsApp.**

### 8.2 Escenario B: Manychat como capa de mensajería

| Rubro adicional al escenario A | USD/mes |
|---|---|
| Manychat Pro (2,500 contactos) | 39 (o 29 con pago anual) |
| Add-on de IA de Manychat (si se usa su IA en lugar de Claude) | ≈ 29 ⚠️ |
| Posible markup de WhatsApp | Desconocido ⚠️ |
| Business (si se requiere ruteo por equipo) | 99 en lugar de 39 |
| **Delta frente al escenario A** | **+$39 a +$128 USD/mes**, más trabajo de sincronización con Supabase |

### 8.3 Lo que domina el costo

1. **Comisiones de pago (~3.5 a 4.4% del GMV)**: unas 4 veces todo lo demás junto. Negociar la tarifa con MP u Openpay al superar ~$100k MXN/mes y elegir el plazo de acreditación.
2. **Marketing por WhatsApp.** Segmentar y medir conversión por campaña.
3. Infraestructura e IA: costo bajo y predecible.

---

## 9. Riesgos y mitigaciones

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| 1 | **Cambios de precios de Meta** (oct-2026: servicio y utility ahora se cobran) | Alto en WhatsApp | Medir mensajes por conversación. Preferir respuestas consolidadas a muchos mensajes cortos. Mover avisos no urgentes a email o IG. Monitorear el CSV de Meta cada trimestre. |
| 2 | **Política de IA de WhatsApp** (prohibición de chatbots generales) | Medio | Bot acotado al dominio del salón, opción de humano siempre visible, sin "chat libre con IA". |
| 3 | **Recategorización de plantillas** (utility → marketing) | Medio | Redacción transaccional pura. Revisar los webhooks `message_template_status_update` y `template_category_update`. |
| 4 | **Bloqueo o calidad baja del número** | Alto | Opt-in real, baja fácil y frecuencia limitada de campañas. |
| 5 | **Pagos diferidos** (OXXO/SPEI) que no llegan y bloquean la agenda | Medio | Reservas con expiración y liberación automática. |
| 6 | **Webhooks falsificados o duplicados** | Alto | Verificar firma (`X-Hub-Signature-256`, `x-signature`), deduplicar por ID con `UNIQUE` y reconciliar contra la API. |
| 7 | **Datos sensibles** (salud y fotos) sin consentimiento expreso | Alto (multas que se duplican) | Checkbox separado, RLS estricto, expediente separado y bitácora de consentimientos. |
| 8 | **Encargados extranjeros** (Supabase, Vercel, Anthropic, Meta) | Medio | Declararlos en el aviso, firmar o aceptar sus DPA y elegir región cuando se pueda. |
| 9 | **Supabase Free** (pausa y sin backups) | Alto | Pro desde producción y dump diario externo. |
| 10 | **Vercel Hobby** usado comercialmente | Medio (suspensión) | Pro. |
| 11 | **Errores CFDI** (datos del receptor mal capturados) | Medio | Validar RFC, nombre, CP y régimen con un formulario que pida la CSF. Usar el modo test de Facturapi. |
| 12 | **Reglamento de la LFPDPPP pendiente** o reformas | Medio | Revisión legal semestral. Diseño *privacy-by-default*. |
| 13 | **Dependencia de Manychat** (si se usa) | Medio | Lógica en el backend propio y Manychat solo como transporte. |

---

## 10. Recomendaciones finales (resumen)

1. **Mensajería:** WhatsApp **Cloud API directa** + Instagram/Messenger por **Graph API con Standard Access** (sin App Review mientras solo sea el negocio propio). Inbox propio sobre Supabase con modo bot o humano. Manychat solo como puente temporal.
2. **IA:** Claude **Haiku 5.5** en primera línea y **Sonnet 5.5** para escalamientos, con prompt caching. Costo menor a $25 USD/mes.
3. **Pagos:** **Mercado Pago** (Checkout/Bricks en línea y Point en sitio). Evaluar Openpay si se busca la menor comisión. Webhooks firmados e idempotentes. Anticipos con expiración.
4. **Facturación:** **Facturapi** ($299 MXN/mes + $0.60 por timbre), factura global semanal o mensual por API y autofacturación opcional.
5. **Infraestructura:** Supabase Pro ($25), Vercel Pro ($20), Resend Free→Pro y Google Calendar como espejo (gratis). **Total de plataforma ≈ $130 a $160 USD/mes**, sin contar comisiones de pago.
6. **Legal:**
   - Aviso de privacidad integral + simplificado conforme a la **LFPDPPP 2025**.
   - Consentimiento **expreso y separado** para datos de salud y para uso de fotos en marketing.
   - Opt-in de marketing con baja en un paso.
   - Proceso ARCO documentado.
   - Términos, cancelación y anticipos visibles (LFPC 76 Bis / NMX-COE-001).
   - NOM-151 opcional para consentimientos firmados.
7. **Verificaciones pendientes antes de lanzar** (marcadas ⚠️):
   - CSV oficial de Meta para México.
   - Markup de Manychat.
   - Tarifas vigentes de Stripe MX y Conekta.
   - Comisión de MSI en Point.
   - Texto oficial de la LFPDPPP sobre datos sensibles y plazos ARCO.
   - Existencia del reglamento 2025-2026.
   - Plazos de la factura global (RMF 2026).

---

## 11. Fuentes (verificadas o consultadas el 2026-10-21)

> Leyenda: **[O]** sitio oficial del proveedor o la autoridad · **[S]** secundaria (blog, reseller o despacho). Las páginas de Meta, Supabase, Vercel, Stripe, Mercado Pago, Manychat y Facturapi se consultaron **a través de resultados de búsqueda** porque el acceso directo estaba bloqueado desde el entorno.

**WhatsApp / Meta**
- [O] https://developers.facebook.com/docs/whatsapp/pricing — modelo de precios y changelog (México: marketing más bajo el 2025-10-01)
- [O] https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- [O] https://developers.facebook.com/docs/whatsapp/messaging-limits — límites a nivel de portafolio, 250 → 2,000
- [O] https://help.twilio.com/articles/53100480177819 — cambios de precios de WhatsApp en octubre de 2026
- [S] https://www.wati.io/en/blog/whatsapp-service-message-pricing/ — 1,000 mensajes de servicio gratis por número
- [S] https://www.ycloud.com/blog/whatsapp-api-message-pricing-update-effective-october-1-2026
- [S] https://www.goeva.ai/en/resources/whatsapp-business-api-pricing-mexico — México: marketing $0.0305 → $0.0397, utility y authentication $0.0085
- [S] https://www.engagelab.com/blog/whatsapp-business-api-pricing
- [S] https://chatfuel.com/docs/whatsapp/how-much-does-meta-charge-for-whatsapp-messages.md
- [S] https://docs.360dialog.com/partner/get-started/pricing-and-billing/whatsapp-pricing-changes-effective-july-1-2025
- [S] https://help.sleekflow.io/en_US/whatsapp/pricing
- [S] https://www.wati.io/en/blog/wati-mcp-agent-whatsapp-rate-limits/ — 80 mps
- [S] https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform — política de IA
- [S] https://respond.io/blog/whatsapp-general-purpose-chatbots-ban
- [S] https://www.unipile.com/whatsapp-api-providers/ — comparación entre Cloud API directa y BSP
- [S] https://help.manychat.com/hc/en-us/articles/14281380243740-WhatsApp-pricing-guide — tabla de México en Manychat ($0.0456 / $0.0098 / $0.0085)

**Messenger / Instagram**
- [O] https://developers.facebook.com/docs/messenger-platform/overview — etiqueta Human Agent, 7 días
- [O] https://developers.facebook.com/docs/instagram-platform/overview — permisos y Advanced Access
- [O] https://developers.facebook.com/docs/instagram-platform/app-review — cuándo se requiere App Review
- [O] https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
- [O] https://developers.secure.facebook.com/docs/messenger-platform/handover-protocol — reemplazo por Conversation Routing
- [S] https://www.spurnow.com/en/blogs/instagram-messenger-ads-7-day-messaging-window — ventana de 7 días por anuncios (no verificado)

**Manychat**
- [S] https://flowgent.ai/blog/manychat-pricing
- [S] https://www.featurebase.app/blog/manychat-pricing
- [S] https://chatpalbot.com/compare/manychat-pricing
- [S] https://heymark.ai/en/compare/manychat-pricing/
- [S] https://community.manychat.com/general-q-a-43/external-requests-10114 — External Request en Pro o superior
- [S] https://leadsbridge.com/documentation/manychat-classic/ — token de API en Pro

**Pagos**
- [O] https://www.mercadopago.com.mx/herramientas-para-vender/link-de-pago — 3.49% + $4, OXXO 3.79% + $4, tabla de MSI
- [O] https://www.mercadopago.com.mx/blog/hot-sale-integra-mercado-pago — tarifas por plazo de acreditación (2026)
- [O] https://www.mercadopago.com.mx/blog/comisiones-point-mercado-pago-mexico — Point 3.50% + IVA
- [O] https://www.mercadolibre.com.mx/a/store/mercadopago — promoción Point 3.20% + IVA
- [O] https://www.mercadopago.com.mx/developers/en/docs/checkout-pro-preferences/payment-notifications — firma `x-signature`
- [O] https://stripe.com/newsroom/news/stripe-launches-mexico — OXXO, MSI hasta 18
- [S] https://wise.com/mx/blog/comisiones-stripe-mexico — Stripe MX 3.6% + $3
- [O] https://site.openpay.mx/en/pricing.html — Openpay 2.9% + $2.5, SPEI $8
- [S] https://skills.sh/ivanovishado/agent-skills/mexico-market — Conekta (no oficial)
- [S] https://www.guiadesoftware.com/blog/mejor-pasarela-pago-mexico
- [S] https://ayuda.tiendanube.com/es_MX/conekta/preguntas-frecuentes-sobre-el-metodo-de-pago-conekta — mínimo de $30 MXN
- [S] https://www.tiendanube.com/mx/blog/clip — Clip 3.6% + IVA
- [S] https://subger.com/en/service/clip-mx — lector Clip de $299
- [S] https://atempora.studio/blog/comisiones-mercado-pago-2026

**CFDI**
- [O] https://www.facturapi.io/pricing — $299/mes + $0.60 por timbre
- [O] https://help.facturapi.io/es/articles/9247074-informacion-general-sobre-precios
- [O] https://facturama.mx/planes-facturacion — paquetes de folios y API $1,650 al año
- [S] https://www.edifact.com.mx/planes-de-timbrado — $1.00 por timbre
- [S] https://idconline.mx/fiscal-contable/2023/06/12/factura-publico-en-general-igual-a-global
- [S] https://facturador.helpjuice.com/%C2%BFc%C3%B3mo-generar-una-factura-global

**Datos personales / consumidor**
- [S] https://www.garrigues.com/es_ES/noticia/mexico-nueva-ley-federal-proteccion-datos-personales-posesion-particulares-introduce
- [S] https://kpmg.com/mx/es/tendencias/2025/04/flash-nueva-ley-federal-de-proteccion-de-datos-personales-en-posesion-de-los-particulares.html
- [S] https://www.hoganlovells.com/es/publications/mexicos-new-federal-data-protection-law-what-it-means-for-companies
- [S] https://iapp.org/news/a/entendiendo-la-ley-federal-de-protecci-n-de-datos-personales-en-posesi-n-de-los-particulares-en-mexico
- [S] https://www.littler.com/es/news-analysis/asap/mexico-tiene-nueva-ley-en-materia-de-proteccion-de-datos-personales
- [S] https://www.legiscope.com/blog/lfpdppp-mexico-guia-cumplimiento.html — reforma del 14-nov-2025 y sanciones en UMA (no verificado)
- [S] https://cdp.com/es/glossary/data-privacy-regulations/ — reglamento 2011 aún publicado
- [O] https://platiica.economia.gob.mx/normalizacion/nmx-coe-001-scfi-2018/ — NMX-COE vigente
- [O] https://platiica.economia.gob.mx/wp-content/uploads/sites/2/PDF_Normas_Publicas/151scfi2016.pdf — NOM-151
- [S] https://www.xataka.com.mx/telecomunicaciones/repep-que-como-funciona-registrar-numero-celular-evitar-llamadas-mensajes-publicidad-telefonicas-bancos — REPEP
- [S] https://www.ecija.com/actualidad-insights/repep-y-publicidad-responsable-cuando-los-derechos-del-consumidor-se-cruzan-con-la-proteccion-de-datos/
- [S] https://www.publimetro.com.mx/nacional/2026/10/08/te-llaman-a-cada-rato-para-venderte-algo-senado-aprueba-multas/ — iniciativa del Senado, oct-2026

**Infraestructura**
- [O] https://supabase.com/pricing (y `/pricing.md`) — PITR $100 por 7 días, pausa del Free, sin backups en Free
- [S] https://makerkit.dev/blog/saas/supabase-pricing ; https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/ ; https://schematichq.com/blog/supabase-pricing
- [O] https://vercel.com/docs/plans/pro — $20 de plataforma con $20 de crédito y 1 asiento
- [S] https://makerkit.dev/blog/tutorials/vercel-cost — Hobby no comercial y excedentes
- [S] https://automationatlas.io/answers/resend-pricing-explained-2026/ ; https://pricingsaas.com/companies/resend
- [S] https://automationatlas.io/answers/postmark-pricing-explained-2026/ ; https://costbench.com/changelog/postmark-price-decrease-2026-02/
- [O] https://developers.google.com/calendar/pricing ; https://developers.google.com/calendar/quota
- [O] Precios de Anthropic: skill oficial `claude-api` (tabla de modelos cacheada el 2026-10-06). Verificar en https://www.anthropic.com/pricing o https://platform.claude.com/docs/en/about-claude/pricing
