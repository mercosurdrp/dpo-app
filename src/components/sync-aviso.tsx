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
 *
 * Dos niveles: si la última corrida FALLÓ el aviso es rojo y sale al día
 * siguiente (con el motivo del error); si solo quedó viejo sin falla
 * registrada —la VPS no corrió nada— es ámbar y sale a los 8 días.
 */
export function SyncAviso({
  actualizadoEn,
  diasSinSync,
  fallaEn = null,
  fallaMotivo = null,
}: {
  actualizadoEn: string | null
  diasSinSync: number | null
  fallaEn?: string | null
  fallaMotivo?: string | null
}) {
  const nuncaSincronizo = actualizadoEn == null
  const atrasado = diasSinSync != null && diasSinSync >= DIAS_ALERTA_SYNC
  const roto = fallaEn != null

  if (!nuncaSincronizo && !atrasado && !roto) return null

  const clase = roto
    ? "border-red-300 bg-red-50 text-red-900"
    : "border-amber-300 bg-amber-50 text-amber-900"
  const claseIcono = roto ? "text-red-600" : "text-amber-600"
  const claseCuerpo = roto ? "text-red-800" : "text-amber-800"

  return (
    <div className={`flex items-start gap-2.5 rounded-md border p-3 text-sm ${clase}`}>
      <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${claseIcono}`} />
      <div>
        <p className="font-medium">
          {roto
            ? `El sync con el Power BI viene fallando: la última corrida (${FMT_DIA.format(
                new Date(fallaEn),
              )}) dio error.`
            : nuncaSincronizo
              ? "Sin registro de sincronización con el Power BI."
              : `Datos desactualizados: la última sincronización con el Power BI fue el ${FMT_DIA.format(
                  new Date(actualizadoEn),
                )} (hace ${diasSinSync} días).`}
        </p>
        <p className={`mt-0.5 ${claseCuerpo}`}>
          {nuncaSincronizo ? (
            "No hay ninguna corrida registrada, así que no se puede saber qué tan viejo es lo que ves abajo."
          ) : (
            <>
              Lo que ves abajo llega hasta el{" "}
              {actualizadoEn ? FMT_DIA.format(new Date(actualizadoEn)) : "—"}: no
              incluye las encuestas ni las entregas puntuadas desde esa fecha.
            </>
          )}{" "}
          El sync corre los lunes a las 05:00; si falló, lo más probable es que
          haya vencido el token de Power BI y haya que rehacer el login a mano.
          Avisale al equipo de sistemas.
        </p>
        {fallaMotivo && (
          <p className={`mt-1 font-mono text-xs ${claseCuerpo}`}>{fallaMotivo}</p>
        )}
      </div>
    </div>
  )
}
