"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TareaForm, type Operador } from "@/components/planes/tarea-form"

interface Props {
  operadores: Operador[]
}

export function NuevaTareaClient({ operadores }: Props) {
  const router = useRouter()

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/registro-tareas" />}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold text-slate-900">Nueva tarea</h1>
      </div>

      <TareaForm
        operadores={operadores}
        onCreated={(id) => router.push(`/planes/${id}`)}
        onCancel={() => router.push("/registro-tareas")}
        submitLabel="Crear tarea"
      />
    </div>
  )
}
