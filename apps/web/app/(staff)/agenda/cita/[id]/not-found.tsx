import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function AppointmentNotFound() {
  return (
    <div className="space-y-4">
      <EmptyState title="Cita no encontrada" description="No existe o tu rol no tiene acceso a ella." />
      <Link className="text-sm underline" href="/agenda">
        Volver a la agenda
      </Link>
    </div>
  );
}
