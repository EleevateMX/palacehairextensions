import "server-only";
import type { createClient } from "@/lib/supabase/server";

type DB = Awaited<ReturnType<typeof createClient>>;

/** Categorías, marcas y proveedores activos para los formularios del catálogo. */
export async function catalogOptions(supabase: DB) {
  const [c, b, s] = await Promise.all([
    supabase.from("product_categories").select("id, name").order("sort_order").order("name"),
    supabase.from("brands").select("id, name").order("name"),
    supabase.from("suppliers").select("id, name").eq("is_active", true).order("name"),
  ]);
  return {
    categories: (c.data ?? []) as { id: string; name: string }[],
    brands: (b.data ?? []) as { id: string; name: string }[],
    suppliers: (s.data ?? []) as { id: string; name: string }[],
  };
}
