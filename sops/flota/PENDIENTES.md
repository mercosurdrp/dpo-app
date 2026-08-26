# Flota — qué falta de verdad, punto por punto

Verificado el **26/08/2026 contra la base de Pampeana**, no contra el comentario
del auditor: la auditoría es del 04–06/08 y varias cosas se hicieron después.
Cada línea dice de dónde sale el dato.

**Regla de lectura:** ✅ = verificado que está. ⚠️ = falta de verdad.

---

## Lo que YA ESTÁ y no hay que volver a hacer

- ✅ **1.4 — La disposición de neumáticos está cerrada.** Retiro del 21/08 a
  **Kumen Co S.A.**, 4 cubiertas 275/80R22.5, con números de fuego
  (TMP_19, 9, 54, 55) y el certificado de disposición final adjunto. Está
  cargado en el módulo (`mantenimiento_residuos`) **y** como evidencia DPO en el
  punto 1.4. Eso cubre R1.4.1 y R1.4.2 completo, incluido el número de fuego que
  el requisito pide explícitamente.
- ✅ **2.4 — El circuito de correctivo interno ya existe en la app** desde el
  25/08: el repuesto de la OT apunta al ítem del pañol y descuenta stock solo.
  Era exactamente lo que pidió el auditor ("sumar la OT para cerrar el círculo
  con el descuento en el stock").
- ✅ **4.2 — La pirámide de mantenimiento ya está construida** en la app
  (Mantenimiento → Análisis → Pirámide de defectos), mapeada a R4.2.3.
- ✅ **4.1 — El CIL se hace y está documentado**: SOP rev 01, material de
  capacitación, foto del área de lavado, 33 registros sobre 11 unidades. Todo
  subido el 05/08, un día DESPUÉS de la auditoría: por eso el punto figura 0.
- ✅ **Las metas de los KPI están puestas** — 20 de 20. Sólo faltan las dos
  nuevas (Trazabilidad de egresos y Desgaste de cubiertas), que salen con el
  SQL pendiente.
- ✅ **1.1, 1.2, 1.3 y 2.1** — no deben nada. 2.1 sacó 5.

---

## Lo que falta de verdad

### ⚠️ A. Cosas que se resuelven USANDO la app, no escribiendo un papel

Son las tres más importantes: la herramienta ya está, nadie la usó todavía.

1. **La capacitación de CIL está cargada pero nadie la hizo.**
   Figura en estado `programada`, instructor Fausto Azzaretti, fecha 05/08, y
   tiene **0 respuestas**: ningún empleado la completó. El propio SOP de CIL
   dice "se dicta y se registra en el módulo de Capacitaciones con evaluación de
   comprensión". Eso es **R4.1.2** ("todos los operadores debidamente
   capacitados") y hoy no hay con qué probarlo.
   → Dictarla y que la completen. Es lo que más rápido sube el 4.1.

2. **Ninguna herramienta de gestión está enganchada a flota.**
   Hay 13 cargadas (5 Porqués, PDCA) y **las 13 son de seguridad y depósito,
   cero de flota**. El botón para abrirlas desde una OT correctiva o desde un
   KPI en rojo se deployó el 25/08 y no se usó.
   → Toca **R2.4.2**, **R3.1.5**, **R4.2.2** y todos los "se toman acciones".
   Con abrir un 5 Porqués sobre una OT correctiva real ya hay evidencia.

3. **Hay un solo plan de acción de flota** (estándares, julio, todavía abierto).
   Varios requisitos piden "se toman acciones para mejorar el resultado del KPI".
   Con un plan de julio abierto, eso no se sostiene.
   → Cerrá ese y abrí uno del mes sobre cualquier KPI fuera de meta.

4. **El correctivo interno sigue sin registrarse.** Las 12 OT correctivas desde
   el 01/07 tienen taller externo; ninguna es interna. El cambio de foco que
   marcó el auditor todavía no aparece.
   → La próxima reparación de depósito: cargarla como OT y elegir el repuesto
   del pañol.

### ⚠️ B. Los 8 SOP a subir

Están escritos, en `sops\flota\`, en .docx. **Ninguno está subido.**
Se suben en Pilares → Flota → SOP. Antes de firmar cada uno: tu nombre en
Control de revisiones y los responsables del RACI.

| # | Punto | Nombre del SOP | Archivo | Por qué |
|---|---|---|---|---|
| 1 | 4.3 | SOP — Metas de Sustentabilidad de Flota | `4-3-metas-de-sustentabilidad.docx` | el punto no tiene **ninguna** evidencia |
| 2 | 4.2 | SOP — Mejoras y Resultados de Mantenimiento | `4-2-mejoras-y-resultados-de-mantenimiento.docx` | el punto no tiene **ninguna** evidencia |
| 3 | 3.2 | SOP — Presupuesto de Gastos de Flota | `3-2-presupuesto-de-gastos-de-flota.docx` | el único SOP del punto está **archivado** |
| 4 | 2.4 | SOP — Mantenimiento Correctivo | `2-4-mantenimiento-correctivo.docx` | sólo hay "Auxilio en Ruta", que es el correctivo en calle |
| 5 | 2.3 | SOP — Políticas y Gestión de Piezas de Inventario | `2-3-gestion-de-repuestos.docx` | los dos viejos no tienen días de stock ni frecuencia de conteo (R2.3.2) |
| 6 | 3.4 | SOP — Políticas y Gestión de Neumáticos | `3-4-politicas-y-gestion-de-neumaticos.docx` | unifica las dos políticas sueltas |
| 7 | 3.3 | SOP — Consumo de Combustible | `3-3-consumo-de-combustible.docx` | los locales están archivados; queda sólo la política corporativa |
| 8 | 1.4 | SOP — Disposición de Residuos de Mantenimiento | `1-4-residuos-de-mantenimiento.docx` | **el menos urgente**: el punto ya tiene SOP y certificado. Este es mejor (RACI, corrientes, indicador) pero es una mejora, no un hueco |

Dos tienen campos sin completar antes de firmar:
- **3.3 Combustible:** el rango de consumo del Utilitario / Team Run.
- **4.3 Sustentabilidad:** las 4 líneas de base y las 4 metas anuales.

### ⚠️ C. Cosas que hay que escribir desde cero

5. **Los 3 SLA — punto 3.1**, que sacó 1 y **no tiene ningún archivo cargado**.
   R3.1.4 pide que los SLA se sigan en la reunión semanal. Son uno por
   departamento cliente: **depósito/almacén, acarreo y entrega**. Cada uno dice
   qué garantiza flota (unidades listas a tal hora, tiempo de respuesta ante
   rotura, aviso de parada programada) y con qué indicador se mide.
   R3.1.2 además pide el **ciclo de gestión de flota** completo: descripción del
   negocio y mapeo de procesos.

6. **El programa de reconocimiento — R4.1.3.** El SOP de CIL ya lo nombra
   ("la operación sin incidentes se reconoce mediante el programa de
   reconocimiento de flota"), pero ese programa **no existe escrito en ningún
   lado**: el SOP apunta a algo que no está. Es media carilla: qué se premia
   (cero raspones en el período), cada cuánto, quién lo entrega y cómo se
   comunica.

7. **La charla de metas de sustentabilidad — R4.3.1**: el personal de línea
   tiene que conocer las metas. Una charla y su registro, después de fijar los
   números del punto 4.3.

---

## Orden sugerido

**Primero, sin escribir nada** (sube tres puntos con la app que ya tenés):
1. Dictar la capacitación de CIL y que la completen → 4.1
2. Abrir un 5 Porqués desde una OT correctiva → 2.4 / 4.2 / 3.1
3. Cargar la próxima reparación interna como OT con repuesto del pañol → 2.4

**Después, subir SOPs** en este orden: 4.3 → 4.2 → 3.2 → 2.4 → 2.3 → 3.4 → 3.3
(el de 1.4 puede esperar).

**Al final, lo que depende de otros:** los 3 SLA de 3.1 y el programa de
reconocimiento de 4.1.
