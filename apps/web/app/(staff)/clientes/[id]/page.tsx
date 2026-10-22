import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Avatar, Badge, buttonClass, EmptyState, ErrorNotice, secondaryButtonClass, Tabs } from "@/components/ui";
import { can, requireStaff } from "@/lib/staff";
import { channelLabel, formatPhone, TABS, type TabKey } from "../_lib/crm";
import { ConsentsTab } from "./_tabs/consents";
import { HistoryTab } from "./_tabs/history";
import { MaintenanceTab } from "./_tabs/maintenance";
import { NotesTab } from "./_tabs/notes";
import { PhotosTab } from "./_tabs/photos";
import { PrivacyTab } from "./_tabs/privacy";
import { ProfileTab } from "./_tabs/profile";
import { ReservationsTab } from "./_tabs/reservations";
import type { ClientRow } from "./_tabs/types";

export const metadata: Metadata = { title: "Expediente de clienta" };

export default async function ClientRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; creada?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, staff } = await requireStaff();

  if (can(staff, "inventory")) {
    return <EmptyState title="Tu rol no tiene acceso a clientas" />;
  }

  // RLS: si la persona no puede ver a la clienta (p. ej. estilista que no la atiende), no hay fila.
  const { data: client, error } = await supabase
    .from("clients")
    .select(
      "id, first_name, last_name, phone, email, birth_date, acquisition_channel, preferred_staff_id, hair_tone, extension_technique, extension_length_cm, style_preferences, maintenance_notes, next_visit_suggested, is_anonymized, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return <ErrorNotice message="No se pudo cargar el expediente. Intenta de nuevo." />;
  if (!client) {
    return (
      <EmptyState
        title="Clienta no encontrada"
        description="No existe o tu rol no tiene acceso a su expediente (las estilistas solo ven a las clientas que atienden)."
      />
    );
  }

  const visibleTabs = TABS.filter((t) => t.key !== "privacidad" || can(staff, "owner", "admin"));
  const tab: TabKey = (visibleTabs.find((t) => t.key === sp.tab)?.key ?? "perfil") as TabKey;
  const href = (k: string) => `/clientes/${id}?tab=${k}`;
  const props = { supabase, staff, client: client as ClientRow };
  const fullName = `${client.first_name} ${client.last_name ?? ""}`.trim();
  const isFront = can(staff, "owner", "admin", "receptionist");
  // wa.me solo abre el chat en el teléfono de quien da clic; no envía nada por su cuenta.
  const waPhone = client.phone ? client.phone.replace(/\D/g, "") : null;
  const since = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", month: "short", year: "numeric" }).format(new Date(client.created_at));

  return (
    <>
      <Link href="/clientes" className="mb-3 inline-block text-sm text-muted hover:text-fg">
        ← Clientas
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={client.first_name} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl leading-tight">{fullName}</h1>
              {client.is_anonymized ? <Badge tone="warning">Anonimizada</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted">
              {[
                formatPhone(client.phone),
                client.email,
                client.acquisition_channel ? `Canal: ${channelLabel(client.acquisition_channel)}` : null,
                `clienta desde ${since}`,
              ]
                .filter((x) => x && x !== "—")
                .join(" · ")}
            </p>
          </div>
        </div>
        {!client.is_anonymized ? (
          <div className="flex flex-wrap gap-2">
            {waPhone ? (
              <a className={secondaryButtonClass} href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
            ) : null}
            {isFront ? (
              <Link className={buttonClass} href={`/agenda/nueva?client=${client.id}`}>
                + Nueva cita
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
      {sp.creada ? (
        <p role="status" className="mb-4 rounded-xl border border-success/30 bg-success/8 p-3 text-sm text-success">
          Clienta registrada con sus consentimientos.
        </p>
      ) : null}
      <Tabs items={visibleTabs.map((t) => ({ href: href(t.key), label: t.label }))} current={href(tab)} />
      {tab === "perfil" ? <ProfileTab {...props} /> : null}
      {tab === "consentimientos" ? <ConsentsTab {...props} /> : null}
      {tab === "notas" ? <NotesTab {...props} /> : null}
      {tab === "historial" ? <HistoryTab {...props} /> : null}
      {tab === "mantenimiento" ? <MaintenanceTab {...props} /> : null}
      {tab === "inventario" ? <ReservationsTab {...props} /> : null}
      {tab === "fotos" ? <PhotosTab {...props} /> : null}
      {tab === "privacidad" ? <PrivacyTab {...props} /> : null}
    </>
  );
}
