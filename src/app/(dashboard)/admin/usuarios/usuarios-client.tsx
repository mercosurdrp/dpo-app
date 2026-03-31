"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Users,
  UserPlus,
  Loader2,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { createUser, updateUserRole, toggleUserActive } from "@/actions/admin"
import type { Profile, UserRole } from "@/types/database"

const ROLE_CONFIG: Record<UserRole, { label: string; color: string }> = {
  admin: { label: "Admin", color: "#3B82F6" },
  auditor: { label: "Auditor", color: "#8B5CF6" },
  viewer: { label: "Viewer", color: "#64748B" },
  empleado: { label: "Empleado", color: "#F59E0B" },
}

const ROLES: UserRole[] = ["admin", "auditor", "viewer", "empleado"]

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function UsuariosClient({ users: initialUsers }: { users: Profile[] }) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Form state
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [nombre, setNombre] = useState("")
  const [role, setRole] = useState<UserRole>("auditor")

  function resetForm() {
    setEmail("")
    setPassword("")
    setNombre("")
    setRole("auditor")
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password || !nombre) {
      toast.error("Todos los campos son requeridos")
      return
    }
    setCreating(true)
    const result = await createUser({ email, password, nombre, role })
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success("Usuario creado exitosamente")
      resetForm()
      setDialogOpen(false)
      router.refresh()
    }
    setCreating(false)
  }

  async function handleRoleChange(userId: string, newRole: UserRole) {
    startTransition(async () => {
      const result = await updateUserRole(userId, newRole)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success(`Rol actualizado a ${ROLE_CONFIG[newRole].label}`)
      }
      router.refresh()
    })
  }

  async function handleToggleActive(userId: string) {
    setToggling(userId)
    const result = await toggleUserActive(userId)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      const state = result.data.active ? "activado" : "desactivado"
      toast.success(`Usuario ${state}`)
      router.refresh()
    }
    setToggling(null)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Usuarios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestionar usuarios del sistema
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button />}>
            <UserPlus className="mr-2 h-4 w-4" />
            Nuevo Usuario
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Crear Usuario</DialogTitle>
              <DialogDescription>
                Ingresa los datos del nuevo usuario.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  placeholder="Nombre completo"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="usuario@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contrasena</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label>Rol</Label>
                <Select value={role} onValueChange={(val) => setRole(val as UserRole)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_CONFIG[r].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={creating}>
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear Usuario
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Users list */}
      {initialUsers.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
          <Users className="h-14 w-14 text-muted-foreground/40" />
          <h2 className="text-lg font-semibold text-slate-700">
            No hay usuarios
          </h2>
          <p className="text-sm text-muted-foreground">
            Crea el primer usuario para comenzar.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden rounded-lg border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Activo</TableHead>
                  <TableHead>Fecha creacion</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.nombre}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <RoleDropdown
                        role={user.role}
                        onChange={(r) => handleRoleChange(user.id, r)}
                        disabled={isPending}
                      />
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex size-2.5 rounded-full ${
                          user.active ? "bg-green-500" : "bg-red-500"
                        }`}
                        title={user.active ? "Activo" : "Inactivo"}
                      />
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={user.active ? "destructive" : "outline"}
                        size="sm"
                        disabled={toggling === user.id}
                        onClick={() => handleToggleActive(user.id)}
                      >
                        {toggling === user.id ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        {user.active ? "Desactivar" : "Activar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {initialUsers.map((user) => (
              <div
                key={user.id}
                className="rounded-lg border bg-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{user.nombre}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                  <span
                    className={`inline-flex size-2.5 shrink-0 rounded-full mt-1.5 ${
                      user.active ? "bg-green-500" : "bg-red-500"
                    }`}
                    title={user.active ? "Activo" : "Inactivo"}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <RoleDropdown
                    role={user.role}
                    onChange={(r) => handleRoleChange(user.id, r)}
                    disabled={isPending}
                  />
                  <span className="text-xs text-muted-foreground">
                    Creado {formatDate(user.created_at)}
                  </span>
                </div>

                <Button
                  variant={user.active ? "destructive" : "outline"}
                  size="sm"
                  className="w-full"
                  disabled={toggling === user.id}
                  onClick={() => handleToggleActive(user.id)}
                >
                  {toggling === user.id && (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  )}
                  {user.active ? "Desactivar" : "Activar"}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function RoleDropdown({
  role,
  onChange,
  disabled,
}: {
  role: UserRole
  onChange: (role: UserRole) => void
  disabled?: boolean
}) {
  const config = ROLE_CONFIG[role]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ backgroundColor: config.color }}
      >
        {config.label}
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {ROLES.map((r) => (
          <DropdownMenuItem
            key={r}
            onClick={() => onChange(r)}
            className="gap-2"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: ROLE_CONFIG[r].color }}
            />
            {ROLE_CONFIG[r].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
