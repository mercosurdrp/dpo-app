// Tipos y formato del bloqueo por crítico: sin dependencias de servidor, para
// poder usarlos desde componentes cliente. La lógica vive en bloqueo-critico.ts.

export interface ItemCriticoAbierto {
  respuestaId: string
  checklistId: string
  item: string
  comentario: string | null
  fecha: string
  /** timestamptz del checklist */
  hora: string
  tipo: string
  chofer: string | null
  planEstado: "sin_plan" | "pendiente" | "en_proceso"
}

export interface CamionBloqueado {
  dominio: string
  /** timestamptz del primer checklist que lo bloqueó */
  desde: string
  items: ItemCriticoAbierto[]
}

/** "03/11 07:12" en hora argentina. */
export function fechaHoraAR(iso: string): string {
  const d = new Date(iso)
  const f = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d)
  const p = (t: string) => f.find((x) => x.type === t)?.value ?? ""
  const d2 = (t: string) => p(t).padStart(2, "0")
  return `${d2("day")}/${d2("month")} ${d2("hour")}:${d2("minute")}`
}
