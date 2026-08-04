# Design

Sistema visual de dpo-app ("mundo navy"), decidido 2026-08-04 evolucionando la identidad
incumbente (sidebar #0a1628 + acento blue-600). Vale para ambos tenants.

## Mundo

**Sala de control nocturna:** el chrome de la app (sidebar, páginas de mando como la home
y /devolucion) vive en azul marino profundo; el contenido operativo vive en superficies
blancas que flotan encima con sombra real. El color saturado está reservado para significar
(pilar, estado, acción), nunca para decorar.

## Tokens

- **Navy (chrome):** `--color-navy #0a1628`, `--color-navy-light #132040`,
  `--color-navy-lighter #1a2d52` (definidos en `globals.css` @theme → clases `bg-navy`, etc.).
  Fondos de mando: `bg-gradient-to-b from-navy-light to-navy`.
- **Acción / marca:** `blue-600` (botones primarios, logo block, ítem activo del menú).
- **Colores de pilar** (dot + acentos; son identidad de dominio, no decoración):
  Seguridad red-500 · Gente amber-500 · Gestión violet-500 · Entrega blue-500 ·
  Flota orange-500 · Almacén emerald-500 · Planeamiento cyan-500.
- **Semáforo de notas DPO:** 0 red · 1 orange · 3 yellow · 5 emerald · N/A slate.
- **Superficies:** cards blancas `rounded-xl` (o `rounded-2xl` en héroes) con
  `shadow-lg shadow-black/20` sobre navy; `border-slate-200` + `shadow-sm` sobre fondo claro.
- **Éxito/avance:** emerald-400 sobre navy, emerald-500/600 sobre blanco.

## Texto sobre navy

Jerarquía fija (nunca gris puro sobre navy): título `text-white font-bold tracking-tight`;
secundario `text-blue-200/80`; terciario/labels `text-blue-200/60`; interactivo inactivo
`text-blue-100` → hover `text-white`. Controles sobre navy: `bg-white/10 border-white/10`,
focus `ring-white/20`.

## Tipografía

Geist (system stack del proyecto). Body de trabajo 15px (`text-[15px]`), labels/uppercase
`text-[11px] font-semibold uppercase tracking-wider`, títulos de página `text-3xl`.
Números tabulares (`tabular-nums`) en todo score, contador y KPI.

## Menú (sidebar)

Navy plano `bg-navy`. Ítems agrupados en secciones tituladas por dominio
(DPO · Operación · Entrega · Flota · Seguridad y Calidad · Gente · Gestión · Pilares ·
Portal · RRHH · Admin). Título de sección = label uppercase `text-blue-200/50`.
Ítem activo: `bg-blue-600 text-white` (pastilla sólida); hover `bg-white/5 text-white`.
La búsqueda de pestañas se mantiene siempre visible (hay ~40 destinos).

## Motion

Un momento por pantalla (ej.: la barra/ruta de progreso que se llena al montar con
`transition-all`). El resto: `transition-colors` discretos. Nada de entrances repetidas
por sección.

## Reglas

- Touch targets ≥40px en controles operativos (uso con guantes/apuro en depósito).
- Acciones de fila siempre visibles en mobile (`md:opacity-0 md:group-hover:opacity-100`
  solo en desktop).
- Estados vencido/crítico en rojo con peso (`font-semibold text-red-600`), no solo color.
- Las pantallas de datos densos (tablas de módulos) mantienen fondo claro; el navy
  full-bleed es para pantallas de mando/resumen.
