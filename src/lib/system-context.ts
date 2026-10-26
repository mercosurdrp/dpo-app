import { AsyncLocalStorage } from "node:async_hooks"

/**
 * Contexto de sistema: deja correr las server actions de lectura (las mismas
 * que usan las pantallas) desde un cron, sin sesión de usuario.
 *
 * Adentro de `runAsSystem`, `createClient()` devuelve el cliente admin
 * (service role) y `getProfile()` un perfil sintético con rol admin. Así un
 * cron reusa, por ejemplo, `getIndicadoresMes` tal cual la ve la reunión en
 * vez de duplicar 2.000 líneas de cálculo.
 *
 * SOLO se debe entrar desde código de servidor que ya validó el pedido (ej.
 * Bearer CRON_SECRET). El navegador no tiene forma de activarlo: el store vive
 * en memoria del proceso y nunca se arma a partir de datos del request.
 */
const storage = new AsyncLocalStorage<{ motivo: string }>()

export function runAsSystem<T>(motivo: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ motivo }, fn)
}

export function isSystem(): boolean {
  return storage.getStore() !== undefined
}
