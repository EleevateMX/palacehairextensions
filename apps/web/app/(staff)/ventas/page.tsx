import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, EmptyState, ErrorNotice, PageHeader, Stat, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { longDate, mxn, TZ } from "@/lib/format";
import { currentLocationId } from "@/lib/location";
import { can, requireStaff } from "@/lib/staff";
import { STATUS_LABEL, statusTone } from "../pos/_lib/labels";
import { POS_ROLES } from "../pos/_lib/session";
import { SALE_STATUSES, type SalesSearchParams, clientName, filterToQuery, loadSales, parseSalesFilter } from "./_lib/query";

export const metadata: Metadata = { title: "Ventas" };

const when = (iso: string, withDate: boolean) =>
  new Intl.DateTimeFormat("es-MX", {
    timeZone: TZ,
    ...(withDate ? { day: "2-digit", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

export default async function SalesPage({ searchParams }: { searchParams: Promise<SalesSearchParams> }) {
  const { staff, supabase } = await requireStaff();
  if (!can(staff, ...POS_ROLES)) redirect("/dashboard");
  const f = parseSalesFilter(await searchParams);
  const locationId = await currentLocationId(supabase, staff);
  if (!locationId) return <EmptyState title="No hay sucursal activa" />;
  const { rows, error } = await loadSales(supabase, locationId, f);

  const live = rows.filter((r) => r.status !== "voided");
  const total = live.reduce((s, r) => s + r.total_cents, 0);
  const paid = live.reduce((s, r) => s + r.paid_cents, 0);
  const tips = live.reduce((s, r) => s + r.tip_cents, 0);
  const balance = live.reduce((s, r) => s + r.balance_due_cents, 0);
  const multiDay = f.pending || f.from !== f.to;

  return (
    <>
      <PageHeader
        title="Ventas"
        subtitle={f.pending ? "Cuentas pendientes (todas las fechas)" : f.from === f.to ? longDate(f.from) : `${longDate(f.from)} – ${longDate(f.to)}`}
        actions={
          <div className="flex gap-2">
            <a href={`/ventas/exportar?${filterToQuery(f)}`} className={secondaryButtonClass} download>
              Exportar CSV
            </a>
            <Link href="/pos" className={buttonClass}>
              Nueva venta
            </Link>
          </div>
        }
      />
      <Card className="mb-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1">
            <span className="text-sm">Desde</span>
            <input type="date" name="desde" defaultValue={f.from} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Hasta</span>
            <input type="date" name="hasta" defaultValue={f.to} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Estado</span>
            <select name="estado" defaultValue={f.status} className={inputClass}>
              <option value="">Todos</option>
              {SALE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-end gap-2 pb-3 text-sm">
            <input type="checkbox" name="pendientes" value="1" defaultChecked={f.pending} /> Solo cuentas pendientes
          </label>
          <div className="flex items-end">
            <button className={buttonClass}>Filtrar</button>
          </div>
        </form>
      </Card>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Ventas" value={String(live.length)} hint={rows.length - live.length ? `${rows.length - live.length} canceladas` : undefined} />
        <Stat label="Total vendido" value={mxn(total)} />
        <Stat label="Cobrado" value={mxn(paid)} hint={`Propinas ${mxn(tips)}`} />
        <Stat label="Saldo pendiente" value={mxn(balance)} />
      </div>

      {error ? <ErrorNotice message="No se pudieron cargar las ventas." /> : null}
      {rows.length === 0 ? (
        <EmptyState title="Sin ventas" description={f.pending ? "No hay cuentas pendientes." : "No hay ventas en el periodo seleccionado."} />
      ) : (
        <Card>
          <ul className="divide-y divide-line md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/ventas/${r.id}`} className="flex items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">
                      Folio {r.folio} <Badge tone={statusTone(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                    </p>
                    <p className="text-xs text-muted">
                      {when(r.created_at, multiDay)} · {clientName(r.client) || "Sin clienta"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium tabular-nums">{mxn(r.total_cents)}</p>
                    {r.balance_due_cents > 0 ? <p className="text-xs text-danger tabular-nums">Saldo {mxn(r.balance_due_cents)}</p> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Folio</th>
                  <th className="pr-3 font-medium">{multiDay ? "Fecha" : "Hora"}</th>
                  <th className="pr-3 font-medium">Clienta</th>
                  <th className="pr-3 font-medium">Estado</th>
                  <th className="pr-3 text-right font-medium">Total</th>
                  <th className="pr-3 text-right font-medium">Pagado</th>
                  <th className="pr-3 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3">
                      <Link href={`/ventas/${r.id}`} className="font-medium underline">
                        {r.folio}
                      </Link>
                    </td>
                    <td className="pr-3 whitespace-nowrap">{when(r.created_at, multiDay)}</td>
                    <td className="pr-3">{clientName(r.client) || "—"}</td>
                    <td className="pr-3">
                      <Badge tone={statusTone(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                    </td>
                    <td className="pr-3 text-right tabular-nums">{mxn(r.total_cents)}</td>
                    <td className="pr-3 text-right tabular-nums">{mxn(r.paid_cents)}</td>
                    <td className={`pr-3 text-right tabular-nums ${r.balance_due_cents > 0 ? "text-danger" : ""}`}>{mxn(r.balance_due_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
