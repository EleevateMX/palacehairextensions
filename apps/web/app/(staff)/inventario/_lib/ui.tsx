import Link from "next/link";
import { Card, ErrorNotice, Tabs } from "@/components/ui";
import type { CurrentStaff } from "@/lib/staff";
import { canWrite } from "./shared";

/** Pestañas del módulo; las de escritura solo para los roles que operan el inventario. */
export function InventoryTabs({ staff, current }: { staff: CurrentStaff; current: string }) {
  const items = [{ href: "/inventario", label: "Existencias" }];
  if (canWrite(staff)) {
    items.push(
      { href: "/inventario/movimiento", label: "Movimientos" },
      { href: "/inventario/conteos", label: "Conteos" },
      { href: "/inventario/compras", label: "Compras" },
      { href: "/inventario/proveedores", label: "Proveedores" },
      { href: "/inventario/productos/nuevo", label: "Nuevo producto" },
    );
  }
  return <Tabs items={items} current={current} />;
}

/** Aviso de acceso denegado (la BD también lo impediría vía RLS/RPC). */
export function Forbidden({ what = "esta sección del inventario" }: { what?: string }) {
  return (
    <Card>
      <h1 className="mb-2 text-lg font-semibold">Sin permiso</h1>
      <ErrorNotice message={`Tu rol no tiene permiso para ${what}. Solo Inventarios, Administración y la Propietaria.`} />
      <p className="mt-3 text-sm">
        <Link href="/inventario" className="underline">
          Volver a existencias
        </Link>
      </p>
    </Card>
  );
}

export function NoLocation() {
  return <ErrorNotice message="No hay una sucursal activa configurada. Da de alta una sucursal en Configuración." />;
}
