import { redirect } from "next/navigation"
import { requireModuloPortal } from "@/lib/portal-empleado-server"

export const dynamic = "force-dynamic"

export default async function MisRechazosPage() {
  await requireModuloPortal("mis-rechazos")
  // Vive como solapa de «Cómo venimos»; esta ruta queda por los links viejos.
  redirect("/como-venimos?tab=rechazos")
}
