# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Administrativos y mandos medios de la distribuidora** (admin, supervisor, admin_rrhh, auditor): gestionan la operación diaria de logística — auditorías DPO, flota, almacén, gente, entregas — mitad desde PC de oficina, mitad desde el celular en el depósito.
- **Empleados operativos** (choferes, ayudantes, pickeros): entran casi siempre desde el celular a su portal curado (mis tareas, mis capacitaciones, fichaje, checklists, reporte de seguridad).
- Dos tenants de la misma app con Supabase separado: **Mercosur Región Pampeana** y **Misiones** (branding por env vars `NEXT_PUBLIC_EMPRESA_*`, flags `pampeanaOnly`/`misionesOnly`).

## Product Purpose

Sistema de gestión operativa integral de la distribuidora, construido alrededor del programa **DPO** (Distributor Performance Operations, el modelo de excelencia de ABI/Quilmes/CMQ). Digitaliza los 7 pilares (Seguridad, Gente, Gestión, Entrega, Flota, Almacén, Planeamiento), sus rutinas, checklists, KPIs y planes de acción. Éxito = subir el score de la auditoría DPO semestral (meta 0.73) y que la operación diaria realmente use las rutinas (no solo para la auditoría).

## Operating Context

- La auditoría DPO es semestral (H1/H2); el auditor externo deja devolución por pilar que se trabaja como plan de acción (sección /devolucion).
- Rutinas reales: reunión matinal pre-ruta, reunión semanal de logística, comités (seguridad, gente), OWDs, checklists de flota diarios, conteos de inventario, seguimiento de rechazos/roturas/NPS.
- Integraciones vivas: Chess ERP (ventas/logística), Foxtrot (telemetría/entregas), GESCOM (ventas paralelo), biométrico de asistencia, OpenAI (análisis), crons de Vercel.
- Se usa en oficina (PC) y en depósito/ruta (celular), a veces con conectividad mediocre.

## Capabilities and Constraints

- Next.js 16 App Router + Supabase (auth con roles admin/supervisor/auditor/viewer/empleado/admin_rrhh) + Tailwind v4 + shadcn sobre @base-ui.
- ~80 rutas agrupadas en un `(dashboard)` layout con sidebar propia + nav mobile; el rol del usuario filtra qué ve.
- El menú actual es una lista plana de ~30 ítems + 4 secciones (Portal, Mi área, Personal a cargo, Admin RRHH) + navegación por pilares: desborda y cuesta encontrar las cosas — ordenarlo es parte del encargo.
- No romper flujos operativos existentes: la app está en producción y se usa a diario.
- Terminología del dominio que la UI debe respetar: DPO, pilares, OWD, PDA (plan de acción), SKAP, matinal, T1/T2, SIF, 5S, RMD, TML, SLA.

## Brand Commitments

- Identidad **propia de la app** (decidido 2026-08-04): evolucionar el mundo navy existente (`--color-navy #0a1628` + azul `blue-600`) hacia una identidad pulida; sin logos corporativos de Mercosur/Quilmes.
- El nombre visible de la empresa viene de `NEXT_PUBLIC_EMPRESA_NOMBRE` (multi-tenant): el branding debe funcionar para ambos tenants.

## Evidence on Hand

- Devolución real de auditoría H1 2026 con scores por pilar (Excel + sección /devolucion con 284 tareas).
- KPIs y datos reales en producción (indicadores, checklists, rechazos, NPS, asistencia).
- No hay logo propio de la app: no inventar uno figurativo; la marca es tipográfica ("DPO" + nombre de empresa del tenant).

## Product Principles

1. **La rutina diaria manda:** cada pantalla sirve a una rutina operativa concreta; encontrarla y completarla rápido vale más que cualquier ornamento.
2. **Un solo sistema para dos mundos:** la misma app debe sentirse igual de resuelta en la PC de oficina y en el celular del depósito.
3. **El score DPO es el norte:** la jerarquía visual prioriza lo que mueve el score (pilares débiles, mandatorias, planes de acción vencidos).
4. **Rol = vista:** cada rol ve solo lo suyo; el menú y la home se curan por rol, no se filtran a último momento.
5. **Multi-tenant sin bifurcar:** toda decisión visual debe funcionar con nombre de empresa variable y features por tenant.

## Accessibility & Inclusion

Uso frecuente en celular con guantes/apuro en depósito: targets táctiles generosos y contraste alto. Sin requisitos formales de norma declarados.
