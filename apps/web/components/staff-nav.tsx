"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export type NavItem = { href: string; label: string; short?: string };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Navegación lateral (escritorio): el activo es una píldora negra. */
export function SidebarLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                active ? "bg-accent font-medium text-accent-fg" : "text-muted hover:bg-surface-muted hover:text-fg"
              }`}
            >
              <NavIcon href={n.href} />
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Barra inferior (teléfono): cuatro accesos y "Más". */
export function BottomTabs({ primary, rest, footer }: { primary: NavItem[]; rest: NavItem[]; footer: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const restActive = rest.some((n) => isActive(pathname, n.href));
  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      ) : null}
      {open ? (
        <div id="menu-mas" className="fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] z-50 mx-auto max-w-2xl rounded-t-3xl border-t border-line bg-surface p-4 pb-5 shadow-2xl lg:hidden">
          <p className="eyebrow mb-2 px-2">Más módulos</p>
          <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {rest.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={isActive(pathname, n.href) ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm ${
                    isActive(pathname, n.href) ? "bg-accent text-accent-fg" : "hover:bg-surface-muted"
                  }`}
                >
                  <NavIcon href={n.href} />
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-line pt-3">{footer}</div>
        </div>
      ) : null}
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-50 grid border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden [&>*]:h-[68px]"
        style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}
      >
        {primary.map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] ${active ? "font-medium text-fg" : "text-muted"}`}
            >
              <span className={`flex h-7 w-11 items-center justify-center rounded-full ${active ? "bg-accent text-accent-fg" : ""}`}>
                <NavIcon href={n.href} />
              </span>
              {n.short ?? n.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="menu-mas"
          className={`flex flex-col items-center justify-center gap-1 text-[11px] ${restActive || open ? "font-medium text-fg" : "text-muted"}`}
        >
          <span className={`flex h-7 w-11 items-center justify-center rounded-full ${restActive && !open ? "bg-accent text-accent-fg" : ""}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </span>
          Más
        </button>
      </nav>
    </>
  );
}

/** Íconos de línea fina (1.6 px), uno por módulo. */
function NavIcon({ href }: { href: string }) {
  const p = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (href) {
    case "/dashboard":
      return (<svg {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>);
    case "/recepcion":
      return (<svg {...p}><path d="M4 20h16" /><path d="M6 20V10h12v10" /><path d="M9 10V6h6v4" /></svg>);
    case "/agenda":
      return (<svg {...p}><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>);
    case "/clientes":
      return (<svg {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5" /></svg>);
    case "/pos":
      return (<svg {...p}><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="M8 8h8M8 12h2M12 12h2M8 16h2M12 16h4" /></svg>);
    case "/ventas":
      return (<svg {...p}><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg>);
    case "/inventario":
      return (<svg {...p}><path d="M3.5 8l8.5-4.5L20.5 8v8L12 20.5 3.5 16z" /><path d="M3.5 8L12 12.5 20.5 8M12 12.5v8" /></svg>);
    case "/cotizador":
      return (<svg {...p}><path d="M7 4c2 3 2 6 0 9s-2 5 0 7M12 4c2 3 2 6 0 9s-2 5 0 7M17 4c2 3 2 6 0 9s-2 5 0 7" /></svg>);
    case "/reportes":
      return (<svg {...p}><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></svg>);
    case "/finanzas":
      return (<svg {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>);
    case "/personal":
      return (<svg {...p}><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.9-3 3-4.5 5.5-4.5s4.6 1.5 5.5 4.5" /><circle cx="17" cy="9" r="2.3" /><path d="M16 14.6c2 .2 3.7 1.5 4.5 4.4" /></svg>);
    case "/configuracion":
      return (<svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></svg>);
    default:
      return (<svg {...p}><circle cx="12" cy="12" r="8" /></svg>);
  }
}
