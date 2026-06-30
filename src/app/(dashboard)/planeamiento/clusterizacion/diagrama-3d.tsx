"use client"

import { useEffect, useRef } from "react"
import * as echarts from "echarts"
import "echarts-gl"
import type { CuboId } from "@/actions/clusterizacion-tipos"

export interface Punto3D {
  id: CuboId
  label: string
  color: string
  /** x = costo (0 menor, 1 mayor) · y = crecimiento (0 menor, 1 mayor) · z = facturación (0 baja, 1 alta) */
  x: 0 | 1
  y: 0 | 1
  z: 0 | 1
  count: number
}

interface PuntoData {
  value: number[]
  label: string
  count: number
  cuboId: CuboId
  itemStyle: { color: string; opacity: number; borderColor: string; borderWidth: number }
}

export default function Diagrama3D({
  puntos,
  selected,
  onSelect,
}: {
  puntos: Punto3D[]
  selected: CuboId | null
  onSelect: (id: CuboId) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null)
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // Init una sola vez.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const chart = echarts.init(el)
    chartRef.current = chart
    chart.on("click", (p) => {
      const data = (p as { data?: { cuboId?: CuboId } }).data
      const id = data?.cuboId
      if (id) onSelectRef.current(id)
    })
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(el)
    return () => {
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  // Actualizar opciones cuando cambian datos / selección.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const maxCount = Math.max(1, ...puntos.map((p) => p.count))
    const ejeLabel = (m: Record<number, string>) => ({
      formatter: (v: number) => m[v] ?? "",
    })
    const data: PuntoData[] = puntos.map((pt) => ({
      value: [pt.x, pt.y, pt.z],
      label: pt.label,
      count: pt.count,
      cuboId: pt.id,
      itemStyle: {
        color: pt.color,
        opacity: selected && selected !== pt.id ? 0.2 : 0.95,
        borderColor: selected === pt.id ? "#0f172a" : "#ffffff",
        borderWidth: selected === pt.id ? 3 : 1,
      },
    }))

    // Los tipos de `option` de echarts son uniones gigantes (vuelven el typecheck
    // lentísimo) y echarts-gl agrega claves 3D que no están tipadas. Lo tratamos laxo.
    const option = {
      tooltip: {
        formatter: (p: { data: PuntoData }) => `<b>${p.data.label}</b><br/>${p.data.count} PDV`,
      },
      xAxis3D: { type: "value", name: "Costo $/HL", min: -0.6, max: 1.6, interval: 1, axisLabel: ejeLabel({ 0: "Menor", 1: "Mayor" }) },
      yAxis3D: { type: "value", name: "Crecimiento", min: -0.6, max: 1.6, interval: 1, axisLabel: ejeLabel({ 0: "Menor", 1: "Mayor" }) },
      zAxis3D: { type: "value", name: "Facturación", min: -0.6, max: 1.6, interval: 1, axisLabel: ejeLabel({ 0: "Baja", 1: "Alta" }) },
      grid3D: {
        boxWidth: 100,
        boxDepth: 100,
        boxHeight: 100,
        viewControl: { distance: 220, alpha: 18, beta: 35, autoRotate: false },
        light: { main: { intensity: 1.2 }, ambient: { intensity: 0.5 } },
      },
      series: [
        {
          type: "scatter3D",
          symbol: "rect",
          symbolSize: (_v: unknown, p: { data: PuntoData }) => 22 + 34 * (p.data.count / maxCount),
          data,
          label: {
            show: true,
            formatter: (p: { data: PuntoData }) => `${p.data.label}\n${p.data.count}`,
            textStyle: { fontSize: 11, color: "#0f172a", fontWeight: "bold" },
          },
          emphasis: { itemStyle: { opacity: 1 } },
        },
      ],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chart.setOption(option as any)
  }, [puntos, selected])

  return <div ref={ref} className="h-[460px] w-full" />
}
