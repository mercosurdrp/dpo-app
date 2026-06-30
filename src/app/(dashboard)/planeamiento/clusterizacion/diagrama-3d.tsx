"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js"
import type { CuboId } from "@/actions/clusterizacion-tipos"

export interface Punto3D {
  id: CuboId
  label: string
  color: string
  /** x = costo (0 menor, 1 mayor) · y = crecimiento (0 menor, 1 mayor) · z = facturación (0 baja, 1 alta) */
  x: 0 | 1
  y: 0 | 1
  z: 0 | 1
  count: number
}

const ALTO = 460
const SIZE = 1.2 // lado del cubo (un poco más grande)
const SEP = 1.7 // separación entre centros de capas (gap ≈ 0.5)
const HALF = SIZE / 2
// Costo $/HL y Facturación: parten de 0 (capa baja pegada al origen, alta hacia +).
const posCF = (v: 0 | 1) => (v === 0 ? HALF : HALF + SEP)
// Crecimiento: centrado en 0 (negativo abajo, positivo arriba).
const posCrec = (v: 0 | 1) => (v === 0 ? -SEP / 2 : SEP / 2)
// Centro del bloque (para apuntar la cámara/controles).
const CTR = (HALF + (HALF + SEP)) / 2

function etiqueta(texto: string, clase: string): CSS2DObject {
  const div = document.createElement("div")
  div.textContent = texto
  div.className = clase
  return new CSS2DObject(div)
}

