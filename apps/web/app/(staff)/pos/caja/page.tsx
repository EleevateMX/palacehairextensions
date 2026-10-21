import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, DataTable, EmptyState, ErrorNotice, PageHeader, Stat, secondaryButtonClass } from "@/components/ui";
import { businessMessage } from "@/lib/errors";
import { mxn, TZ } from "@/lib/format";
import { can, requireStaff } from "@/lib/staff";
import { METHOD_LABEL } from "../_lib/labels";
import { type CashSummary, POS_ROLES, posContext } from "../_lib/session";
import { CloseCashForm, OpenCashForm } from "./cash-forms";

export const metadata: Metadata = { title: "Caja" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso),
  );

function MethodTable({ summary }: { summary: CashSummary }) {
  const rows = Object.entries(summary.by_method);
  if (rows.length === 0) return <p className="text-sm text-muted">Sin cobros registrados en esta caja.</p>;
  return (
    <DataTable head={["Método", "Cobros", "Importe", "Propinas"]}>
      {rows.map(([m, v]) => (
        <tr key={m}>
          <td className="py-2 pr-3">{METHOD_LABEL[m] ?? m}</td>
          <td className="pr-3 tabular-nums">{v.count}</td>
          <td className="pr-3 tabular-nums">{mxn(v.amount_cents)}</td>
          <td className="pr-3 tabular-nums">{mxn(v.tip_cents)}</td>
        </tr>
      ))}
    </DataTable>
  );
}

function BreakdownTable({ breakdown }: { breakdown: Record<string, number> | null }) {
  const rows = Object.entries(breakdown ?? {})
    .map(([k, n]) => [Number(k), n] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[0] - a[0]);
  if (rows.length === 0) return <p className="text-sm text-muted">Sin desglose.</p>;
  return (
    <DataTable head={["Denominación", "Piezas", "Importe"]}>
      {rows.map(([c, n]) => (
        <tr key={c}>
          <td className="py-2 pr-3 tabular-nums">{mxn(c)}</td>
          <td className="pr-3 tabular-nums">{n}</td>
          <td className="pr-3 tabular-nums">{mxn(c * n)}</td>
        </tr>
      ))}
    </DataTable>
  );
}

