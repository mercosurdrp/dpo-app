"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Users,
  UserPlus,
  Loader2,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  KeyRound,
  Trash2,
  Power,
  PowerOff,
  Search,
  BadgeCheck,
  Clock,
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
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  createUser,
  updateUser,
  updateUserRole,
  toggleUserActive,
  deleteUser,
  resetUserPassword,
} from "@/actions/admin"
import type { UserWithStats, UserRole } from "@/types/database"
import { EmpleadoPicker } from "./empleado-picker"

const ROLE_CONFIG: Record<UserRole, { label: string; color: string }> = {
  admin: { label: "Admin", color: "#3B82F6" },
  auditor: { label: "Auditor", color: "#8B5CF6" },
  viewer: { label: "Viewer", color: "#64748B" },
  empleado: { label: "Empleado", color: "#F59E0B" },
  supervisor: { label: "Supervisor", color: "#0EA5E9" },
  admin_rrhh: { label: "Admin RRHH", color: "#10B981" },
}

const ROLES: UserRole[] = [
  "admin",
  "admin_rrhh",
  "auditor",
  "supervisor",
  "viewer",
  "empleado",
]

type FilterTab = "todos" | "activos" | "inactivos"

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Nunca"
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = now - then
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return "Hace instantes"
  if (mins < 60) return `Hace ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `Hace ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 30) return `Hace ${days} ${days === 1 ? "día" : "días"}`
  const months = Math.round(days / 30)
  if (months < 12) return `Hace ${months} ${months === 1 ? "mes" : "meses"}`
  const years = Math.round(days / 365)
  return `Hace ${years} ${years === 1 ? "año" : "años"}`
}