export default function Diagrama3D({
  puntos,
  selected,
  onSelect,
}: {
  puntos: Punto3D[]
  selected: CuboId | null
  onSelect: (id: CuboId) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const meshesRef = useRef<THREE.Mesh[]>([])
  const onSelectRef = useRef(onSelect)
  const puntosRef = useRef(puntos)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])
  useEffect(() => {
    puntosRef.current = puntos
  }, [puntos])

  // Escena (una sola vez).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const width = container.clientWidth || 600

    const scene = new THREE.Scene()
    scene.background = new THREE.Color("#f8fafc")

    const camera = new THREE.PerspectiveCamera(45, width / ALTO, 0.1, 100)
    camera.position.set(CTR + 5, 3.8, CTR + 5.6)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, ALTO)
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)

    const labelRenderer = new CSS2DRenderer()
    labelRenderer.setSize(width, ALTO)
    labelRenderer.domElement.style.position = "absolute"
    labelRenderer.domElement.style.top = "0"
    labelRenderer.domElement.style.left = "0"
    labelRenderer.domElement.style.pointerEvents = "none"
    container.appendChild(labelRenderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(CTR, 0, CTR)

    scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const dir = new THREE.DirectionalLight(0xffffff, 0.85)
    dir.position.set(5, 8, 6)
    scene.add(dir)

    // 8 cubos.
    const geo = new THREE.BoxGeometry(SIZE, SIZE, SIZE)
    const edgesGeo = new THREE.EdgesGeometry(geo)
    const meshes: THREE.Mesh[] = []
    for (const pt of puntosRef.current) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(pt.color),
        transparent: true,
        opacity: 0.95,
        metalness: 0.1,
        roughness: 0.55,
      })
      // x = costo, y = crecimiento (vertical), z = facturación
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(posCF(pt.x), posCrec(pt.y), posCF(pt.z))
      mesh.userData.cuboId = pt.id
      mesh.add(new THREE.LineSegments(edgesGeo, new THREE.LineBasicMaterial({ color: "#1e293b" })))
      mesh.add(etiqueta(`${pt.label}\n${pt.count}`, "pointer-events-none select-none whitespace-pre-line rounded bg-white/75 px-1 text-center text-[10px] font-bold leading-tight text-slate-900"))
      scene.add(mesh)
      meshes.push(mesh)
    }
    meshesRef.current = meshes

    // Ejes. Costo (X) y Facturación (Z) PARTEN DE 0 hacia + ; Crecimiento (Y)
    // cruza el 0 (negativo abajo, positivo arriba).
    const POS = HALF + SEP + HALF + 0.5 // largo del eje positivo (más allá de la capa alta)
    const CREC = SEP / 2 + HALF + 0.5 // medio largo del eje de crecimiento
    const ejeMat = new THREE.LineBasicMaterial({ color: "#94a3b8" })
    const eje = (a: THREE.Vector3, b: THREE.Vector3) =>
      new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), ejeMat)
    scene.add(eje(new THREE.Vector3(0, 0, 0), new THREE.Vector3(POS, 0, 0))) // costo
    scene.add(eje(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, POS))) // facturación
    scene.add(eje(new THREE.Vector3(0, -CREC, 0), new THREE.Vector3(0, CREC, 0))) // crecimiento

    const addLabel = (texto: string, clase: string, p: THREE.Vector3) => {
      const l = etiqueta(texto, clase)
      l.position.copy(p)
      scene.add(l)
    }
    const cap = "pointer-events-none select-none whitespace-nowrap text-xs font-semibold text-slate-500"
    const tick = "pointer-events-none select-none whitespace-nowrap text-[10px] text-slate-400"
    const lo = posCF(0)
    const hi = posCF(1)
    // Costo $/HL (X) desde 0.
    addLabel("Costo $/HL →", cap, new THREE.Vector3(POS + 0.15, 0, 0))
    addLabel("0", tick, new THREE.Vector3(0, -0.3, 0))
    addLabel("Menor", tick, new THREE.Vector3(lo, -0.35, 0))
    addLabel("Mayor", tick, new THREE.Vector3(hi, -0.35, 0))
    // Facturación (Z) desde 0.
    addLabel("Facturación →", cap, new THREE.Vector3(0, 0, POS + 0.15))
    addLabel("Baja", tick, new THREE.Vector3(0, -0.35, lo))
    addLabel("Alta", tick, new THREE.Vector3(0, -0.35, hi))
    // Crecimiento (Y) cruza 0.
    addLabel("Crecimiento +", cap, new THREE.Vector3(0, CREC + 0.15, 0))
    addLabel("− (cae)", tick, new THREE.Vector3(0.35, -CREC, 0))

    // Click por raycasting.
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(meshes, false)
      const id = hits[0]?.object.userData.cuboId as CuboId | undefined
      if (id) onSelectRef.current(id)
    }
    renderer.domElement.addEventListener("click", onClick)

    let raf = 0
    const animate = () => {
      controls.update()
      renderer.render(scene, camera)
      labelRenderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    animate()

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth || width
      camera.aspect = w / ALTO
      camera.updateProjectionMatrix()
      renderer.setSize(w, ALTO)
      labelRenderer.setSize(w, ALTO)
    })
    ro.observe(container)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener("click", onClick)
      controls.dispose()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = m.material
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else if (mat) mat.dispose()
      })
      renderer.dispose()
      renderer.domElement.parentNode?.removeChild(renderer.domElement)
      labelRenderer.domElement.parentNode?.removeChild(labelRenderer.domElement)
    }
  }, [])

  // Resaltar el cubo seleccionado. Three.js obliga a mutar los materiales/escala
  // de los objetos (viven fuera del flujo de React), por eso desactivamos la regla.
  useEffect(() => {
    /* eslint-disable react-hooks/immutability */
    for (const m of meshesRef.current) {
      const mat = m.material as THREE.MeshStandardMaterial
      const isSel = selected === (m.userData.cuboId as CuboId)
      mat.opacity = selected ? (isSel ? 1 : 0.16) : 0.95
      mat.emissive = new THREE.Color(isSel ? mat.color.getHex() : 0x000000)
      mat.emissiveIntensity = isSel ? 0.4 : 0
      m.scale.setScalar(isSel ? 1.12 : 1)
    }
    /* eslint-enable react-hooks/immutability */
  }, [selected])

  return <div ref={containerRef} className="relative h-[460px] w-full" />
}
