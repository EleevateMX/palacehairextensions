# Brief de diseño — Palace Hair Extensions OS (para Claude Design)

> Estado: la identidad de Palace **aún no está definida**. Este brief describe el producto, las pantallas y el
> contrato técnico de tokens. La dirección visual de la §4 es una **propuesta inicial** para explorar, no la marca final.

## 1. Qué es
Sistema de gestión para un salón especializado en **extensiones de cabello** en México: agenda inteligente con
estaciones, inventario de extensiones por tono/largo/textura, punto de venta, expediente de clientas, personal y
comisiones, reportes, finanzas y un portal público para reservar desde el celular.

## 2. Quién lo usa y dónde
| Persona | Dispositivo | Qué necesita ver primero |
|---|---|---|
| Propietaria | Teléfono y laptop | Ventas del día, citas, inventario crítico, utilidad |
| Recepción | Tablet/laptop en mostrador | Quién llega, quién está en servicio, cobrar rápido |
| Estilista | Teléfono | Su agenda del día, sus clientas, registrar consumo |
| Inventarios | Teléfono/laptop | Existencias, entradas, conteos |
| Clienta (portal) | Teléfono | Elegir servicio, horario, reservar en 1 minuto |

Prioridad: **móvil primero** (360 px), operable con una mano, botones de 44 px mínimo, español de México.

## 3. Pantallas a diseñar (rutas reales de la app)
**Panel del personal**
1. `/login` — acceso del personal.
2. `/dashboard` — tarjetas de KPI (ventas, citas, ticket promedio, ocupación), próximas citas, inventario crítico, alertas.
3. `/recepcion` — tablero en vivo: por llegar, retrasadas, en servicio, estaciones libres, apartados por vencer.
4. `/agenda` — vista día / semana / por estación; tarjetas de cita con estados (apartado, confirmada, llegó, en servicio, terminada, no asistió).
5. `/agenda/nueva` — clienta → servicio(s) → tono de extensión → horarios disponibles en cuadrícula.
6. `/agenda/cita/[id]` — detalle con 4 estados (reserva, asistencia, pago, materiales) y acciones.
7. `/clientes` y `/clientes/[id]` — lista con segmentos; expediente con pestañas (perfil capilar, consentimientos, notas, historial, mantenimiento, inventario apartado).
8. `/cotizador` — cotizador de extensiones con rango estimado y aviso de valoración.
9. `/inventario` (+ producto, kardex, conteos, compras) — tablas densas legibles en móvil.
10. `/pos` — carrito combinado productos + servicios, pagos divididos, propinas; `/pos/caja` — corte con contador de billetes.
11. `/ventas/[id]` — comprobante imprimible.
12. `/reportes`, `/finanzas` — tablas y barras simples.
13. `/personal`, `/configuracion` — formularios largos con pestañas.

**Público**
14. `/reservar` — flujo de reserva para clientas (pantalla más visible para la marca).

## 4. Dirección visual propuesta (para explorar)
- **Tono:** salón premium, cálido y sereno; lujo discreto, no recargado. Mucho aire, jerarquía clara, datos fáciles de leer.
- **Paleta a explorar:** neutros cálidos (marfil/nude/champaña) como fondo; un tono profundo (espresso, ciruela o negro cálido)
  para texto y acción principal; un acento metálico suave (oro rosado o dorado mate) solo para detalles.
  Colores de estado claros y accesibles: éxito, advertencia, peligro.
- **Tipografía a explorar:** una display con carácter (serif elegante) para títulos y la marca; una sans muy legible para
  datos, tablas y formularios; cifras tabulares.
- **Componentes clave:** tarjeta de KPI, tarjeta de cita con estado, badge de estado, tabla responsive, pestañas,
  formulario con validación, botón primario/secundario/peligro, estado vacío, estado de error, esqueleto de carga,
  selector de horarios en cuadrícula, chip de tono de cabello (muestra de color + nombre).
- **Modo oscuro:** deseable (recepción con poca luz).
- **Accesibilidad:** contraste AA mínimo, foco visible, nada que dependa solo del color.

## 5. Contrato técnico (lo que necesito de vuelta)
La app usa **Tailwind CSS 4** con variables CSS. Cualquier propuesta debe expresarse con estos tokens
(archivo actual: `apps/web/app/globals.css`), en claro y oscuro:

| Token | Uso |
|---|---|
| `--color-bg` | Fondo de la app |
| `--color-surface` | Tarjetas, paneles |
| `--color-surface-muted` | Fondos secundarios, hover |
| `--color-text` | Texto principal |
| `--color-text-muted` | Texto secundario |
| `--color-border` | Bordes y divisores |
| `--color-accent` | Acción principal |
| `--color-accent-contrast` | Texto sobre la acción principal |
| `--color-success` / `--color-warning` / `--color-danger` | Estados |
| `--radius` | Radio de esquinas |
| `--font-sans` | Tipografía base (+ proponer `--font-display`) |

**Entregables útiles:** valores de los tokens (HEX), tipografías (Google Fonts u otras con licencia web), logotipo en SVG
si existe, y maquetas de: dashboard, agenda (día), nueva cita, detalle de cita, POS, expediente de clienta y portal
`/reservar` en móvil y escritorio. Con eso aplico el diseño a todos los módulos sin cambiar la lógica.
