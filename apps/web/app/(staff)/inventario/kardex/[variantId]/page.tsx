import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SubmitButton } from "@/components/forms";
import { KeepForm as ActionForm } from "@/app/(staff)/inventario/_lib/keep-form";
import { Badge, Card, DataTable, EmptyState, Field, inputClass, PageHeader, secondaryButtonClass } from "@/components/ui";
import { mxn } from "@/lib/format";
import { requireStaff } from "@/lib/staff";
import { canReserve, canSeeCost, canWrite, dateTime, MOVEMENT_LABEL, qty, RESERVATION_SOURCE_LABEL, workingLocation } from "../../_lib/shared";
import { InventoryTabs, NoLocation } from "../../_lib/ui";
import { releaseAction, reserveAction } from "./actions";

export const metadata: Metadata = { title: "Kardex" };

/** Enlace a la página dueña de la referencia (ventas y agenda son de otros módulos). */
function Reference({ type, id }: { type: string | null; id: string | null }) {
  if (!type) return <>—</>;
  const short = id ? id.slice(0, 8) : "";
  switch (type) {
    case "sale":
    case "refund":
    case "void":
      return id ? (
        <Link className="underline" href={`/ventas/${id}`}>
          {type === "sale" ? "Venta" : type === "refund" ? "Devolución de venta" : "Cancelación de venta"} {short}
        </Link>
      ) : (
        <>Venta</>
      );
    case "appointment":
      return id ? (
        <Link className="underline" href={`/agenda/cita/${id}`}>
          Cita {short}
        </Link>
      ) : (
        <>Cita</>
      );
    case "purchase_order":
      return id ? (
        <Link className="underline" href={`/inventario/compras/${id}`}>
          Orden de compra {short}
        </Link>
      ) : (
        <>Orden de compra</>
      );
    case "stock_count":
      return id ? (
        <Link className="underline" href={`/inventario/conteos/${id}`}>
          Conteo {short}
        </Link>
      ) : (
        <>Conteo</>
      );
    case "transfer":
      return <>Transferencia {short}</>;
    case "manual":
      return <>Manual</>;
    default:
      return (
        <>
          {type} {short}
        </>
      );
  }
}

