# Guía para agentes y desarrolladores — Palace Hair Extensions OS

## Idioma
Documentación, mensajes de UI y comentarios en español (México). Identificadores de código en inglés.

## Reglas no negociables
1. Garantías críticas en la base de datos: doble reserva (EXCLUDE en `appointment_allocations`), sobreventa (`app.lock_stock` + CHECK), duplicados (llaves únicas/idempotencia). No moverlas a la app.
2. Toda tabla nueva: RLS activado + políticas + prueba en `supabase/tests`. Toda función pública: `security definer`, `set search_path = ''`, `app.require_role(...)`, y `revoke execute ... from public, anon` (la migración de RLS lo hace para las existentes; repetirlo para funciones nuevas).
3. Movimientos de inventario solo vía `app.apply_movement` / RPC. `stock_movements`, `audit_log` y `client_consents` son de solo inserción.
4. Dinero en centavos enteros. Fechas `timestamptz`; horarios locales con `locations.timezone`.
5. Migraciones nuevas con timestamp; nunca editar una migración ya aplicada en un entorno compartido.
6. Nada de datos, llaves o proyectos de Shakeaholic u Hojaldras Lily. No modificar esos repositorios.
7. No declarar que algo funciona sin pruebas que lo verifiquen. No simular integraciones externas como reales.

## Verificación antes de commitear
`pnpm typecheck && pnpm test && pnpm test:db && pnpm --filter @palace/web build`

## Errores de negocio
Las RPC lanzan `raise exception '<CODIGO>'` (vía `app.fail`). La app traduce códigos en `apps/web/lib/errors.ts`.

## Next.js 16
`middleware` se llama ahora `proxy.ts`. `searchParams`/`params` son Promesas. Consulta `node_modules/next/dist/docs` antes de asumir APIs.
