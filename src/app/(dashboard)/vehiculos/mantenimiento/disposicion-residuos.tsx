"use client"

// Disposición de residuos de mantenimiento — punto 1.4 del pilar Flota.
//
// El punto pide tres cosas (R1.4.1 legalidad del operador, R1.4.2 seguimiento
// ELECTRÓNICO con fecha / material / proveedor + certificado de descarte con el
// número de fuego en las cubiertas, R1.4.3 cero incidentes ambientales) y la
// auditoría H1 2026 lo puntuó 0 con un pedido textual: "generar seguimiento
// histórico para cuando comiencen". Esta pantalla es ese seguimiento.
//
// 🚨 Los dos flujos NO son el mismo y por eso van separados:
//
//  CUBIERTAS — la goma es nuestra hasta que se la lleva la recicladora. Se
//  cuenta sobre el padrón (bandeja "Para desechar" → retiro), cada casco sale
//  con su número de fuego y el retiro se imputa a un certificado que ampara una
//  CANTIDAD (Kumen: 300 unidades), no un viaje. De ahí que lo que importe sea
//  el saldo del certificado y no cuántos papeles hay.
//
//  ACEITE Y FILTROS — nunca entran al depósito: el taller que hace el service
//  retiene el aceite drenado y los filtros reemplazados, y es él quien los
//  dispone. Entonces el seguimiento no es de stock sino DE SERVICES: por cada
//  service en taller externo tiene que existir el registro del residuo que
//  generó, con el taller como proveedor de eliminación y la constancia que lo
//  ampara. Un service sin registro es un hueco en el punto, y por eso la tabla
//  lista también los que NO tienen fila.
//
// Las bajas de cubiertas por TRANSFERENCIA (las 18 que se fueron a Misiones)
// no son residuo y se muestran aparte a propósito: el auditor ve 26 bajas en el
// padrón y hay que poder explicarle por qué sólo una parte tiene certificado.

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangle,
  Check,
  Droplets,
  FileText,
  Filter as FilterIcon,
  Hourglass,
  Image as ImageIcon,
  Recycle,
  Send,
  Truck,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

import {
  marcarConstanciaSolicitada,
  quitarConstanciaTramite,
  setResiduoCantidad,
  subirConstanciaTramite,
  type Residuo,
} from "@/actions/mantenimiento-vehiculos"
import { getEstadoDpoFlota, type PuntoEstadoDpo } from "@/actions/estado-dpo-flota"
import type { MantenimientoRealizado } from "@/types/database"
import type { Neumatico } from "@/lib/vehiculos/neumaticos-tipos"

import { DpoSeccionCinta } from "./_components/dpo-badge"
import { KpiCard } from "./_components/kpi-card"

const fmtFecha = (f: string | null | undefined) =>
  f ? f.slice(0, 10).split("-").reverse().join("/") : "—"

const fmtNum = (n: number | null | undefined, dec = 0) =>
  n == null ? "—" : new Intl.NumberFormat("es-AR", { maximumFractionDigits: dec }).format(n)

const MATERIAL_LABEL: Record<string, string> = {
  neumaticos: "Cubiertas",
  aceite: "Aceite usado",
  filtros: "Filtros",
  baterias: "Baterías",
  chatarra: "Chatarra",
  otros: "Otros",
}

/** Número de OT que menciona la descripción del residuo ("OT 1786 · AF664NY — …"). */
function otDeResiduo(r: Residuo): string | null {
  const m = (r.descripcion ?? "").match(/\bOT\s*(\d+)/i)
  return m ? m[1] : null
}

/**
 * Cómo lo resuelve Misiones Distribuciones, para contrastar.
 *
 * Sale del SOP de eliminación de residuos de esa operación (Herminio Agüero,
 * SDF, rev. 6). No se adopta —describe otros proveedores y un registro en papel
 * (remito interno) en vez de uno electrónico— pero sirve de contraste: en lo
 * que coincide, confirma que el circuito es el correcto; en lo que difiere,
 * muestra qué nos falta y qué tenemos de más.
 */
