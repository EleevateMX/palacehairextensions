import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bar, ExportLink, PeriodFilter, td, tdNum } from "@/components/reports";
import { Card, DataTable, EmptyState, ErrorNotice, PageHeader, Stat } from "@/components/ui";
import { hour, mxn } from "@/lib/format";
import { currentLocationId } from "@/lib/location";
import { type Period, periodFromSearch, periodQuery, shortDate } from "@/lib/period";
import {
  type CommissionReport,
  loadBookingKpis,
  loadCommissions,
  loadProductivity,
  loadSalesDaily,
  loadTopItems,
  METHOD_LABEL,
  METHODS,
  type PaymentMethod,
  pct,
  RULE_KIND_LABEL,
} from "@/lib/reports";
import { can, requireStaff } from "@/lib/staff";

export const metadata: Metadata = { title: "Reportes" };

type SP = { desde?: string; hasta?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { staff, supabase } = await requireStaff();
  const isManager = can(staff, "owner", "admin");
  if (!isManager && !can(staff, "stylist")) redirect("/dashboard");
  const period = periodFromSearch(await searchParams);
  const locationId = await currentLocationId(supabase, staff);
  if (!locationId) return <ErrorNotice message="No hay una sucursal activa configurada." />;
  const qs = periodQuery(period);

  if (!isManager) {
    // Estilista: solo sus comisiones (RLS de v_commissionable_lines y commission_rules lo garantiza).
    const commissions = await loadCommissions(supabase, locationId, period, staff.id);
    return (
      <>
        <PageHeader title="Mis comisiones" subtitle={`${shortDate(period.from)} – ${shortDate(period.to)}`} />
        <PeriodFilter period={period} basePath="/reportes">
          <ExportLink href={`/reportes/exportar/comisiones?${qs}`}>Exportar CSV</ExportLink>
        </PeriodFilter>
        {period.warning ? <div className="mb-4"><ErrorNotice message={period.warning} /></div> : null}
        <CommissionsSection report={commissions} period={period} single />
      </>
    );
  }

  const [sales, top, commissions, productivity, bookings] = await Promise.all([
    loadSalesDaily(supabase, locationId, period),
    loadTopItems(supabase, locationId, period),
    loadCommissions(supabase, locationId, period),
    loadProductivity(supabase, locationId, period),
    loadBookingKpis(supabase, locationId, period),
  ]);

  const activeDays = sales.rows.filter((d) => d.salesCount > 0 || d.refundsCents > 0);
  const totals = sales.rows.reduce(
    (acc, d) => {
      acc.count += d.salesCount;
      acc.total += d.totalCents;
      acc.tips += d.tipsCents;
      acc.refunds += d.refundsCents;
      acc.discounts += d.discountsCents;
      for (const m of METHODS) acc.methods[m] += d.byMethod[m];
      return acc;
    },
    { count: 0, total: 0, tips: 0, refunds: 0, discounts: 0, methods: Object.fromEntries(METHODS.map((m) => [m, 0])) as Record<PaymentMethod, number> },
  );
  const maxDay = Math.max(0, ...activeDays.map((d) => d.totalCents));
  const methodsTotal = Object.values(totals.methods).reduce((a, b) => a + b, 0);
  const services = top.rows.filter((t) => t.kind === "service").slice(0, 10);
  const products = top.rows.filter((t) => t.kind === "product").slice(0, 10);
  const k = bookings.kpis;

  return (
    <>
      <PageHeader title="Reportes" subtitle={`${shortDate(period.from)} – ${shortDate(period.to)} · hora de Ciudad de México`} />
      <PeriodFilter period={period} basePath="/reportes" />
      {period.warning ? <div className="mb-4"><ErrorNotice message={period.warning} /></div> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ventas del periodo" value={mxn(totals.total)} hint={`${totals.count} tickets`} />
        <Stat label="Ticket promedio" value={mxn(totals.count ? Math.round(totals.total / totals.count) : 0)} />
        <Stat label="Propinas" value={mxn(totals.tips)} hint="No forman parte de la venta" />
        <Stat label="Devoluciones" value={mxn(totals.refunds)} />
      </div>

      <section className="mt-6 space-y-4" aria-labelledby="ventas">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ventas" className="font-display text-xl">Ventas por día y método</h2>
          <ExportLink href={`/reportes/exportar/ventas?${qs}`}>Exportar CSV</ExportLink>
        </div>
        {sales.error ? <ErrorNotice message="No se pudieron cargar las ventas." /> : null}
        <div className="grid gap-4 md:grid-cols-3">
          <Card title="Por método de pago">
            {methodsTotal === 0 ? (
              <EmptyState title="Sin cobros en el periodo" />
            ) : (
              <ul className="space-y-2 text-sm">
                {METHODS.filter((m) => totals.methods[m] > 0).map((m) => (
                  <li key={m}>
                    <p>{METHOD_LABEL[m]}</p>
                    <Bar value={totals.methods[m]} max={methodsTotal} label={`${mxn(totals.methods[m])} · ${pct(Math.round((1000 * totals.methods[m]) / methodsTotal) / 10)}`} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Por día" className="md:col-span-2">
            {activeDays.length === 0 ? (
              <EmptyState title="Sin ventas en el periodo" description="Prueba con otro rango de fechas." />
            ) : (
              <DataTable head={["Día", "Tickets", "Total", "Efectivo", "Tarjeta", "Transf.", "Otros", "Propinas"]}>
                {activeDays.map((d) => (
                  <tr key={d.day}>
                    <td className={td}>
                      <span className="block whitespace-nowrap">{shortDate(d.day)}</span>
                      <Bar value={d.totalCents} max={maxDay} label="" />
                    </td>
                    <td className={tdNum}>{d.salesCount}</td>
                    <td className={`${tdNum} font-medium`}>{mxn(d.totalCents)}</td>
                    <td className={tdNum}>{mxn(d.byMethod.cash)}</td>
                    <td className={tdNum}>{mxn(d.byMethod.card)}</td>
                    <td className={tdNum}>{mxn(d.byMethod.transfer)}</td>
                    <td className={tdNum}>{mxn(d.byMethod.gift_card + d.byMethod.deposit + d.byMethod.online)}</td>
                    <td className={tdNum}>{mxn(d.tipsCents)}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>
        </div>
      </section>

      <section className="mt-8 space-y-4" aria-labelledby="mas-vendidos">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="mas-vendidos" className="font-display text-xl">Más vendidos</h2>
          <ExportLink href={`/reportes/exportar/articulos?${qs}`}>Exportar CSV</ExportLink>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <TopTable title="Servicios" rows={services} />
          <TopTable title="Productos" rows={products} />
        </div>
      </section>

      <section className="mt-8 space-y-4" aria-labelledby="comisiones">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="comisiones" className="font-display text-xl">Comisiones por estilista</h2>
          <ExportLink href={`/reportes/exportar/comisiones?${qs}`}>Exportar CSV</ExportLink>
        </div>
        <CommissionsSection report={commissions} period={period} />
      </section>

      <section className="mt-8 space-y-4" aria-labelledby="productividad">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="productividad" className="font-display text-xl">Productividad por estilista</h2>
          <ExportLink href={`/reportes/exportar/productividad?${qs}`}>Exportar CSV</ExportLink>
        </div>
        <Card>
          {productivity.error ? <ErrorNotice message="No se pudo cargar la productividad." /> : null}
          {productivity.rows.length === 0 ? (
            <EmptyState title="Sin personal reservable" description="Marca a las estilistas como reservables y asigna sus turnos." />
          ) : (
            <DataTable head={["Estilista", "Citas completadas", "Servicios", "Ingresos servicios", "Ingresos productos", "Horas de turno", "Horas reservadas", "Ocupación"]}>
              {productivity.rows.map((r) => (
                <tr key={r.staffId}>
                  <td className={td}>{r.name}</td>
                  <td className={tdNum}>{r.completedAppointments}</td>
                  <td className={tdNum}>{r.servicesCount}</td>
                  <td className={tdNum}>{mxn(r.servicesRevenueCents)}</td>
                  <td className={tdNum}>{mxn(r.productsRevenueCents)}</td>
                  <td className={tdNum}>{hours(r.scheduledMinutes - r.unavailableMinutes)}</td>
                  <td className={tdNum}>{hours(r.bookedMinutes)}</td>
                  <td className={`${td} min-w-32`}>
                    <Bar value={r.occupancyPct ?? 0} max={100} label={pct(r.occupancyPct)} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
          <p className="mt-3 text-xs text-muted">
            Ocupación = minutos con citas confirmadas (o apartados vigentes) ÷ minutos de turno menos ausencias y bloqueos. Ingresos netos de descuentos y
            devoluciones, por fecha de venta.
          </p>
        </Card>
      </section>

      <section className="mt-8 space-y-4" aria-labelledby="citas">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="citas" className="font-display text-xl">Citas y clientas</h2>
          <ExportLink href={`/reportes/exportar/citas?${qs}`}>Exportar CSV</ExportLink>
        </div>
        {bookings.error ? <ErrorNotice message="No se pudieron cargar los indicadores de citas." /> : null}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Tasa de cancelación" value={pct(k.cancellationRatePct)} hint={`${k.cancelled} de ${k.appointmentsTotal} citas`} />
          <Stat label="Tasa de no-show" value={pct(k.noShowRatePct)} hint={`${k.noShow} de ${k.completed + k.noShow} con asistencia registrada`} />
          <Stat label="Clientas nuevas" value={String(k.clientsNew)} hint="Primera atención en el periodo" />
          <Stat label="Clientas recurrentes" value={String(k.clientsReturning)} hint="Ya atendidas antes del periodo" />
        </div>
        <p className="text-xs text-muted">
          Se excluyen reprogramaciones y apartados vencidos. Clienta atendida = cita completada o compra en el periodo.
        </p>
      </section>
    </>
  );
}

const hours = (min: number) => `${(min / 60).toLocaleString("es-MX", { maximumFractionDigits: 1 })} h`;

function TopTable({ title, rows }: { title: string; rows: { itemId: string | null; name: string; quantity: number; salesCount: number; netCents: number }[] }) {
  const max = Math.max(0, ...rows.map((r) => r.netCents));
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <EmptyState title={`Sin ${title.toLowerCase()} vendidos`} />
      ) : (
        <DataTable head={["Concepto", "Cantidad", "Importe neto"]}>
          {rows.map((r) => (
            <tr key={`${r.itemId}-${r.name}`}>
              <td className={td}>{r.name}</td>
              <td className={tdNum}>{r.quantity.toLocaleString("es-MX")}</td>
              <td className={`${td} min-w-40`}>
                <Bar value={r.netCents} max={max} label={mxn(r.netCents)} />
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </Card>
  );
}

function CommissionsSection({ report, single = false }: { report: CommissionReport; period: Period; single?: boolean }) {
  if (report.error) return <ErrorNotice message="No se pudieron calcular las comisiones." />;
  return (
    <Card>
      {report.invalidRules > 0 ? (
        <div className="mb-3">
          <ErrorNotice message={`${report.invalidRules} regla(s) de comisión con formato inválido se ignoraron. Revísalas en Personal.`} />
        </div>
      ) : null}
      {report.staff.length === 0 ? (
        <EmptyState
          title={single ? "Sin comisiones en el periodo" : "Sin comisiones en el periodo"}
          description={single ? "Aquí verás tus servicios y ventas atribuidos cuando se cobren." : "Asigna reglas de comisión y estilistas a las líneas de venta."}
        />
      ) : (
        <div className="space-y-4">
          <DataTable head={["Estilista", "Servicios netos", "Productos netos", "Comisión", "Bono", "Total comisión", "Propinas"]}>
            {report.staff.map((s) => (
              <tr key={s.staffId} data-testid={`comision-${s.name}`}>
                <td className={td}>
                  <span className="font-medium">{s.name}</span>
                  {s.rules.length === 0 ? <span className="block text-xs text-warning">Sin regla de comisión activa</span> : null}
                </td>
                <td className={tdNum}>{mxn(s.netServicesCents)}</td>
                <td className={tdNum}>{mxn(s.netProductsCents)}</td>
                <td className={tdNum}>{mxn(s.commissionCents)}</td>
                <td className={tdNum}>{mxn(s.bonusCents)}</td>
                <td className={`${tdNum} font-semibold`} data-testid="comision-total">
                  {mxn(s.commissionCents + s.bonusCents)}
                </td>
                <td className={tdNum}>{mxn(s.tipsCents)}</td>
              </tr>
            ))}
          </DataTable>
          {report.staff.map((s) => (
            <details key={s.staffId} className="rounded-brand border border-line p-3" open={single}>
              <summary className="cursor-pointer text-sm font-medium">Detalle de {s.name}</summary>
              {s.rules.length ? (
                <ul className="mt-2 list-disc pl-5 text-xs text-muted">
                  {s.rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
              {s.details.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Sin líneas comisionables.</p>
              ) : (
                <div className="mt-2">
                  <DataTable head={["Fecha", "Concepto", "Regla", "Bruto", "Desc./dev.", "Base neta", "Comisión"]}>
                    {s.details.map((d, i) => {
                      const line = report.lines.get(d.lineId);
                      return (
                        <tr key={`${d.lineId}-${i}`}>
                          <td className={td}>{line ? `${shortDate(toLocalDate(line.createdAt))} ${hour(line.createdAt)}` : "Periodo"}</td>
                          <td className={td}>{line?.concept ?? "Total del periodo"}</td>
                          <td className={td}>{RULE_KIND_LABEL[d.rule]}</td>
                          <td className={tdNum}>{line ? mxn(line.grossCents) : "—"}</td>
                          <td className={tdNum}>{line ? mxn(line.discountCents + line.refundedCents) : "—"}</td>
                          <td className={tdNum}>{mxn(d.baseCents)}</td>
                          <td className={tdNum}>{mxn(d.commissionCents)}</td>
                        </tr>
                      );
                    })}
                  </DataTable>
                </div>
              )}
            </details>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        Base neta = importe − descuentos (incluida la parte proporcional de cupones) − devoluciones, con IVA incluido. Anticipos y tarjetas de regalo no
        comisionan al cobrarse; las propinas se reportan aparte al 100%. Reporte operativo: no sustituye la nómina ni el cálculo laboral o fiscal.
      </p>
    </Card>
  );
}

const toLocalDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
