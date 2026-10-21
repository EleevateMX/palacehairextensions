# 06 · Módulos y permisos

La seguridad efectiva está en la base de datos (RLS + verificación de rol en cada RPC). La navegación de la app solo oculta lo que no aplica (`apps/web/lib/roles.ts`).

## 1. Matriz de permisos (MVP)
L = leer · E = escribir directo · R = solo mediante funciones RPC · — = sin acceso

| Recurso | Propietaria | Admin | Recepción | Estilista | Inventarios | Ventas |
|---|---|---|---|---|---|---|
| Configuración, servicios, recursos, horarios | L/E | L/E | L | L | L | L |
| Costos de servicios y de productos | L/E | L/E | — | — | L (costo producto) | — |
| Catálogo (productos/variantes sin costo) | L/E | L/E | L | L | L/E | L |
| Existencias y reservas | L | L | L | L | L | L |
| Movimientos de inventario (kardex) | L | L | — | — | L | — |
| Entradas, mermas, ajustes, conteos, transferencias | R | R | — | — | R | — |
| Reservar/liberar material | R | R | R | — | R | R |
| Clientas | L/E | L/E | L/E | L (solo las que atiende) | — | L/E |
| Notas generales | L/E | L/E | L/E | L/E (sus clientas) | — | L/E |
| Notas sensibles | L/E | L/E | — | — | — | — |
| Fotos | L/E | L/E | E | L/E (sus clientas) | — | — |
| Citas | L/R | L/R | L/R | L (las suyas), asistencia/consumo R | — | L |
| Ocupación (sin datos de clienta) | L | L | L | L | L | L |
| Ausencias | L/aprobar | L/aprobar | L | solicitar/ver propias | solicitar | solicitar |
| Cobro (POS) | R | R | R | — | — | R |
| Descuentos manuales / cambio de precio | R | R | — | — | — | — |
| Devoluciones y cancelaciones de venta | R | R | — | — | — | — |
| Ventas y pagos | L | L | L | Sus líneas (comisión) | — | L |
| Cortes de caja | L | L | Los suyos | — | — | Los suyos |
| Conversaciones | L/E | L/E | L/E | — | — | — |
| Bitácora de auditoría | L | — | — | — | — | — |
| Anonimizar clienta | R | R | — | — | — | — |

Usuarias autenticadas **sin** expediente de personal activo no ven datos operativos. `anon` solo ve catálogo público (servicios reservables en línea, productos a la venta en línea, horarios) y nunca costos.

## 2. Implementación
- Funciones auxiliares en esquema privado `app`: `current_staff_id()`, `has_role(...)`, `require_role(...)`, `can_access_client()`, `staff_serves_client()`.
- Todas las RPC son `SECURITY DEFINER` con `search_path = ''` y llaman a `app.require_role`.
- `revoke execute … from public, anon` en todas las funciones públicas; `revoke truncate` a roles de la API; permisos por **columna** para ocultar `cost_cents`.
- Vistas: `security_invoker` salvo `v_variant_costs` y `v_commissionable_lines`, que filtran por rol en su `WHERE`.
- Storage: bucket `catalog` público; `client-photos` privado, ruta `<client_id>/…`, acceso alineado a la política de fotos y al consentimiento.
- Registro público deshabilitado (`enable_signup = false`): la propietaria da de alta al personal. Contraseña mínima de 10 caracteres con mayúsculas, minúsculas y dígitos.

## 3. Datos personales (México)
Base legal y obligaciones resumidas en [`research/integraciones-costos-legal.md`](research/integraciones-costos-legal.md) §6 (LFPDPPP publicada en el DOF el 20-03-2025; autoridad: Secretaría Anticorrupción y Buen Gobierno).

| Medida | Estado |
|---|---|
| Aviso de privacidad versionado (`business_settings.privacy_notice_version`, `client_consents.privacy_notice_version`) | Esquema listo; ❓ texto legal pendiente (abogada/o) |
| Consentimientos por finalidad, históricos e inmutables | Implementado |
| Datos potencialmente sensibles (salud capilar, alergias) separados como notas sensibles | Implementado |
| Fotos solo con consentimiento; uso en marketing con consentimiento aparte (`photos_marketing`) | Implementado |
| Derechos ARCO: cancelación mediante anonimización conservando registros contables | `anonymize_client()` implementado; falta borrar archivos del bucket (Edge Function de mantenimiento, V2) |
| Retención | 🟦 Propuesta: expedientes inactivos 5 años → anonimizar; registros contables según obligaciones fiscales; bitácora 2 años. ❓ Validar con asesoría legal/contable. |
| Comunicaciones comerciales | Solo con consentimiento `marketing_*` vigente y baja en un paso (V2–V3) |

## 4. Respaldos y restauración (procedimiento propuesto)
1. Supabase Pro: respaldos diarios incluidos; PITR opcional (costo en docs/10).
2. Exportación semanal adicional con `supabase db dump` a almacenamiento de la propietaria (cifrado).
3. Prueba de restauración trimestral en un proyecto de staging (`supabase db reset` + restore), documentando tiempo y resultado.
4. Las migraciones en git permiten reconstruir el esquema desde cero (verificado en CI).
