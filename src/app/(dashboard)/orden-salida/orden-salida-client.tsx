"use client"

import type React from "react"
import { useEffect, useMemo, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import {
  agregarEmpleado as agregarEmpleadoAction,
  obtenerAsignacionesEnRango,
  obtenerNoSaleEnRango,
  quitarNoSale as quitarNoSaleAction,
  setEmpleadoActivo as setEmpleadoActivoAction,
  upsertAsignacion,
  upsertNoSale,
} from "@/actions/orden-salida"
import {
  ESTADOS_CAMION,
  MOTIVOS_NO_SALE,
  ZONAS_SUGERIDAS,
} from "./mock-data"
import type {
  AsignacionCamionDiario,
  CamionMock,
  EmpleadoMock,
  EstadoCamion,
  MotivoNoSale,
  PersonalNoSaleDiario,
  PuestoOperativo,
  Sucursal,
} from "./types"

interface Props {
  empleados: EmpleadoMock[]
  camiones: CamionMock[]
  asignacionesIniciales: AsignacionCamionDiario[]
  noSaleIniciales: PersonalNoSaleDiario[]
  fechaInicial: string
}

// Camión que "sale a la calle" hoy (con o sin tripulación cargada)
function camionSaleHoy(estado: EstadoCamion): boolean {
  return estado === "operativo" || estado === "sin_asignar"
}

// ════════════════════════════════════════════════════════════════════════════
//  Componente principal
// ════════════════════════════════════════════════════════════════════════════
export function OrdenSalidaClient({
  empleados: empleadosIniciales,
  camiones,
  asignacionesIniciales,
  noSaleIniciales,
  fechaInicial,
}: Props) {
  const [fecha, setFecha] = useState(fechaInicial)
  const [empleadosState, setEmpleadosState] = useState<EmpleadoMock[]>(
    empleadosIniciales.map((e) => ({ ...e, activo: e.activo ?? true })),
  )
  const [asignaciones, setAsignaciones] = useState<AsignacionCamionDiario[]>(asignacionesIniciales)
  const [noSale, setNoSale] = useState<PersonalNoSaleDiario[]>(noSaleIniciales)
  const [filtroSucursal, setFiltroSucursal] = useState<Sucursal | "__all__">("__all__")
  const [vista, setVista] = useState<"admin" | "empleado">("admin")
  const [empleadoSimulado, setEmpleadoSimulado] = useState<string>(empleadosIniciales[0]?.id ?? "")
  const [maestroAbierto, setMaestroAbierto] = useState(false)
  const [exportAbierto, setExportAbierto] = useState(false)
  const [exportDesde, setExportDesde] = useState<string>(() => inicioCicloOperativo(fechaInicial))
  const [exportHasta, setExportHasta] = useState<string>(fechaInicial)
  const [planillaAbierta, setPlanillaAbierta] = useState(false)
  const [, startTransition] = useTransition()

  // Re-fetch del backend cuando se cambia a una fecha fuera del rango precargado.
  useEffect(() => {
    if (asignaciones.some((a) => a.fecha === fecha)) return
    if (noSale.some((n) => n.fecha === fecha)) return
    let cancelled = false
    startTransition(async () => {
      const [a, n] = await Promise.all([
        obtenerAsignacionesEnRango(fecha, fecha),
        obtenerNoSaleEnRango(fecha, fecha),
      ])
      if (cancelled) return
      if ("data" in a) {
        setAsignaciones((prev) => [
          ...prev.filter((x) => x.fecha !== fecha),
          ...a.data,
        ])
      }
      if ("data" in n) {
        setNoSale((prev) => [
          ...prev.filter((x) => x.fecha !== fecha),
          ...n.data,
        ])
      }
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha])

  // Empleados activos (los que aparecen en selectores y balance).
  const empleados = useMemo(
    () => empleadosState.filter((e) => e.activo !== false),
    [empleadosState],
  )

  // ─── Helpers ────────────────────────────────────────────────────────────
  // empById incluye también a los anulados (el histórico puede referenciarlos).
  const empById = useMemo(
    () => new Map(empleadosState.map((e) => [e.id, e])),
    [empleadosState],
  )

  const camionById = useMemo(
    () => new Map(camiones.map((c) => [c.id, c])),
    [camiones],
  )

  function getAsignacion(camionId: string): AsignacionCamionDiario {
    return (
      asignaciones.find((a) => a.camion_id === camionId && a.fecha === fecha) ?? {
        camion_id: camionId,
        fecha,
        chofer_empleado_id: null,
        ayudante_empleado_id: null,
        zona: "",
        estado: "sin_asignar",
        observacion: "",
        clientes: null,
        sobrecarga_completa: null,
        media_sobrecarga: null,
        cuarto_sobrecarga: null,
        bultos: null,
      }
    )
  }

  function updateAsignacion(camionId: string, patch: Partial<AsignacionCamionDiario>) {
    setAsignaciones((prev) => {
      const existe = prev.find((a) => a.camion_id === camionId && a.fecha === fecha)
      const next = existe
        ? prev.map((a) =>
            a.camion_id === camionId && a.fecha === fecha ? { ...a, ...patch } : a,
          )
        : [
            ...prev,
            {
              camion_id: camionId,
              fecha,
              chofer_empleado_id: null,
              ayudante_empleado_id: null,
              zona: "",
              estado: "sin_asignar",
              observacion: "",
              clientes: null,
              sobrecarga_completa: null,
              media_sobrecarga: null,
              cuarto_sobrecarga: null,
              bultos: null,
              ...patch,
            } as AsignacionCamionDiario,
          ]
      const row = next.find((a) => a.camion_id === camionId && a.fecha === fecha)!
      startTransition(async () => {
        await upsertAsignacion(row)
      })
      return next
    })
  }

  function getNoSale(empleadoId: string): PersonalNoSaleDiario | null {
    return noSale.find((n) => n.empleado_id === empleadoId && n.fecha === fecha) ?? null
  }

  function setMotivoNoSale(empleadoId: string, motivo: MotivoNoSale, detalle = "") {
    let detalleFinal = detalle
    setNoSale((prev) => {
      const existe = prev.find((n) => n.empleado_id === empleadoId && n.fecha === fecha)
      if (existe) detalleFinal = detalle || existe.detalle
      return existe
        ? prev.map((n) =>
            n.empleado_id === empleadoId && n.fecha === fecha
              ? { ...n, motivo, detalle: detalleFinal }
              : n,
          )
        : [...prev, { empleado_id: empleadoId, fecha, motivo, detalle: detalleFinal }]
    })
    // Si lo bajan, sacarlo de cualquier asignación de ese día (DB hace lo mismo).
    setAsignaciones((prev) =>
      prev.map((a) =>
        a.fecha === fecha
          ? {
              ...a,
              chofer_empleado_id: a.chofer_empleado_id === empleadoId ? null : a.chofer_empleado_id,
              ayudante_empleado_id: a.ayudante_empleado_id === empleadoId ? null : a.ayudante_empleado_id,
            }
          : a,
      ),
    )
    startTransition(async () => {
      await upsertNoSale({ empleado_id: empleadoId, fecha, motivo, detalle: detalleFinal })
    })
  }

  function updateDetalleNoSale(empleadoId: string, detalle: string) {
    let motivoActual: MotivoNoSale | null = null
    setNoSale((prev) =>
      prev.map((n) => {
        if (n.empleado_id === empleadoId && n.fecha === fecha) {
          motivoActual = n.motivo
          return { ...n, detalle }
        }
        return n
      }),
    )
    if (motivoActual) {
      startTransition(async () => {
        await upsertNoSale({ empleado_id: empleadoId, fecha, motivo: motivoActual!, detalle })
      })
    }
  }

  function quitarNoSale(empleadoId: string) {
    setNoSale((prev) => prev.filter((n) => !(n.empleado_id === empleadoId && n.fecha === fecha)))
    startTransition(async () => {
      await quitarNoSaleAction(fecha, empleadoId)
    })
  }

  // ─── Cálculos derivados ─────────────────────────────────────────────────
  const camionesFiltrados = useMemo(
    () => camiones.filter((c) => filtroSucursal === "__all__" || c.sucursal === filtroSucursal),
    [camiones, filtroSucursal],
  )

  const empleadosNoAsignados = useMemo(() => {
    const asignadosHoy = new Set<string>()
    for (const a of asignaciones) {
      if (a.fecha !== fecha) continue
      if (a.chofer_empleado_id) asignadosHoy.add(a.chofer_empleado_id)
      if (a.ayudante_empleado_id) asignadosHoy.add(a.ayudante_empleado_id)
    }
    const noSaleIds = new Set(noSale.filter((n) => n.fecha === fecha).map((n) => n.empleado_id))
    return empleados.filter((e) => !asignadosHoy.has(e.id) && !noSaleIds.has(e.id))
  }, [empleados, asignaciones, noSale, fecha])

  const noSaleHoy = useMemo(
    () => noSale.filter((n) => n.fecha === fecha),
    [noSale, fecha],
  )

  // ¿Hoy ya tiene asignaciones cargadas?
  const tieneAsignacionesHoy = useMemo(
    () => asignaciones.some((a) => a.fecha === fecha),
    [asignaciones, fecha],
  )

  // Sobrecargas equivalentes acumuladas en el mes corriente, por empleado.
  // Equivalente = SC completa + 1/2 SC * 0.5 + 1/4 SC * 0.25.
  // Solo cuenta asignaciones operativas. Acumula todo el mes (no solo hasta hoy).
  const scMesPorEmpleado = useMemo(() => {
    const mes = fecha.slice(0, 7) // "YYYY-MM"
    const m = new Map<string, number>()
    function add(id: string, v: number) {
      m.set(id, (m.get(id) ?? 0) + v)
    }
    for (const a of asignaciones) {
      if (a.estado !== "operativo") continue
      if (!a.fecha.startsWith(mes)) continue
      const sc =
        (a.sobrecarga_completa ?? 0) +
        (a.media_sobrecarga ?? 0) * 0.5 +
        (a.cuarto_sobrecarga ?? 0) * 0.25
      if (sc === 0) continue
      if (a.chofer_empleado_id) add(a.chofer_empleado_id, sc)
      if (a.ayudante_empleado_id) add(a.ayudante_empleado_id, sc)
    }
    return m
  }, [asignaciones, fecha])

  // Última fecha previa con asignaciones (para sugerir aplicar como base)
  const ultimaFechaConDatos = useMemo(() => {
    const fechas = Array.from(
      new Set(asignaciones.filter((a) => a.fecha < fecha).map((a) => a.fecha)),
    ).sort()
    return fechas[fechas.length - 1] ?? null
  }, [asignaciones, fecha])

  function aplicarUltimaCarga() {
    if (!ultimaFechaConDatos) return
    const previas = asignaciones.filter((a) => a.fecha === ultimaFechaConDatos)
    setAsignaciones((prev) => [
      ...prev.filter((a) => a.fecha !== fecha),  // limpia las de hoy si había algo
      ...previas.map((a) => ({
        ...a,
        fecha,
        // las métricas se resetean (son del día)
        clientes: null,
        sobrecarga_completa: null,
        media_sobrecarga: null,
        cuarto_sobrecarga: null,
        bultos: null,
        observacion: "",
      })),
    ])
  }

  // ─── Exportar resumen por empleado a XLSX ──────────────────────────────
  // Acumula sobre el rango [desde, hasta] inclusive.
  // Solo cuenta asignaciones con estado "operativo".
  async function exportarResumen(desde: string, hasta: string) {
    type Acum = {
      sobrecCompleta: number
      mediaSobrec: number
      cuartoSobrec: number
      bultos: number
      salidasChofer: number
      salidasAyudante: number
    }
    const por = new Map<string, Acum>()
    function bump(id: string): Acum {
      let a = por.get(id)
      if (!a) {
        a = {
          sobrecCompleta: 0, mediaSobrec: 0, cuartoSobrec: 0, bultos: 0,
          salidasChofer: 0, salidasAyudante: 0,
        }
        por.set(id, a)
      }
      return a
    }
    for (const a of asignaciones) {
      if (a.estado !== "operativo") continue
      if (a.fecha < desde || a.fecha > hasta) continue
      if (a.chofer_empleado_id) {
        const acc = bump(a.chofer_empleado_id)
        acc.sobrecCompleta += a.sobrecarga_completa ?? 0
        acc.mediaSobrec += a.media_sobrecarga ?? 0
        acc.cuartoSobrec += a.cuarto_sobrecarga ?? 0
        acc.bultos += a.bultos ?? 0
        acc.salidasChofer += 1
      }
      if (a.ayudante_empleado_id) {
        const acc = bump(a.ayudante_empleado_id)
        acc.sobrecCompleta += a.sobrecarga_completa ?? 0
        acc.mediaSobrec += a.media_sobrecarga ?? 0
        acc.cuartoSobrec += a.cuarto_sobrecarga ?? 0
        acc.bultos += a.bultos ?? 0
        acc.salidasAyudante += 1
      }
    }
    const header = [
      "Legajo",
      "Nombre",
      "Sucursal",
      "Salidas como chofer",
      "Salidas como ayudante",
      "Sobrec. Completas",
      "1/2 Sobrec.",
      "1/4 Sobrec.",
      "Bultos",
    ]
    const rows: (string | number)[][] = [header]
    // Ordenar por sucursal, puesto, nombre para que el archivo salga prolijo
    const ordenados = [...empleadosState].sort((a, b) => {
      if (a.sucursal !== b.sucursal) return a.sucursal.localeCompare(b.sucursal)
      if (a.puesto !== b.puesto) return a.puesto.localeCompare(b.puesto)
      return a.nombre.localeCompare(b.nombre)
    })
    for (const e of ordenados) {
      const a = por.get(e.id)
      if (!a) continue
      rows.push([
        e.legajo ?? "",
        e.nombre,
        e.sucursal,
        a.salidasChofer,
        a.salidasAyudante,
        a.sobrecCompleta,
        a.mediaSobrec,
        a.cuartoSobrec,
        a.bultos,
      ])
    }
    if (rows.length === 1) {
      alert(`Sin asignaciones operativas entre ${desde} y ${hasta}.`)
      return
    }
    const XLSX = await import("xlsx")
    const ws = XLSX.utils.aoa_to_sheet(rows)
    // Anchos sugeridos (Legajo, Nombre, Sucursal, Sal. chofer, Sal. ayudante, Sobrec, 1/2, 1/4, Bultos)
    ws["!cols"] = [
      { wch: 8 },  { wch: 28 }, { wch: 10 }, { wch: 20 }, { wch: 22 },
      { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
    ]
    const wb = XLSX.utils.book_new()
    const sheetName = `Resumen ${desde} a ${hasta}`.slice(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, `resumen-orden-salida_${desde}_a_${hasta}.xlsx`)
  }

  // ─── Auto-balance de choferes Iguazú ────────────────────────────────────
  // Reglas:
  //  · Ciclo histórico = del día 24 del mes anterior al día 23 del mes actual
  //    (o sea: el último 24 ≤ fecha hasta la víspera de fecha). Salvo override.
  //  · El titular de un camión, si no maneja hoy, va como AYUDANTE de su camión.
  //  · El titular de un camión, si le toca manejar, va a SU camión (no a otro).
  //  · Los no-titulares manejan los camiones de los titulares que descansan.
  function autoBalanceIguazu() {
    const choferesIgu = empleados.filter((e) => e.sucursal === "IGUAZU" && e.puesto === "Chofer")
    if (choferesIgu.length === 0) return
    const camionesIgu = camiones.filter((c) => c.sucursal === "IGUAZU")
    const noSaleIds = new Set(noSale.filter((n) => n.fecha === fecha).map((n) => n.empleado_id))
    const disponibles = choferesIgu.filter((c) => !noSaleIds.has(c.id))

    // Inicio del ciclo operativo (24 → 23)
    const inicioCiclo = inicioCicloOperativo(fecha)

    // Días-chofer en el ciclo (sin contar la fecha actual)
    const diasChofer = new Map<string, number>()
    for (const a of asignaciones) {
      if (a.fecha < inicioCiclo || a.fecha >= fecha) continue
      if (a.chofer_empleado_id && disponibles.some((c) => c.id === a.chofer_empleado_id)) {
        diasChofer.set(a.chofer_empleado_id, (diasChofer.get(a.chofer_empleado_id) ?? 0) + 1)
      }
    }

    // Camiones que van a salir (operativos / sin_asignar)
    const camOperativos = camionesIgu.filter((c) => {
      const asig = asignaciones.find((a) => a.camion_id === c.id && a.fecha === fecha)
      const estado = asig?.estado ?? "sin_asignar"
      return estado !== "fuera_servicio" && estado !== "taller" && estado !== "sin_carga"
    })

    // Ranking por (menos días → más días, nombre alfabético)
    const ranking = [...disponibles].sort((a, b) => {
      const da = diasChofer.get(a.id) ?? 0
      const db = diasChofer.get(b.id) ?? 0
      if (da !== db) return da - db
      return a.nombre.localeCompare(b.nombre)
    })

    const debenManejar = new Set(ranking.slice(0, camOperativos.length).map((c) => c.id))
    const descansan    = ranking.slice(camOperativos.length)  // titulares→a su camión, no-titulares→ayudante donde haga falta

    // Pool extra: ayudantes propios de Iguazú disponibles
    const ayudantesIguDisp = empleados.filter(
      (e) => e.sucursal === "IGUAZU" && e.puesto === "Ayudante" && !noSaleIds.has(e.id),
    )

    // Asignación con respeto al titular
    const noTitularesQueManejan = ranking.filter(
      (c) => debenManejar.has(c.id) && !esTitular(c, camionesIgu),
    )
    const ayudantesPool: EmpleadoMock[] = [
      ...descansan.filter((c) => !esTitular(c, camionesIgu)),
      ...ayudantesIguDisp,
    ]
    let idxNoTitular = 0
    let idxAyud = 0

    const nuevas: AsignacionCamionDiario[] = camOperativos.map((cam) => {
      const previa = asignaciones.find((a) => a.camion_id === cam.id && a.fecha === fecha)
      const titular = disponibles.find((c) => c.camion_fijo === cam.patente) ?? null

      let chofer_id: string | null = null
      let ayudante_id: string | null = null

      if (titular && debenManejar.has(titular.id)) {
        // Titular maneja su camión
        chofer_id = titular.id
        ayudante_id = ayudantesPool[idxAyud++]?.id ?? null
      } else if (titular) {
        // Titular descansa → es ayudante de su camión
        ayudante_id = titular.id
        chofer_id = noTitularesQueManejan[idxNoTitular++]?.id ?? null
      } else {
        // Camión sin titular → cualquiera
        chofer_id = noTitularesQueManejan[idxNoTitular++]?.id ?? ranking.find((c) => debenManejar.has(c.id))?.id ?? null
        ayudante_id = ayudantesPool[idxAyud++]?.id ?? null
      }

      return {
        camion_id: cam.id,
        fecha,
        chofer_empleado_id: chofer_id,
        ayudante_empleado_id: ayudante_id,
        zona: previa?.zona ?? "IGUAZU",
        estado: "operativo",
        observacion: previa?.observacion ?? "",
        clientes: previa?.clientes ?? null,
        sobrecarga_completa: previa?.sobrecarga_completa ?? null,
        media_sobrecarga: previa?.media_sobrecarga ?? null,
        cuarto_sobrecarga: previa?.cuarto_sobrecarga ?? null,
        bultos: previa?.bultos ?? null,
      }
    })

    setAsignaciones((prev) => {
      const otros = prev.filter(
        (a) => !(a.fecha === fecha && camionesIgu.some((c) => c.id === a.camion_id)),
      )
      const noOperativos = prev.filter(
        (a) =>
          a.fecha === fecha &&
          camionesIgu.some((c) => c.id === a.camion_id) &&
          !camOperativos.some((c) => c.id === a.camion_id),
      )
      return [...otros, ...nuevas, ...noOperativos]
    })
  }

  // Resumen
  const totalCamiones = camionesFiltrados.length
  const camOperativos = camionesFiltrados.filter(
    (c) => getAsignacion(c.id).estado === "operativo",
  ).length
  const camSinAsignar = camionesFiltrados.filter(
    (c) => getAsignacion(c.id).estado === "sin_asignar",
  ).length
  const camFueraServicio = camionesFiltrados.filter((c) => {
    const e = getAsignacion(c.id).estado
    return e === "fuera_servicio" || e === "taller"
  }).length
  const camSinCarga = camionesFiltrados.filter(
    (c) => getAsignacion(c.id).estado === "sin_carga",
  ).length

  // ─── Split de camiones en dos paneles ───────────────────────────────────
  const camionesQueSalen = useMemo(
    () => camionesFiltrados.filter((c) => camionSaleHoy(getAsignacion(c.id).estado)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camionesFiltrados, asignaciones, fecha],
  )
  const camionesQueNoSalen = useMemo(
    () => camionesFiltrados.filter((c) => !camionSaleHoy(getAsignacion(c.id).estado)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camionesFiltrados, asignaciones, fecha],
  )

  // ─── CRUD del padrón de personal ────────────────────────────────────────
  function toggleEmpleadoActivo(id: string) {
    let nuevoEstado = true
    setEmpleadosState((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e
        nuevoEstado = e.activo === false ? true : false
        return { ...e, activo: nuevoEstado }
      }),
    )
    startTransition(async () => {
      await setEmpleadoActivoAction(id, nuevoEstado)
    })
  }

  function agregarEmpleado(input: {
    nombre: string
    sucursal: Sucursal
    puesto: PuestoOperativo
    legajo: number | null
    camion_fijo: string | null
  }) {
    const nombre = input.nombre.trim().toUpperCase()
    if (!nombre) return
    // Optimistic: insertamos con id temporal; el server action devuelve el id real
    // y reemplazamos. Si falla, lo sacamos.
    const tempId = `tmp-${Date.now()}`
    setEmpleadosState((prev) => [
      ...prev,
      {
        id: tempId,
        legajo: input.legajo,
        numero: null,
        nombre,
        sucursal: input.sucursal,
        puesto: input.puesto,
        camion_fijo: input.camion_fijo,
        activo: true,
      },
    ])
    startTransition(async () => {
      const res = await agregarEmpleadoAction({
        nombre,
        sucursal: input.sucursal,
        puesto: input.puesto,
        legajo: input.legajo,
      })
      if ("data" in res) {
        setEmpleadosState((prev) =>
          prev.map((e) => (e.id === tempId ? { ...e, id: res.data.id } : e)),
        )
      } else {
        setEmpleadosState((prev) => prev.filter((e) => e.id !== tempId))
      }
    })
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Vista empleado
  // ════════════════════════════════════════════════════════════════════════
  if (vista === "empleado") {
    const emp = empById.get(empleadoSimulado)
    let estadoEmpleado: { tipo: "asigna"; asignacion: AsignacionCamionDiario; rol: "chofer" | "ayudante" } |
                       { tipo: "no_sale"; registro: PersonalNoSaleDiario } |
                       { tipo: "sin_definir" } = { tipo: "sin_definir" }

    if (emp) {
      const asig = asignaciones.find(
        (a) =>
          a.fecha === fecha &&
          (a.chofer_empleado_id === emp.id || a.ayudante_empleado_id === emp.id),
      )
      if (asig) {
        estadoEmpleado = {
          tipo: "asigna",
          asignacion: asig,
          rol: asig.chofer_empleado_id === emp.id ? "chofer" : "ayudante",
        }
      } else {
        const reg = getNoSale(emp.id)
        if (reg) estadoEmpleado = { tipo: "no_sale", registro: reg }
      }
    }

    return (
      <div className="p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Mi orden del día</h1>
          <button
            type="button"
            onClick={() => setVista("admin")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Volver a vista admin
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <select
            value={empleadoSimulado}
            onChange={(e) => setEmpleadoSimulado(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
          >
            {empleados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.legajo !== null ? `${e.legajo} — ` : ""}{e.nombre}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">
            (En producción: cada empleado solo ve su propio registro.)
          </span>
        </div>

        {emp ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">{fecha}</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{emp.nombre}</h2>
            <p className="text-sm text-slate-500">
              {emp.legajo !== null ? `Legajo ${emp.legajo} · ` : ""}
              {emp.sucursal} · {emp.puesto}
            </p>

            <div className="mt-5">
              {estadoEmpleado.tipo === "asigna" && (
                <>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Hoy salís en</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-700">
                    {camionById.get(estadoEmpleado.asignacion.camion_id)?.patente ?? "—"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Como <span className="font-medium capitalize">{estadoEmpleado.rol}</span>
                    {estadoEmpleado.asignacion.zona ? ` · Zona: ${estadoEmpleado.asignacion.zona}` : ""}
                  </p>
                  {estadoEmpleado.asignacion.observacion && (
                    <p className="mt-2 text-sm italic text-slate-500">
                      Obs.: {estadoEmpleado.asignacion.observacion}
                    </p>
                  )}
                </>
              )}
              {estadoEmpleado.tipo === "no_sale" && (
                <>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Estado del día</p>
                  {(() => {
                    const meta = MOTIVOS_NO_SALE.find((m) => m.value === estadoEmpleado.registro.motivo)!
                    return (
                      <span
                        className={`mt-2 inline-flex rounded-full px-3 py-1 text-base font-medium ${meta.bg} ${meta.color}`}
                      >
                        {meta.label}
                      </span>
                    )
                  })()}
                  {estadoEmpleado.registro.detalle && (
                    <p className="mt-3 text-sm text-slate-700">{estadoEmpleado.registro.detalle}</p>
                  )}
                </>
              )}
              {estadoEmpleado.tipo === "sin_definir" && (
                <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-base text-slate-500">
                  Sin asignación cargada
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No hay datos.</p>
        )}
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Vista admin
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Orden de salida diario</h1>
          <p className="text-sm text-slate-500">
            Asigná chofer, ayudante y zona a cada camión. Abajo se cargan los que no salen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={autoBalanceIguazu}
            className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-sm font-medium text-cyan-700 hover:bg-cyan-100"
            title="Asigna los 5 camiones de Iguazú a los choferes con menos días, y a los titulares restantes los pone como ayudantes"
          >
            Auto-asignar Iguazú
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportAbierto((v) => !v)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Exportar resumen ▾
            </button>
            {exportAbierto && (
              <div
                role="dialog"
                aria-label="Exportar resumen por rango"
                className="absolute right-0 z-20 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
              >
                <p className="mb-2 text-xs font-medium text-slate-600">Rango a exportar</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">Desde</span>
                    <input
                      type="date"
                      value={exportDesde}
                      max={exportHasta}
                      onChange={(e) => setExportDesde(e.target.value)}
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">Hasta</span>
                    <input
                      type="date"
                      value={exportHasta}
                      min={exportDesde}
                      onChange={(e) => setExportHasta(e.target.value)}
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                    />
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setExportDesde(inicioCicloOperativo(fecha))
                      setExportHasta(fecha)
                    }}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
                    title="Ciclo operativo: del último 24 hasta hoy"
                  >
                    Ciclo actual
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(fecha + "T00:00:00")
                      d.setDate(1)
                      setExportDesde(d.toISOString().slice(0, 10))
                      setExportHasta(fecha)
                    }}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
                  >
                    Mes corriente
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const fechas = asignaciones.map((a) => a.fecha)
                      if (fechas.length === 0) return
                      setExportDesde(fechas.reduce((min, f) => (f < min ? f : min)))
                      setExportHasta(fechas.reduce((max, f) => (f > max ? f : max)))
                    }}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
                  >
                    Todo el histórico
                  </button>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setExportAbierto(false)}
                    className="rounded-lg px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await exportarResumen(exportDesde, exportHasta)
                      setExportAbierto(false)
                    }}
                    disabled={!exportDesde || !exportHasta || exportDesde > exportHasta}
                    className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Exportar .xlsx
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setPlanillaAbierta(true)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            title="Genera la planilla apaisada para imprimir y completar a mano"
          >
            Planilla imprimible
          </button>
          <button
            type="button"
            onClick={() => setVista("empleado")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Vista empleado
          </button>
        </div>
      </div>

      {/* Banner: aplicar última carga si hoy está vacío */}
      {!tieneAsignacionesHoy && ultimaFechaConDatos && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900">
            <span className="font-medium">No hay asignaciones cargadas para {fecha}.</span>{" "}
            Última carga disponible: <span className="font-mono">{ultimaFechaConDatos}</span>
          </p>
          <button
            type="button"
            onClick={aplicarUltimaCarga}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            Aplicar última carga como base
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Fecha</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Sucursal</span>
          <select
            value={filtroSucursal}
            onChange={(e) => setFiltroSucursal(e.target.value as Sucursal | "__all__")}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
          >
            <option value="__all__">Todas</option>
            <option value="ELDORADO">ELDORADO</option>
            <option value="IGUAZU">IGUAZU</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Chip color="bg-emerald-100 text-emerald-700" label="Operativos" count={camOperativos} />
          <Chip color="bg-slate-100 text-slate-500" label="Sin asignar" count={camSinAsignar} />
          <Chip color="bg-cyan-100 text-cyan-700" label="Sin carga" count={camSinCarga} />
          <Chip color="bg-rose-100 text-rose-700" label="Fuera/Taller" count={camFueraServicio} />
          <Chip color="bg-blue-100 text-blue-700" label="Total" count={totalCamiones} />
        </div>
      </div>

      {/* ═══ Maestro de personal (colapsable) ═══ */}
      <MaestroPersonalPanel
        abierto={maestroAbierto}
        onToggle={() => setMaestroAbierto((v) => !v)}
        empleados={empleadosState}
        camiones={camiones}
        onToggleActivo={toggleEmpleadoActivo}
        onAgregar={agregarEmpleado}
      />

      {/* ═══ Panel A — Camiones que SALEN a calle ═══ */}
      <CamionesPanel
        titulo="Salen a calle"
        descripcion="Operativos y los que aún no tienen tripulación asignada."
        accentBorde="border-emerald-300"
        accentFondo="bg-emerald-50/60"
        accentBadge="bg-emerald-100 text-emerald-700"
        camiones={camionesQueSalen}
        renderRow={(cam) => {
                const asig = getAsignacion(cam.id)
                const meta = ESTADOS_CAMION.find((e) => e.value === asig.estado)!

                // Personal disponible para esta fila (no en otro camión y no en "no sale")
                const noSaleIds = new Set(noSale.filter((n) => n.fecha === fecha).map((n) => n.empleado_id))
                const ocupadosHoy = new Set<string>()
                for (const a of asignaciones) {
                  if (a.fecha !== fecha || a.camion_id === cam.id) continue
                  if (a.chofer_empleado_id) ocupadosHoy.add(a.chofer_empleado_id)
                  if (a.ayudante_empleado_id) ocupadosHoy.add(a.ayudante_empleado_id)
                }
                // Para chofer y ayudante mostramos a TODOS los disponibles
                // (sin restricción de puesto ni sucursal — sólo no duplicar
                // entre camiones y excluir a los que están en "no sale").
                const disponibles = empleados.filter(
                  (e) => !ocupadosHoy.has(e.id) && !noSaleIds.has(e.id),
                )
                const choferesDisp = disponibles
                const ayudantesDisp = disponibles

                return (
                  <tr key={cam.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-3 py-2 font-mono font-semibold text-slate-900">
                      {cam.patente}
                      {cam.numero !== null && (
                        <div className="text-xs font-normal text-slate-400">N° {cam.numero}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{cam.sucursal}</td>

                    {/* CHOFER */}
                    <td className="px-3 py-2">
                      <select
                        value={asig.chofer_empleado_id ?? ""}
                        onChange={(e) =>
                          updateAsignacion(cam.id, {
                            chofer_empleado_id: e.target.value || null,
                            estado: e.target.value && asig.estado === "sin_asignar" ? "operativo" : asig.estado,
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                      >
                        <option value="">— Sin asignar —</option>
                        {asig.chofer_empleado_id && !choferesDisp.find((c) => c.id === asig.chofer_empleado_id) && (
                          <option value={asig.chofer_empleado_id}>
                            {empById.get(asig.chofer_empleado_id)?.nombre ?? "?"} (asignado)
                          </option>
                        )}
                        {choferesDisp.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}{c.camion_fijo === cam.patente ? " ★" : ""}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* AYUDANTE */}
                    <td className="px-3 py-2">
                      <select
                        value={asig.ayudante_empleado_id ?? ""}
                        onChange={(e) =>
                          updateAsignacion(cam.id, { ayudante_empleado_id: e.target.value || null })
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                      >
                        <option value="">— Sin asignar —</option>
                        {asig.ayudante_empleado_id && !ayudantesDisp.find((a) => a.id === asig.ayudante_empleado_id) && (
                          <option value={asig.ayudante_empleado_id}>
                            {empById.get(asig.ayudante_empleado_id)?.nombre ?? "?"} (asignado)
                          </option>
                        )}
                        {ayudantesDisp.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nombre}{a.camion_fijo === cam.patente ? " ★" : ""}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* SC MES (acumulado del mes para chofer y ayudante) */}
                    <td className="px-3 py-2 text-xs tabular-nums text-slate-600">
                      <ScMesCell
                        choferId={asig.chofer_empleado_id}
                        ayudanteId={asig.ayudante_empleado_id}
                        scPorEmpleado={scMesPorEmpleado}
                      />
                    </td>

                    {/* ZONA */}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        list="zonas-sugeridas"
                        value={asig.zona}
                        onChange={(e) => updateAsignacion(cam.id, { zona: e.target.value })}
                        placeholder="Zona…"
                        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                      />
                    </td>

                    {/* ESTADO */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${meta.bg}`} aria-hidden />
                        <select
                          value={asig.estado}
                          onChange={(e) => {
                            const nuevo = e.target.value as EstadoCamion
                            const limpiar = nuevo !== "operativo"
                            updateAsignacion(cam.id, {
                              estado: nuevo,
                              ...(limpiar
                                ? { chofer_empleado_id: null, ayudante_empleado_id: null }
                                : {}),
                            })
                          }}
                          className={`w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm ${meta.color}`}
                        >
                          {ESTADOS_CAMION.map((es) => (
                            <option key={es.value} value={es.value}>{es.label}</option>
                          ))}
                        </select>
                      </div>
                    </td>

                    {/* MÉTRICAS NUMÉRICAS */}
                    <NumCell
                      value={asig.clientes}
                      onChange={(v) => updateAsignacion(cam.id, { clientes: v })}
                    />
                    <NumCell
                      value={asig.sobrecarga_completa}
                      onChange={(v) => updateAsignacion(cam.id, { sobrecarga_completa: v })}
                    />
                    <NumCell
                      value={asig.media_sobrecarga}
                      onChange={(v) => updateAsignacion(cam.id, { media_sobrecarga: v })}
                    />
                    <NumCell
                      value={asig.cuarto_sobrecarga}
                      onChange={(v) => updateAsignacion(cam.id, { cuarto_sobrecarga: v })}
                    />
                    <NumCell
                      value={asig.bultos}
                      onChange={(v) => updateAsignacion(cam.id, { bultos: v })}
                    />

                    {/* OBSERVACIÓN */}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={asig.observacion}
                        onChange={(e) => updateAsignacion(cam.id, { observacion: e.target.value })}
                        placeholder="Observación…"
                        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                      />
                    </td>
                  </tr>
                )
        }}
      />

      {/* ═══ Panel B — Camiones que NO salen a calle ═══ */}
      <CamionesPanel
        titulo="No salen"
        descripcion="Sin carga, fuera de servicio o en taller. No se les asigna tripulación."
        accentBorde="border-rose-300"
        accentFondo="bg-rose-50/40"
        accentBadge="bg-rose-100 text-rose-700"
        camiones={camionesQueNoSalen}
        renderRow={(cam) => {
          const asig = getAsignacion(cam.id)
          const meta = ESTADOS_CAMION.find((e) => e.value === asig.estado)!
          return (
            <tr key={cam.id} className="border-t border-slate-100 hover:bg-slate-50/50">
              <td className="px-3 py-2 font-mono font-semibold text-slate-900">
                {cam.patente}
                {cam.numero !== null && (
                  <div className="text-xs font-normal text-slate-400">N° {cam.numero}</div>
                )}
              </td>
              <td className="px-3 py-2 text-slate-600">{cam.sucursal}</td>
              <td className="px-3 py-2 text-slate-400 italic">— sin chofer —</td>
              <td className="px-3 py-2 text-slate-400 italic">— sin ayudante —</td>
              <td className="px-3 py-2 text-slate-300">—</td>
              <td className="px-3 py-2 text-slate-400">—</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${meta.bg}`} aria-hidden />
                  <select
                    value={asig.estado}
                    onChange={(e) => {
                      const nuevo = e.target.value as EstadoCamion
                      const limpiar = nuevo !== "operativo"
                      updateAsignacion(cam.id, {
                        estado: nuevo,
                        ...(limpiar
                          ? { chofer_empleado_id: null, ayudante_empleado_id: null }
                          : {}),
                      })
                    }}
                    className={`w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm ${meta.color}`}
                  >
                    {ESTADOS_CAMION.map((es) => (
                      <option key={es.value} value={es.value}>{es.label}</option>
                    ))}
                  </select>
                </div>
              </td>
              <td className="px-3 py-2 text-right text-slate-300">—</td>
              <td className="px-3 py-2 text-right text-slate-300">—</td>
              <td className="px-3 py-2 text-right text-slate-300">—</td>
              <td className="px-3 py-2 text-right text-slate-300">—</td>
              <td className="px-3 py-2 text-right text-slate-300">—</td>
              <td className="px-3 py-2">
                <input
                  type="text"
                  value={asig.observacion}
                  onChange={(e) => updateAsignacion(cam.id, { observacion: e.target.value })}
                  placeholder="Motivo / detalle…"
                  className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                />
              </td>
            </tr>
          )
        }}
      />
      <p className="-mt-3 text-xs text-slate-400">★ = el chofer tiene este camión como fijo en FORMACIÓN</p>

      {/* ═══ Personal que no sale ═══ */}
      <section>
        <h2 className="mb-2 text-lg font-semibold text-slate-900">
          Personal que no sale <span className="text-sm font-normal text-slate-500">({noSaleHoy.length})</span>
        </h2>

        {noSaleHoy.length === 0 ? (
          <p className="text-sm text-slate-500 italic">Sin personal cargado en esta lista.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 w-20">Legajo</th>
                  <th className="px-3 py-2">Empleado</th>
                  <th className="px-3 py-2 w-28">Sucursal</th>
                  <th className="px-3 py-2 w-24">Puesto</th>
                  <th className="px-3 py-2 w-44">Motivo</th>
                  <th className="px-3 py-2">Detalle</th>
                  <th className="px-3 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {noSaleHoy.map((n) => {
                  const emp = empById.get(n.empleado_id)
                  if (!emp) return null
                  const meta = MOTIVOS_NO_SALE.find((m) => m.value === n.motivo)!
                  return (
                    <tr key={n.empleado_id} className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className="px-3 py-2 font-mono text-slate-600">{emp.legajo ?? "—"}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{emp.nombre}</td>
                      <td className="px-3 py-2 text-slate-600">{emp.sucursal}</td>
                      <td className="px-3 py-2 text-slate-600">{emp.puesto}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${meta.bg}`} aria-hidden />
                          <select
                            value={n.motivo}
                            onChange={(e) => setMotivoNoSale(emp.id, e.target.value as MotivoNoSale, n.detalle)}
                            className={`w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm ${meta.color}`}
                          >
                            {MOTIVOS_NO_SALE.map((m) => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={n.detalle}
                          onChange={(e) => updateDetalleNoSale(emp.id, e.target.value)}
                          placeholder="Hasta qué fecha, motivo…"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => quitarNoSale(emp.id)}
                          className="rounded-md px-2 py-0.5 text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                          title="Quitar de la lista"
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Selector para bajar a alguien */}
        {empleadosNoAsignados.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <span className="text-xs font-medium text-slate-600">
              Bajar a la lista “No sale”:
            </span>
            <select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return
                setMotivoNoSale(e.target.value, "ausente")
                e.target.value = ""
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
            >
              <option value="">— Elegir empleado disponible ({empleadosNoAsignados.length}) —</option>
              {empleadosNoAsignados.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre} ({e.sucursal} · {e.puesto})
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-400">
              Se baja con motivo “Ausente” por defecto — luego cambialo en la fila.
            </span>
          </div>
        )}
      </section>

      {/* Footer prototipo */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Prototipo — los cambios viven solo en memoria. Para producción falta conectar
          server actions + tablas en Supabase.
        </p>
        <button
          type="button"
          disabled
          className="cursor-not-allowed rounded-lg bg-slate-900/40 px-4 py-2 text-sm font-medium text-white"
          title="Acción aún no conectada"
        >
          Guardar (deshabilitado en test)
        </button>
      </div>

      {/* Datalist global de zonas */}
      <datalist id="zonas-sugeridas">
        {ZONAS_SUGERIDAS.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>

      {/* Modal: Planilla imprimible */}
      {planillaAbierta && (
        <PlanillaImprimibleModal
          fecha={fecha}
          camiones={camiones}
          asignaciones={asignaciones.filter((a) => a.fecha === fecha)}
          empById={empById}
          onClose={() => setPlanillaAbierta(false)}
        />
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────
function Chip({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${color}`}>
      <span className="font-semibold">{count}</span>
      <span>{label}</span>
    </span>
  )
}

// Devuelve el inicio del ciclo operativo (último día 24 ≤ fecha).
// Ej: fecha = "2026-04-30" → "2026-04-24"; fecha = "2026-04-15" → "2026-03-24".
function inicioCicloOperativo(fecha: string): string {
  const d = new Date(fecha + "T00:00:00")
  const day = d.getDate()
  if (day >= 24) {
    d.setDate(24)
  } else {
    d.setMonth(d.getMonth() - 1)
    d.setDate(24)
  }
  return d.toISOString().slice(0, 10)
}

function esTitular(emp: EmpleadoMock, camiones: CamionMock[]): boolean {
  return Boolean(emp.camion_fijo && camiones.some((c) => c.patente === emp.camion_fijo))
}

// ─── Planilla imprimible (modal a pantalla completa, apaisada) ──────────────
// Replica el layout de la hoja "PLANILLA DIST" del Sheet maestro
// (`Mercosur distribuciones/Entrega/Screenshot_3.png`).
function PlanillaImprimibleModal({
  fecha,
  camiones,
  asignaciones,
  empById,
  onClose,
}: {
  fecha: string
  camiones: CamionMock[]
  asignaciones: AsignacionCamionDiario[]
  empById: Map<string, EmpleadoMock>
  onClose: () => void
}) {
  const fechaTxt = formatearFecha(fecha)
  const diaSemana = nombreDiaSemana(fecha)
  const mesAbrev = nombreMesAbrev(fecha)

  // Camiones del día con tripulación, ordenados por sucursal (Eldorado primero)
  // y luego por número/patente como en el Sheet original.
  const camionesEnRuta = camiones
    .filter((c) => {
      const asig = asignaciones.find((a) => a.camion_id === c.id)
      return Boolean(asig?.chofer_empleado_id || asig?.ayudante_empleado_id)
    })
    .sort((a, b) => {
      if (a.sucursal !== b.sucursal) return a.sucursal === "ELDORADO" ? -1 : 1
      const na = a.numero ?? Number.POSITIVE_INFINITY
      const nb = b.numero ?? Number.POSITIVE_INFINITY
      if (na !== nb) return na - nb
      return a.patente.localeCompare(b.patente)
    })

  // Portal hacia <body> para que el CSS de print pueda esconder todo el resto del DOM.
  const [montado, setMontado] = useState(false)
  useEffect(() => { setMontado(true) }, [])
  if (!montado) return null

  const contenido = (
    <div
      className="planilla-modal fixed inset-0 z-40 overflow-auto bg-slate-100/95"
      role="dialog"
      aria-modal="true"
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: A4 landscape; margin: 8mm; }

              html, body {
                background: white !important;
                height: auto !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
              }
              /* El modal vive como hijo directo de <body> (portal) — escondemos los hermanos. */
              body > *:not(.planilla-modal) { display: none !important; }

              .planilla-modal {
                position: static !important;
                inset: auto !important;
                background: white !important;
                overflow: visible !important;
                height: auto !important;
                min-height: 0 !important;
                display: block !important;
              }
              .planilla-no-print { display: none !important; }

              .planilla-wrap { padding: 0 !important; margin: 0 !important; max-width: none !important; }
              .planilla-page {
                width: auto !important;
                max-height: 194mm !important;
                padding: 0 !important;
                margin: 0 !important;
                box-shadow: none !important;
                border: none !important;
                page-break-after: avoid !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                overflow: hidden !important;
              }
              .planilla-page * { page-break-inside: avoid !important; break-inside: avoid !important; }
            }
          `,
        }}
      />

      {/* Toolbar (oculta al imprimir) */}
      <div className="planilla-no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2 shadow-sm">
        <div className="text-sm text-slate-700">
          <span className="font-semibold">Planilla imprimible</span>{" "}
          <span className="text-slate-500">— {fechaTxt} ({diaSemana})</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Imprimir / Guardar PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* Una sola hoja apaisada */}
      <div className="planilla-wrap mx-auto p-4 print:p-0">
        <section
          className="planilla-page bg-white text-slate-900 shadow-sm"
          style={{ width: "297mm", padding: "8mm" }}
        >
          {/* ═══ Encabezado superior — totales por sucursal a completar a mano ═══ */}
          <table className="w-full border-collapse text-[11px]">
            <tbody>
              <tr>
                <td className="px-2 py-0.5 text-right italic">FECHA ENTREGA</td>
                <td className="border border-slate-500 px-2 py-0.5 text-center font-semibold">
                  {fechaTxt}
                </td>
                <td className="px-2 py-0.5 text-center">{diaSemana}</td>
                <td className="px-2 py-0.5"></td>
                <td className="px-2 py-0.5"></td>
                <td className="px-2 py-0.5"></td>
                <td className="px-2 py-0.5"></td>
                <td className="px-2 py-0.5"></td>
              </tr>
              <tr className="bg-slate-100 text-center font-semibold">
                <td className="px-2 py-0.5 italic">{mesAbrev}</td>
                <td className="border border-slate-500 px-2 py-0.5">BULTOS</td>
                <td className="border border-slate-500 px-2 py-0.5">CLIENTES</td>
                <td className="border border-slate-500 px-2 py-0.5">BRAHMA</td>
                <td className="border border-slate-500 px-2 py-0.5">LOTE</td>
                <td className="border border-slate-500 px-2 py-0.5">PREVENTA</td>
                <td className="border border-slate-500 px-2 py-0.5">INICIO</td>
                <td className="border border-slate-500 px-2 py-0.5">FIN</td>
              </tr>
              <tr>
                <td className="border border-slate-500 bg-slate-100 px-2 py-1 text-center font-semibold">IGUAZU</td>
                <td className="border border-slate-500 px-2 py-1">&nbsp;</td>
                <td className="border border-slate-500 px-2 py-1">&nbsp;</td>
                <td className="border border-slate-500 px-2 py-1">&nbsp;</td>
                <td className="border border-slate-500 px-2 py-1">&nbsp;</td>
                <td className="border border-slate-500 px-2 py-1">&nbsp;</td>
                <td className="border border-slate-500 px-2 py-1">&nbsp;</td>
                <td className="border border-slate-500 px-2 py-1">&nbsp;</td>
              </tr>
              <tr>
                <td className="border border-slate-500 bg-slate-100 px-2 py-1 text-center font-semibold">ELDORADO</td>
                <td className="border border-slate-500 px-2 py-1">&nbsp;</td>
                <td className="border border-slate-500 px-2 py-1">&nbsp;</td>
                <td className="border border-slate-500 px-2 py-1">&nbsp;</td>
                <td className="border border-slate-500 px-2 py-1">&nbsp;</td>
                <td className="border border-slate-500 px-2 py-1">&nbsp;</td>
                <td className="border border-slate-500 px-2 py-1">&nbsp;</td>
                <td className="border border-slate-500 px-2 py-1">&nbsp;</td>
              </tr>
            </tbody>
          </table>

          {/* Separador */}
          <div className="h-3" />

          {/* ═══ Tabla principal de camiones ═══ */}
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-100 text-center font-bold italic">
                <th className="border border-slate-500 px-2 py-0.5">CAPACIDAD<br />KG</th>
                <th className="border border-slate-500 px-2 py-0.5">SUCURSAL</th>
                <th className="border border-slate-500 px-2 py-0.5">CAMIÓN</th>
                <th className="border border-slate-500 px-2 py-0.5">CHOFER</th>
                <th className="border border-slate-500 px-2 py-0.5">ACUM<br />REC</th>
                <th className="border border-slate-500 px-2 py-0.5">FX</th>
                <th className="border border-slate-500 px-2 py-0.5">BULTOS</th>
                <th className="border border-slate-500 px-2 py-0.5">CLIENTES</th>
                <th className="border border-slate-500 px-2 py-0.5">ZONA</th>
              </tr>
            </thead>
            <tbody>
              {camionesEnRuta.length === 0 && (
                <tr>
                  <td colSpan={9} className="border border-slate-500 px-2 py-3 text-center text-sm italic text-slate-400">
                    No hay camiones con tripulación asignada para {fechaTxt}.
                  </td>
                </tr>
              )}
              {camionesEnRuta.map((cam) => {
                const asig = asignaciones.find((a) => a.camion_id === cam.id)
                const chofer = asig?.chofer_empleado_id
                  ? empById.get(asig.chofer_empleado_id)?.nombre ?? ""
                  : ""
                const zona = asig?.zona ?? ""
                return (
                  <tr key={cam.id}>
                    <td className="border border-slate-500 px-2 py-1 text-right tabular-nums">
                      {cam.capacidad ?? ""}
                    </td>
                    <td className="border border-slate-500 px-2 py-1 italic">{cam.sucursal}</td>
                    <td className="border border-slate-500 px-2 py-1 font-mono font-semibold">{cam.patente}</td>
                    <td className="border border-slate-500 px-2 py-1">{chofer}</td>
                    <td className="border border-slate-500 px-2 py-1 text-center tabular-nums">0</td>
                    <td className="border border-slate-500 px-2 py-1 text-center tabular-nums">
                      {cam.numero ?? ""}
                    </td>
                    <td className="border border-slate-500 px-2 py-1">&nbsp;</td>
                    <td className="border border-slate-500 px-2 py-1">&nbsp;</td>
                    <td className="border border-slate-500 px-2 py-1 text-center">{zona}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )

  return createPortal(contenido, document.body)
}

function formatearFecha(iso: string): string {
  // YYYY-MM-DD → DD/MM/YYYY
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}
function nombreDiaSemana(iso: string): string {
  const d = new Date(iso + "T12:00:00")
  return d.toLocaleDateString("es-AR", { weekday: "long" })
}
function nombreMesAbrev(iso: string): string {
  // "2026-05-02" → "may"
  const d = new Date(iso + "T12:00:00")
  return d.toLocaleDateString("es-AR", { month: "short" }).replace(".", "").toLowerCase()
}
// Renderiza el acumulado de SC del mes para el chofer y/o ayudante de una fila.
function ScMesCell({
  choferId,
  ayudanteId,
  scPorEmpleado,
}: {
  choferId: string | null
  ayudanteId: string | null
  scPorEmpleado: Map<string, number>
}) {
  function fmt(v: number | undefined) {
    if (v === undefined || v === 0) return "0"
    // 1 decimal, sin .0 al final
    const s = v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
    return s
  }
  const c = choferId ? scPorEmpleado.get(choferId) : undefined
  const a = ayudanteId ? scPorEmpleado.get(ayudanteId) : undefined
  if (!choferId && !ayudanteId) return <span className="text-slate-300">—</span>
  return (
    <div className="flex flex-col leading-tight">
      {choferId && (
        <span>
          <span className="text-slate-400">C</span>{" "}
          <span className="font-medium text-slate-700">{fmt(c)}</span>
        </span>
      )}
      {ayudanteId && (
        <span>
          <span className="text-slate-400">A</span>{" "}
          <span className="font-medium text-slate-700">{fmt(a)}</span>
        </span>
      )}
    </div>
  )
}

function NumCell({
  value,
  onChange,
}: {
  value: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <td className="px-2 py-2">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === "") return onChange(null)
          const n = parseInt(raw, 10)
          onChange(Number.isFinite(n) ? n : null)
        }}
        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-right text-sm tabular-nums"
        placeholder="—"
      />
    </td>
  )
}

// ─── Panel de camiones (se reutiliza para "salen" y "no salen") ─────────────
function CamionesPanel({
  titulo,
  descripcion,
  accentBorde,
  accentFondo,
  accentBadge,
  camiones,
  renderRow,
}: {
  titulo: string
  descripcion: string
  accentBorde: string
  accentFondo: string
  accentBadge: string
  camiones: CamionMock[]
  renderRow: (cam: CamionMock) => React.ReactNode
}) {
  return (
    <section className={`rounded-2xl border-2 ${accentBorde} ${accentFondo} p-3 md:p-4`}>
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${accentBadge}`}>
          {camiones.length}
        </span>
        <p className="ml-1 text-xs text-slate-500">{descripcion}</p>
      </header>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1400px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 w-28">Camión</th>
              <th className="px-3 py-2 w-24">Sucursal</th>
              <th className="px-3 py-2 min-w-[180px]">Chofer</th>
              <th className="px-3 py-2 min-w-[180px]">Ayudante</th>
              <th className="px-3 py-2 w-24" title="SC equivalentes acumuladas en el mes corriente para chofer (C) y ayudante (A)">
                SC mes
              </th>
              <th className="px-3 py-2 w-48">Zona</th>
              <th className="px-3 py-2 w-40">Estado</th>
              <th className="px-3 py-2 w-20 text-right">Clientes</th>
              <th className="px-3 py-2 w-20 text-right">Sobrec.</th>
              <th className="px-3 py-2 w-20 text-right">1/2 SC</th>
              <th className="px-3 py-2 w-20 text-right">1/4 SC</th>
              <th className="px-3 py-2 w-20 text-right">Bultos</th>
              <th className="px-3 py-2 w-44">Observación</th>
            </tr>
          </thead>
          <tbody>
            {camiones.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-3 py-6 text-center text-sm text-slate-400 italic">
                  Sin camiones en este grupo.
                </td>
              </tr>
            ) : (
              camiones.map((c) => renderRow(c))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── Maestro de personal (alta + anular/reactivar) ──────────────────────────
function MaestroPersonalPanel({
  abierto,
  onToggle,
  empleados,
  camiones,
  onToggleActivo,
  onAgregar,
}: {
  abierto: boolean
  onToggle: () => void
  empleados: EmpleadoMock[]
  camiones: CamionMock[]
  onToggleActivo: (id: string) => void
  onAgregar: (input: {
    nombre: string
    sucursal: Sucursal
    puesto: PuestoOperativo
    legajo: number | null
    camion_fijo: string | null
  }) => void
}) {
  const [nombre, setNombre] = useState("")
  const [sucursal, setSucursal] = useState<Sucursal>("ELDORADO")
  const [puesto, setPuesto] = useState<PuestoOperativo>("Ayudante")
  const [legajo, setLegajo] = useState<string>("")
  const [camionFijo, setCamionFijo] = useState<string>("")
  const [filtroNombre, setFiltroNombre] = useState("")

  const totales = useMemo(() => {
    const activos = empleados.filter((e) => e.activo !== false).length
    return { total: empleados.length, activos, inactivos: empleados.length - activos }
  }, [empleados])

  const filtrados = useMemo(() => {
    const q = filtroNombre.trim().toUpperCase()
    return empleados
      .filter((e) => !q || e.nombre.includes(q))
      .sort((a, b) => {
        if (a.sucursal !== b.sucursal) return a.sucursal.localeCompare(b.sucursal)
        if (a.puesto !== b.puesto) return a.puesto.localeCompare(b.puesto)
        return a.nombre.localeCompare(b.nombre)
      })
  }, [empleados, filtroNombre])

  function handleAgregar() {
    if (!nombre.trim()) return
    onAgregar({
      nombre,
      sucursal,
      puesto,
      legajo: legajo ? parseInt(legajo, 10) : null,
      camion_fijo: camionFijo || null,
    })
    setNombre("")
    setLegajo("")
    setCamionFijo("")
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div>
          <h2 className="text-base font-semibold text-slate-900">Maestro de personal</h2>
          <p className="text-xs text-slate-500">
            Agregá nuevos choferes/ayudantes o anulá quienes ya no estén operativos.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">{totales.activos} activos</span>
          {totales.inactivos > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">{totales.inactivos} anulados</span>
          )}
          <span className="text-slate-400">{abierto ? "▲" : "▼"}</span>
        </div>
      </button>

      {abierto && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          {/* Form de alta */}
          <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 md:grid-cols-6">
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="APELLIDO Y NOMBRE"
              className="md:col-span-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm uppercase"
            />
            <select
              value={sucursal}
              onChange={(e) => setSucursal(e.target.value as Sucursal)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="ELDORADO">ELDORADO</option>
              <option value="IGUAZU">IGUAZU</option>
            </select>
            <select
              value={puesto}
              onChange={(e) => setPuesto(e.target.value as PuestoOperativo)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="Chofer">Chofer</option>
              <option value="Ayudante">Ayudante</option>
              <option value="Depósito">Depósito</option>
            </select>
            <input
              type="number"
              inputMode="numeric"
              value={legajo}
              onChange={(e) => setLegajo(e.target.value)}
              placeholder="Legajo (opc.)"
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
            <select
              value={camionFijo}
              onChange={(e) => setCamionFijo(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              title="Camión fijo (solo aplica a choferes)"
            >
              <option value="">Sin camión fijo</option>
              {camiones
                .filter((c) => c.sucursal === sucursal)
                .map((c) => (
                  <option key={c.id} value={c.patente}>{c.patente}</option>
                ))}
            </select>
            <button
              type="button"
              onClick={handleAgregar}
              disabled={!nombre.trim()}
              className="md:col-span-6 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Agregar al padrón
            </button>
          </div>

          {/* Lista con toggle activo/anulado */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={filtroNombre}
              onChange={(e) => setFiltroNombre(e.target.value)}
              placeholder="Buscar nombre…"
              className="w-64 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
            <span className="text-xs text-slate-500">{filtrados.length} de {empleados.length}</span>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2 w-24">Sucursal</th>
                  <th className="px-3 py-2 w-24">Puesto</th>
                  <th className="px-3 py-2 w-20">Legajo</th>
                  <th className="px-3 py-2 w-28">Camión fijo</th>
                  <th className="px-3 py-2 w-24 text-right">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((e) => {
                  const inactivo = e.activo === false
                  return (
                    <tr
                      key={e.id}
                      className={`border-t border-slate-100 ${inactivo ? "bg-slate-50 text-slate-400" : ""}`}
                    >
                      <td className={`px-3 py-1.5 font-medium ${inactivo ? "line-through" : "text-slate-900"}`}>
                        {e.nombre}
                      </td>
                      <td className="px-3 py-1.5">{e.sucursal}</td>
                      <td className="px-3 py-1.5">{e.puesto}</td>
                      <td className="px-3 py-1.5 font-mono">{e.legajo ?? "—"}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{e.camion_fijo ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => onToggleActivo(e.id)}
                          className={
                            inactivo
                              ? "rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                              : "rounded-md border border-rose-200 bg-white px-2 py-0.5 text-xs text-rose-600 hover:bg-rose-50"
                          }
                        >
                          {inactivo ? "Reactivar" : "Anular"}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            Anular saca al empleado de los selectores y del balance, pero conserva sus referencias en el histórico.
          </p>
        </div>
      )}
    </section>
  )
}
