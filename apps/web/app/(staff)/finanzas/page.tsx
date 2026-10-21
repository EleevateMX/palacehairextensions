import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Bar, ExportLink, PeriodFilter, td, tdNum } from "@/components/reports";
import { Card, DataTable, EmptyState, ErrorNotice, Field, inputClass, PageHeader, Stat } from "@/components/ui";
import { mxn, todayLocal } from "@/lib/format";
import { currentLocationId } from "@/lib/location";
import { periodFromSearch, periodQuery, shortDate } from "@/lib/period";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_KIND_LABEL,
  type FinanceSummary,
  loadExpenses,
  loadFinanceSummary,
  loadServiceProfitability,
  METHOD_LABEL,
  pct,
} from "@/lib/reports";
import { can, requireStaff } from "@/lib/staff";
import { createExpense, deleteExpense, updateExpense } from "./actions";

export const metadata: Metadata = { title: "Finanzas" };

type SP = { desde?: string; hasta?: string };

const EXPENSE_METHOD: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", other: "Otro" };

export default async function FinancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const { staff, supabase } = await requireStaff();
  if (!can(staff, "owner", "admin")) redirect("/dashboard");
  const period = periodFromSearch(await searchParams);
  const locationId = await currentLocationId(supabase, staff);
  if (!locationId) return <ErrorNotice message="No hay una sucursal activa configurada." />;
  const qs = periodQuery(period);

  const [fin, profit, expenses, { data: suppliers }] = await Promise.all([
    loadFinanceSummary(supabase, locationId, period),
    loadServiceProfitability(supabase, locationId, period),
    loadExpenses(supabase, locationId, period),
    supabase.from("suppliers").select("id, name").order("name"),
  ]);
  const s = fin.summary;
  const expensesTotal = expenses.rows.reduce((a, e) => a + e.amountCents, 0);
  const defaultDate = todayLocal() >= period.from && todayLocal() <= period.to ? todayLocal() : period.to;

  return (
    <>
      <PageHeader title="Finanzas" subtitle={`${shortDate(period.from)} – ${shortDate(period.to)}`} />
      <p className="mb-4 rounded-brand border border-warning/40 bg-warning/10 p-3 text-sm">
        Reporte <strong>operativo</strong> para la toma de decisiones: no es contabilidad formal ni sustituye la facturación (CFDI) ni las declaraciones
        ante el SAT. Importes con IVA incluido. Valídalo con tu contadora o contador.
      </p>
      <PeriodFilter period={period} basePath="/finanzas" />
      {period.warning ? <div className="mb-4"><ErrorNotice message={period.warning} /></div> : null}

      <section aria-labelledby="resumen" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="resumen" className="text-lg font-semibold">Resumen del periodo</h2>
          <ExportLink href={`/finanzas/exportar/resumen?${qs}`}>Exportar CSV</ExportLink>
        </div>
        {fin.error || !s ? (
          <ErrorNotice message="No se pudo cargar el resumen financiero." />
        ) : (
          <Summary s={s} />
        )}
      </section>

      <section aria-labelledby="gastos" className="mt-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="gastos" className="text-lg font-semibold">Gastos</h2>
          <ExportLink href={`/finanzas/exportar/gastos?${qs}`}>Exportar CSV</ExportLink>
        </div>
        <Card title="Registrar gasto">
          <ActionForm action={createExpense} resetOnSuccess className="space-y-3">
            <ExpenseFields defaults={{ date: defaultDate }} suppliers={suppliers ?? []} />
            <SubmitButton>Registrar gasto</SubmitButton>
          </ActionForm>
        </Card>
        <Card title={`Gastos del periodo · ${mxn(expensesTotal)}`}>
          {expenses.error ? <ErrorNotice message="No se pudieron cargar los gastos." /> : null}
          {expenses.rows.length === 0 ? (
            <EmptyState title="Sin gastos registrados en el periodo" />
          ) : (
            <ul className="divide-y divide-line">
              {expenses.rows.map((e) => (
                <li key={e.id} className="py-3" data-testid="gasto">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span>
                      <span className="tabular-nums text-muted">{shortDate(e.date)}</span> · <span className="font-medium">{e.category}</span> ·{" "}
                      {EXPENSE_KIND_LABEL[e.kind]}
                      {e.supplierName ? ` · ${e.supplierName}` : ""}
                      {e.paymentMethod ? ` · ${EXPENSE_METHOD[e.paymentMethod] ?? e.paymentMethod}` : ""}
                    </span>
                    <span className="font-semibold tabular-nums">{mxn(e.amountCents)}</span>
                  </div>
                  {e.description ? <p className="text-xs text-muted">{e.description}</p> : null}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs underline">Editar o eliminar</summary>
                    <div className="mt-2 space-y-3">
                      <ActionForm action={updateExpense} className="space-y-3">
                        <input type="hidden" name="id" value={e.id} />
                        <ExpenseFields
                          defaults={{
                            date: e.date,
                            category: e.category,
                            kind: e.kind,
                            amount: (e.amountCents / 100).toFixed(2),
                            description: e.description,
                            supplierId: e.supplierId ?? "",
                            paymentMethod: e.paymentMethod ?? "",
                          }}
                          suppliers={suppliers ?? []}
                          idPrefix={e.id}
                        />
                        <SubmitButton variant="secondary">Guardar cambios</SubmitButton>
                      </ActionForm>
                      <ActionForm action={deleteExpense}>
                        <input type="hidden" name="id" value={e.id} />
                        <SubmitButton variant="danger" confirm="¿Eliminar este gasto? Queda registro en la bitácora.">
                          Eliminar
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section aria-labelledby="rentabilidad" className="mt-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="rentabilidad" className="text-lg font-semibold">Rentabilidad por servicio</h2>
          <ExportLink href={`/finanzas/exportar/rentabilidad?${qs}`}>Exportar CSV</ExportLink>
        </div>
        <Card>
          {profit.error ? <ErrorNotice message="No se pudo cargar la rentabilidad." /> : null}
          {profit.rows.length === 0 ? (
            <EmptyState title="Sin servicios completados en el periodo" description="La rentabilidad se calcula con citas completadas." />
          ) : (
            <DataTable head={["Servicio", "Realizados", "Ingresos", "Materiales", "Costos configurados", "Margen", "Margen %", "Min. promedio"]}>
              {profit.rows.map((r) => (
                <tr key={r.serviceId} data-testid="rentabilidad-fila">
                  <td className={td}>{r.name}</td>
                  <td className={tdNum}>{r.count}</td>
                  <td className={tdNum}>{mxn(r.revenueCents)}</td>
                  <td className={tdNum}>{mxn(r.materialsCents)}</td>
                  <td className={tdNum}>{mxn(r.configuredCostsCents)}</td>
                  <td className={`${tdNum} font-medium ${r.marginCents < 0 ? "text-danger" : ""}`}>{mxn(r.marginCents)}</td>
                  <td className={`${td} min-w-28`}>
                    <Bar value={Math.max(0, r.marginPct ?? 0)} max={100} label={pct(r.marginPct)} />
                  </td>
                  <td className={tdNum}>{r.avgMinutes ?? "—"}</td>
                </tr>
              ))}
            </DataTable>
          )}
          <p className="mt-3 text-xs text-muted">
            Margen = ingresos cobrados del servicio (o precio agendado si aún no se cobra) − materiales consumidos al completar la cita (costo histórico) −
            costos configurados por servicio (mano de obra, energía, amortización). No incluye gastos fijos.
          </p>
        </Card>
      </section>
    </>
  );
}

function Summary({ s }: { s: FinanceSummary }) {
  const expenses = s.expenses_fixed_cents + s.expenses_variable_cents;
  const methods = Object.entries(s.payments_by_method).filter(([, v]) => v > 0);
  const methodsTotal = methods.reduce((a, [, v]) => a + v, 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ventas netas" value={mxn(s.net_revenue_cents)} hint={`${s.sales_count} ventas · sin tarjetas de regalo ni devoluciones`} />
        <Stat label="Costo de lo vendido (CMV)" value={mxn(s.cogs_products_cents)} hint="Productos, a costo histórico" />
        <Stat label="Materiales de servicio" value={mxn(s.service_materials_cents)} />
        <Stat label="Mermas" value={mxn(s.waste_cents)} />
        <Stat label="Utilidad bruta" value={mxn(s.gross_profit_cents)} />
        <Stat label="Gastos" value={mxn(expenses)} hint={`Fijos ${mxn(s.expenses_fixed_cents)} · variables ${mxn(s.expenses_variable_cents)}`} />
        <div data-testid="utilidad-operativa" data-cents={s.operating_profit_cents}>
          <Stat label="Utilidad operativa" value={mxn(s.operating_profit_cents)} />
        </div>
        <Stat label="Margen operativo" value={pct(s.net_revenue_cents > 0 ? Math.round((1000 * s.operating_profit_cents) / s.net_revenue_cents) / 10 : null)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Otros movimientos">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">Venta de servicios (bruto)</dt>
            <dd className="text-right tabular-nums">{mxn(s.gross_services_cents)}</dd>
            <dt className="text-muted">Venta de productos (bruto)</dt>
            <dd className="text-right tabular-nums">{mxn(s.gross_products_cents)}</dd>
            <dt className="text-muted">Descuentos</dt>
            <dd className="text-right tabular-nums">{mxn(s.discounts_cents)}</dd>
            <dt className="text-muted">Devoluciones</dt>
            <dd className="text-right tabular-nums">{mxn(s.refunds_cents)}</dd>
            <dt className="text-muted">Tarjetas de regalo vendidas (pasivo)</dt>
            <dd className="text-right tabular-nums">{mxn(s.gift_cards_sold_cents)}</dd>
            <dt className="text-muted">Anticipos recibidos</dt>
            <dd className="text-right tabular-nums">{mxn(s.deposits_received_cents)}</dd>
            <dt className="text-muted">Saldos pendientes por cobrar</dt>
            <dd className="text-right tabular-nums">{mxn(s.balance_due_cents)}</dd>
            <dt className="text-muted">Propinas (no son ingreso del salón)</dt>
            <dd className="text-right tabular-nums">{mxn(s.tips_cents)}</dd>
          </dl>
        </Card>
        <Card title="Métodos de pago">
          {methods.length === 0 ? (
            <EmptyState title="Sin cobros en el periodo" />
          ) : (
            <ul className="space-y-2 text-sm">
              {methods.map(([m, v]) => (
                <li key={m}>
                  <p>{METHOD_LABEL[m] ?? m}</p>
                  <Bar value={v} max={methodsTotal} label={mxn(v)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function ExpenseFields({
  defaults,
  suppliers,
  idPrefix = "nuevo",
}: {
  defaults: { date: string; category?: string; kind?: string; amount?: string; description?: string; supplierId?: string; paymentMethod?: string };
  suppliers: { id: string; name: string }[];
  idPrefix?: string;
}) {
  const listId = `categorias-${idPrefix}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
      <Field label="Fecha">
        <input type="date" name="expense_date" defaultValue={defaults.date} required className={inputClass} />
      </Field>
      <Field label="Categoría">
        <input name="category" list={listId} defaultValue={defaults.category} required maxLength={80} className={inputClass} />
        <datalist id={listId}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Tipo">
        <select name="kind" defaultValue={defaults.kind ?? "variable"} className={inputClass}>
          <option value="fixed">Fijo</option>
          <option value="variable">Variable</option>
        </select>
      </Field>
      <Field label="Importe (pesos)">
        <input name="amount" inputMode="decimal" defaultValue={defaults.amount} required placeholder="1,500.00" className={inputClass} />
      </Field>
      <Field label="Proveedor (opcional)">
        <select name="supplier_id" defaultValue={defaults.supplierId ?? ""} className={inputClass}>
          <option value="">Sin proveedor</option>
          {suppliers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Método de pago">
        <select name="payment_method" defaultValue={defaults.paymentMethod ?? ""} className={inputClass}>
          <option value="">Sin especificar</option>
          {Object.entries(EXPENSE_METHOD).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Descripción (opcional)" className="sm:col-span-2">
        <input name="description" defaultValue={defaults.description} maxLength={500} className={inputClass} />
      </Field>
    </div>
  );
}
