import type {
  PiramideConteos,
  PiramideDesglose,
} from "@/components/reportes-seguridad/piramide-seguridad"
import type { ReporteSeguridadTipoAccidente } from "@/types/database"

/** Lo mínimo que necesita el cálculo (sirve para ReporteSeguridad y ...ConAutor). */
interface ReporteParaPiramide {
  fecha: string
  tipo_accidente: ReporteSeguridadTipoAccidente | null
  area: string | null
}

export interface PiramidesPorArea {
  /** Todos los reportes del período, sin importar el área. */
  total: PiramideConteos
  /** area = 'deposito' */
  almacen: PiramideConteos
  /** area = 'distribucion' */
  distribucion: PiramideConteos
  /** Apertura por área de cada escalón, para el popup. */
  desglose: PiramideDesglose
  /** Reportes del período que no son ni de almacén ni de distribución. */
  fueraDeArea: number
}

const SIGLAS: ReporteSeguridadTipoAccidente[] = [
  "fat",
  "lti",
  "mdi",
  "mti",
  "fai",
  "sio",
  "sho",
]

function vacia(): PiramideConteos {
  return { fat: 0, lti: 0, mdi: 0, mti: 0, fai: 0, sio: 0, sho: 0 }
}

function desgloseVacio(): PiramideDesglose {
  return Object.fromEntries(
    SIGLAS.map((s) => [s, { almacen: 0, distribucion: 0, otras: 0 }]),
  ) as PiramideDesglose
}

/**
 * Conteos de la pirámide para un año (y opcionalmente un mes), abiertos por
 * área. Un mismo recorrido alimenta las tres pirámides y el desglose del popup,
 * así los números no pueden quedar desalineados entre pantallas.
 */
export function calcularPiramides(
  reportes: ReporteParaPiramide[],
  anio: number,
  mes: number | "all",
): PiramidesPorArea {
  const out: PiramidesPorArea = {
    total: vacia(),
    almacen: vacia(),
    distribucion: vacia(),
    desglose: desgloseVacio(),
    fueraDeArea: 0,
  }

  for (const r of reportes) {
    if (!r.tipo_accidente) continue
    const y = Number(r.fecha.slice(0, 4))
    const m = Number(r.fecha.slice(5, 7))
    if (y !== anio) continue
    if (mes !== "all" && m !== mes) continue

    const sigla = r.tipo_accidente
    out.total[sigla] += 1
    if (r.area === "deposito") {
      out.almacen[sigla] += 1
      out.desglose[sigla].almacen += 1
    } else if (r.area === "distribucion") {
      out.distribucion[sigla] += 1
      out.desglose[sigla].distribucion += 1
    } else {
      out.desglose[sigla].otras += 1
      out.fueraDeArea += 1
    }
  }

  return out
}