const COMPARACION_MISIONES: Array<{
  tema: string
  misiones: string
  nosotros: string
  /** true = acá estamos mejor o igual; false = ellos tienen algo que falta acá. */
  favor: boolean
}> = [
  {
    tema: "Cubiertas — operador",
    misiones:
      "Fontana Neumáticos (Posadas), con resolución del Ministerio de Ecología de Misiones, más un acuerdo con la Municipalidad de Oberá.",
    nosotros:
      "Kumen Co S.A., con certificado de disposición final vigente. Pica el caucho en tornos y lo manda a Rosario para el reciclado final.",
    favor: true,
  },
  {
    tema: "Cubiertas — conteo",
    misiones:
      "Conteo manual de los cascos acopiados en un contenedor con techo antes de cada retiro.",
    nosotros:
      "La bandeja «Para desechar» del padrón de neumáticos: la cantidad no se estima, sale del padrón y cada casco va con su número de fuego.",
    favor: true,
  },
  {
    tema: "Cubiertas — frecuencia",
    misiones: "El recolector pasa una vez por semana por el CD.",
    nosotros:
      "No hay frecuencia pactada: se llama cuando hay tanda. Tres retiros en 2026.",
    favor: false,
  },
  {
    tema: "Aceite y filtros",
    misiones:
      "Peniel SRL (autoelevadores) retira aceite y filtros; los camiones MB los dispone el taller oficial. La evidencia es la factura del servicio.",
    nosotros:
      "Lo mismo, con los talleres de acá: LitorMac en autoelevadores, Los Sauces y Luval en camiones. La evidencia es el registro por OT más el manifiesto de residuos especiales.",
    favor: true,
  },
  {
    tema: "Registro",
    misiones:
      "Remito interno de salida en papel, verificado por el SDF antes de autorizar el despacho.",
    nosotros:
      "Registro electrónico con fecha, material y proveedor por cada eliminación — que es lo que pide textualmente el R1.4.2.",
    favor: true,
  },
  {
    tema: "Residuos varios",
    misiones:
      "Volquete que retira la municipalidad dos veces por semana, sin documentación.",
    nosotros: "Igual: recolector municipal, sin documentación y sin registro.",
    favor: true,
  },
]

interface Props {
  residuos: Residuo[]
  neumaticos: Neumatico[]
  mantenimientos: MantenimientoRealizado[]
  puedeEditar: boolean
  onChanged: () => void
}

