"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  RAMA_COLOR,
  RAMA_LABEL,
  type SuenoNodo,
  type SuenoRama,
} from "@/lib/sueno/arbol-config"
import { SuenoKpiCard } from "./sueno-kpi-card"
import { SuenoEditDialog } from "./sueno-edit-dialog"
import "./arbol-tree.css"

const RAMA_ORDEN: SuenoRama[] = ["seguridad", "productividad", "cliente"]

/** Nodo recursivo del árbol (tarjeta + flecha + hijos en cascada). */
function TreeNode({
  node,
  childrenMap,
  editable,
  isRoot,
  onEdit,
}: {
  node: SuenoNodo
  childrenMap: Map<string, SuenoNodo[]>
  editable: boolean
  isRoot: boolean
  onEdit: (n: SuenoNodo) => void
}) {
  const kids = childrenMap.get(node.key) ?? []
  return (
    <li>
      <div className="sueno-node">
        {!isRoot && <span className="sueno-arrow" aria-hidden />}
        <div className="w-32 sm:w-36">
          <SuenoKpiCard
            nodo={node}
            editable={editable}
            destacado={isRoot}
            onEdit={onEdit}
          />
        </div>
      </div>
      {kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <TreeNode
              key={k.key}
              node={k}
              childrenMap={childrenMap}
              editable={editable}
              isRoot={false}
              onEdit={onEdit}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export function ArbolSueno({
  nodos,
  editable,
  anio,
}: {
  nodos: SuenoNodo[]
  editable: boolean
  anio: number
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(true)
  const [editNodo, setEditNodo] = useState<SuenoNodo | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const childrenMap = useMemo(() => {
    const m = new Map<string, SuenoNodo[]>()
    for (const n of nodos) {
      if (!n.parentKey) continue
      const arr = m.get(n.parentKey) ?? []
      arr.push(n)
      m.set(n.parentKey, arr)
    }
    return m
  }, [nodos])

  const raices = useMemo(
    () =>
      nodos
        .filter((n) => !n.parentKey)
        .sort(
          (a, b) => RAMA_ORDEN.indexOf(a.rama) - RAMA_ORDEN.indexOf(b.rama),
        ),
    [nodos],
  )

  function openEdit(n: SuenoNodo) {
    setEditNodo(n)
    setDialogOpen(true)
  }

  return (
    <section className="mb-6">
      <Card className="overflow-hidden border-slate-200 p-0 gap-0">
        {/* Banner del Sueño */}
        <div className="bg-gradient-to-r from-[#0a1628] to-[#1a2d52] px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 size-5 shrink-0 text-amber-300" />
              <div>
                <h2 className="text-lg font-bold">El Sueño {anio}</h2>
                <p className="mt-1 max-w-4xl text-sm leading-snug text-slate-200">
                  Soñamos con ser la empresa que marque la diferencia en nuestro
                  rubro, liderando con excelencia operativa, pasión y
                  profesionalismo en cada área. Lo medimos a través del
                  compromiso en la seguridad de las personas{" "}
                  <strong className="text-orange-300">(TRI)</strong>, la
                  eficiencia en nuestros costos logísticos{" "}
                  <strong className="text-blue-300">(VLC/HL)</strong> y la
                  satisfacción de nuestros clientes{" "}
                  <strong className="text-amber-300">(OTIF)</strong>.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAbierto((v) => !v)}
              className="shrink-0 text-white hover:bg-white/10 hover:text-white"
            >
              {abierto ? (
                <>
                  Ocultar <ChevronUp className="ml-1 size-4" />
                </>
              ) : (
                <>
                  Ver indicadores <ChevronDown className="ml-1 size-4" />
                </>
              )}
            </Button>
          </div>
        </div>

        {abierto && (
          <div className="p-5">
            {/* 3 ramas lado a lado (como el PPT); scroll horizontal si no entra */}
            <div className="overflow-x-auto pb-2">
              <div className="mx-auto flex w-max items-start justify-center gap-5 md:gap-8">
                {raices.map((raiz) => (
                  <div key={raiz.key} className="flex flex-col items-center">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className="inline-block size-3 rounded-full"
                        style={{ backgroundColor: RAMA_COLOR[raiz.rama] }}
                      />
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {RAMA_LABEL[raiz.rama]}
                      </p>
                    </div>
                    <div
                      className="sueno-tree"
                      style={
                        {
                          "--sueno-line": RAMA_COLOR[raiz.rama],
                        } as React.CSSProperties
                      }
                    >
                      <ul>
                        <TreeNode
                          node={raiz}
                          childrenMap={childrenMap}
                          editable={editable}
                          isRoot
                          onEdit={openEdit}
                        />
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-3 text-center text-xs text-slate-400">
              Las flechas muestran cómo cada indicador se despliega en los del
              nivel siguiente (cascadeo del Sueño).
            </p>
          </div>
        )}
      </Card>

      {editable && (
        <SuenoEditDialog
          nodo={editNodo}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSaved={() => router.refresh()}
        />
      )}
    </section>
  )
}
