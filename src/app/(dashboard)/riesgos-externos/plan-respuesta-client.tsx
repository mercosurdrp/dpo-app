"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Ambulance,
  ArrowDown,
  ArrowLeft,
  Ban,
  Biohazard,
  Bomb,
  Bug,
  CalendarClock,
  ClipboardList,
  CloudLightning,
  Flame,
  HeartPulse,
  Lock,
  Megaphone,
  Pencil,
  Phone,
  Plus,
  PlugZap,
  Printer,
  QrCode,
  ServerCrash,
  Star,
  TrafficCone,
  Trash2,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
  WifiOff,
  ZapOff,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { eliminarEscalamiento } from "@/actions/riesgos-externos-plan"
import { EscalamientoFormDialog } from "@/components/riesgos-externos/escalamiento-form-dialog"
import { PlanRespuestaFormDialog } from "@/components/riesgos-externos/plan-respuesta-form-dialog"
import {
  CRITICIDAD_RIESGO_EXTERNO_LABELS,
  TIPO_RIESGO_EXTERNO_LABELS,
  formatMinutosDisparo,
  type CriticidadRiesgoExterno,
  type RiesgoExternoConfig,
  type RiesgoExternoContacto,
  type RiesgoExternoEscalamiento,
  type TipoRiesgoExterno,
} from "@/types/database"

interface Props {
  escalamiento: RiesgoExternoEscalamiento[]
  config: RiesgoExternoConfig[]
  contactos: RiesgoExternoContacto[]
  /** Riesgo al que apunta el QR del pizarrón: entra filtrado en esa ficha. */
  riesgoInicial?: string
  puedeEditar: boolean
}

const TODOS_LOS_RIESGOS = Object.keys(
  TIPO_RIESGO_EXTERNO_LABELS,
) as TipoRiesgoExterno[]

/** Símbolo de cada riesgo: la tarjeta se reconoce sin leer el nombre. */
const ICONO_RIESGO: Record<TipoRiesgoExterno, LucideIcon> = {
  corte_de_luz: ZapOff,
  falla_en_generador: PlugZap,
  corte_de_sistema: ServerCrash,
  corte_de_internet: WifiOff,
  corte_de_ruta_o_acceso: TrafficCone,
  incendio: Flame,
  paro_sindical: Megaphone,
  emergencia_medica_interna: HeartPulse,
  emergencia_medica_externa: Ambulance,
  temporal: CloudLightning,
  robo_warehouse: Warehouse,
  robo_distribucion: Truck,
  saqueos: Users,
  clausura_del_predio: Ban,
  no_apertura_de_caja: Lock,
  amenaza_de_bomba: Bomb,
  pandemia: Biohazard,
  invasion_de_plagas: Bug,
}

function CriticidadBadge({ criticidad }: { criticidad: CriticidadRiesgoExterno }) {
  const cls =
    criticidad === "critico"
      ? "border-red-200 bg-red-100 text-red-700 hover:bg-red-100"
      : criticidad === "alto"
        ? "border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100"
        : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100"
  return <Badge className={cls}>{CRITICIDAD_RIESGO_EXTERNO_LABELS[criticidad]}</Badge>
}

/** Un bloque de R2.2.2: nivel de servicio, mano de obra o ajuste de pronóstico. */
function BloquePlan({
  icon,
  titulo,
  texto,
}: {
  icon: React.ReactNode
  titulo: string
  texto: string | null
}) {
  const borrador = !!texto && texto.startsWith("BORRADOR")
  return (
    <div className="rounded-md border bg-slate-50/70 px-3 py-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
        {icon}
        {titulo}
        {borrador && (
          <Badge className="border-amber-200 bg-amber-100 text-[10px] text-amber-800 hover:bg-amber-100">
            borrador
          </Badge>
        )}
      </p>
      {texto ? (
        <p className="mt-1 text-sm text-slate-700">{texto}</p>
      ) : (
        <p className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-amber-700">
          <AlertTriangle className="size-3.5" />
          Sin definir
        </p>
      )}
    </div>
  )
}

