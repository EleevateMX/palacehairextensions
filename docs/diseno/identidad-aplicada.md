# Identidad aplicada — "Champagne Luxe"

Fuente: paquete de Claude Design "Tokens y primeras maquetas" (tokens + 7 maquetas). Este documento
dice **dónde vive cada cosa en el código** para que la identidad no se desvíe.

## Fuente de la verdad

| Qué | Dónde |
|---|---|
| Colores, radios, modo oscuro | `apps/web/app/globals.css` (`:root` + `@theme inline`) |
| Tipografías | `apps/web/app/layout.tsx` — **Prata** (títulos y cifras grandes, un solo peso) y **Figtree** (texto) vía `next/font` |
| Nombre y logotipo | `apps/web/config/brand.ts`, `components/brand.tsx` (`Wordmark`), `public/logo-palace.svg`, `public/icon.svg`, `public/apple-touch-icon.png` |
| Componentes base | `apps/web/components/ui.tsx` |
| Navegación | `app/(staff)/layout.tsx` + `components/staff-nav.tsx` |

## Paleta

Marfil `#F8F5F0` (fondo) · blanco (tarjetas) · línea `#E5DCD1` · tinta `#171717` (acción principal) ·
oro champaña `#C6A77A` (detalles, foco, barra de avance; acción principal en modo oscuro) · nude `#EADDD5`.
Estados: verde = confirmada/terminada, ámbar = apartado/pendiente, rojo = no asistió/faltante,
nude o negro = en servicio.

## Reglas

- Prata **solo** en `h1`, títulos de tarjeta (`h2` de `Card`) y cifras de KPI. Nunca `font-semibold`
  sobre Prata: el navegador la engorda y se ve emborronada.
- Etiquetas pequeñas en versalitas: clase `.eyebrow`.
- Un estado = una píldora (`Badge` con `tone`). Las citas llevan además borde izquierdo de color
  (`statusAccent` en `agenda/_lib/status.tsx`).
- Tonos de extensión: `ToneDot` / `ToneChip` muestran un color **aproximado** según el código de tono
  (`toneColor`); es referencia visual, no un dato.
- Escritorio: barra lateral de 232 px. Teléfono: barra superior + barra inferior
  (Inicio · Agenda · POS · Clientas · Más), filtrada por rol.

## Componentes nuevos

`Wordmark`, `Avatar`, `Segmented`, `StepIndicator`, `ToneChip`, `ToneDot`, `KeyValue`,
`slotButtonClass`, `dangerButtonClass`, `Stat` con `progress` y `size="sm"`, `Badge` con tonos `dark` y `nude`.

## Pantallas con maqueta

Dashboard, Agenda (rejilla por especialista en escritorio, lista con tira de días en teléfono),
Nueva cita, Detalle de cita, POS, Expediente y Reservar. El resto hereda la identidad por los
componentes base.

## Tamaños de pantalla

| Pantalla | Ancho | Navegación |
|---|---|---|
| Teléfono | < 768 px | Barra superior + barra inferior (Inicio · Agenda · POS · Clientas · Más) |
| Tableta / iPad vertical | 768–1023 px | Igual que teléfono, con más margen |
| iPad horizontal, laptop | ≥ 1024 px | Barra lateral de 14.5 rem |
| TV y monitores grandes | ≥ 1920 / 2560 / 3200 px | Todo escala (letra base 112.5 % / 131.25 % / 162.5 %) |

Reglas que evitan el desbordamiento horizontal (en `globals.css`):
- los hijos de cualquier `.grid` pueden encogerse (`min-width: 0`);
- las zonas `overflow-x-auto` contienen a sus elementos posicionados (p. ej. `sr-only` en tablas);
- la columna principal es `minmax(0, 1fr)`.

`e2e/tests/responsivo.spec.ts` recorre ~40 pantallas en 9 tamaños (360 px a TV 4K) y falla si algo
se sale de la pantalla o si desaparece la navegación. Se puede instalar como app (manifest + íconos).

## Ubicación y redes

Configuración → «Ubicación y redes»: nombre de la sucursal, dirección, teléfono, enlace de Google
Maps («Cómo llegar»), texto para el mapa y página de Facebook. El portal de reservas los muestra en
la tarjeta «Visítanos» (mapa embebido de Google, sin llave de API, carga diferida).
