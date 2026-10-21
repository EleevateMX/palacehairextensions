import "server-only";

/**
 * CSV para Excel en español (México): UTF-8 con BOM (para que respete acentos), separador
 * coma y punto decimal (configuración regional de México). Importes en pesos con 2 decimales.
 */
export type CsvCell = string | number | null | undefined;

const BOM = "﻿";

function cell(v: CsvCell): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Evita inyección de fórmulas al abrir en Excel (=, +, -, @ al inicio de texto).
  const safe = typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return BOM + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Centavos → "1234.50" (número para Excel, sin símbolo ni separador de miles). */
export const pesos = (cents: number | string | null | undefined) => (Number(cents ?? 0) / 100).toFixed(2);

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
