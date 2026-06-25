"use client"

import { useEffect } from "react"
import { toast } from "sonner"

/**
 * Permite pegar (Ctrl/Cmd+V) una imagen del portapapeles en CUALQUIER
 * <input type="file"> de la app, sin tener que abrir el selector de archivos.
 *
 * Se monta una sola vez en el layout raíz y escucha el evento "paste" a nivel
 * documento. Cuando el portapapeles trae una imagen (captura de pantalla o foto
 * copiada), resuelve a qué input de archivo corresponde según el contexto activo
 * (el campo donde el usuario hizo foco/clic, o el diálogo abierto) e inyecta el
 * archivo vía DataTransfer disparando un evento "change" nativo, de modo que cada
 * formulario lo recibe igual que si el usuario lo hubiera elegido a mano.
 *
 * No requiere tocar los ~33 formularios de carga existentes: funciona sobre los
 * inputs nativos, acepten foto, pdf, excel o lo que fuere.
 */
export function PasteImageToFileInput() {
  useEffect(() => {
    // Último elemento con el que el usuario interactuó (foco o clic). Sirve para
    // saber a qué campo apunta el pegado cuando hay varios inputs en pantalla.
    let lastActivity: HTMLElement | null = null

    const trackActivity = (e: Event) => {
      const t = e.target
      if (t instanceof HTMLElement) lastActivity = t
    }
    document.addEventListener("focusin", trackActivity, true)
    document.addEventListener("pointerdown", trackActivity, true)

    const onPaste = (e: ClipboardEvent) => {
      const dt = e.clipboardData
      if (!dt) return

      // Si el foco está en un campo de texto y el portapapeles trae texto,
      // dejamos que el navegador pegue el texto y no interferimos.
      const active = document.activeElement
      const editingText =
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLInputElement && isTextInput(active)) ||
        (active instanceof HTMLElement && active.isContentEditable)
      const hasText = Array.from(dt.items).some((it) => it.kind === "string")
      if (editingText && hasText) return

      const imageFile = extractImage(dt)
      if (!imageFile) return

      const target = resolveTarget(lastActivity)
      if (!target) {
        toast.info("Hacé clic en el campo de archivo y volvé a pegar la imagen")
        return
      }

      e.preventDefault()
      assignFile(target, imageFile)
      toast.success("Imagen pegada")
    }

    document.addEventListener("paste", onPaste)
    return () => {
      document.removeEventListener("paste", onPaste)
      document.removeEventListener("focusin", trackActivity, true)
      document.removeEventListener("pointerdown", trackActivity, true)
    }
  }, [])

  return null
}

function isTextInput(el: HTMLInputElement): boolean {
  const noText = [
    "file",
    "checkbox",
    "radio",
    "button",
    "submit",
    "reset",
    "range",
    "color",
    "image",
  ]
  return !noText.includes(el.type)
}

/** Inputs de archivo conectados y habilitados dentro de un contenedor. */
function fileInputsIn(root: ParentNode): HTMLInputElement[] {
  return Array.from(
    root.querySelectorAll<HTMLInputElement>('input[type="file"]')
  ).filter((el) => !el.disabled && el.isConnected)
}

function isVisibleEl(el: Element): boolean {
  if (typeof el.checkVisibility === "function") return el.checkVisibility()
  return (el as HTMLElement).offsetParent !== null
}

/**
 * Decide a qué input de archivo va la imagen pegada:
 *  1. Si el último elemento activo ES un input file → ese.
 *  2. El input más cercano (en el árbol) al punto de actividad del usuario.
 *  3. El diálogo/sheet abierto más arriba → su primer input file.
 *  4. Si en toda la página hay un único input file → ese.
 */
function resolveTarget(lastActivity: HTMLElement | null): HTMLInputElement | null {
  if (
    lastActivity instanceof HTMLInputElement &&
    lastActivity.type === "file" &&
    !lastActivity.disabled &&
    lastActivity.isConnected
  ) {
    return lastActivity
  }

  // (2) Subir desde el punto de actividad hasta el primer ancestro que contenga
  // algún input file; así caemos en el "grupo de campo" más chico (p. ej. el
  // recuadro de "frente" vs el de "dorso") en vez de adivinar.
  if (lastActivity && lastActivity.isConnected) {
    let node: HTMLElement | null = lastActivity
    while (node) {
      const inputs = fileInputsIn(node)
      if (inputs.length === 1) return inputs[0]
      if (inputs.length > 1) return nearest(inputs, lastActivity)
      node = node.parentElement
    }
  }

  // (3) Diálogo/sheet abierto más arriba en el DOM.
  const dialogs = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-slot="dialog-content"], [data-slot="sheet-content"], [role="dialog"], [role="alertdialog"]'
    )
  ).filter((d) => isVisibleEl(d))
  const topDialog = dialogs[dialogs.length - 1]
  if (topDialog) {
    const inputs = fileInputsIn(topDialog)
    if (inputs.length >= 1) return inputs[0]
  }

  // (4) Única opción posible en toda la página.
  const all = fileInputsIn(document)
  if (all.length === 1) return all[0]

  return null
}

/** De varios inputs, el que comparte el ancestro común más profundo con `ref`. */
function nearest(inputs: HTMLInputElement[], ref: HTMLElement): HTMLInputElement {
  const refChain = new Map<Element, number>()
  let n: HTMLElement | null = ref
  let depth = 0
  while (n) {
    refChain.set(n, depth++)
    n = n.parentElement
  }
  let best = inputs[0]
  let bestDepth = Infinity
  for (const inp of inputs) {
    let a: HTMLElement | null = inp
    while (a) {
      if (refChain.has(a)) {
        const d = refChain.get(a)!
        if (d < bestDepth) {
          bestDepth = d
          best = inp
        }
        break
      }
      a = a.parentElement
    }
  }
  return best
}

/** Extrae la primera imagen del portapapeles (archivo o ítem). */
function extractImage(dt: DataTransfer): File | null {
  for (const f of Array.from(dt.files)) {
    if (f.type.startsWith("image/")) return withName(f)
  }
  for (const it of Array.from(dt.items)) {
    if (it.kind === "file" && it.type.startsWith("image/")) {
      const f = it.getAsFile()
      if (f) return withName(f)
    }
  }
  return null
}

/** Las imágenes pegadas suelen llamarse "image.png": les damos un nombre único. */
function withName(f: File): File {
  if (f.name && f.name !== "image.png") return f
  const ext = f.type.split("/")[1]?.split("+")[0] || "png"
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(
    d.getHours()
  )}${p(d.getMinutes())}${p(d.getSeconds())}`
  return new File([f], `pegada-${stamp}.${ext}`, {
    type: f.type,
    lastModified: f.lastModified,
  })
}

/** Inyecta el archivo en el input y notifica a React con un "change" nativo. */
function assignFile(input: HTMLInputElement, file: File) {
  const data = new DataTransfer()
  // Si el input admite varios archivos, conservamos los ya elegidos.
  if (input.multiple && input.files) {
    for (const f of Array.from(input.files)) data.items.add(f)
  }
  data.items.add(file)
  input.files = data.files
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))
}
