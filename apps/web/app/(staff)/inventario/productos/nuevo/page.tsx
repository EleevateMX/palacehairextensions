import type { Metadata } from "next";
import { SubmitButton } from "@/components/forms";
import { KeepForm as ActionForm } from "@/app/(staff)/inventario/_lib/keep-form";
import { Card, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/staff";
import { catalogOptions } from "../../_lib/catalog";
import { canSeeCost, canWrite } from "../../_lib/shared";
import { Forbidden, InventoryTabs } from "../../_lib/ui";
import { createProductAction } from "../actions";
import { ProductFields, VariantFields } from "../fields";

export const metadata: Metadata = { title: "Nuevo producto" };

export default async function NewProductPage() {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return <Forbidden what="dar de alta productos" />;
  const options = await catalogOptions(supabase);
  return (
    <>
      <PageHeader title="Nuevo producto" subtitle="Producto y su primera variante (tono, largo, presentación…)" />
      <InventoryTabs staff={staff} current="/inventario/productos/nuevo" />
      <ActionForm action={createProductAction} className="space-y-4">
        <Card title="Producto">
          <ProductFields {...options} />
        </Card>
        <Card title="Primera variante">
          <VariantFields showCost={canSeeCost(staff)} />
          <p className="mt-3 text-xs text-muted">
            Las existencias no se capturan aquí: después registra una entrada inicial en Movimientos para que quede en el kardex.
          </p>
        </Card>
        <Card title="Imágenes">
          <p className="text-sm text-muted">
            La carga de imágenes requiere Supabase Storage, que no está disponible en este entorno. Se habilitará al conectar el almacenamiento.
          </p>
        </Card>
        <SubmitButton>Crear producto</SubmitButton>
      </ActionForm>
    </>
  );
}
