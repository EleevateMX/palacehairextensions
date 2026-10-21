import type { NextRequest } from "next/server";
import { requireStaff } from "@/lib/staff";
import { canSeeCost, KIND_LABEL, workingLocation } from "../_lib/shared";
import { loadStock, type StockFilters } from "../_lib/stock";

export const dynamic = "force-dynamic";

const CSV_HEADER = [
  "sku",
  "producto",
  "variante",
  "tipo",
  "tecnica",
  "tono",
  "largo_cm",
  "textura",
  "unidad",
  "existencias",
  "reservado",
  "disponible",
  "minimo",
  "bajo_minimo",
  "ubicacion",
  "precio_mxn",
];
const COST_HEADER = ["costo_mxn", "margen_pct"];

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Evita inyección de fórmulas al abrir en hojas de cálculo.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV de existencias actuales. Lee con la sesión de la persona (RLS); costo solo para roles autorizados. */
export async function GET(request: NextRequest) {
  const { supabase, staff } = await requireStaff();
  const { location } = await workingLocation(supabase, staff);
  if (!location) return new Response("Sin sucursal activa", { status: 400 });
  const sp = request.nextUrl.searchParams;
  const f: StockFilters = Object.fromEntries(
    ["q", "kind", "tone", "length", "texture", "technique", "low", "inactive"].flatMap((k) => (sp.get(k) ? [[k, sp.get(k)!]] : [])),
  );
  const withCost = canSeeCost(staff);
  const { rows, error } = await loadStock(supabase, location.id, f, withCost);
  if (error) return new Response("No se pudo generar el archivo", { status: 500 });

  const header = withCost ? [...CSV_HEADER, ...COST_HEADER] : CSV_HEADER;
  const lines = [header.join(",")];
  for (const r of rows) {
    const base = [
      r.sku,
      r.product_name,
      r.variant_name,
      KIND_LABEL[r.kind] ?? r.kind,
      r.technique,
      r.tone,
      r.length_cm,
      r.texture,
      r.unit,
      r.on_hand,
      r.reserved,
      r.available,
      r.min_stock,
      r.is_low ? "si" : "no",
      r.bin_location,
      (r.price_cents / 100).toFixed(2),
    ];
    if (withCost) base.push(r.cost_cents === null ? "" : (r.cost_cents / 100).toFixed(2), r.margin_pct);
    lines.push(base.map(cell).join(","));
  }
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: location.timezone }).format(new Date());
  // BOM para que Excel reconozca UTF-8 (acentos).
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inventario-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
