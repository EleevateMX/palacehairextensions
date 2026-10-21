import type { NextRequest } from "next/server";
import { csvResponse, pesos, toCsv } from "@/lib/csv";
import { currentLocationId } from "@/lib/location";
import { periodFromSearch } from "@/lib/period";
import { loadBookingKpis, loadCommissions, loadProductivity, loadSalesDaily, loadTopItems } from "@/lib/reports";
import { can, requireStaff } from "@/lib/staff";

/**
 * Exportación CSV de reportes. Usa la sesión de la persona: RLS y las RPC con validación de rol
 * deciden qué datos salen. La estilista solo puede exportar sus propias comisiones.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const { staff, supabase } = await requireStaff();
  const isManager = can(staff, "owner", "admin");
  if (!isManager && !(tipo === "comisiones" && can(staff, "stylist"))) {
    return new Response("Tu rol no tiene permiso para esta exportación.", { status: 403 });
  }
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const period = periodFromSearch(sp);
  if (period.warning) return new Response(period.warning, { status: 400 });
  const locationId = await currentLocationId(supabase, staff);
  if (!locationId) return new Response("No hay sucursal activa.", { status: 400 });
  const suffix = `${period.from}_a_${period.to}`;

  switch (tipo) {
    case "ventas": {
      const { rows, error } = await loadSalesDaily(supabase, locationId, period);
      if (error) return new Response("No se pudo generar el reporte.", { status: 500 });
      const header = ["fecha", "tickets", "total", "efectivo", "tarjeta", "transferencia", "tarjeta_regalo", "anticipo_aplicado", "en_linea", "descuentos", "propinas", "devoluciones"];
      return csvResponse(
        `ventas_${suffix}.csv`,
        toCsv(
          header,
          rows.map((d) => [
            d.day,
            d.salesCount,
            pesos(d.totalCents),
            pesos(d.byMethod.cash),
            pesos(d.byMethod.card),
            pesos(d.byMethod.transfer),
            pesos(d.byMethod.gift_card),
            pesos(d.byMethod.deposit),
            pesos(d.byMethod.online),
            pesos(d.discountsCents),
            pesos(d.tipsCents),
            pesos(d.refundsCents),
          ]),
        ),
      );
    }
    case "articulos": {
      const { rows, error } = await loadTopItems(supabase, locationId, period);
      if (error) return new Response("No se pudo generar el reporte.", { status: 500 });
      return csvResponse(
        `mas_vendidos_${suffix}.csv`,
        toCsv(
          ["tipo", "concepto", "cantidad", "ventas", "importe_neto"],
          rows.map((r) => [r.kind === "product" ? "Producto" : "Servicio", r.name, r.quantity, r.salesCount, pesos(r.netCents)]),
        ),
      );
    }
    case "comisiones": {
      const report = await loadCommissions(supabase, locationId, period, isManager ? undefined : staff.id);
      if (report.error) return new Response("No se pudo generar el reporte.", { status: 500 });
      const rows = report.staff.flatMap((s) =>
        s.details.map((d) => {
          const line = report.lines.get(d.lineId);
          return [
            s.name,
            line?.createdAt ?? "",
            line?.concept ?? "Total del periodo",
            d.rule,
            line ? pesos(line.grossCents) : "",
            line ? pesos(line.discountCents + line.refundedCents) : "",
            pesos(d.baseCents),
            pesos(d.commissionCents),
          ];
        }),
      );
      const totals = report.staff.map((s) => [s.name, "", "TOTAL", "", "", "", pesos(s.netServicesCents + s.netProductsCents), pesos(s.commissionCents + s.bonusCents)]);
      const tips = report.staff.filter((s) => s.tipsCents > 0).map((s) => [s.name, "", "PROPINAS (aparte)", "", "", "", "", pesos(s.tipsCents)]);
      return csvResponse(
        `comisiones_${suffix}.csv`,
        toCsv(["estilista", "fecha", "concepto", "regla", "bruto", "descuento_y_devolucion", "base_neta", "comision"], [...rows, ...totals, ...tips]),
      );
    }
    case "productividad": {
      const { rows, error } = await loadProductivity(supabase, locationId, period);
      if (error) return new Response("No se pudo generar el reporte.", { status: 500 });
      return csvResponse(
        `productividad_${suffix}.csv`,
        toCsv(
          ["estilista", "citas_completadas", "servicios", "ingresos_servicios", "ingresos_productos", "minutos_turno", "minutos_no_disponibles", "minutos_reservados", "ocupacion_pct"],
          rows.map((r) => [
            r.name,
            r.completedAppointments,
            r.servicesCount,
            pesos(r.servicesRevenueCents),
            pesos(r.productsRevenueCents),
            r.scheduledMinutes,
            r.unavailableMinutes,
            r.bookedMinutes,
            r.occupancyPct ?? "",
          ]),
        ),
      );
    }
    case "citas": {
      const { kpis, error } = await loadBookingKpis(supabase, locationId, period);
      if (error) return new Response("No se pudo generar el reporte.", { status: 500 });
      return csvResponse(
        `citas_${suffix}.csv`,
        toCsv(
          ["indicador", "valor"],
          [
            ["citas", kpis.appointmentsTotal],
            ["canceladas", kpis.cancelled],
            ["completadas", kpis.completed],
            ["no_show", kpis.noShow],
            ["tasa_cancelacion_pct", kpis.cancellationRatePct ?? ""],
            ["tasa_no_show_pct", kpis.noShowRatePct ?? ""],
            ["clientas_nuevas", kpis.clientsNew],
            ["clientas_recurrentes", kpis.clientsReturning],
          ],
        ),
      );
    }
    default:
      return new Response(`Exportación desconocida. Opciones: ventas, articulos, comisiones, productividad, citas.`, { status: 404 });
  }
}
