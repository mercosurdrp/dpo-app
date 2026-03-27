import { requireAuth, getProfile } from "@/lib/session"
import { Sidebar } from "@/components/layout/sidebar"
import { MobileNav } from "@/components/layout/mobile-nav"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAuth()
  const profile = await getProfile()
  const role = profile?.role ?? "viewer"

  return (
    <div className="flex min-h-screen">
      <Sidebar role={role} />
      <MobileNav role={role} />
      <main className="flex-1 overflow-auto bg-slate-50 p-4 pt-14 md:p-6 md:pt-6">
        {children}
      </main>
    </div>
  )
}