export default async function CashPage({ searchParams }: { searchParams: Promise<{ corte?: string; next?: string }> }) {
  const { staff, supabase } = await requireStaff();
  if (!can(staff, ...POS_ROLES)) redirect("/dashboard");
  const sp = await searchParams;
  const next = sp.next && /^\/pos(\/|\?|$)/.test(sp.next) ? sp.next : "/pos";
  const { locationId, session } = await posContext(supabase, staff);
  if (!locationId) return <EmptyState title="No hay sucursal activa" />;

  const [summaryRes, closedRes, historyRes, peopleRes] = await Promise.all([
    session ? supabase.rpc("cash_session_summary", { p_session: session.id }) : Promise.resolve({ data: null, error: null }),
    sp.corte && UUID.test(sp.corte) ? supabase.rpc("cash_session_summary", { p_session: sp.corte }) : Promise.resolve({ data: null, error: null }),
    supabase
      .from("cash_sessions")
      .select("id, opened_at, closed_at, opened_by, closed_by, opening_float_cents, expected_cash_cents, counted_cash_cents, difference_cents, status")
      .eq("location_id", locationId)
      .order("opened_at", { ascending: false })
      .limit(30),
    supabase.from("staff_members").select("id, display_name"),
  ]);
  const summary = summaryRes.data as CashSummary | null;
  const closed = closedRes.data as CashSummary | null;
  const names = new Map((peopleRes.data ?? []).map((p) => [p.id, p.display_name as string]));

  return (
    <>
      <PageHeader
        title="Caja"
        subtitle={session ? `Abierta por ${session.opened_by_name} · ${dateTime(session.opened_at)}` : "Sin caja abierta"}
        actions={
          <Link href="/pos" className={secondaryButtonClass}>
            Ir al punto de venta
          </Link>
        }
      />

      {closedRes.error ? (
        <div className="mb-4">
          <ErrorNotice message={businessMessage(closedRes.error)} />
        </div>
      ) : null}
      {closed && closed.status === "closed" ? (
        <Card title="Corte de caja" className="mb-6">
          <div role="status" className="grid gap-3 sm:grid-cols-3" data-testid="cash-close-result">
            <Stat label="Esperado" value={mxn(closed.expected_cash_cents)} />
            <Stat label="Contado" value={mxn(closed.counted_cash_cents ?? 0)} />
            <Stat
              label="Diferencia"
              value={mxn(closed.difference_cents ?? 0)}
              hint={(closed.difference_cents ?? 0) === 0 ? "Cuadra" : (closed.difference_cents ?? 0) < 0 ? "Faltante" : "Sobrante"}
            />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium">Cobros por método</h3>
              <MethodTable summary={closed} />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">Desglose contado</h3>
              <BreakdownTable breakdown={closed.counted_breakdown} />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">
            Cerrada por {closed.closed_by_name ?? "—"} · {closed.closed_at ? dateTime(closed.closed_at) : ""}
            {closed.notes ? ` · ${closed.notes}` : ""}
          </p>
        </Card>
      ) : null}

      {session && summary ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Fondo inicial" value={mxn(summary.opening_float_cents)} />
            <Stat label="Ventas" value={String(summary.sales_count)} hint={summary.voided_count ? `${summary.voided_count} canceladas` : undefined} />
            <Stat
              label="Efectivo esperado"
              value={mxn(summary.expected_cash_cents)}
              hint={`Anticipos ${mxn(summary.cash_deposits_cents)} · devoluciones ${mxn(summary.cash_refunds_cents)}`}
            />
            <Stat
              label="Total cobrado"
              value={mxn(Object.values(summary.by_method).reduce((s, v) => s + v.amount_cents, 0))}
              hint={`Propinas ${mxn(Object.values(summary.by_method).reduce((s, v) => s + v.tip_cents, 0))}`}
            />
          </div>
          <Card title="Cobros por método">
            <MethodTable summary={summary} />
          </Card>
          <Card title="Cerrar caja (corte)">
            <p className="mb-3 text-sm text-muted">Cuenta el efectivo en caja por denominación. El esperado incluye fondo, cobros y propinas en efectivo, anticipos en efectivo y devoluciones.</p>
            <CloseCashForm sessionId={session.id} expectedCents={summary.expected_cash_cents} />
          </Card>
        </div>
      ) : session ? (
        <ErrorNotice message={summaryRes.error ? businessMessage(summaryRes.error) : "No se pudo cargar el resumen de la caja."} />
      ) : (
        <Card title="Abrir caja">
          <OpenCashForm next={next} />
        </Card>
      )}

      <Card title={can(staff, "owner", "admin") ? "Historial de cajas" : "Mis cajas"} className="mt-6">
        {(historyRes.data ?? []).length === 0 ? (
          <EmptyState title="Sin cajas registradas" />
        ) : (
          <DataTable head={["Apertura", "Abrió", "Cierre", "Fondo", "Esperado", "Contado", "Diferencia", "Estado"]}>
            {historyRes.data!.map((c) => (
              <tr key={c.id}>
                <td className="py-2 pr-3 whitespace-nowrap">{dateTime(c.opened_at)}</td>
                <td className="pr-3">{names.get(c.opened_by) ?? "—"}</td>
                <td className="pr-3 whitespace-nowrap">{c.closed_at ? `${dateTime(c.closed_at)} · ${names.get(c.closed_by) ?? ""}` : "—"}</td>
                <td className="pr-3 tabular-nums">{mxn(c.opening_float_cents)}</td>
                <td className="pr-3 tabular-nums">{c.expected_cash_cents === null ? "—" : mxn(c.expected_cash_cents)}</td>
                <td className="pr-3 tabular-nums">{c.counted_cash_cents === null ? "—" : mxn(c.counted_cash_cents)}</td>
                <td className={`pr-3 tabular-nums ${(c.difference_cents ?? 0) < 0 ? "text-danger" : ""}`}>
                  {c.difference_cents === null ? "—" : mxn(c.difference_cents)}
                </td>
                <td className="pr-3">
                  {c.status === "open" ? <Badge tone="success">Abierta</Badge> : c.closed_by ? <Link href={`/pos/caja?corte=${c.id}`} className="underline">Ver corte</Link> : <Badge>Cerrada</Badge>}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </>
  );
}
