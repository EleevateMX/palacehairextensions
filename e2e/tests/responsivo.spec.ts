import { expect, test } from "@playwright/test";
import { db, login, USERS } from "./helpers";

/**
 * Cada pantalla principal debe verse completa en teléfono, tableta, iPad, laptop y TV:
 * sin desplazamiento horizontal, con su título visible y con una navegación a la mano.
 */
const SIZES = [
  { name: "teléfono 360", width: 360, height: 740 },
  { name: "iPhone 390", width: 390, height: 844 },
  { name: "iPad vertical", width: 768, height: 1024 },
  { name: "iPad Air vertical", width: 820, height: 1180 },
  { name: "iPad horizontal", width: 1024, height: 768 },
  { name: "iPad Pro horizontal", width: 1366, height: 1024 },
  { name: "TV Full HD", width: 1920, height: 1080 },
  { name: "monitor 2K", width: 2560, height: 1440 },
  { name: "TV 4K", width: 3840, height: 2160 },
];

const STAFF_PAGES = [
  "/dashboard",
  "/recepcion",
  "/agenda",
  "/agenda?view=semana",
  "/agenda?view=recursos",
  "/agenda/nueva",
  "/agenda/bloqueos",
  "/agenda/espera",
  "/clientes",
  "/clientes/nueva",
  "/cotizador",
  "/pos",
  "/pos/caja",
  "/ventas",
  "/inventario",
  "/inventario/compras",
  "/inventario/compras/nueva",
  "/inventario/conteos",
  "/inventario/movimiento",
  "/inventario/productos/nuevo",
  "/inventario/proveedores",
  "/reportes",
  "/finanzas",
  "/personal",
  "/personal/ausencias",
  "/configuracion",
  "/configuracion/horarios",
  "/configuracion/servicios",
  "/configuracion/recursos",
  "/configuracion/cotizador",
  "/configuracion/comisiones",
];

/** Pantallas de detalle con un registro real de la BD local (si existe). */
async function detailPages(): Promise<string[]> {
  const one = async (sql: string) => (await db.query(sql)).rows[0]?.id as string | undefined;
  const pages: [string, string | undefined][] = [
    ["/clientes/", await one(`select id from clients where not is_anonymized order by created_at desc limit 1`)],
    ["/agenda/cita/", await one(`select id from appointments order by created_at desc limit 1`)],
    ["/ventas/", await one(`select id from sales order by created_at desc limit 1`)],
    ["/inventario/productos/", await one(`select id from products order by created_at desc limit 1`)],
    ["/inventario/kardex/", await one(`select id from product_variants order by created_at desc limit 1`)],
    ["/personal/", await one(`select id from staff_members where is_bookable order by display_name limit 1`)],
    ["/configuracion/servicios/", await one(`select id from services order by name limit 1`)],
  ];
  return pages.filter(([, id]) => id).map(([base, id]) => `${base}${id}`);
}

for (const size of SIZES) {
  test(`se ve completo en ${size.name} (${size.width}×${size.height})`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: size.width, height: size.height });
    await login(page, USERS.owner);
    for (const path of [...STAFF_PAGES, ...(await detailPages())]) {
      await page.goto(path);
      await expect(page.locator("main h1").first(), `título en ${path}`).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `desbordamiento horizontal en ${path}`).toBeLessThanOrEqual(0);
      // Siempre hay navegación visible: barra lateral o barra inferior.
      await expect(page.getByRole("navigation", { name: "Navegación principal" }).filter({ visible: true }).first(), `navegación en ${path}`).toBeVisible();
    }
    // Portal público (sin sesión no importa: es público).
    for (const path of ["/reservar", "/reservar/privacidad"]) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `desbordamiento horizontal en ${path}`).toBeLessThanOrEqual(0);
    }
  });
}
