import { requireAuth } from "@/lib/session"
import { requireModuloPortal } from "@/lib/portal-empleado-server"
import { BuscarClienteClient } from "./buscar-cliente-client"

// "Buscar cliente" — DPO Entrega 4.1: el chofer pone el código del cliente y
// ve la ventana horaria relevada, el teléfono del cliente y el celular de su
// vendedor. Sólo Pampeana: la base del dashboard Mercosur es de ese tenant.

export const dynamic = "force-dynamic"

export default async function BuscarClientePage() {
  await requireModuloPortal("buscar-cliente")
  await requireAuth()
  return <BuscarClienteClient />
}
