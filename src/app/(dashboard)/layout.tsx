import { NuqsAdapter } from "nuqs/adapters/next/app"
import { requireAuth, getProfile } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { Sidebar } from "@/components/layout/sidebar"
import { MobileNav } from "@/components/layout/mobile-nav"
import { EmpleadoGuard } from "@/components/layout/empleado-guard"
import { EmpleadoSidebar, EmpleadoMobileNav } from "@/components/layout/empleado-sidebar"
import { puedeOperarAcarreo } from "@/lib/acarreo-operadores"
import type { Pilar } from "@/types/database"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAuth()
  const profile = await getProfile()
  const role = profile?.role ?? "viewer"
  const email = profile?.email ?? null
  const puedeRecepcion = puedeOperarAcarreo(role, email)

  // Empleados: mismo menú lateral que el resto (columna izquierda), con sus
  // ítems curados. Reemplaza la vieja nav superior de tabs.
  if (role === "empleado") {
    return (
      <EmpleadoGuard>
        <div className="flex min-h-screen">
          <EmpleadoSidebar puedeRecepcion={puedeRecepcion} />
          <EmpleadoMobileNav puedeRecepcion={puedeRecepcion} />
          <main className="flex-1 overflow-auto bg-slate-50 p-4 pt-16 md:p-6 md:pt-6">
            {children}
          </main>
        </div>
      </EmpleadoGuard>
    )
  }

  // Fetch pilares for sidebar navigation
  const supabase = await createClient()
  const { data: pilares } = await supabase
    .from("pilares")
    .select("id, nombre, color")
    .order("orden")

  const pilarNav = ((pilares ?? []) as Pick<Pilar, "id" | "nombre" | "color">[]).map(
    (p) => ({ id: p.id, nombre: p.nombre, color: p.color })
  )

  return (
    <NuqsAdapter>
      <div className="flex min-h-screen">
        <Sidebar role={role} email={email} pilares={pilarNav} />
        <MobileNav role={role} email={email} pilares={pilarNav} />
        <main className="flex-1 overflow-auto bg-slate-50 p-4 pt-14 md:p-6 md:pt-6">
          {children}
        </main>
      </div>
    </NuqsAdapter>
  )
}
