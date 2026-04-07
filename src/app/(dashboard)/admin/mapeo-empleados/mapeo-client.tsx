"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Link2,
  Link2Off,
  Truck,
  User,
  Loader2,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  upsertMapeoChofer,
  upsertMapeoFletero,
} from "@/actions/mapeo-empleados"
import type { EmpleadoCompleto } from "@/types/database"

interface Props {
  mapeos: EmpleadoCompleto[]
  unmappedChoferes: { id: string; nombre: string }[]
  unmappedFleteros: string[]
  empleados: { id: string; legajo: number; nombre: string; sector: string }[]
}

export function MapeoClient({
  mapeos,
  unmappedChoferes,
  unmappedFleteros,
  empleados,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [savingChofer, setSavingChofer] = useState<string | null>(null)
  const [savingFletero, setSavingFletero] = useState<string | null>(null)

  // Track selected empleado for each unmapped item
  const [choferSelections, setChoferSelections] = useState<
    Record<string, string>
  >({})
  const [fleteroSelections, setFleteroSelections] = useState<
    Record<string, string>
  >({})

  const totalMapeados = mapeos.filter(
    (m) => m.ds_fletero_carga || m.nombre_chofer
  ).length
  const totalSinMapear = mapeos.filter(
    (m) => !m.ds_fletero_carga && !m.nombre_chofer
  ).length

  async function handleSaveChofer(nombreChofer: string) {
    const empleadoId = choferSelections[nombreChofer]
    if (!empleadoId) {
      toast.error("Selecciona un empleado")
      return
    }
    setSavingChofer(nombreChofer)
    const result = await upsertMapeoChofer(empleadoId, nombreChofer)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(`Chofer "${nombreChofer}" vinculado`)
      startTransition(() => router.refresh())
    }
    setSavingChofer(null)
  }

  async function handleSaveFletero(dsFletero: string) {
    const empleadoId = fleteroSelections[dsFletero]
    if (!empleadoId) {
      toast.error("Selecciona un empleado")
      return
    }
    setSavingFletero(dsFletero)
    const result = await upsertMapeoFletero(empleadoId, dsFletero)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(`Fletero "${dsFletero}" vinculado`)
      startTransition(() => router.refresh())
    }
    setSavingFletero(null)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Mapeo de Empleados
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vincular identidades externas (fleteros ERP, choferes TML) con
          empleados del sistema
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Empleados" value={mapeos.length} />
        <StatCard label="Mapeados" value={totalMapeados} color="green" />
        <StatCard label="Sin mapear" value={totalSinMapear} color="amber" />
        <StatCard
          label="Pendientes"
          value={unmappedChoferes.length + unmappedFleteros.length}
          color="red"
        />
      </div>

      <Tabs defaultValue="empleados">
        <TabsList>
          <TabsTrigger value="empleados">Empleados</TabsTrigger>
          <TabsTrigger value="choferes">
            Choferes TML sin mapear ({unmappedChoferes.length})
          </TabsTrigger>
          <TabsTrigger value="fleteros">
            Fleteros ERP sin mapear ({unmappedFleteros.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab: Empleados con mapeos */}
        <TabsContent value="empleados">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Legajo</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Chofer TML</TableHead>
                  <TableHead>Fletero ERP</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mapeos.map((m) => {
                  const hasMaping = m.ds_fletero_carga || m.nombre_chofer
                  return (
                    <TableRow key={`${m.empleado_id}-${m.nombre_chofer}-${m.ds_fletero_carga}`}>
                      <TableCell className="font-mono text-sm">
                        {m.legajo}
                      </TableCell>
                      <TableCell className="font-medium">{m.nombre}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{m.sector}</Badge>
                      </TableCell>
                      <TableCell>
                        {m.nombre_chofer ? (
                          <span className="text-sm">{m.nombre_chofer}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {m.ds_fletero_carga ? (
                          <span className="font-mono text-sm">
                            {m.ds_fletero_carga}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {hasMaping ? (
                          <Link2 className="size-4 text-green-600" />
                        ) : (
                          <Link2Off className="size-4 text-amber-500" />
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Tab: Choferes TML sin mapear */}
        <TabsContent value="choferes">
          {unmappedChoferes.length === 0 ? (
            <EmptyState
              icon={<User className="h-14 w-14 text-muted-foreground/40" />}
              title="Todos los choferes mapeados"
              description="No hay choferes TML pendientes de vincular."
            />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chofer TML</TableHead>
                    <TableHead>Vincular a empleado</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmappedChoferes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.nombre}</TableCell>
                      <TableCell>
                        <Select
                          value={choferSelections[c.nombre] ?? ""}
                          onValueChange={(val: string | null) =>
                            setChoferSelections((prev) => ({
                              ...prev,
                              [c.nombre]: val ?? "",
                            }))
                          }
                        >
                          <SelectTrigger className="w-full max-w-xs">
                            <SelectValue placeholder="Seleccionar empleado..." />
                          </SelectTrigger>
                          <SelectContent>
                            {empleados.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.legajo} - {e.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          disabled={
                            !choferSelections[c.nombre] ||
                            savingChofer === c.nombre ||
                            isPending
                          }
                          onClick={() => handleSaveChofer(c.nombre)}
                        >
                          {savingChofer === c.nombre ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="mr-1 h-3.5 w-3.5" />
                          )}
                          Vincular
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Tab: Fleteros ERP sin mapear */}
        <TabsContent value="fleteros">
          {unmappedFleteros.length === 0 ? (
            <EmptyState
              icon={<Truck className="h-14 w-14 text-muted-foreground/40" />}
              title="Todos los fleteros mapeados"
              description="No hay patentes de fletero pendientes de vincular."
            />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patente (ERP)</TableHead>
                    <TableHead>Vincular a empleado</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmappedFleteros.map((f) => (
                    <TableRow key={f}>
                      <TableCell className="font-mono font-medium">
                        {f}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={fleteroSelections[f] ?? ""}
                          onValueChange={(val: string | null) =>
                            setFleteroSelections((prev) => ({
                              ...prev,
                              [f]: val ?? "",
                            }))
                          }
                        >
                          <SelectTrigger className="w-full max-w-xs">
                            <SelectValue placeholder="Seleccionar empleado..." />
                          </SelectTrigger>
                          <SelectContent>
                            {empleados.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.legajo} - {e.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          disabled={
                            !fleteroSelections[f] ||
                            savingFletero === f ||
                            isPending
                          }
                          onClick={() => handleSaveFletero(f)}
                        >
                          {savingFletero === f ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="mr-1 h-3.5 w-3.5" />
                          )}
                          Vincular
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color?: "green" | "amber" | "red"
}) {
  const colorClass =
    color === "green"
      ? "text-green-600"
      : color === "amber"
        ? "text-amber-600"
        : color === "red"
          ? "text-red-600"
          : "text-slate-900"

  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
    </div>
  )
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3">
      {icon}
      <h2 className="text-lg font-semibold text-slate-700">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
