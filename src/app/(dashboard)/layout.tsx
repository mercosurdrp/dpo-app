import { NuqsAdapter } from "nuqs/adapters/next/app"
import { requireAuth, getProfile } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { Sidebar } from "@/components/layout/sidebar"
import { MobileNav } from "@/components/layout/mobile-nav"
import { EmpleadoGuard } from "@/components/layout/empleado-guard"
import { EmpleadoNav } from "@/components/layout/empleado-nav"
import type { Pilar } from "@/types/database"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAuth()
  const profile = await getProfile()
  const role = profile?.role ?? "viewer"

  // Empleados: nav superior con tabs, sin sidebar
  if (role === "empleado") {
    return (
      <EmpleadoGuard>
        <div className="min-h-screen bg-slate-50">
          <EmpleadoNav />
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
    <NuqsAdapter>
      <div className="flex min-h-screen">
        <Sidebar role={role} pilares={pilarNav} />
        <MobileNav role={role} pilares={pilarNav} />
        {/* Sin overflow-auto: crearía un scroll context que rompe los sticky
            internos (el scroll real es del documento, igual que el sidebar). */}
        <main className="min-w-0 flex-1 bg-slate-50 p-4 pt-14 md:p-6 md:pt-6">
          {children}
        </main>
      </div>
    </NuqsAdapter>
  )
}
