import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, EmptyState, ErrorNotice, PageHeader, buttonClass, secondaryButtonClass } from "@/components/ui";
import { hour, mxn } from "@/lib/format";
import { can, requireStaff } from "@/lib/staff";
import { MANAGER_ROLES, POS_ROLES, posContext } from "./_lib/session";
import { type AppointmentPreload, type CatalogProduct, type CatalogService, PosCart, type StaffOption } from "./pos-cart";

export const metadata: Metadata = { title: "Punto de venta" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PosPage({ searchParams }: { searchParams: Promise<{ appointment?: string }> }) {
  const { staff, supabase } = await requireStaff();
  if (!can(staff, ...POS_ROLES)) redirect("/dashboard");
  const sp = await searchParams;
  const { locationId, session } = await posContext(supabase, staff);

  if (!locationId) {
    return (
      <>
        <PageHeader title="Punto de venta" />
        <EmptyState title="No hay sucursal activa" description="Configura una sucursal antes de cobrar." />
      </>
    );
  }

  if (!session) {
    const next = sp.appointment && UUID.test(sp.appointment) ? `/pos?appointment=${sp.appointment}` : "/pos";
    return (
      <>
        <PageHeader title="Punto de venta" />
        <Card>
          <div className="space-y-3 text-center">
            <p className="font-medium">La caja está cerrada</p>
            <p className="text-sm text-muted">Para cobrar, primero abre la caja con el fondo inicial.</p>
            <Link href={`/pos/caja?next=${encodeURIComponent(next)}`} className={buttonClass}>
              Abrir caja
            </Link>
          </div>
        </Card>
      </>
    );
  }

  const [variantsRes, stockRes, servicesRes, staffRes] = await Promise.all([
    supabase.from("product_variants").select("id, sku, barcode, name, price_cents, promo_price_cents, promo_ends_at").eq("is_active", true).limit(1000),
    supabase.from("v_stock_availability").select("variant_id, product_name, available").eq("location_id", locationId).limit(1000),
    supabase.from("services").select("id, name, price_cents, price_is_from").eq("is_active", true).order("name"),
    supabase.from("staff_members").select("id, display_name, is_bookable").eq("is_active", true).order("display_name"),
  ]);
  const loadError = variantsRes.error || stockRes.error || servicesRes.error || staffRes.error;

  const stock = new Map((stockRes.data ?? []).map((s) => [s.variant_id as string, s]));
  const now = Date.now();
  const products: CatalogProduct[] = (variantsRes.data ?? [])
    .map((v) => {
      const s = stock.get(v.id);
      const promo = v.promo_price_cents !== null && (!v.promo_ends_at || new Date(v.promo_ends_at).getTime() > now);
      return {
        id: v.id,
        sku: v.sku,
        barcode: v.barcode,
        name: v.name,
        productName: (s?.product_name as string | undefined) ?? "",
        priceCents: promo ? v.promo_price_cents! : v.price_cents,
        regularPriceCents: v.price_cents,
        available: Number(s?.available ?? 0),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const services: CatalogService[] = (servicesRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    priceCents: s.price_cents,
    priceIsFrom: s.price_is_from,
  }));
  const people: StaffOption[] = (staffRes.data ?? []).map((p) => ({ id: p.id, name: p.display_name, bookable: p.is_bookable }));

  let appointment: AppointmentPreload | null = null;
  let appointmentError: string | null = null;
  if (sp.appointment) {
    if (!UUID.test(sp.appointment)) appointmentError = "La cita indicada no es válida.";
    else {
      const [apptRes, linesRes, depositsRes, salesRes] = await Promise.all([
        supabase
          .from("appointments")
          .select("id, starts_at, booking_status, client_id, clients(first_name, last_name, phone)")
          .eq("id", sp.appointment)
          .maybeSingle(),
        supabase
          .from("appointment_services")
          .select("id, service_id, staff_id, price_cents, position, services(name, price_is_from)")
          .eq("appointment_id", sp.appointment)
          .order("position"),
        supabase.from("appointment_deposits").select("id, amount_cents, method, status").eq("appointment_id", sp.appointment).eq("status", "received"),
        supabase.from("sales").select("id, folio").eq("appointment_id", sp.appointment).neq("status", "voided").limit(1),
      ]);
      const a = apptRes.data;
      if (!a) appointmentError = "No se encontró la cita.";
      else {
        const c = (Array.isArray(a.clients) ? a.clients[0] : a.clients) as { first_name: string; last_name: string | null; phone: string | null } | null;
        appointment = {
          id: a.id,
          label: `Cita de ${hour(a.starts_at)}`,
          client: a.client_id && c ? { id: a.client_id, name: [c.first_name, c.last_name].filter(Boolean).join(" "), phone: c.phone } : null,
          services: (linesRes.data ?? []).map((l) => {
            const svc = (Array.isArray(l.services) ? l.services[0] : l.services) as { name: string; price_is_from: boolean } | null;
            return {
              appointmentServiceId: l.id,
              serviceId: l.service_id,
              staffId: l.staff_id,
              name: svc?.name ?? "Servicio",
              priceCents: l.price_cents,
              priceIsFrom: svc?.price_is_from ?? false,
            };
          }),
          deposits: (depositsRes.data ?? []).map((d) => ({ id: d.id, amountCents: d.amount_cents, method: d.method })),
          existingSale: salesRes.data?.[0] ? { id: salesRes.data[0].id, folio: salesRes.data[0].folio } : null,
        };
      }
    }
  }

  return (
    <>
      <PageHeader
        title="Punto de venta"
        subtitle={`Caja abierta por ${session.opened_by_name} a las ${hour(session.opened_at)} · fondo ${mxn(session.opening_float_cents)}`}
        actions={
          <Link href="/pos/caja" className={secondaryButtonClass}>
            Caja y corte
          </Link>
        }
      />
      {loadError ? (
        <div className="mb-4">
          <ErrorNotice message="No se pudo cargar el catálogo completo. Recarga la página." />
        </div>
      ) : null}
      {appointmentError ? (
        <div className="mb-4">
          <ErrorNotice message={appointmentError} />
        </div>
      ) : null}
      {appointment?.existingSale ? (
        <div className="mb-4">
          <ErrorNotice message={`Esta cita ya tiene la venta folio ${appointment.existingSale.folio}. Revisa antes de cobrar de nuevo.`} />
        </div>
      ) : null}
      <PosCart
        products={products}
        services={services}
        staff={people}
        canDiscount={can(staff, ...MANAGER_ROLES)}
        appointment={appointment}
      />
    </>
  );
}
