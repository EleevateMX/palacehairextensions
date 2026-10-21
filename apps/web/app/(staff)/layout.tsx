import Link from "next/link";
import { brand } from "@/config/brand";
import { NAV, ROLE_LABEL } from "@/lib/roles";
import { requireStaff } from "@/lib/staff";
import { logout } from "../login/actions";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { staff } = await requireStaff();
  const items = NAV.filter((n) => n.roles.includes(staff.role));
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-line bg-surface md:min-h-dvh md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-3 md:block">
          <p className="font-semibold">{brand.shortName}</p>
          <p className="text-xs text-muted md:mt-1">
            {staff.displayName} · {ROLE_LABEL[staff.role]}
          </p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
          {items.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-brand px-3 py-2 text-sm hover:bg-surface-muted">
              {n.label}
            </Link>
          ))}
          <form action={logout}>
            <button className="w-full whitespace-nowrap rounded-brand px-3 py-2 text-left text-sm text-muted hover:bg-surface-muted">
              Salir
            </button>
          </form>
        </nav>
      </aside>
      <main className="mx-auto w-full max-w-6xl p-4 md:p-8">{children}</main>
    </div>
  );
}