export default async function KardexPage({ params }: { params: Promise<{ variantId: string }> }) {
  const { variantId } = await params;
  if (!z.guid().safeParse(variantId).success) notFound();
  const { supabase, staff } = await requireStaff();
  const { location } = await workingLocation(supabase, staff);
  if (!location) return <NoLocation />;
  const writer = canWrite(staff);
  const showCost = canSeeCost(staff);
  const reserver = canReserve(staff);

  const { data: variant } = await supabase
    .from("product_variants")
    .select("id, sku, name, unit, min_stock, product_id, products(name)")
    .eq("id", variantId)
    .maybeSingle();
  if (!variant) notFound();
  const v = variant as any;

  const [{ data: level }, movementsRes, { data: reservations }, { data: staffRows }, clientsRes] = await Promise.all([
    supabase.from("stock_levels").select("on_hand, reserved, bin_location").eq("variant_id", variantId).eq("location_id", location.id).maybeSingle(),
    writer
      ? supabase
          .from("stock_movements")
          .select("id, movement_type, quantity, on_hand_after, unit_cost_cents, reference_type, reference_id, note, created_by, created_at")
          .eq("variant_id", variantId)
          .eq("location_id", location.id)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(300)
      : Promise.resolve({ data: [] as any[], error: null }),
    supabase
      .from("stock_reservations")
      .select("id, quantity, source, appointment_id, client_id, expires_at, note, created_at")
      .eq("variant_id", variantId)
      .eq("location_id", location.id)
      .eq("status", "active")
      .order("created_at"),
    supabase.from("staff_members").select("user_id, display_name"),
    reserver ? supabase.from("clients").select("id, first_name, last_name").eq("is_anonymized", false).order("first_name").limit(300) : Promise.resolve({ data: [] as any[] }),
  ]);
  const movements = (movementsRes.data ?? []) as any[];
  const who = new Map((staffRows ?? []).map((s: any) => [s.user_id, s.display_name]));
  const clients = (clientsRes.data ?? []) as any[];
  const clientIds = [...new Set((reservations ?? []).map((r: any) => r.client_id).filter(Boolean))] as string[];
  const missing = clientIds.filter((id) => !clients.some((c) => c.id === id));
  const extra = missing.length ? ((await supabase.from("clients").select("id, first_name, last_name").in("id", missing)).data ?? []) : [];
  const clientName = new Map([...clients, ...extra].map((c: any) => [c.id, `${c.first_name} ${c.last_name ?? ""}`.trim()]));
  const onHand = Number(level?.on_hand ?? 0);
  const reserved = Number(level?.reserved ?? 0);

  return (
    <>
      <PageHeader
        title={`Kardex · ${v.name}`}
        subtitle={`${v.sku} · ${v.products?.name ?? ""} · ${location.name}`}
        actions={
          <div className="flex gap-2">
            <Link href={`/inventario/productos/${v.product_id}`} className={secondaryButtonClass}>
              Producto
            </Link>
            {writer ? (
              <Link href={`/inventario/movimiento?variant=${v.id}`} className={secondaryButtonClass}>
                Registrar movimiento
              </Link>
            ) : null}
          </div>
        }
      />
      <InventoryTabs staff={staff} current="" />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-brand border border-line bg-surface p-3">
          <p className="text-xs text-muted">Existencias</p>
          <p className="text-xl font-semibold tabular-nums" data-testid="on-hand">
            {qty(onHand)}
          </p>
        </div>
        <div className="rounded-brand border border-line bg-surface p-3">
          <p className="text-xs text-muted">Reservado</p>
          <p className="text-xl font-semibold tabular-nums">{qty(reserved)}</p>
        </div>
        <div className="rounded-brand border border-line bg-surface p-3">
          <p className="text-xs text-muted">Disponible</p>
          <p className="text-xl font-semibold tabular-nums">
            {qty(onHand - reserved)} {onHand - reserved <= Number(v.min_stock) ? <Badge tone="danger">Bajo</Badge> : null}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <Card title="Reservas activas">
          {(reservations ?? []).length === 0 ? (
            <EmptyState title="Sin reservas activas" />
          ) : (
            <DataTable head={["Cantidad", "Origen", "Clienta / cita", "Vence", "Nota", ""]}>
              {(reservations ?? []).map((r: any) => (
                <tr key={r.id}>
                  <td className="py-2 pr-3 tabular-nums">{qty(r.quantity)}</td>
                  <td className="pr-3">{RESERVATION_SOURCE_LABEL[r.source] ?? r.source}</td>
                  <td className="pr-3">
                    {r.client_id ? (clientName.get(r.client_id) ?? "Clienta (sin acceso)") : "—"}
                    {r.appointment_id ? (
                      <>
                        {" · "}
                        <Link className="underline" href={`/agenda/cita/${r.appointment_id}`}>
                          Ver cita
                        </Link>
                      </>
                    ) : null}
                  </td>
                  <td className="pr-3">{r.expires_at ? dateTime(r.expires_at, location.timezone) : "—"}</td>
                  <td className="pr-3">{r.note ?? "—"}</td>
                  <td className="pr-3">
                    {reserver && r.source === "manual" ? (
                      <ActionForm action={releaseAction}>
                        <input type="hidden" name="reservation_id" value={r.id} />
                        <input type="hidden" name="variant_id" value={v.id} />
                        <SubmitButton variant="secondary" confirm="¿Liberar esta reserva?">
                          Liberar
                        </SubmitButton>
                      </ActionForm>
                    ) : r.source === "appointment" ? (
                      <span className="text-xs text-muted">Se libera desde la cita</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
          {reserver ? (
            <ActionForm action={reserveAction} className="mt-4 grid gap-3 md:grid-cols-4" resetOnSuccess>
              <input type="hidden" name="variant_id" value={v.id} />
              <input type="hidden" name="location_id" value={location.id} />
              <Field label="Cantidad a apartar">
                <input name="quantity" required inputMode="decimal" className={inputClass} />
              </Field>
              <Field label="Clienta (opcional)">
                <select name="client_id" defaultValue="" className={inputClass}>
                  <option value="">Sin clienta</option>
                  {clients.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.first_name} {c.last_name ?? ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nota">
                <input name="note" maxLength={500} className={inputClass} />
              </Field>
              <div className="flex items-end">
                <SubmitButton variant="secondary">Apartar</SubmitButton>
              </div>
            </ActionForm>
          ) : null}
        </Card>

        <Card title="Movimientos">
          {!writer ? (
            <p className="text-sm text-muted">El historial de movimientos solo lo consultan Inventarios, Administración y la Propietaria.</p>
          ) : movementsRes.error ? (
            <p className="text-sm text-danger">No se pudieron cargar los movimientos.</p>
          ) : movements.length === 0 ? (
            <EmptyState title="Sin movimientos" description="Registra una entrada inicial para empezar el kardex." />
          ) : (
            <DataTable head={["Fecha", "Tipo", "Cantidad", "Saldo", ...(showCost ? ["Costo unitario"] : []), "Referencia", "Nota", "Registró"]}>
              {movements.map((m) => (
                <tr key={m.id} data-testid="kardex-row">
                  <td className="py-2 pr-3 whitespace-nowrap">{dateTime(m.created_at, location.timezone)}</td>
                  <td className="pr-3">{MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}</td>
                  <td className={`pr-3 text-right tabular-nums ${Number(m.quantity) < 0 ? "text-danger" : "text-success"}`}>
                    {Number(m.quantity) > 0 ? "+" : ""}
                    {qty(m.quantity)}
                  </td>
                  <td className="pr-3 text-right tabular-nums">{qty(m.on_hand_after)}</td>
                  {showCost ? <td className="pr-3 text-right tabular-nums">{m.unit_cost_cents === null ? "—" : mxn(m.unit_cost_cents)}</td> : null}
                  <td className="pr-3">
                    <Reference type={m.reference_type} id={m.reference_id} />
                  </td>
                  <td className="pr-3">{m.note ?? "—"}</td>
                  <td className="pr-3">{(m.created_by && who.get(m.created_by)) || "—"}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      </div>
    </>
  );
}
