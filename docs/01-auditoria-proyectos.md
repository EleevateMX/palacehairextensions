# 01 · Auditoría de proyectos previos (Shakeaholic y Hojaldras Lily)

**Fecha:** 2026-10-21 · **Modo:** solo lectura. No se modificó, commiteó ni empujó nada en los repositorios auditados. No se copiaron datos, usuarios, credenciales ni configuración de esos negocios.

Convención: **[V]** verificado en código/SQL/historial git · **[I]** inferido (documentación interna o razonamiento; no comprobable sin acceso a sus bases de datos).

## 1. Qué se auditó

| Repositorio | Qué es realmente | Evidencia |
|---|---|---|
| `EleevateMX/costosshake` (el que se indicó) | Hoja de costeo legacy: 1 `index.html` (vanilla JS + supabase-js por CDN) con costeo e inventario bodega/kiosko guardado en una fila JSON. **No tiene POS ni descuento por receta.** 27 commits "Add files via upload" (2026-06-08 → 07-14). | [V] |
| `EleevateMX/ventashake` | **El sistema Shakeaholic real.** Monorepo pnpm, 523 commits (2026-07-01 → 10-20), 11 apps Vite + React 18 SPA, 6 paquetes, 254 migraciones SQL, 17 Edge Functions, despliegue en Cloudflare Pages. `costosshake` se importó como `apps/costos` (commit `9541c73`). | [V] |
| `EleevateMX/shakeaholic-pos` (privado) | Copia divergente de `ventashake` (~2026-08-26) con 6 migraciones propias. Comparte el mismo proyecto de backend y destino de despliegue que `ventashake`. | [V] YAML/docs · riesgo [I] |
| `EleevateMX/webshake` | Landing estática (~1 MB, recursos en base64). Sin backend. | [V] |
| `EleevateMX/hojaldraslily` | **Hojaldras Lily**: copia del motor POS de Shakeaholic adaptada a panadería (commit fundacional `38838d6`, 2026-08-26, «Replicar el sistema POS completo de Shakeaholic…»). Historias git separadas; 132 migraciones replicadas con reemplazo de marca (`scripts/adaptar-sql-lily.sh`) + 83 propias. | [V] |

Los informes detallados (≈400 líneas cada uno, con rutas, commits y SQL citado) se entregaron al propietario del proyecto **fuera de este repositorio**, porque este repositorio es público y contienen hallazgos de seguridad de sistemas en producción de otros negocios (ver §6).

## 2. Hallazgos principales

### Shakeaholic (`ventashake`)
- **Arquitectura DB-céntrica** [V]: pago → inventario → cocina → lealtad corren en triggers y RPC `SECURITY DEFINER` (330 funciones en repo; todas las definer con `search_path`). Los frontends solo llaman RPC desde un paquete único de acceso a datos.
- **Descuento automático por receta** [V]: trigger `fn_descontar_inventario_por_orden` (commit `a7bae30`) escribe ledger (`inventario_movimientos`) y saldo (`inventario_stock`) en la misma sentencia, al pasar la orden a pagada. Permite stock negativo a propósito.
- **POS sólido** [V]: precios recalculados en el servidor, máquina de estados de pago validada por trigger, idempotencia de efectos de venta (`venta_confirmaciones`), pago dividido/mixto, modo sin internet con reenvío idempotente, corte de caja con desglose por denominación y fondo fijo.
- **Traspasos entre almacenes a medias** [V]: solo Bodega→Kiosko con nombres de almacén escritos en el SQL; la tabla `transferencias` y la función cliente `transferir()` existen pero no se usan.
- **Catálogo como JSON** [V]: la fuente de verdad del catálogo es una fila JSON sincronizada a tablas por nombre; causó productos duplicados, ~630 insumos fantasma y recetas que no se actualizaban (documentado en su `CLAUDE.md`).
- **Base no reproducible** [V]: faltan en git las migraciones fundacionales; 247 de 254 archivos sin prefijo de fecha; se aplican directo a producción.
- **Pruebas** [V]: 352 casos Vitest de funciones puras; **cero** pruebas de SQL/RLS/integración/E2E; el CI no ejecuta pruebas.
- **No existe**: agenda/citas, recursos físicos, comisiones, CRM de servicios, CFDI, finanzas (P&L), multi-sucursal real.

### Hojaldras Lily
- **Misma base técnica** (Vite 5/6 + React 18 SPA, Tailwind 3, Zustand, Edge Functions Deno, 2 agentes Node de impresión) [V]. 215 migraciones, 67 tablas, 189 funciones, 140 políticas, RLS en todas las tablas [V].
- **Aportes propios** [V]: producción por moldes (Caja → Producción → Horno → Empaque), encargos con anticipo, pago mixto, venta sin internet, corte por denominación, índice único que impide doble cobro aprobado por orden.
- **Eliminó** CRM/lealtad/checador de la UI pero dejó las tablas [V].
- **Pruebas** [V]: 17 archivos Vitest (~220 casos) de paquetes y agentes; sin pruebas SQL/UI/E2E; el CI solo corre lint y build.

## 3. Matriz de evaluación

