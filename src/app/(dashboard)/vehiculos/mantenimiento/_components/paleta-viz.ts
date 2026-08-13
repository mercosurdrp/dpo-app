"use client"

// Paleta única de los gráficos del módulo de flota.
//
// Los siete tonos están elegidos —y verificados— para que se distingan entre sí
// también con daltonismo, y cada modo tiene su propio escalón: el oscuro NO es
// el claro "dado vuelta", son los mismos siete matices pisados para el fondo
// oscuro. El gris queda reservado para el agrupado "otros", que no es una
// categoría más.

import { useTheme } from "next-themes"

const SERIES_LIGHT = [
  "#2a78d6", // azul
  "#eb6834", // naranja
  "#1baf7a", // verde agua
  "#eda100", // amarillo
  "#e87ba4", // magenta
  "#008300", // verde
  "#4a3aa7", // violeta
]
const SERIES_DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
]
const OTRAS_LIGHT = "#8f8f88"
const OTRAS_DARK = "#a3a39a"

/** Cantidad de tonos antes de tener que agrupar en "otros". */
export const MAX_SERIES = SERIES_LIGHT.length

/** Par de colores para las dos lecturas que conviven en casi todos los
 *  gráficos del módulo: lo que impide operar y lo que sólo se observa. */
const CRITICO_LIGHT = "#e34948"
const CRITICO_DARK = "#e66767"
const LEVE_LIGHT = "#2a78d6"
const LEVE_DARK = "#3987e5"

/** Las tres causas por las que una unidad no está en la calle. El verde para el
 *  preventivo es deliberado: es la parada PLANIFICADA, la que se busca. */
const PARADAS_LIGHT = {
  correctivo: "#e34948",
  preventivo: "#1baf7a",
  indisponible: "#4a3aa7",
}
const PARADAS_DARK = {
  correctivo: "#e66767",
  preventivo: "#199e70",
  indisponible: "#9085e9",
}

export interface PaletaViz {
  oscuro: boolean
  /** Tonos categóricos en orden fijo. */
  series: string[]
  /** Color del agrupado "otros". */
  otras: string
  critico: string
  leve: string
  paradas: typeof PARADAS_LIGHT
  /** Color de la serie `i`, ciclando si hiciera falta. */
  serie: (i: number) => string
}

export function usePaletaViz(): PaletaViz {
  // `resolvedTheme` recién tiene valor después de montar, así que el primer
  // pintado coincide con el del servidor y no hay desajuste de hidratación.
  const { resolvedTheme } = useTheme()
  const oscuro = resolvedTheme === "dark"
  const series = oscuro ? SERIES_DARK : SERIES_LIGHT
  return {
    oscuro,
    series,
    otras: oscuro ? OTRAS_DARK : OTRAS_LIGHT,
    critico: oscuro ? CRITICO_DARK : CRITICO_LIGHT,
    leve: oscuro ? LEVE_DARK : LEVE_LIGHT,
    paradas: oscuro ? PARADAS_DARK : PARADAS_LIGHT,
    serie: (i: number) => series[i % series.length],
  }
}
