# 11 · Riesgos y decisiones

## 1. Decisiones tomadas (reversibles, registradas como ADR breves)
| # | Decisión | Alternativas | Motivo | Impacto |
|---|---|---|---|---|
| D1 | Next.js 16 + Supabase; monorepo pnpm | SPA Vite (como Shakeaholic) | Pedido de la clienta; SSR con sesión segura; un solo despliegue | Complejidad media |
| D2 | Garantías críticas en PostgreSQL (EXCLUDE, CHECK, bloqueos, llaves únicas) | Validar en la app | Las carreras solo se resuelven bien en la BD | Seguridad ↑ |
| D3 | Cada unidad física = un recurso | Recurso con capacidad N | Permite usar EXCLUDE y garantizar capacidad sin bloqueos manuales | Simple; para "espacios compartidos" de capacidad alta se modelan N unidades |
| D4 | Estados separados (reserva/asistencia/pago/materiales) | Un solo estado | Evita combinaciones imposibles y facilita reportes | — |
| D5 | Motor de disponibilidad en TypeScript puro | SQL | Rápido de probar y reutilizable por portal y bot; la BD revalida | — |
| D6 | Dinero en centavos enteros, IVA incluido | Decimales | Sin errores de redondeo | — |
| D7 | Registro público deshabilitado; alta de personal por la propietaria | Registro abierto | Superficie de ataque mínima | — |
| D8 | Costos ocultos por permisos de columna | Vista separada para todos | El personal no ve costos ni márgenes | — |
| D9 | Esquema nuevo (no reutilizar migraciones de Shakeaholic/Lily) | Copiar | Sus migraciones no son reproducibles y llevan otro giro | Más trabajo inicial, menos deuda |
| D10 | Pruebas de BD con un *shim* mínimo de Supabase sobre PostgreSQL | Solo `supabase start` (Docker) | Corre en CI sin Docker y en segundos; `supabase start` sigue disponible para desarrollo | El shim no prueba Storage/Auth reales |
| D11 | Google Calendar fuera del MVP | Sincronización bidireccional | La agenda propia es la fuente de verdad; la bidireccional crea conflictos | Opcional V3 (solo lectura) |

## 2. Decisiones pendientes de la clienta (afectan costo, complejidad o funcionamiento)
| # | Pregunta | Afecta |
|---|---|---|
| P1 | ¿Autoriza crear un proyecto Supabase y una cuenta Vercel **exclusivos** de Palace? ¿Plan Pro desde el inicio? | Costo, entorno de staging |
| P2 | ¿Cuántas estaciones, lavacabezas, cabinas y especialistas hay? ¿Horarios reales? | Configuración, capacidad |
| P3 | ¿Cómo se venden y cotizan las extensiones (paquete, gramo, mechón)? ¿Qué técnicas? ¿Tabla de gramos por largo/volumen? | Inventario, cotizador |
| P4 | Política de anticipos y cancelación (monto, plazo, ¿se pierde, abona o reembolsa?) | Agenda, pagos |
| P5 | Esquema de comisiones real (con/sin IVA, tras descuentos) | Comisiones |
| P6 | Pasarela de pago y terminal actuales | Integración, costo |
| P7 | ¿Manychat primero o bandeja propia? Número de WhatsApp y estado de verificación en Meta | Mensajería |
| P8 | ¿Emite CFDI hoy? ¿Con qué proveedor? | Finanzas |
| P9 | Identidad visual (cuando exista) | UI |
| P10 | ¿Operar temporalmente con AgendaPro/Fresha mientras se construye? | Calendario |
| P11 | Aviso de privacidad y políticas (revisión legal) | Cumplimiento |

## 3. Registro de riesgos
| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Cambios de precios/políticas de Meta (cobro desde 2026-10-01, prohibición de IA general) | Alta | Medio | Bot acotado al salón con transferencia humana; medir costo por campaña; plantillas *utility* mínimas |
| Bot que inventa precios u horarios | Media | Alto | Solo funciones controladas; nunca confirma sin la BD; pruebas de herramientas |
| Doble reserva / sobreventa | Baja | Alto | Garantías en BD probadas con concurrencia real en CI |
| Comisiones de pago mayores a lo esperado | Media | Medio | Elegir plazo de acreditación; negociar; OXXO/SPEI |
| Datos personales (fotos, salud capilar) expuestos | Baja | Alto | RLS, bucket privado, consentimiento por finalidad, notas sensibles separadas, auditoría |
| Incumplimiento LFPDPPP / comunicaciones comerciales | Media | Alto | Aviso de privacidad versionado, opt-in por canal, baja en un paso, revisión legal (P11) |
| Deuda por "copiar" de proyectos previos | Media | Medio | Solo lógica reescrita; nada de migraciones copiadas |
| Sesiones caducadas en tablets de recepción (aprendido de Shakeaholic) | Media | Medio | Refresco de sesión en `proxy.ts`; PIN en V2 |
| Dependencia de un solo desarrollador/agente | Media | Medio | Documentación, pruebas en CI, migraciones reproducibles |
| Datos de mercado no verificados | Media | Bajo | Marcados en los documentos; confirmar antes de decidir |
| Diferencias entre PostgreSQL 16 (pruebas locales) y 17 (Supabase/CI) | Baja | Bajo | CI usa PostgreSQL 17 |

## 4. Fuera de alcance de esta entrega (explícito)
- No se creó ni modificó ningún proyecto Supabase, despliegue, cuenta de Meta, Manychat o pasarela.
- No se probó la app web contra un Supabase real (no existe proyecto aún); se verificó compilación, tipos y redirecciones de autenticación.
- No se implementaron adaptadores de pago, mensajería, IA ni CFDI: solo el esquema y las garantías de datos que necesitarán.