| Elemento | Shakeaholic (`ventashake`) | Hojaldras Lily | Reutilización en Palace |
|---|---|---|---|
| **Arquitectura** | Monorepo pnpm, SPA Vite+React 18, lógica en Postgres, agentes locales, Cloudflare Pages | Copia del mismo motor + módulo de producción | **Patrón sí** (lógica crítica en BD, RPC atómicas, capa única de datos). **UI no**: Palace usa Next.js (App Router). |
| **Autenticación** | PIN → Edge Function → sesión real de Supabase Auth; bcrypt; roles admin/gerente/cajero/cocina + permisos por persona | Igual, con variantes | **Adaptar la idea** (PIN en tablet de recepción, fase posterior). MVP: correo + contraseña con Supabase Auth, sin registro público. |
| **Inventario** | Ledger + saldo materializado, receta en trigger, conteo, entradas con prorrateo de flete; sin variantes, lotes ni reservas | Igual + mínimos, merma, lista de compra, apartados | **Lógica adaptada** y ampliada: variantes (tono/largo/textura), reservado vs disponible, reservas por clienta/cita, transferencias por id. |
| **POS** | Precio en servidor, máquina de estados, idempotencia, pago dividido, offline | Igual + índice anti doble cobro, encargos con anticipo | **Patrones adaptados**: precio en servidor, idempotencia por llave, referencias de pago únicas. Nuevo: servicios + productos, anticipos de cita, propinas, saldo pendiente. |
| **Clientes** | Tabla básica + programa de lealtad | Débil (CRM eliminado) | **Desde cero**: expediente capilar, consentimientos, fotos, notas sensibles, mantenimiento. |
| **Reportes** | Ventas diarias, top productos, cierre diario en vivo, kardex | Básico | **Patrón reutilizable** (cierre calculado + aclaraciones). Nuevo: rentabilidad por servicio, ocupación, comisiones. |
| **Supabase** | 254 migraciones no reproducibles, aplicadas en producción | 215 migraciones | **No reutilizable como migraciones**. Palace parte de un esquema limpio, con fecha, reproducible y probado en CI. |
| **Seguridad** | Endurecimiento en fases, sin llaves secretas en git; con huecos abiertos documentados | Media-alta y documentada, con huecos puntuales | **No heredar la postura**: RLS deny-by-default, cobro solo con sesión de personal, `revoke` explícito a `anon`, pruebas automáticas de permisos. |

## 4. Clasificación para Palace

### 4.1 Código reutilizable (portar con revisión)
- Utilidades TS puras de `ventashake/packages/utils`: dinero, desglose de efectivo por denominación (`efectivo.ts`, `sugerirFondo`), división de pagos (`dividir.ts`), paginación de PostgREST (`paginar.ts`), comprobante de corte. *Se portarán cuando se implemente el corte con desglose; en esta entrega Palace usa sus propios helpers en `@palace/domain`.*
- Agente de impresión ESC/POS/TSPL (`agente-impresion/`) **solo si** Palace decide imprimir tickets/etiquetas (pendiente de validar).

### 4.2 Lógica comercial adaptada (reescrita en el esquema de Palace)
| Origen | En Palace |
|---|---|
| Receta → descuento de insumos | `service_materials` (BOM del servicio): se **estima y reserva** al agendar y se **consume real** al completar (`complete_appointment`). |
| Ledger + saldo | `stock_movements` (inmutable, con `on_hand_after`, costo y actor) + `stock_levels` (on_hand, reserved) con `CHECK` anti-negativos. |
| Traspaso bodega→kiosko | `transfer_stock()` genérico por id de sucursal, con orden de bloqueo determinista. |
| Conteo que fija existencia | `apply_stock_count()` genera movimientos `count_adjustment` auditables. |
| Idempotencia de venta | `sales.idempotency_key` único + referencias de pago únicas por proveedor. |
| Precio desde catálogo en servidor | `pos_checkout()` recalcula precio; solo owner/admin pueden sobrescribir o descontar. |
| Corte con fondo | `open_cash_session()` / `close_cash_session()` (desglose por denominación: siguiente iteración). |
| Cola con `FOR UPDATE SKIP LOCKED` | Barrido de apartados vencidos (`app.expire_holds`); futuras colas de recordatorios. |

### 4.3 Requiere refactorización antes de usarse
- Pantallas de Admin (React SPA): solo como referencia funcional.
- Fórmula de costeo (food cost) → margen por servicio (materiales + mano de obra + costos configurables).
- Integración de terminal Clip: solo si Palace la elige (ver docs/10).

### 4.4 Desarrollado desde cero en Palace
Agenda con capacidad de personal **y** recursos físicos; reservas provisionales con expiración; anticipos separados del estado de la cita; CRM de salón con consentimientos; catálogo de extensiones por variante; comisiones configurables; mensajería con transferencia humana; esquema reproducible con pruebas de concurrencia y RLS en CI.

## 5. Lecciones incorporadas (de sus `CLAUDE.md` y del historial)
1. Catálogo y BOM en tablas con FK por id desde el día 1; nunca empatar por nombre ni usar JSON como fuente de verdad.
2. Migraciones con fecha, aplicadas primero en local/CI (`supabase db reset`), nunca directo a producción.
3. Pruebas automáticas de SQL, RLS y concurrencia en CI antes de desplegar.
4. Movimientos con actor, costo y saldo resultante como columnas, no en notas.
5. Llaves solo en variables de entorno/secretos; nada en YAML ni SQL.
6. Un solo repositorio/entorno por despliegue (evitar copias que publiquen al mismo destino).

## 6. Hallazgos de seguridad en los sistemas auditados
Se identificaron hallazgos de seguridad en los sistemas de Shakeaholic y Hojaldras Lily (permisos de funciones y políticas, autenticación por PIN, datos de demostración y despliegue). **Por responsabilidad, el detalle no se publica en este repositorio público**; se entregó al propietario para su atención en esos proyectos. Ninguno afecta a Palace, que no comparte base de datos, credenciales ni infraestructura con ellos.
