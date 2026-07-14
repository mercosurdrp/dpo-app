import { AlertTriangle } from "lucide-react"
import { DIAS_ALERTA_SYNC } from "@/lib/sync-estado"

const FMT_DIA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

/**
 * Cartel de datos desactualizados. No renderiza nada mientras el sync viene
 * al día: solo aparece cuando hay algo que mirar.
 */
export function SyncAviso({
  actualizadoEn,
  diasSinSync,
}: {
  actualizadoEn: string | null
  diasSinSync: number | null
}) {
  const nuncaSincronizo = actualizadoEn == null
  if (
    !nuncaSincronizo &&
    (diasSinSync == null || diasSinSync < DIAS_ALERTA_SYNC)
  ) {
    return null
  }

  return (
    <div className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div>
        <p className="font-medium">
          {nuncaSincronizo
            ? "Sin registro de sincronización con el Power BI."
            : `Datos desactualizados: la última sincronización con el Power BI fue el ${FMT_DIA.format(
                new Date(actualizadoEn),
              )} (hace ${diasSinSync} días).`}
        </p>
        <p className="mt-0.5 text-amber-800">
          {nuncaSincronizo
            ? "No hay ninguna corrida registrada, así que no se puede saber qué tan viejo es lo que ves abajo."
            : "Lo que ves abajo no incluye las encuestas ni las entregas puntuadas desde esa fecha."}{" "}
          El sync corre los lunes a las 05:00; si falló, lo más probable es que
          haya vencido el token de Power BI y haya que rehacer el login a mano.
          Avisale al equipo de sistemas.
        </p>
      </div>
    </div>
  )
}
