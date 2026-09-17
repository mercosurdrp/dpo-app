// Puestos de almacén con cartel en el área y QR que abre su SOP vigente.
//
// El QR impreso apunta a /sop/<slug> (ruta pública, sin login). La ruta
// resuelve el archivo en dpo_archivos por pilar + punto + título en vez de
// por UUID, porque los ids difieren entre Pampeana y Misiones y porque el
// documento cambia de versión sin que haya que reimprimir el cartel.

export interface SopPuesto {
  slug: string
  nombre: string
  pilar_codigo: string
  punto_codigo: string
  /** Fragmento del título (ilike) que identifica al SOP dentro del punto. */
  titulo_contiene: string
}

export const SOP_PUESTOS: readonly SopPuesto[] = [
  { slug: "picking", nombre: "Picking", pilar_codigo: "almacen", punto_codigo: "4.1", titulo_contiene: "Picking" },
  { slug: "reabastecimiento", nombre: "Reabastecimiento", pilar_codigo: "almacen", punto_codigo: "4.2", titulo_contiene: "Abastecimiento" },
  { slug: "reempaque", nombre: "Reempaque", pilar_codigo: "almacen", punto_codigo: "2.2", titulo_contiene: "Reempaque" },
  { slug: "clasificacion-envases", nombre: "Clasificación de envases", pilar_codigo: "almacen", punto_codigo: "3.3", titulo_contiene: "retorno" },
  { slug: "maquinista", nombre: "Maquinista", pilar_codigo: "almacen", punto_codigo: "5.1", titulo_contiene: "Carga y Descarga" },
  { slug: "controlador", nombre: "Controlador", pilar_codigo: "almacen", punto_codigo: "4.3", titulo_contiene: "Verificaci" },
]

/**
 * Carpeta del bucket donde se guarda el PDF de una versión de SOP, para que el
 * QR abra un PDF en el celular en vez del visor de Office. Se busca por
 * versión: si el SOP cambia y nadie generó el PDF nuevo, se cae al docx.
 */
export function rutaPdfSop(archivoId: string, version: number): string {
  return `sop-pdf/${archivoId}/v${version}.pdf`
}
