import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge, EmptyState, ErrorNotice, PageHeader, Tabs } from "@/components/ui";
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

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/clientes" className="text-muted hover:underline">
          ← Clientas
        </Link>
      </p>
      <PageHeader
        title={`${client.first_name} ${client.last_name ?? ""}`.trim()}
        subtitle={[formatPhone(client.phone), client.email, client.acquisition_channel ? `Canal: ${channelLabel(client.acquisition_channel)}` : null]
          .filter((x) => x && x !== "—")
          .join(" · ")}
        actions={client.is_anonymized ? <Badge tone="warning">Anonimizada</Badge> : null}
      />
      {sp.creada ? (
        <p role="status" className="mb-4 rounded-brand border border-success/40 bg-success/10 p-2 text-sm text-success">
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
