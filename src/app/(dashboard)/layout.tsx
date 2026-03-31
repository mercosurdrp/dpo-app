import { requireAuth, getProfile } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { Sidebar } from "@/components/layout/sidebar"
import { MobileNav } from "@/components/layout/mobile-nav"
import { EmpleadoGuard } from "@/components/layout/empleado-guard"
import type { Pilar } from "@/types/database"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAuth()
  const profile = await getProfile()
  const role = profile?.role ?? "viewer"

  // Empleados: no sidebar, redirect to /mis-capacitaciones if on any other route
  if (role === "empleado") {
    return (
      <EmpleadoGuard>
        <div className="min-h-screen bg-slate-50">
          <main className="mx-auto max-w-4xl p-4 md:p-6">
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
    <div className="flex min-h-screen">
      <Sidebar role={role} pilares={pilarNav} />
      <MobileNav role={role} pilares={pilarNav} />
      <main className="flex-1 overflow-auto bg-slate-50 p-4 pt-14 md:p-6 md:pt-6">
        {children}
      </main>
    </div>
  )
}
