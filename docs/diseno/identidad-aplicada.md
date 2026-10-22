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
