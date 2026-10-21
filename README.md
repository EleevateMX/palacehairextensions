# Palace Hair Extensions OS

Plataforma de gestión integral para un salón especializado en extensiones de cabello: agenda inteligente con control de capacidad, inventario por tono/largo/técnica con reservas por clienta, punto de venta, CRM, personal y comisiones, y base para tienda en línea, pagos y mensajería con IA.

> Estado: **entrega 2** — MVP completo (configuración, personal, agenda, recepción, clientas, cotizador, inventario, POS, caja, ventas, reportes, finanzas y portal de reservas), probado de punta a punta en el stack local. Ver [`docs/09-roadmap.md`](docs/09-roadmap.md).
> Identidad visual **provisional** (tokens neutros); se personaliza al definir la marca.

## Documentación
| # | Documento |
|---|---|
| 01 | [Auditoría de proyectos previos](docs/01-auditoria-proyectos.md) |
| 02 | [Investigación de mercado](docs/02-investigacion-mercado.md) · [benchmark completo](docs/research/market-benchmark.md) |
| 03 | [PRD](docs/03-prd-palace.md) |
| 04 | [Arquitectura](docs/04-arquitectura.md) |
| 05 | [Modelo de datos](docs/05-modelo-datos.md) |
| 06 | [Módulos y permisos](docs/06-modulos-y-permisos.md) |
| 07 | [Flujos de reservas](docs/07-flujos-de-reservas.md) |
| 08 | [Mensajería e IA](docs/08-mensajeria-ia.md) |
| 09 | [Roadmap](docs/09-roadmap.md) · [Backlog](docs/backlog.md) |
| 10 | [Costos operativos](docs/10-costos-operativos.md) · [integraciones, costos y marco legal](docs/research/integraciones-costos-legal.md) |
| 11 | [Riesgos y decisiones](docs/11-riesgos-y-decisiones.md) |
| 12 | [Criterios de aceptación](docs/12-criterios-aceptacion.md) |

## Estructura
```
apps/web            Next.js 16 (panel del personal y portal público /reservar)
e2e                 Pruebas E2E con Playwright contra el stack local
packages/domain     Lógica pura: disponibilidad, comisiones, cotizador, mantenimiento, transferencia bot→humano
supabase/migrations Esquema versionado con RLS y funciones atómicas
supabase/tests      Pruebas contra PostgreSQL real (concurrencia, permisos, flujos)
supabase/seed.sql   Datos ficticios de desarrollo
scripts/local-stack Supabase mínimo sin Docker para desarrollo y E2E
```

## Requisitos
Node 22, pnpm 10, PostgreSQL 16+ (cliente `psql`) para las pruebas de BD. Docker + Supabase CLI para el entorno completo local.

## Comandos
```bash
pnpm install
pnpm test          # pruebas de dominio
pnpm test:db       # crea una BD desechable "palace_test", aplica migraciones y corre pruebas
                   # variables: PGHOST, PGPORT, PGUSER, PGPASSWORD (por defecto socket /tmp:54329)
pnpm typecheck
pnpm --filter @palace/web build
```

### Entorno local sin Docker (Auth + PostgREST oficiales)
```bash
# Requiere PostgreSQL 16+ escuchando en el socket /tmp, puerto 54329 (o PGHOST/PGPORT).
bash scripts/local-stack/start.sh      # descarga binarios, recrea la BD palace_local, aplica migraciones y seed,
                                       # levanta Auth (9999), PostgREST (3001) y la puerta http://127.0.0.1:54321
cat /tmp/palace-local-run/env > apps/web/.env.local
pnpm dev                               # personal ficticio: propietaria@palace.local, recepcion@, ana@, bea@, almacen@ — contraseña PalaceDev2026
pnpm --filter @palace/web build && pnpm --filter @palace/e2e exec playwright test   # E2E
```
`STACK_OFFSET=n` levanta copias en paralelo en otros puertos.

### Entorno local completo (con Docker)
```bash
npx supabase start            # levanta Postgres, Auth, Storage y Studio locales
npx supabase db reset         # aplica migraciones + seed.sql
cp apps/web/.env.example apps/web/.env.local   # URL y llave publicable que imprime `supabase start`
pnpm dev
```
Después crea una usuaria en Studio (Authentication → Users) y vincúlala como propietaria (instrucciones al final de `supabase/seed.sql`).

## Reglas del proyecto
- Proyecto Supabase, llaves y datos **exclusivos** de Palace. Nunca reutilizar los de Shakeaholic u Hojaldras Lily.
- Cambios de esquema solo con migraciones nuevas con fecha; nunca editar producción a mano.
- Ningún secreto en el código ni en workflows; la llave secreta de Supabase solo en el servidor.
- No se simulan servicios externos como si fueran reales: sin credenciales, adaptadores de desarrollo marcados como tales.
