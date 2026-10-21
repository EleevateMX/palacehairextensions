import type { NextRequest } from "next/server";
import { csvResponse, pesos, toCsv } from "@/lib/csv";
import { currentLocationId } from "@/lib/location";
import { periodFromSearch } from "@/lib/period";
import { EXPENSE_KIND_LABEL, loadExpenses, loadFinanceSummary, loadServiceProfitability, METHOD_LABEL } from "@/lib/reports";
import { can, requireStaff } from "@/lib/staff";

/** Exportación CSV de finanzas (owner/admin). La sesión de la persona aplica RLS y la validación de rol de las RPC. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const { staff, supabase } = await requireStaff();
  if (!can(staff, "owner", "admin")) return new Response("Tu rol no tiene permiso para esta exportación.", { status: 403 });
  const period = periodFromSearch(Object.fromEntries(request.nextUrl.searchParams));
  if (period.warning) return new Response(period.warning, { status: 400 });
  const locationId = await currentLocationId(supabase, staff);
  if (!locationId) return new Response("No hay sucursal activa.", { status: 400 });
  const suffix = `${period.from}_a_${period.to}`;

  switch (tipo) {
    case "gastos": {
      const { rows, error } = await loadExpenses(supabase, locationId, period);
      if (error) return new Response("No se pudo generar el reporte.", { status: 500 });
      return csvResponse(
        `gastos_${suffix}.csv`,
        toCsv(
          ["fecha", "categoria", "tipo", "importe", "proveedor", "metodo", "descripcion"],
          rows.map((e) => [e.date, e.category, EXPENSE_KIND_LABEL[e.kind], pesos(e.amountCents), e.supplierName, e.paymentMethod, e.description]),
        ),
      );
    }
    case "resumen": {
      const { summary: s, error } = await loadFinanceSummary(supabase, locationId, period);
      if (error || !s) return new Response("No se pudo generar el reporte.", { status: 500 });
      const rows: [string, string][] = [
        ["ventas_totales", pesos(s.total_sales_cents)],
        ["tarjetas_regalo_vendidas", pesos(s.gift_cards_sold_cents)],
        ["devoluciones", pesos(s.refunds_cents)],
        ["ventas_netas", pesos(s.net_revenue_cents)],
        ["costo_de_lo_vendido", pesos(s.cogs_products_cents)],
        ["materiales_de_servicio", pesos(s.service_materials_cents)],
        ["mermas", pesos(s.waste_cents)],
        ["utilidad_bruta", pesos(s.gross_profit_cents)],
        ["gastos_fijos", pesos(s.expenses_fixed_cents)],
        ["gastos_variables", pesos(s.expenses_variable_cents)],
        ["utilidad_operativa", pesos(s.operating_profit_cents)],
        ["descuentos", pesos(s.discounts_cents)],
        ["anticipos_recibidos", pesos(s.deposits_received_cents)],
        ["saldos_pendientes", pesos(s.balance_due_cents)],
        ["propinas", pesos(s.tips_cents)],
        ...Object.entries(s.payments_by_method).map(([m, v]) => [`cobrado_${METHOD_LABEL[m] ?? m}`, pesos(v)] as [string, string]),
      ];
      return csvResponse(`resumen_financiero_${suffix}.csv`, toCsv(["concepto", "importe"], rows));
    }
    case "rentabilidad": {
      const { rows, error } = await loadServiceProfitability(supabase, locationId, period);
      if (error) return new Response("No se pudo generar el reporte.", { status: 500 });
      return csvResponse(
        `rentabilidad_servicios_${suffix}.csv`,
        toCsv(
          ["servicio", "realizados", "ingresos", "materiales", "costos_configurados", "margen", "margen_pct", "minutos_promedio"],
          rows.map((r) => [r.name, r.count, pesos(r.revenueCents), pesos(r.materialsCents), pesos(r.configuredCostsCents), pesos(r.marginCents), r.marginPct ?? "", r.avgMinutes ?? ""]),
        ),
      );
    }
    default:
      return new Response("Exportación desconocida. Opciones: gastos, resumen, rentabilidad.", { status: 404 });
  }
}
