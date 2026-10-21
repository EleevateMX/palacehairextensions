import { addDays } from "./time";

/** Intervalos de mantenimiento por técnica (días). Configuración pendiente de validar con Palace. */
export type MaintenancePolicy = Record<string, { intervalDays: number; reminderLeadDays: number }>;

export interface MaintenancePlan {
  dueDate: string;
  reminderDate: string;
}

export function planMaintenance(technique: string, serviceDate: string, policy: MaintenancePolicy): MaintenancePlan | null {
  const p = policy[technique];
  if (!p) return null;
  const dueDate = addDays(serviceDate, p.intervalDays);
  return { dueDate, reminderDate: addDays(dueDate, -p.reminderLeadDays) };
}
