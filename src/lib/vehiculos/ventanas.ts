/**
 * Ventanas de datos del seguimiento de flota (disponibilidad y utilización).
 *
 * Viven acá porque la misma pantalla se muestra en DOS lugares —la solapa
 * Disponibilidad de /vehiculos y Seguimiento de flota de /vehiculos/mantenimiento—
 * y las dos tienen que traer EXACTAMENTE el mismo período. Si cada página
 * eligiera su ventana, el mismo mes podría dar dos porcentajes distintos según
 * por dónde se entró, que es la clase de diferencia que nadie puede explicar en
 * una auditoría.
 */

/** Días ruteados a traer (~13 meses): es la base de la utilización. */
export function ventanaRuteoDesde(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 13)
  return d.toISOString().slice(0, 10)
}

/**
 * Órdenes de trabajo a traer (~24 meses).
 *
 * 🚨 Antes eran las **200 más recientes** (`limit: 200`) y eso rompía el filtro
 * de mes: el selector se arma con los meses que tienen OT cargada, así que al
 * 06/10/2026 la lista cortaba en septiembre de 2025 —las 58 OT anteriores no
 * llegaban— y los meses de la primera mitad de 2025 no se podían elegir. El que
 * sí se podía elegir (2025-09) mostraba una parada de menos. Un tope por FILAS
 * no sirve para una pantalla que filtra por FECHA.
 */
export function ventanaOtDesde(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 24)
  return d.toISOString().slice(0, 10)
}
