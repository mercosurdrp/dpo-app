"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<"empleado" | "admin">("empleado")
  const [legajo, setLegajo] = useState("")
  const [dni, setDni] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()

    // Build credentials based on mode
    const credentials =
      mode === "empleado"
        ? { email: `${legajo.trim()}@dpo.local`, password: dni.trim() }
        : { email: email.trim(), password }

    const { error } = await supabase.auth.signInWithPassword(credentials)

    if (error) {
      toast.error(
        mode === "empleado"
          ? "Legajo o DNI incorrecto"
          : "Credenciales inválidas"
      )
      setLoading(false)
      return
    }

    // Check role to redirect
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .single()

    toast.success("Bienvenido")

    if (profile?.role === "empleado") {
      router.push("/mis-capacitaciones")
    } else {
      router.push("/")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a1628] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="text-5xl font-bold tracking-tight text-white">DPO</h1>
          <p className="mt-2 text-sm text-slate-400">
            Mercosur Región Pampeana
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="mb-4 flex rounded-lg border border-white/10 overflow-hidden">
          <button
            type="button"
            onClick={() => setMode("empleado")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === "empleado"
                ? "bg-blue-600 text-white"
                : "bg-white/5 text-slate-400 hover:text-white"
            }`}
          >
            Empleado
          </button>
          <button
            type="button"
            onClick={() => setMode("admin")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === "admin"
                ? "bg-blue-600 text-white"
                : "bg-white/5 text-slate-400 hover:text-white"
            }`}
          >
            Administrador
          </button>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
        >
          {mode === "empleado" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="legajo" className="text-sm text-slate-300">
                  Legajo
                </Label>
                <Input
                  id="legajo"
                  type="number"
                  inputMode="numeric"
                  placeholder="Ej: 30"
                  value={legajo}
                  onChange={(e) => setLegajo(e.target.value)}
                  required
                  className="border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus-visible:border-blue-500 focus-visible:ring-blue-500/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dni" className="text-sm text-slate-300">
                  DNI
                </Label>
                <Input
                  id="dni"
                  type="password"
                  inputMode="numeric"
                  placeholder="Tu número de documento"
                  value={dni}
                  onChange={(e) => setDni(e.target.value)}
                  required
                  className="border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus-visible:border-blue-500 focus-visible:ring-blue-500/30"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm text-slate-300">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus-visible:border-blue-500 focus-visible:ring-blue-500/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm text-slate-300">
                  Contraseña
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus-visible:border-blue-500 focus-visible:ring-blue-500/30"
                />
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="mt-6 w-full bg-blue-600 text-white hover:bg-blue-700"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Ingresando...
              </>
            ) : (
              "Ingresar"
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
