import type { NextRequest } from "next/server";
import { TZ } from "@/lib/format";
import { currentLocationId } from "@/lib/location";
import { can, requireStaff } from "@/lib/staff";
import { STATUS_LABEL } from "../../pos/_lib/labels";
import { POS_ROLES } from "../../pos/_lib/session";
import { clientName, loadSales, parseSalesFilter } from "../_lib/query";

const CSV_HEADER = ["Folio", "Fecha", "Clienta", "Estado", "Subtotal", "Descuento", "Total", "IVA incluido", "Propinas", "Pagado", "Saldo"];

/** Escapa un campo CSV y neutraliza fórmulas (=, +, -, @) al abrirlo en hojas de cálculo. */
function cell(v: string | number): string {
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const pesos = (cents: number) => (cents / 100).toFixed(2);
const stamp = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso),
  );

export async function GET(request: NextRequest) {
  const { staff, supabase } = await requireStaff();
  if (!can(staff, ...POS_ROLES)) return new Response("Sin permiso", { status: 403 });
  const sp = request.nextUrl.searchParams;
  const f = parseSalesFilter({
    desde: sp.get("desde") ?? undefined,
    hasta: sp.get("hasta") ?? undefined,
    estado: sp.get("estado") ?? undefined,
    pendientes: sp.get("pendientes") ?? undefined,
  });
  const locationId = await currentLocationId(supabase, staff);
  if (!locationId) return new Response("No hay sucursal activa", { status: 400 });
  const { rows, error } = await loadSales(supabase, locationId, f, 5000);
  if (error) return new Response("No se pudieron cargar las ventas", { status: 500 });

  const lines = [
    CSV_HEADER.join(","),
    ...rows.map((r) =>
      [
        r.folio,
        stamp(r.created_at),
        clientName(r.client),
        STATUS_LABEL[r.status] ?? r.status,
        pesos(r.subtotal_cents),
        pesos(r.discount_cents),
        pesos(r.total_cents),
        pesos(r.tax_cents),
        pesos(r.tip_cents),
        pesos(r.paid_cents),
        pesos(r.balance_due_cents),
      ]
        .map(cell)
        .join(","),
    ),
  ];
  const name = f.pending ? "cuentas-pendientes" : `ventas-${f.from}${f.to !== f.from ? `_${f.to}` : ""}`;
  // BOM para que Excel reconozca UTF-8 (acentos).
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}.csv"`,
      "cache-control": "no-store",
    },
  });
}
