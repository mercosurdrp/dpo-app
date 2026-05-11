"use client"

import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-red-700" />
        <div className="flex-1 space-y-2">
          <h1 className="text-base font-semibold text-red-900">Algo salió mal en el dashboard de rechazos</h1>
          <p className="text-sm text-red-700">{error.message}</p>
          {error.digest && <p className="font-mono text-xs text-red-600">digest: {error.digest}</p>}
          <Button onClick={reset} variant="outline" size="sm" className="mt-2">
            Reintentar
          </Button>
        </div>
      </div>
    </div>
  )
}