export function DisposicionResiduos({
  residuos,
  neumaticos,
  mantenimientos,
  puedeEditar,
  onChanged,
}: Props) {
  const anioActual = String(new Date().getFullYear())
  const [anio, setAnio] = useState(anioActual)
  const [punto, setPunto] = useState<PuntoEstadoDpo | null>(null)
  const [auditoria, setAuditoria] = useState<string | null>(null)
  const [fechaAuditoria, setFechaAuditoria] = useState<string | null>(null)

  // Lo que dijo la última auditoría se LEE de la auditoría cerrada, no se
  // escribe acá: es el único modo de poder mostrar la mejora entre ciclos.
  useEffect(() => {
    let vivo = true
    getEstadoDpoFlota().then((r) => {
      if (!vivo || !("data" in r)) return
      setPunto(r.data.puntos.find((p) => p.numero === "1.4") ?? null)
      setAuditoria(r.data.auditoria?.nombre ?? null)
      const f = r.data.auditoria?.fechaInicio
      setFechaAuditoria(
        f
          ? new Date(`${f.slice(0, 10)}T12:00:00`).toLocaleDateString("es-AR", {
              month: "long",
              year: "numeric",
            })
          : null
      )
    })
    return () => {
      vivo = false
    }
  }, [])

  // ===== Certificados: un papel por CANTIDAD, compartido por varias filas =====
  const certificados = useMemo(() => {
    const porPath = new Map<string, Residuo[]>()
    for (const r of residuos) {
      if (!r.certificado_path) continue
      const lista = porPath.get(r.certificado_path)
      if (lista) lista.push(r)
      else porPath.set(r.certificado_path, [r])
    }
    return [...porPath.entries()].map(([path, filas]) => {
      const ampara = filas.reduce<number | null>(
        (max, f) => (f.certificado_unidades != null ? Math.max(max ?? 0, f.certificado_unidades) : max),
        null
      )
      // La fila "cabecera" es el retiro que declara la cantidad del papel (el
      // manifiesto de 200 kg); las cubiertas no tienen cabecera, cada retiro
      // descuenta del total.
      const cabecera = filas.find(
        (f) => ampara != null && f.cantidad != null && f.cantidad === ampara
      )
      const consumen = filas.filter((f) => f !== cabecera)
      // 🚨 Las cubiertas se cuentan en CASCOS (es lo que lleva número de fuego)
      // pero su certificado declara PESO: el de Kumen dice "cantidad retirada,
      // transportada y tratada: 325 kg". Las dos magnitudes no se restan, así
      // que acá no hay saldo — se muestra lo que dice el papel al lado de lo
      // que efectivamente salió. Sólo se calcula saldo cuando el certificado y
      // los retiros hablan en la misma unidad.
      const esCubiertas = filas.some((f) => f.material === "neumaticos")
      const unidadCert = esCubiertas ? "kg" : ((cabecera ?? filas[0]).unidad ?? null)
      const mismaUnidad =
        !esCubiertas && consumen.every((f) => (f.unidad ?? null) === unidadCert)
      const retirado = consumen.reduce((a, f) => a + (f.cantidad ?? 0), 0)
      return {
        path,
        url: filas.find((f) => f.certificado_url)?.certificado_url ?? null,
        operador: (cabecera ?? filas[0]).proveedor,
        materiales: [...new Set(filas.map((f) => f.material))],
        fecha: filas.reduce((min, f) => (f.fecha < min ? f.fecha : min), filas[0].fecha),
        ampara,
        unidad: unidadCert,
        esCubiertas,
        /** Saldo sólo si el papel y los retiros están en la misma unidad. */
        saldo: mismaUnidad && ampara != null ? ampara - retirado : null,
        retirado,
        amparados: consumen.length,
      }
    })
  }, [residuos])

  // ===== Cubiertas =====
  const retiros = useMemo(
    () =>
      residuos
        .filter((r) => r.material === "neumaticos")
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [residuos]
  )
  const cubiertasRetiradas = retiros.reduce((a, r) => a + (r.cantidad ?? 0), 0)
  const enBandeja = neumaticos.filter((n) => n.estado === "para_desecho").length
  // Bajas que NO son residuo: salieron del padrón por transferencia, no por
  // desecho. Hay que poder nombrarlas porque el auditor ve el total de bajas.
  const bajasNoResiduo = neumaticos.filter(
    (n) => n.estado === "baja" && !n.residuo_id
  ).length

  // ===== Aceite y filtros por service en taller externo =====
  const residuoPorOt = useMemo(() => {
    const m = new Map<string, { aceite?: Residuo; filtros?: Residuo }>()
    for (const r of residuos) {
      if (r.material !== "aceite" && r.material !== "filtros") continue
      const ot = otDeResiduo(r)
      if (!ot) continue
      const e = m.get(ot) ?? {}
      if (r.material === "aceite") e.aceite = r
      else e.filtros = r
      m.set(ot, e)
    }
    return m
  }, [residuos])

  const anios = useMemo(() => {
    const s = new Set(
      mantenimientos.filter((m) => m.es_service_general).map((m) => m.fecha.slice(0, 4))
    )
    s.add(anioActual)
    return [...s].sort().reverse()
  }, [mantenimientos, anioActual])

  const services = useMemo(
    () =>
      mantenimientos
        .filter((m) => m.es_service_general && m.fecha.slice(0, 4) === anio)
        .map((m) => {
          const reg = residuoPorOt.get(String(m.numero_ot ?? "")) ?? {}
          return { ot: m, aceite: reg.aceite ?? null, filtros: reg.filtros ?? null }
        })
        .sort((a, b) => b.ot.fecha.localeCompare(a.ot.fecha)),
    [mantenimientos, anio, residuoPorOt]
  )

  const conRegistro = services.filter((s) => s.aceite || s.filtros).length
  const faltaConstancia = services.filter(
    (s) =>
      (s.aceite || s.filtros) &&
      !(s.aceite?.certificado_url ?? s.filtros?.certificado_url)
  )
  const sinConstancia = faltaConstancia.length
  // De los que no tienen el papel, cuántos están al menos reclamados o con el
  // comprobante del trámite: ante el auditor no es lo mismo que no hacer nada.
  const sinConstanciaGestionados = faltaConstancia.filter(
    (s) =>
      s.aceite?.constancia_solicitada_at ||
      s.filtros?.constancia_solicitada_at ||
      s.aceite?.tramite_url ||
      s.filtros?.tramite_url
  ).length
  const litrosDeclarados = services.reduce(
    (a, s) => a + (s.aceite?.cantidad ?? 0),
    0
  )

  const certCubiertas = certificados.find((c) => c.esCubiertas)

  return (
    <div className="space-y-6">
      <DpoSeccionCinta seccionId="residuos" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Cubiertas a disposición final"
          valor={fmtNum(cubiertasRetiradas)}
          dpo="1.4"
          estado="neutro"
          sub={`${retiros.length} retiro${retiros.length === 1 ? "" : "s"}, todos con número de fuego y certificado`}
        />
        <KpiCard
          label="Certificado de cubiertas"
          valor={certCubiertas?.ampara != null ? `${fmtNum(certCubiertas.ampara)} kg` : "—"}
          dpo="1.4"
          estado={certCubiertas ? "ok" : "alerta"}
          sub={
            certCubiertas?.ampara != null
              ? `Kilos tratados que declara ${certCubiertas.operador}. El papel va por peso; los cascos se cuentan aparte`
              : "Sin certificado cargado"
          }
        />
        <KpiCard
          label={`Services con residuo registrado · ${anio}`}
          valor={`${conRegistro} / ${services.length}`}
          dpo="1.4"
          estado={
            services.length === 0
              ? "neutro"
              : conRegistro === services.length
                ? "ok"
                : "alerta"
          }
          sub="Cada service en taller externo deja aceite y filtros: sin fila no hay seguimiento"
        />
        <KpiCard
          label="Registros sin constancia"
          valor={fmtNum(sinConstancia)}
          dpo="1.4"
          estado={
            sinConstancia === 0
              ? "ok"
              : sinConstanciaGestionados === sinConstancia
                ? "alerta"
                : "critico"
          }
          sub={
            sinConstancia === 0
              ? "Todos los residuos registrados tienen el certificado del operador"
              : `${sinConstanciaGestionados} de ${sinConstancia} ya reclamados o con el trámite adjunto`
          }
        />
      </div>

      {/* ===== Lo que pidió la auditoría ===== */}
      {punto && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
              Punto de partida: lo que pidió la última auditoría
              {punto.puntaje != null && (
                <Badge variant="outline" className="tabular-nums">
                  Puntuó {punto.puntaje}
                  {fechaAuditoria ? ` en ${fechaAuditoria}` : ""}
                </Badge>
              )}
            </CardTitle>
            {/* 🚨 El puntaje es el de la auditoría CERRADA, no el estado de hoy:
                sin decirlo, la tarjeta se lee como "hoy tenés 0". Se muestra
                justamente para poder decir "esto era un 0 y mirá lo que hay
                ahora", que es lo que el DPO premia. */}
            <p className="text-sm text-muted-foreground">
              Es el puntaje de {auditoria ?? "la última auditoría"},{" "}
              <strong>no el estado de hoy</strong>: está acá para poder mostrar la diferencia
              contra lo que hay cargado ahora. El puntaje nuevo sale cuando se abra el próximo
              ciclo.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {punto.comentario && (
              <blockquote className="border-l-2 border-amber-500/50 pl-3 text-sm text-foreground italic">
                “{punto.comentario}”
              </blockquote>
            )}
            <div className="space-y-1.5">
              {punto.requisitos.map((r) => (
                <p key={r} className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{r.slice(0, 6)}</span>
                  {r.slice(6)}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Certificados ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" />
            Certificados y constancias vigentes
          </CardTitle>
          <p className="max-w-3xl text-sm text-muted-foreground">
            El operador no emite un papel por viaje: emite uno por tanda y el mismo ampara varios
            retiros. En cubiertas el certificado declara <strong>kilos tratados</strong> —no
            unidades— y los cascos se cuentan aparte porque son los que llevan número de fuego:
            las dos magnitudes van una al lado de la otra, no se restan.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {certificados.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin certificados cargados.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operador</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Desde</TableHead>
                  <TableHead className="text-right">Declara</TableHead>
                  <TableHead className="text-right">Imputado</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Documento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certificados.map((c) => (
                  <TableRow key={c.path}>
                    <TableCell className="font-medium text-foreground">{c.operador}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {c.materiales.map((m) => (
                          <Badge key={m} variant="outline">
                            {MATERIAL_LABEL[m] ?? m}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmtFecha(c.fecha)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.ampara != null ? `${fmtNum(c.ampara)} ${c.unidad ?? ""}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.esCubiertas
                        ? `${fmtNum(c.retirado)} cascos`
                        : `${c.amparados} registros`}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {c.saldo != null ? (
                        fmtNum(c.saldo)
                      ) : (
                        <span
                          className="text-xs font-normal text-muted-foreground"
                          title="El certificado declara peso y los retiros se cuentan en cascos: no se restan entre sí"
                        >
                          no aplica
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.url ? (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <FileText className="size-3.5" /> Ver
                        </a>
                      ) : (
                        <span className="text-xs italic text-amber-600 dark:text-amber-400">
                          falta
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ===== Cubiertas ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Recycle className="size-4" />
            Cubiertas — disposición final
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Cada retiro sale de la bandeja «Para desechar» del padrón: la baja de la cubierta y el
            registro del residuo ocurren en el mismo acto, con el número de fuego de cada casco.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 overflow-x-auto">
          {retiros.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin retiros registrados.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Cascos</TableHead>
                  <TableHead>N° de fuego</TableHead>
                  <TableHead>Medida</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Certificado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {retiros.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{fmtFecha(r.fecha)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.cantidad)}</TableCell>
                    <TableCell className="max-w-56 text-xs text-foreground">
                      {r.numeros_fuego ?? (
                        <span className="italic text-amber-600 dark:text-amber-400">
                          sin número de fuego
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.descripcion ?? "—"}
                    </TableCell>
                    <TableCell className="text-foreground">{r.proveedor}</TableCell>
                    <TableCell>
                      {r.certificado_url ? (
                        <a
                          href={r.certificado_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <FileText className="size-3.5" /> Ver
                        </a>
                      ) : (
                        <span className="text-xs italic text-amber-600 dark:text-amber-400">
                          falta
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-2">
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">{enBandeja}</span> cubierta
              {enBandeja === 1 ? "" : "s"} en la bandeja «Para desechar», esperando el próximo
              retiro.
            </p>
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">{bajasNoResiduo}</span> baja
              {bajasNoResiduo === 1 ? "" : "s"} del padrón que <strong>no son residuo</strong>:
              salieron por transferencia, no por desecho, y por eso no llevan certificado.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ===== Aceite y filtros de los services ===== */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Droplets className="size-4" />
                Aceite y filtros de los services en taller externo
              </CardTitle>
              <p className="max-w-3xl text-sm text-muted-foreground">
                El aceite drenado y los filtros reemplazados no entran al depósito: los retiene y
                los dispone el taller que hizo el service. El seguimiento es por orden de trabajo —
                un service sin fila es un residuo que salió sin registro.
              </p>
            </div>
            <Select value={anio} onValueChange={(v) => setAnio(v ?? anio)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anios.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 overflow-x-auto">
          {services.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin services registrados en {anio}.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OT</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Taller</TableHead>
                  {/* "Litros", no "Aceite usado": la columna es la CANTIDAD, y
                      que diga "sin declarar" se leía como que el residuo no
                      estaba amparado. Lo amparado lo dice la columna
                      Constancia, que es la que mira el auditor. */}
                  <TableHead className="w-40">Litros de aceite</TableHead>
                  <TableHead className="text-right">Filtros</TableHead>
                  <TableHead>Constancia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map(({ ot, aceite, filtros }) => {
                  const sinRegistro = !aceite && !filtros
                  return (
                    <TableRow
                      key={ot.id}
                      className={cn(sinRegistro && "bg-amber-500/5")}
                    >
                      <TableCell className="whitespace-nowrap font-medium text-foreground">
                        {ot.numero_ot ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{fmtFecha(ot.fecha)}</TableCell>
                      <TableCell className="whitespace-nowrap text-foreground">
                        {ot.dominio}
                      </TableCell>
                      <TableCell className="max-w-48 text-xs text-muted-foreground">
                        {ot.taller || (
                          <span className="italic text-amber-600 dark:text-amber-400">
                            sin taller cargado
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {aceite ? (
                          <LitrosAceite
                            residuo={aceite}
                            puedeEditar={puedeEditar}
                            onChanged={onChanged}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {filtros ? (
                          filtros.cantidad != null ? (
                            fmtNum(filtros.cantidad)
                          ) : (
                            <span className="text-xs italic text-muted-foreground">
                              sin cantidad
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {sinRegistro ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          >
                            sin registro
                          </Badge>
                        ) : (
                          <ConstanciaCell
                            residuos={[aceite, filtros].filter(Boolean) as Residuo[]}
                            puedeEditar={puedeEditar}
                            onChanged={onChanged}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}

          <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-3">
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">
                {conRegistro} de {services.length}
              </span>{" "}
              services de {anio} con el residuo registrado.
            </p>
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">
                {litrosDeclarados > 0 ? `${fmtNum(litrosDeclarados, 1)} lts` : "0 lts"}
              </span>{" "}
              de aceite usado con los litros cargados.
            </p>
            <p className="text-muted-foreground">
              <FilterIcon className="mr-1 inline size-3.5" />
              Que falten los litros <strong>no</strong> quiere decir que el residuo esté sin
              amparar: eso lo dice la columna Constancia. El R1.4.2 exige fecha, material y
              proveedor y la cantidad no es requisito — pero sin ella no se puede contrastar lo
              generado contra lo que declara el manifiesto.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ===== Comparación con Misiones ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="size-4" />
            Cómo lo resuelve Misiones Distribuciones
          </CardTitle>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Contraste contra el SOP de eliminación de residuos de esa operación (Herminio Agüero,
            SDF). No se adopta —describe otros proveedores y un registro en papel— pero sirve para
            ver en qué coincide el circuito y qué nos falta.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Tema</TableHead>
                <TableHead>Misiones</TableHead>
                <TableHead>Pampeana</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {COMPARACION_MISIONES.map((c) => (
                <TableRow key={c.tema}>
                  <TableCell className="align-top font-medium text-foreground">{c.tema}</TableCell>
                  <TableCell className="align-top text-sm text-muted-foreground">
                    {c.misiones}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "align-top text-sm",
                      c.favor ? "text-foreground" : "text-amber-700 dark:text-amber-400"
                    )}
                  >
                    {c.nosotros}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * El estado de la constancia de disposición final de un service.
 *
 * Mientras el papel no está, "falta" no alcanza: ante el auditor no es lo mismo
 * un residuo que nadie reclamó que uno pedido hace dos semanas y con el remito
 * del taller adjunto. Por eso hay tres estados y no dos — falta / solicitada /
 * en trámite con comprobante — y el certificado sigue siendo el único que pone
 * el registro en verde.
 *
 * 🚨 El comprobante del trámite NO se guarda en `certificado_url`: si lo
 * hiciera, el registro figuraría como amparado sin estarlo.
 *
 * Un service deja dos filas de residuo (aceite y filtros) y la constancia es la
 * misma para las dos, así que las acciones se aplican a todas.
 */
function ConstanciaCell({
  residuos,
  puedeEditar,
  onChanged,
}: {
  residuos: Residuo[]
  puedeEditar: boolean
  onChanged: () => void
}) {
  const [pend, setPend] = useState(false)
  const inputId = `tramite-${residuos[0]?.id ?? "x"}`

  const certificado = residuos.find((r) => r.certificado_url)?.certificado_url ?? null
  const conTramite = residuos.find((r) => r.tramite_url) ?? null
  const solicitada = residuos.find((r) => r.constancia_solicitada_at) ?? null

  if (certificado) {
    return (
      <a
        href={certificado}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-primary hover:underline"
      >
        <Check className="size-3.5" /> amparado
      </a>
    )
  }

  const correrEnTodas = async (fn: (id: string) => Promise<{ success: true } | { error: string }>) => {
    setPend(true)
    for (const r of residuos) {
      const res = await fn(r.id)
      if ("error" in res) {
        setPend(false)
        toast.error(res.error)
        return false
      }
    }
    setPend(false)
    onChanged()
    return true
  }

  const toggleSolicitada = async () => {
    const quiere = !solicitada
    const ok = await correrEnTodas((id) =>
      marcarConstanciaSolicitada({ id, solicitada: quiere })
    )
    if (ok) toast.success(quiere ? "Marcada como solicitada" : "Se quitó la marca")
  }

  const subirTramite = async (file: File) => {
    setPend(true)
    for (const r of residuos) {
      const fd = new FormData()
      fd.set("archivo", file)
      const res = await subirConstanciaTramite(r.id, fd)
      if ("error" in res) {
        setPend(false)
        toast.error(res.error)
        return
      }
    }
    setPend(false)
    toast.success("Comprobante del trámite cargado")
    onChanged()
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        {conTramite ? (
          <a
            href={conTramite.tramite_url as string}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-px text-[11px] font-medium text-sky-700 hover:underline dark:text-sky-300"
            title={conTramite.tramite_nombre ?? "Comprobante del trámite"}
          >
            <Hourglass className="size-3" /> en trámite
          </a>
        ) : (
          <span className="text-xs italic text-amber-600 dark:text-amber-400">
            falta constancia
          </span>
        )}
        {solicitada && (
          <span
            className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[11px] font-medium text-amber-700 dark:text-amber-400"
            title={`Reclamada el ${fmtFecha(solicitada.constancia_solicitada_at)}`}
          >
            solicitada {fmtFecha(solicitada.constancia_solicitada_at)}
          </span>
        )}
      </div>

      {puedeEditar && (
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant={solicitada ? "secondary" : "outline"}
            className="h-6 px-2 text-[11px]"
            disabled={pend}
            onClick={toggleSolicitada}
            title={
              solicitada
                ? "Quitar la marca de solicitada"
                : "Dejar registrado que ya se le pidió la constancia al taller"
            }
          >
            <Send className="mr-1 size-3" />
            {solicitada ? "Solicitada ✓" : "Solicitada"}
          </Button>

          <label
            htmlFor={inputId}
            className={cn(
              "inline-flex h-6 cursor-pointer items-center rounded-md border px-2 text-[11px] font-medium",
              "border-input bg-background hover:bg-accent hover:text-accent-foreground",
              pend && "pointer-events-none opacity-50"
            )}
          >
            <ImageIcon className="mr-1 size-3" />
            {conTramite ? "Cambiar" : "Adjuntar trámite"}
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/*,application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ""
              if (f) subirTramite(f)
            }}
          />

          {conTramite && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[11px] text-destructive"
              disabled={pend}
              onClick={async () => {
                const ok = await correrEnTodas((id) => quitarConstanciaTramite(id))
                if (ok) toast.success("Comprobante quitado")
              }}
              title="Quitar el comprobante del trámite"
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Los litros del aceite drenado, editables en la fila.
 *
 * Nacen vacíos porque el taller no los informa en la factura, y obligar a
 * borrar y recrear el registro para agregarlos hacía que nadie los cargara.
 */
function LitrosAceite({
  residuo,
  puedeEditar,
  onChanged,
}: {
  residuo: Residuo
  puedeEditar: boolean
  onChanged: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(residuo.cantidad != null ? String(residuo.cantidad) : "")
  const [guardando, setGuardando] = useState(false)

  if (!editando) {
    const texto =
      residuo.cantidad != null
        ? `${fmtNum(residuo.cantidad, 1)} ${residuo.unidad ?? "lts"}`
        : "cargar litros"
    if (!puedeEditar) {
      return (
        <span
          className={cn(
            "text-sm tabular-nums",
            residuo.cantidad == null && "text-xs italic text-muted-foreground"
          )}
        >
          {texto}
        </span>
      )
    }
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className={cn(
          "rounded px-1 text-sm tabular-nums hover:bg-muted",
          residuo.cantidad == null && "text-xs italic text-muted-foreground"
        )}
        title="Cargar los litros que informó el taller"
      >
        {texto}
      </button>
    )
  }

  const guardar = async () => {
    const limpio = valor.trim().replace(",", ".")
    const cantidad = limpio === "" ? null : Number(limpio)
    if (cantidad != null && !isFinite(cantidad)) {
      toast.error("Escribí un número")
      return
    }
    setGuardando(true)
    const res = await setResiduoCantidad({
      id: residuo.id,
      cantidad,
      unidad: residuo.unidad ?? "lts",
    })
    setGuardando(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    setEditando(false)
    toast.success("Litros actualizados")
    onChanged()
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") guardar()
          if (e.key === "Escape") setEditando(false)
        }}
        className="h-7 w-20 text-sm"
        placeholder="lts"
      />
      <Button size="sm" className="h-7 px-2" disabled={guardando} onClick={guardar}>
        <Check className="size-3.5" />
      </Button>
    </div>
  )
}
