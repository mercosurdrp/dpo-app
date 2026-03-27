"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ShieldCheck,
  Users,
  Wrench,
  Settings,
  Award,
  Leaf,
  HardHat,
  ClipboardList,
  ArrowLeft,
  BarChart3,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { Pilar } from "@/types/database"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "shield-check": ShieldCheck,
  users: Users,
  wrench: Wrench,
  settings: Settings,
  award: Award,
  leaf: Leaf,
  "hard-hat": HardHat,
  ShieldCheck,
  Users,
  Wrench,
  Settings,
  Award,
  Leaf,
  HardHat,
}

export function PilarLayoutClient({
  pilar,
  children,
}: {
  pilar: Pilar
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const IconComp = iconMap[pilar.icono] ?? ClipboardList

  const basePath = `/pilares/${pilar.id}`
  const tabs = [
    {
      label: "Checklist",
      href: `${basePath}/checklist`,
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      label: "Gestion",
      href: `${basePath}/gestion`,
      icon: <BarChart3 className="h-4 w-4" />,
    },
  ]

  return (
    <div className="space-y-4">
      {/* Pilar header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/" />}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: `${pilar.color}15`,
            color: pilar.color,
          }}
        >
          <IconComp className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            {pilar.nombre}
          </h1>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href)

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-current text-slate-900"
                  : "border-transparent text-muted-foreground hover:text-slate-700"
              )}
              style={isActive ? { borderColor: pilar.color } : undefined}
            >
              {tab.icon}
              {tab.label}
            </Link>
          )
        })}
      </div>

      {/* Tab content */}
      {children}
    </div>
  )
}
