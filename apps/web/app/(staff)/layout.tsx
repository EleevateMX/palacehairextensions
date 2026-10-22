import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { BottomTabs, SidebarLinks, type NavItem } from "@/components/staff-nav";
import { Avatar } from "@/components/ui";
import { NAV, ROLE_LABEL } from "@/lib/roles";
import { requireStaff } from "@/lib/staff";
import { logout } from "../login/actions";

/** Orden de la barra inferior en teléfono; lo que no quepa va a "Más". */
const MOBILE_PRIORITY = ["/dashboard", "/agenda", "/pos", "/clientes", "/recepcion", "/inventario", "/cotizador", "/personal"];
const SHORT: Record<string, string> = { "/pos": "POS", "/dashboard": "Inicio" };

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { staff } = await requireStaff();
  const items: NavItem[] = NAV.filter((n) => n.roles.includes(staff.role)).map((n) => ({ href: n.href, label: n.label, short: SHORT[n.href] }));
  const primary = MOBILE_PRIORITY.map((h) => items.find((i) => i.href === h)).filter((i): i is NavItem => !!i).slice(0, 4);
  const rest = items.filter((i) => !primary.includes(i));

  const logoutButton = (
    <form action={logout}>
      <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-muted transition hover:bg-surface-muted hover:text-fg">
        Salir
      </button>
    </form>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)]">
      {/* Escritorio: barra lateral */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <Link href="/dashboard" className="mb-8 block px-2">
          <Wordmark />
        </Link>
        <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto">
          <SidebarLinks items={items} />
        </nav>
        <div className="mt-4 border-t border-line pt-4">
          <div className="mb-2 flex items-center gap-3 px-2" data-testid="usuario-actual">
            <Avatar name={staff.displayName} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{staff.displayName}</p>
              <p className="truncate text-xs text-muted">{ROLE_LABEL[staff.role]}</p>
            </div>
          </div>
          {logoutButton}
        </div>
      </aside>

      {/* Teléfono: barra superior */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur md:px-8 lg:hidden">
        <Link href="/dashboard">
          <Wordmark size="sm" />
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-right text-[11px] leading-tight text-muted">
            {staff.displayName}
            <br />
            {ROLE_LABEL[staff.role]}
          </span>
          <Avatar name={staff.displayName} size="sm" dark />
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5 md:px-8 md:pt-7 lg:pb-10 lg:pt-8">{children}</main>

      <BottomTabs primary={primary} rest={rest} footer={logoutButton} />
    </div>
  );
}