export function UsuariosClient({
  users: initialUsers,
  currentUserId,
}: {
  users: UserWithStats[]
  currentUserId: string
}) {
  const router = useRouter()

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newNombre, setNewNombre] = useState("")
  const [newRole, setNewRole] = useState<UserRole>("auditor")

  // Edit dialog
  const [editUser, setEditUser] = useState<UserWithStats | null>(null)
  const [editNombre, setEditNombre] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editRole, setEditRole] = useState<UserRole>("auditor")
  const [editing, setEditing] = useState(false)

  // Reset password dialog
  const [resetUser, setResetUser] = useState<UserWithStats | null>(null)
  const [resetPwd, setResetPwd] = useState("")
  const [resetting, setResetting] = useState(false)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<UserWithStats | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Per-row loading & list state
  const [toggling, setToggling] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Filters
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<FilterTab>("todos")

  const counts = useMemo(() => {
    const total = initialUsers.length
    const activos = initialUsers.filter((u) => u.active).length
    const inactivos = total - activos
    return { todos: total, activos, inactivos }
  }, [initialUsers])

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    return initialUsers.filter((u) => {
      if (tab === "activos" && !u.active) return false
      if (tab === "inactivos" && u.active) return false
      if (!q) return true
      return (
        u.nombre.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      )
    })
  }, [initialUsers, query, tab])

  // -------- Handlers --------
  function resetCreateForm() {
    setNewEmail("")
    setNewPassword("")
    setNewNombre("")
    setNewRole("auditor")
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newEmail || !newPassword || !newNombre) {
      toast.error("Todos los campos son requeridos")
      return
    }
    setCreating(true)
    const result = await createUser({
      email: newEmail,
      password: newPassword,
      nombre: newNombre,
      role: newRole,
    })
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success("Usuario creado exitosamente")
      resetCreateForm()
      setCreateOpen(false)
      router.refresh()
    }
    setCreating(false)
  }

  function openEdit(user: UserWithStats) {
    setEditUser(user)
    setEditNombre(user.nombre)
    setEditEmail(user.email)
    setEditRole(user.role)
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editUser) return
    if (!editNombre || !editEmail) {
      toast.error("Nombre y email son requeridos")
      return
    }
    setEditing(true)
    const result = await updateUser(editUser.id, {
      nombre: editNombre,
      email: editEmail,
      role: editRole,
    })
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success("Usuario actualizado")
      setEditUser(null)
      router.refresh()
    }
    setEditing(false)
  }

  function openReset(user: UserWithStats) {
    setResetUser(user)
    setResetPwd("")
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!resetUser) return
    if (resetPwd.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres")
      return
    }
    setResetting(true)
    const result = await resetUserPassword(resetUser.id, resetPwd)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success("Contraseña actualizada")
      setResetUser(null)
      setResetPwd("")
    }
    setResetting(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const result = await deleteUser(deleteTarget.id)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success("Usuario eliminado")
      setDeleteTarget(null)
      router.refresh()
    }
    setDeleting(false)
  }

  function handleRoleChange(userId: string, role: UserRole) {
    startTransition(async () => {
      const result = await updateUserRole(userId, role)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success(`Rol actualizado a ${ROLE_CONFIG[role].label}`)
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

  // -------- Render --------
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Usuarios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestionar usuarios del sistema
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <UserPlus className="mr-2 h-4 w-4" />
            Nuevo Usuario
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Crear Usuario</DialogTitle>
              <DialogDescription>
                Ingresá los datos del nuevo usuario.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  placeholder="Nombre completo"
                  value={newNombre}
                  onChange={(e) => setNewNombre(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="usuario@ejemplo.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label>Rol</Label>
                <Select
                  value={newRole}
                  onValueChange={(val) => setNewRole(val as UserRole)}
                >
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
                  {creating && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Crear Usuario
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search + filter tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o email"
            className="pl-8"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          <FilterTabButton
            active={tab === "todos"}
            onClick={() => setTab("todos")}
            label="Todos"
            count={counts.todos}
          />
          <FilterTabButton
            active={tab === "activos"}
            onClick={() => setTab("activos")}
            label="Activos"
            count={counts.activos}
          />
          <FilterTabButton
            active={tab === "inactivos"}
            onClick={() => setTab("inactivos")}
            label="Inactivos"
            count={counts.inactivos}
          />
        </div>
      </div>

      {/* Users list */}
      {initialUsers.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
          <Users className="h-14 w-14 text-muted-foreground/40" />
          <h2 className="text-lg font-semibold text-slate-700">
            No hay usuarios
          </h2>
          <p className="text-sm text-muted-foreground">
            Creá el primer usuario para comenzar.
          </p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="flex min-h-[30vh] flex-col items-center justify-center gap-2 rounded-lg border bg-card">
          <Search className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Sin resultados para los filtros actuales.
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
                  <TableHead>Estado</TableHead>
                  <TableHead>Último acceso</TableHead>
                  <TableHead>Creación</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => {
                  const isSelf = user.id === currentUserId
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {user.nombre}
                          {user.email_confirmed_at && (
                            <BadgeCheck
                              className="size-3.5 text-emerald-500"
                              aria-label="Email verificado"
                            />
                          )}
                        </div>
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
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                            user.active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-700"
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              user.active ? "bg-emerald-500" : "bg-red-500"
                            )}
                          />
                          {user.active ? "Activo" : "Inactivo"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {formatRelative(user.last_sign_in_at)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(user.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActionsMenu
                          user={user}
                          isSelf={isSelf}
                          toggling={toggling === user.id}
                          onEdit={() => openEdit(user)}
                          onReset={() => openReset(user)}
                          onToggle={() => handleToggleActive(user.id)}
                          onDelete={() => setDeleteTarget(user)}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filteredUsers.map((user) => {
              const isSelf = user.id === currentUserId
              return (
                <div
                  key={user.id}
                  className="space-y-3 rounded-lg border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 truncate font-medium text-slate-900">
                        {user.nombre}
                        {user.email_confirmed_at && (
                          <BadgeCheck
                            className="size-3.5 shrink-0 text-emerald-500"
                            aria-label="Email verificado"
                          />
                        )}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                    <RowActionsMenu
                      user={user}
                      isSelf={isSelf}
                      toggling={toggling === user.id}
                      onEdit={() => openEdit(user)}
                      onReset={() => openReset(user)}
                      onToggle={() => handleToggleActive(user.id)}
                      onDelete={() => setDeleteTarget(user)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <RoleDropdown
                      role={user.role}
                      onChange={(r) => handleRoleChange(user.id, r)}
                      disabled={isPending}
                    />
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                        user.active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          user.active ? "bg-emerald-500" : "bg-red-500"
                        )}
                      />
                      {user.active ? "Activo" : "Inactivo"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" />
                      Último acceso: {formatRelative(user.last_sign_in_at)}
                    </span>
                    <span>Creado {formatDate(user.created_at)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Edit dialog */}
      <Dialog
        open={editUser !== null}
        onOpenChange={(open) => {
          if (!open) setEditUser(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>
              Actualizá los datos del usuario.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-nombre">Nombre</Label>
              <Input
                id="edit-nombre"
                value={editNombre}
                onChange={(e) => setEditNombre(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                required
              />
              {editUser && editEmail !== editUser.email && (
                <p className="text-xs text-amber-600">
                  Al cambiar el email se actualiza también el email de
                  autenticación del usuario.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select
                value={editRole}
                onValueChange={(val) => setEditRole(val as UserRole)}
              >
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
            {editUser && (
              <div className="space-y-2 border-t pt-4">
                <EmpleadoPicker userId={editUser.id} />
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditUser(null)}
                disabled={editing}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={editing}>
                {editing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar cambios
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog
        open={resetUser !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResetUser(null)
            setResetPwd("")
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
            <DialogDescription>
              Asigná una nueva contraseña para{" "}
              <span className="font-medium">{resetUser?.nombre}</span>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-pwd">Nueva contraseña</Label>
              <Input
                id="reset-pwd"
                type="password"
                value={resetPwd}
                onChange={(e) => setResetPwd(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                minLength={6}
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetUser(null)}
                disabled={resetting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={resetting}>
                {resetting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Actualizar contraseña
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar usuario</DialogTitle>
            <DialogDescription>
              Vas a eliminar a{" "}
              <span className="font-medium">{deleteTarget?.nombre}</span>. Esto
              elimina al usuario del sistema (auth + perfil). No se puede
              deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FilterTabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1 text-sm font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label} ({count})
    </button>
  )
}

function RowActionsMenu({
  user,
  isSelf,
  toggling,
  onEdit,
  onReset,
  onToggle,
  onDelete,
}: {
  user: UserWithStats
  isSelf: boolean
  toggling: boolean
  onEdit: () => void
  onReset: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Acciones" />
        }
      >
        {toggling ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <MoreHorizontal className="size-4" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="size-4" />
          Editar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onReset}>
          <KeyRound className="size-4" />
          Cambiar contraseña
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onToggle}>
          {user.active ? (
            <>
              <PowerOff className="size-4" />
              Desactivar
            </>
          ) : (
            <>
              <Power className="size-4" />
              Activar
            </>
          )}
        </DropdownMenuItem>
        {!isSelf && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-4" />
              Eliminar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
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
