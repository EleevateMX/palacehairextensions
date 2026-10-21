import { type Page, expect } from "@playwright/test";
import pg from "pg";

export const PASSWORD = "PalaceDev2026";
export const USERS = {
  owner: "propietaria@palace.local",
  reception: "recepcion@palace.local",
  ana: "ana@palace.local",
  inventory: "almacen@palace.local",
} as const;

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Acceso directo a la BD local para preparar/verificar (superusuario, solo stack local). */
export const db = new pg.Pool({
  host: process.env.PGHOST ?? "/tmp",
  port: Number(process.env.PGPORT ?? 54329),
  user: "postgres",
  database: process.env.PALACE_LOCAL_DB ?? "palace_local",
});

/** Próximo día hábil (lun–sáb) a 7+ días, en formato YYYY-MM-DD. */
export function futureWorkday(offsetDays = 7): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Selecciona la primera opción cuyo texto contenga `text`. */
export async function choose(page: Page, label: string, text: string) {
  const select = page.getByLabel(label);
  const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
  if (value === null) throw new Error(`Opción "${text}" no encontrada en ${label}`);
  await select.selectOption(value);
}
