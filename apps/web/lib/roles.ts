export type AppRole = "owner" | "admin" | "receptionist" | "stylist" | "inventory" | "sales";

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Propietaria",
  admin: "Administración",
  receptionist: "Recepción",
  stylist: "Estilista",
  inventory: "Inventarios",
  sales: "Ventas",
};

/** Navegación visible por rol. La seguridad real vive en RLS/RPC; esto solo oculta lo que no aplica. */
export const NAV: { href: string; label: string; roles: AppRole[] }[] = [
  { href: "/dashboard", label: "Inicio", roles: ["owner", "admin", "receptionist", "stylist", "inventory", "sales"] },
  { href: "/agenda", label: "Agenda", roles: ["owner", "admin", "receptionist", "stylist"] },
  { href: "/clientes", label: "Clientas", roles: ["owner", "admin", "receptionist", "sales", "stylist"] },
  { href: "/inventario", label: "Inventario", roles: ["owner", "admin", "inventory", "receptionist", "sales", "stylist"] },
];
