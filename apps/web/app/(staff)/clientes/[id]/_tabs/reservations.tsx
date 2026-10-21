import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, ErrorNotice, Field, inputClass } from "@/components/ui";
import { currentLocationId } from "@/lib/location";
import { can } from "@/lib/staff";
import { dateMx } from "../../_lib/crm";
import { releaseReservationAction, reserveForClientAction } from "../../actions";
import type { TabProps } from "./types";

type Reservation = {
  id: string;
  quantity: number;
  status: string;
  note: string | null;
  created_at: string;
  closed_at: string | null;
  product_variants: { sku: string; name: string; tone: string | null; length_cm: number | null; unit: string } | null;
};

const STATUS_LABEL: Record<string, string> = { active: "Apartado", consumed: "Usado", released: "Liberado", expired: "Vencido" };

export async function ReservationsTab({ supabase, staff, client }: TabProps) {
  const canReserve = can(staff, "owner", "admin", "receptionist", "sales") && !client.is_anonymized;
  const location = await currentLocationId(supabase, staff);
  const [{ data, error }, { data: stock }] = await Promise.all([
    supabase
      .from("stock_reservations")
      .select("id, quantity, status, note, created_at, closed_at, product_variants(sku, name, tone, length_cm, unit)")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(50),
    canReserve && location
      ? supabase
          .from("v_stock_availability")
          .select("variant_id, sku, variant_name, product_name, tone, length_cm, available")
          .eq("location_id", location)
          .gt("available", 0)
          .order("product_name")
          .order("variant_name")
          .limit(300)
      : Promise.resolve({ data: [] as { variant_id: string; sku: string; variant_name: string; product_name: string; tone: string | null; length_cm: number | null; available: number }[] }),
  ]);
  const rows = (data ?? []) as unknown as Reservation[];
  const active = rows.filter((r) => r.status === "active");
  const past = rows.filter((r) => r.status !== "active").slice(0, 10);
  const label = (r: Reservation) => {
    const v = r.product_variants;
    return v ? `${v.name}${v.tone ? ` · tono ${v.tone}` : ""}${v.length_cm ? ` · ${Number(v.length_cm)} cm` : ""}` : "Producto";
  };

  return (
    <div className="space-y-4">
      <Card title="Apartado para la clienta">
        {error ? <ErrorNotice message="No se pudieron cargar los apartados." /> : null}
        {!error && active.length === 0 ? (
          <EmptyState title="Sin inventario apartado" description="Aparta tonos o productos para asegurar su disponibilidad." />
        ) : null}
        <ul className="divide-y divide-line text-sm" aria-label="Apartados activos">
          {active.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                <span className="font-medium">{label(r)}</span>
                <span className="block text-xs text-muted">
                  {r.product_variants?.sku} · {Number(r.quantity)} {r.product_variants?.unit === "pack" ? "paquete(s)" : "unidad(es)"} · desde{" "}
                  {dateMx(r.created_at)}
                  {r.note ? ` · ${r.note}` : ""}
                </span>
              </span>
              {canReserve ? (
                <ActionForm action={releaseReservationAction}>
                  <input type="hidden" name="client_id" value={client.id} />
                  <input type="hidden" name="reservation_id" value={r.id} />
                  <SubmitButton variant="secondary" confirm="¿Liberar este apartado? El material vuelve a estar disponible.">
                    Liberar
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {canReserve ? (
        <Card title="Apartar material">
          {!location ? (
            <ErrorNotice message="No hay sucursal activa." />
          ) : (stock ?? []).length === 0 ? (
            <EmptyState title="No hay existencias disponibles para apartar" />
          ) : (
            <ActionForm action={reserveForClientAction} className="grid gap-3 sm:grid-cols-4">
              <input type="hidden" name="client_id" value={client.id} />
              <Field label="Producto o tono" className="sm:col-span-2">
                <select name="variant_id" required defaultValue="" className={inputClass}>
                  <option value="">Selecciona…</option>
                  {stock!.map((v) => (
                    <option key={v.variant_id} value={v.variant_id}>
                      {v.variant_name} ({v.sku}) · disponible {Number(v.available)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cantidad">
                <input name="quantity" type="number" min={1} step={1} defaultValue={1} required inputMode="numeric" className={inputClass} />
              </Field>
              <Field label="Nota (opcional)">
                <input name="note" maxLength={300} className={inputClass} />
              </Field>
              <div className="sm:col-span-4">
                <SubmitButton>Apartar</SubmitButton>
              </div>
            </ActionForm>
          )}
        </Card>
      ) : (
        <p className="text-sm text-muted">Tu rol puede consultar los apartados, pero no crearlos ni liberarlos.</p>
      )}

      {past.length > 0 ? (
        <Card title="Historial reciente">
          <ul className="divide-y divide-line text-sm">
            {past.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {label(r)} · {Number(r.quantity)}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  <Badge>{STATUS_LABEL[r.status] ?? r.status}</Badge> {dateMx(r.closed_at ?? r.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
