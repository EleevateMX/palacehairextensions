import { Tabs } from "@/components/ui";

export const CONFIG_TABS = [
  { href: "/configuracion", label: "Negocio" },
  { href: "/configuracion/horarios", label: "Horarios" },
  { href: "/configuracion/servicios", label: "Servicios" },
  { href: "/configuracion/recursos", label: "Recursos" },
  { href: "/configuracion/cotizador", label: "Cotizador" },
  { href: "/configuracion/comisiones", label: "Comisiones" },
];

export function ConfigTabs({ current }: { current: string }) {
  return <Tabs items={CONFIG_TABS} current={current} />;
}