export function PlanRespuestaClient({
  escalamiento,
  config,
  contactos,
  riesgoInicial,
  puedeEditar,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [filtroTipo, setFiltroTipo] = useState<string>(
    riesgoInicial && riesgoInicial in TIPO_RIESGO_EXTERNO_LABELS
      ? riesgoInicial
      : "todos",
  )
  const [soloIncompletos, setSoloIncompletos] = useState(false)

  const [openNivel, setOpenNivel] = useState(false)
  const [nivelEdit, setNivelEdit] = useState<RiesgoExternoEscalamiento | null>(null)
  const [tipoNivel, setTipoNivel] = useState<TipoRiesgoExterno>("corte_de_luz")
  const [nivelSugerido, setNivelSugerido] = useState(1)

  const [openPlan, setOpenPlan] = useState(false)
  const [tipoPlan, setTipoPlan] = useState<TipoRiesgoExterno>("corte_de_luz")

  const configPorTipo = useMemo(() => {
    const map = new Map<TipoRiesgoExterno, RiesgoExternoConfig>()
    for (const c of config) map.set(c.tipo_riesgo, c)
    return map
  }, [config])

  const contactosPorTipo = useMemo(() => {
    const map = new Map<TipoRiesgoExterno, RiesgoExternoContacto[]>()
    for (const c of contactos) {
      const arr = map.get(c.tipo_riesgo) ?? []
      arr.push(c)
      map.set(c.tipo_riesgo, arr)
    }
    return map
  }, [contactos])

  const fichas = useMemo(() => {
    return TODOS_LOS_RIESGOS.map((tipo) => {
      const conf = configPorTipo.get(tipo) ?? null
      const niveles = escalamiento
        .filter((e) => e.tipo_riesgo === tipo)
        .sort((a, b) => a.nivel - b.nivel)
      const completo =
        niveles.length > 0 &&
        !!conf?.plan_nivel_servicio &&
        !!conf?.plan_mano_obra &&
        !!conf?.plan_ajuste_pronostico
      return {
        tipo,
        conf,
        niveles,
        completo,
        prioritario: conf?.prioritario ?? false,
        criticidad: conf?.criticidad ?? null,
      }
    })
      .filter((f) => (filtroTipo === "todos" ? true : f.tipo === filtroTipo))
      .filter((f) => (soloIncompletos ? !f.completo : true))
      .sort((a, b) => Number(b.prioritario) - Number(a.prioritario))
  }, [escalamiento, configPorTipo, filtroTipo, soloIncompletos])

  const stats = useMemo(() => {
    const conEscalamiento = new Set(escalamiento.map((e) => e.tipo_riesgo)).size
    const completos = TODOS_LOS_RIESGOS.filter((tipo) => {
      const conf = configPorTipo.get(tipo)
      return (
        escalamiento.some((e) => e.tipo_riesgo === tipo) &&
        !!conf?.plan_nivel_servicio &&
        !!conf?.plan_mano_obra &&
        !!conf?.plan_ajuste_pronostico
      )
    }).length
    const borradores = config.filter((c) =>
      [c.plan_nivel_servicio, c.plan_mano_obra, c.plan_ajuste_pronostico].some(
        (t) => t?.startsWith("BORRADOR"),
      ),
    ).length
    return {
      total: TODOS_LOS_RIESGOS.length,
      conEscalamiento,
      completos,
      borradores,
    }
  }, [escalamiento, config, configPorTipo])

  function refrescar() {
    router.refresh()
  }

  function handleEliminarNivel(nivel: RiesgoExternoEscalamiento) {
    if (
      !confirm(
        `¿Eliminar el nivel ${nivel.nivel} de ${TIPO_RIESGO_EXTERNO_LABELS[nivel.tipo_riesgo]}?`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await eliminarEscalamiento(nivel.id)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      refrescar()
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3">
        <p className="text-sm text-blue-900">
          <strong>Plan de respuesta a riesgos externos</strong> — DPO
          Planeamiento 2.2, requisito R2.2.2: matriz de escalamiento con
          contactos responsables, más nivel de servicio, mano de obra y
          procedimientos de ajuste de pronóstico.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
          <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">
            Riesgos
          </p>
          <p className="text-xl font-bold">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-700">
          <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">
            Con escalamiento
          </p>
          <p className="text-xl font-bold">
            {stats.conEscalamiento}/{stats.total}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
          <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">
            Plan completo
          </p>
          <p className="text-xl font-bold">
            {stats.completos}/{stats.total}
          </p>
        </div>
        <div
          className={`rounded-lg border px-3 py-2 ${
            stats.borradores > 0
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">
            Con borradores
          </p>
          <p className="text-xl font-bold">{stats.borradores}</p>
        </div>
      </div>

      {/* Selector de riesgo: es lo primero que ve quien entra por el QR del
          pizarrón, así que son tarjetas con símbolo y no un desplegable. */}
      {filtroTipo === "todos" ? (
        <div className="rounded-lg border bg-white p-3">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Elegí el riesgo
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {TODOS_LOS_RIESGOS.map((tipo) => {
              const conf = configPorTipo.get(tipo)
              const Icono = ICONO_RIESGO[tipo]
              const esPrioritario = conf?.prioritario ?? false
              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setFiltroTipo(tipo)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition hover:border-slate-400 hover:bg-slate-50 ${
                    esPrioritario
                      ? "border-red-300 bg-red-50/50 ring-1 ring-red-100"
                      : "border-slate-200"
                  }`}
                >
                  <span className="relative">
                    <Icono
                      className={`size-7 ${
                        conf?.criticidad === "critico"
                          ? "text-red-600"
                          : conf?.criticidad === "alto"
                            ? "text-amber-600"
                            : "text-slate-500"
                      }`}
                    />
                    {esPrioritario && (
                      <Star className="absolute -right-2 -top-1 size-3 fill-red-600 text-red-600" />
                    )}
                  </span>
                  <span className="text-xs font-medium leading-tight text-slate-800">
                    {TIPO_RIESGO_EXTERNO_LABELS[tipo]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setFiltroTipo("todos")}>
          <ArrowLeft className="mr-2 size-4" />
          Ver todos los riesgos
        </Button>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={soloIncompletos ? "default" : "outline"}
          onClick={() => setSoloIncompletos((v) => !v)}
        >
          <AlertTriangle className="mr-2 size-4" />
          Sólo incompletos
        </Button>

        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            title="Cartel de una hoja con el QR general, para pegar en el pizarrón"
            render={
              <a
                href="/api/riesgos-externos/qr-pdf"
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <QrCode className="mr-2 size-4" />
            Cartel QR
          </Button>
          <Button
            variant="outline"
            title="Resumen compacto de todos los riesgos"
            render={
              <a
                href="/api/riesgos-externos/plan-respuesta-pdf"
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <Printer className="mr-2 size-4" />
            Resumen
          </Button>
          <Button
            title="Una hoja por riesgo, con su QR"
            render={
              <a
                href="/api/riesgos-externos/fichas-pdf"
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <Printer className="mr-2 size-4" />
            Fichas por riesgo
          </Button>
        </div>
      </div>

      {fichas.length === 0 && (
        <p className="rounded-lg border bg-white py-10 text-center text-sm text-muted-foreground">
          No hay riesgos con los filtros aplicados.
        </p>
      )}

      {/* Fichas por riesgo */}
      <div className="space-y-3">
        {fichas.map(({ tipo, conf, niveles, completo, prioritario, criticidad }) => {
          const contactosDelRiesgo = contactosPorTipo.get(tipo) ?? []
          return (
            <div
              key={tipo}
              className={`rounded-lg border bg-white ${
                prioritario ? "border-red-300 ring-1 ring-red-200" : ""
              }`}
            >
              <div
                className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 ${
                  prioritario ? "bg-red-50" : "bg-slate-50"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {prioritario && (
                    <Star className="size-4 fill-red-600 text-red-600" />
                  )}
                  <h3 className="font-semibold text-slate-900">
                    {TIPO_RIESGO_EXTERNO_LABELS[tipo]}
                  </h3>
                  {criticidad && <CriticidadBadge criticidad={criticidad} />}
                  {!completo && (
                    <Badge className="gap-1 border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
                      <AlertTriangle className="size-3.5" />
                      Incompleto
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    title="Imprimir sólo esta ficha"
                    render={
                      <a
                        href={`/api/riesgos-externos/fichas-pdf?riesgo=${tipo}`}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                  >
                    <Printer className="size-3.5" />
                  </Button>
                  {puedeEditar && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTipoPlan(tipo)
                        setOpenPlan(true)
                      }}
                    >
                      <ClipboardList className="mr-2 size-3.5" />
                      Editar plan
                    </Button>
                  )}
                  {puedeEditar && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTipoNivel(tipo)
                        setNivelEdit(null)
                        setNivelSugerido(
                          niveles.length
                            ? Math.max(...niveles.map((n) => n.nivel)) + 1
                            : 1,
                        )
                        setOpenNivel(true)
                      }}
                    >
                      <Plus className="mr-2 size-3.5" />
                      Nivel
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-3 px-4 py-3">
                {/* Escalamiento */}
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Matriz de escalamiento
                  </p>
                  {niveles.length === 0 ? (
                    <p className="inline-flex items-center gap-1 text-sm font-medium text-amber-700">
                      <AlertTriangle className="size-3.5" />
                      Sin escalamiento definido
                    </p>
                  ) : (
                    <ol className="space-y-1.5">
                      {niveles.map((n, i) => (
                        <li key={n.id} className="relative">
                          {i > 0 && (
                            <ArrowDown className="absolute -top-1.5 left-3 size-3 text-slate-300" />
                          )}
                          <div className="flex flex-wrap items-start gap-2 rounded-md border bg-white px-3 py-2">
                            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
                              {n.nivel}
                            </span>
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-slate-900">
                                  {n.rol}
                                </span>
                                <Badge className="gap-1 border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
                                  <CalendarClock className="size-3" />
                                  {formatMinutosDisparo(n.minutos_disparo)}
                                </Badge>
                                {n.suplente && (
                                  <span className="text-xs text-muted-foreground">
                                    supl. {n.suplente}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-slate-700">
                                {n.disparador}
                              </p>
                              {n.acciones && (
                                <p className="text-xs text-muted-foreground">
                                  {n.acciones}
                                </p>
                              )}
                            </div>
                            {puedeEditar && (
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setTipoNivel(tipo)
                                    setNivelEdit(n)
                                    setNivelSugerido(n.nivel)
                                    setOpenNivel(true)
                                  }}
                                  title="Editar nivel"
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEliminarNivel(n)}
                                  title="Eliminar nivel"
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                {/* Los tres temas de R2.2.2 */}
                <div className="grid gap-2 lg:grid-cols-3">
                  <BloquePlan
                    icon={<TrendingUp className="size-3.5" />}
                    titulo="Nivel de servicio"
                    texto={conf?.plan_nivel_servicio ?? null}
                  />
                  <BloquePlan
                    icon={<Users className="size-3.5" />}
                    titulo="Mano de obra"
                    texto={conf?.plan_mano_obra ?? null}
                  />
                  <BloquePlan
                    icon={<ClipboardList className="size-3.5" />}
                    titulo="Ajuste de pronóstico"
                    texto={conf?.plan_ajuste_pronostico ?? null}
                  />
                </div>

                {/* Teléfonos del riesgo, para no tener que cambiar de solapa */}
                {contactosDelRiesgo.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      A quién llamar
                    </span>
                    {contactosDelRiesgo.map((c) => (
                      <span key={c.id} className="text-xs">
                        {c.telefono ? (
                          <a
                            href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`}
                            className="inline-flex items-center gap-1 font-mono text-blue-700 hover:underline"
                          >
                            <Phone className="size-3" />
                            {c.telefono}
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <AlertTriangle className="size-3" />
                            s/tel.
                          </span>
                        )}{" "}
                        <span className="text-muted-foreground">{c.nombre}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {puedeEditar && (
        <>
          <EscalamientoFormDialog
            open={openNivel}
            onOpenChange={setOpenNivel}
            tipoRiesgo={tipoNivel}
            nivel={nivelEdit}
            nivelSugerido={nivelSugerido}
            onSaved={refrescar}
          />
          <PlanRespuestaFormDialog
            open={openPlan}
            onOpenChange={setOpenPlan}
            tipoRiesgo={tipoPlan}
            config={configPorTipo.get(tipoPlan) ?? null}
            onSaved={refrescar}
          />
        </>
      )}
    </div>
  )
}
