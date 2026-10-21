import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import type { TabProps } from "./types";

export async function PhotosTab({ supabase, client }: TabProps) {
  const { data: consents } = await supabase
    .from("v_client_current_consents")
    .select("purpose, granted")
    .eq("client_id", client.id)
    .in("purpose", ["photos_internal", "photos_marketing"]);
  const granted = (p: string) => consents?.find((c) => c.purpose === p)?.granted === true;

  return (
    <Card title="Fotografías antes / después">
      <ul className="mb-4 space-y-2 text-sm">
        <li>
          Expediente interno:{" "}
          {granted("photos_internal") ? <Badge tone="success">Autorizado</Badge> : <Badge tone="danger">Sin autorización</Badge>}
        </li>
        <li>
          Redes y publicidad:{" "}
          {granted("photos_marketing") ? <Badge tone="success">Autorizado</Badge> : <Badge tone="danger">Sin autorización</Badge>}
        </li>
      </ul>
      <div role="note" className="rounded-brand border border-line bg-surface-muted p-3 text-sm">
        <p className="font-medium">La carga de fotos aún no está disponible.</p>
        <p className="mt-1 text-muted">
          Se habilitará al conectar Supabase Storage (bucket privado <code>client-photos</code>). Mientras tanto no se guardan imágenes en
          este sistema. La base de datos ya impide registrar fotos sin la autorización «Fotos para expediente interno».
        </p>
        {!granted("photos_internal") ? (
          <p className="mt-2">
            Para tomar fotos primero registra la autorización en{" "}
            <Link className="underline" href={`/clientes/${client.id}?tab=consentimientos`}>
              Consentimientos
            </Link>
            .
          </p>
        ) : null}
      </div>
    </Card>
  );
}
