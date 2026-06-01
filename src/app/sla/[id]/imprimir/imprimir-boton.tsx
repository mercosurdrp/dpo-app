"use client"

import { Printer } from "lucide-react"

export function ImprimirBoton() {
  return (
    <div className="mb-4 flex justify-end gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700"
      >
        <Printer className="size-4" />
        Imprimir / Guardar PDF
      </button>
    </div>
  )
}
