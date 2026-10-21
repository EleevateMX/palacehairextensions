# 10 · Costos operativos

Detalle, supuestos y fuentes: [`research/integraciones-costos-legal.md`](research/integraciones-costos-legal.md) §4, §5, §7 y §8 (verificación 2026-10-21). Supuestos: ~400 citas/mes, ~600 conversaciones/mes, ~150 ventas en línea/mes, tipo de cambio 18.5 MXN/USD, ticket promedio $2,000 MXN (supuestos del equipo, ❓ validar).

> ⚠️ Varias tarifas (Meta para México, Stripe/Conekta) provienen de fuentes secundarias o no pudieron leerse en el sitio oficial desde este entorno. Confirmar antes de comprometer presupuesto.

## 1. Plataforma (escenario recomendado: stack propio)
| Rubro | USD/mes | MXN/mes | Notas |
|---|---|---|---|
| Supabase Pro (cómputo Micro) | 25 | ~463 | Free se pausa por inactividad y no tiene respaldos → no apto para producción. PITR 7 días: +US$100. |
| Vercel Pro (1 asiento) | 20 | ~370 | Hobby no permite uso comercial. |
| Correo transaccional (Resend) | 0–20 | 0–370 | Free: 3,000/mes, 100/día. |
| WhatsApp (servicio + utility + 1 campaña) | ~24–130 (base ~59) | ~450–2,400 | El marketing es la variable más sensible. |
| IA (modelo pequeño + escalamiento) | ~2–10 | ~40–185 | Precios según tabla de Anthropic consultada (caché 2026-10-06). |
| CFDI (Facturapi API) | ~22 | ~410 | $299 MXN/mes + $0.60 por timbre (~185 timbres). |
| Google Calendar API | 0 | 0 | No se usa en MVP. |
| **Subtotal** | **≈ 132–156** | **≈ 2,450–2,900** | Sin comisiones de pago. |

Escenario con **Manychat** como puente: **+US$39 a +US$128/mes** (Pro/Business, IA opcional, posible sobreprecio de WhatsApp no verificado).

## 2. Comisiones de pago (el costo dominante)
| Proveedor | Tarjeta en línea | Otros | Fuente |
|---|---|---|---|
| Mercado Pago | 3.49% + $4 (inmediato); 2.95% + $4 (30 días) + IVA | OXXO 3.79% + $4; MSI 3 meses 4.69% | Oficial |
| Openpay (BBVA) | 2.9% + $2.50 + IVA | SPEI $8 | Oficial (página sin fecha) |
| Stripe México | 3.6% + $3 + IVA | — | No verificado |
| Conekta | 3.4% + $3 + IVA | — | No verificado |
| Terminal Mercado Pago Point | 3.50% + IVA | — | Oficial |
| Terminal Clip | 3.6% + IVA | — | Secundaria |

Con $300,000 MXN/mes en ventas en línea: **≈ $10,500–13,000 MXN/mes** en comisiones (≈ 4 veces el resto de la plataforma).

**Recomendación** 🟦: Mercado Pago (en línea + Point en el salón) por cobertura (OXXO, MSI) y ecosistema; Openpay si la tarifa más baja es prioritaria. Negociar tarifa al superar ~$100k MXN/mes. ❓ Decisión de la clienta (¿ya tiene cuenta/terminal?).

## 3. Desarrollo y mantenimiento
No se estiman honorarios de desarrollo en este documento. Mantener: actualizaciones de dependencias, monitoreo, respaldos y plantillas de Meta (~4–8 h/mes estimadas 🟦).

## 4. Comparación con comprar
| Opción | Costo mensual aproximado | Cubre extensiones (inventario por tono, apartado, cotizador) |
|---|---|---|
| AgendaPro MX (plan con inventario y comisiones) | $550–1,500 MXN + IVA + complementos de WhatsApp | No |
| Fresha | US$14.95 × miembro + comisiones de marketplace | No |
| Palace OS (stack propio) | ≈ $2,450–2,900 MXN + desarrollo | Sí |
