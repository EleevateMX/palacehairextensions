export type AppRole = "owner" | "admin" | "receptionist" | "stylist" | "inventory" | "sales";

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Propietaria",
  admin: "Administración",
  receptionist: "Recepción",
  stylist: "Estilista",
  inventory: "Inventarios",
  sales: "Ventas",
};

export const ALL_ROLES: AppRole[] = ["owner", "admin", "receptionist", "stylist", "inventory", "sales"];

/** Navegación visible por rol. La seguridad real vive en RLS/RPC; esto solo oculta lo que no aplica. */
export const NAV: { href: string; label: string; roles: AppRole[] }[] = [
  { href: "/dashboard", label: "Inicio", roles: ALL_ROLES },
  { href: "/recepcion", label: "Recepción", roles: ["owner", "admin", "receptionist"] },
  { href: "/agenda", label: "Agenda", roles: ["owner", "admin", "receptionist", "stylist"] },
  { href: "/clientes", label: "Clientas", roles: ["owner", "admin", "receptionist", "sales", "stylist"] },
  { href: "/pos", label: "Punto de venta", roles: ["owner", "admin", "receptionist", "sales"] },
  { href: "/ventas", label: "Ventas", roles: ["owner", "admin", "receptionist", "sales"] },
  { href: "/inventario", label: "Inventario", roles: ["owner", "admin", "inventory", "receptionist", "sales", "stylist"] },
  { href: "/cotizador", label: "Cotizador", roles: ["owner", "admin", "receptionist", "sales", "stylist"] },
  { href: "/reportes", label: "Reportes", roles: ["owner", "admin", "stylist"] },
  { href: "/finanzas", label: "Finanzas", roles: ["owner", "admin"] },
  { href: "/personal", label: "Personal", roles: ALL_ROLES },
  { href: "/configuracion", label: "Configuración", roles: ["owner", "admin"] },
];
