# Abrir el nodo CERRADO por cumplimiento de horario

**Fecha:** 18/09/2026 · **Estado:** medido de punta a punta, nada implementado todavía
**Pedido:** aperturar el motivo CERRADO del Árbol del Sueño cruzando la hora en que
Foxtrot dice que fuimos contra el horario relevado del cliente, y medir la tasa de
cumplimiento de horario.

---

## 0. Resultado: se puede, y ya está medido

No hizo falta estimar: se corrió el cruce completo sobre 2026. **Las 420 veces de
CERRADO del año quedaron clasificadas así:**

| Clasificación | Veces | % del total | De quién es |
|---|---:|---:|---|
| **DENTRO** de su horario declarado | **173** | 41,2 % | 🔴 del cliente |
| **SIESTA** (entre los dos tramos de un cortado) | **77** | 18,3 % | 🟡 **nuestro** |
| TEMPRANO (antes de abrir) | 18 | 4,3 % | 🟠 nuestro |
| TARDE (después de cerrar) | 8 | 1,9 % | 🟠 nuestro |
| DÍA QUE NO ABRE | 2 | 0,5 % | 🟠 nuestro |
| BORDE (±15 min, zona gris) | 6 | 1,4 % | ⚪ de nadie |
| SIN VH relevada | 7 | 1,7 % | — |
| **SIN HORA de Foxtrot** | **129** | **30,7 %** | — |

```
TASA DE CUMPLIMIENTO DE HORARIO = 62,2 %
   sobre 278 veces clasificables (66,2 % de cobertura)
   173 veces fuimos en horario y estaba cerrado  ·  105 veces fuimos fuera
```

---

## 1. El hallazgo: la siesta

**77 de las 105 veces que el problema fue nuestro son la siesta.** El 73 %. Y sobre
el total de CERRADO del año, el 18,3 %.

No es una hipótesis, es lo que mostró el cruce, y tiene el respaldo del histograma
de todas las paradas desde agosto:

```
 7h   59
 8h  749
 9h 1465
10h 1882   ← pico
11h 1725
12h 1205
13h  591  ┐
14h  260  │ 955 paradas en la franja de la siesta
15h  104  ┘
16h   34
17h    3
18h   27
```

Repartimos de 7 a 16 y casi nada después de las 16. Mientras tanto, los dos horarios
de comercio más frecuentes de la cartera son **«8 a 13 / 16 a 20»** (449 clientes) y
**«9 a 14 / 17 a 21»** (365). La ventana de la tarde, donde esos clientes están
abiertos, prácticamente no la usamos.

**Esto es lo más accionable de todo el análisis**, porque no requiere hablar con
ningún cliente: son ~77 rechazos al año que se evitan resecuenciando. Y el corte por
`modo_carga` lo respalda: **930 de los 1.960 clientes relevados tienen horario
partido**, casi la mitad de la cartera relevada.

---

## 2. Las tres advertencias (leer antes de publicar el número)

### a) El 62,2 % es un TECHO, no el dato final
El bucket DENTRO está contaminado por relevamientos mal cargados. Se ve a simple
vista en los reincidentes:

| Cliente | Veces | Horas en que fuimos |
|---|---:|---|
| PERGA SPORTS SRL | 4 | 09:30 · 09:45 · 10:32 · 10:41 |
| CASTELLANO MARCELO | 4 | 10:21 · 11:46 · 11:46 · 13:54 |
| ARAUDO MARIA ZULEMA | 3 | 12:19 · 12:47 · 12:56 |
| CERNADAS NICOLAS | 2 | 13:30 · 13:49 |

Cuatro veces a la misma hora de la mañana y siempre cerrado no es un cliente que
incumple: **es una ventana mal relevada.** ARAUDO y CERNADAS, siempre pegados al
mediodía, huelen a un cierre real 30 minutos antes del declarado. Hasta separar
esto, el 62,2 % hay que leerlo como *«el cliente no nos atendió en la ventana que
dijo»*, que no es lo mismo que *«el cliente incumplió»*.

### b) El 30,7 % sin hora: diagnosticado
129 veces sin hora. Las causas, medidas y sin solaparse:

| Causa | Veces | % | Recuperable |
|---|---:|---:|---|
| Parada **PENDING**: el chofer nunca la cerró | 55 | 13,1 % | **sí, estimando** |
| Hay datos de ese día y de ese cliente, pero no esa visita | 62 | 14,8 % | a investigar |
| Ese día no tiene ninguna parada sincronizada | 12 | 2,9 % | sí, con backfill |
| Ese cliente nunca aparece en Foxtrot | **0** | 0 % | — |

**El match cliente↔Foxtrot es perfecto: cero casos sin correspondencia.** La fórmula
`ltrim(substring(customer_id from 7),'0')` no pierde a nadie.

**El dato duro del estado:** de 48.149 paradas de 2026, las `COMPLETED` tienen hora
el **100 %** (43.122/43.122) y las `PENDING` el **0 %** (0/5.027). O sea: no hay
paradas a medias — o el chofer cerró la parada y hay hora, o no la cerró y no hay
nada. **Recuperar esas 55 no es un problema de datos de Foxtrot, es de registro.**

**Asimetría que importa:** la cobertura general de Foxtrot es del 87–97 % mensual,
pero sobre los CERRADO cae al 69 %. No es un problema general de sincronización: las
paradas donde el cliente estaba cerrado tienen **mucha más chance de quedar
PENDING**, porque el chofer no registra la visita fallida. Es un hallazgo operativo
propio, y degrada todo indicador que se apoye en Foxtrot, no solo éste.

**Camino para recuperar las 55:** interpolar contra las paradas vecinas de la misma
ruta. Si la anterior se cerró 10:15 y la siguiente 10:45, por esa puerta pasamos
~10:30. La tabla además ya guarda `estimated_time_of_arrival`. Es una **estimación**
y tiene que viajar etiquetada como tal, en su propia columna `fuente_hora`, nunca
mezclada con la hora medida. Con eso la base clasificable pasaría de 66 % a ~79 %.

### b-bis) No hay que cortar el indicador por fecha
La cobertura mensual es pareja (58–94 %), sin escalón. No existe un mes a partir del
cual los datos empiecen: el indicador puede cubrir el año entero. Lo que sigue
valiendo es la advertencia del punto (c) sobre la antigüedad del relevamiento.

### c) La ventana se aplica hacia atrás en el tiempo
El relevamiento más viejo es **2026-Q2**; los CERRADO de enero a marzo se clasifican
con una ventana relevada después. Si el comercio cambió el horario en el medio, esos
casos mienten. **Falta medir cuántos son** y, según eso, arrancar el indicador desde
abril.

---

## 3. Lo que ya no es problema

| Se temía | Lo que se encontró |
|---|---|
| Parsear horarios de texto libre | **JSONB estructurado**: `{lun:{abre:true, t1:["08:00","18:00"], t2:null}, ...}`. Día por día, dos tramos. Nada que parsear. |
| Cobertura del 13 % de horarios | Global sí, pero **entre los clientes que rechazan es ~98 %** (solo 7 sin VH de 420). El relevamiento priorizó los clientes que importan. |
| El promotor apretando «confirmar» sin relevar | Los 1.960 de Q3 están todos en `confirmado_sin_cambios = false`. Se relevaron de verdad. |
| Qué fuente de hora usar | `foxtrot_waypoints_visita.completed_timestamp` cubre 291/420. `delivery_attempts` FAILED solo 59 — sirve únicamente para sumar las notas del chofer. |
| Zona horaria | Verificada con el histograma: 7–18 h locales. La conversión UTC−3 está bien. |

---

## 4. Modelo y reglas de clasificación

**Fuente de la hora:** `foxtrot_waypoints_visita.completed_timestamp` (una fila por
parada), `customer_id` → `id_cliente` de Chess con
`ltrim(substring(customer_id from 7),'0')`. Guardado en UTC; Argentina es UTC−3 fijo.

**Fuente de la ventana:** `horarios_relevamientos.horario` (JSONB) de la base
Mercosur, del ciclo vigente a la fecha del rechazo, con fallback al último. La
ventana horaria **de Chess está descartada** por el equipo (defaults masivos que
nadie respeta, ya validado contra 120 días de Foxtrot) — el campo suelto
`clientes.horario_entrega` es justamente eso y no se usa.

**Unidad de conteo: la VEZ (`id_cliente` × `fecha`), nunca la fila.** `rechazos`
tiene una fila por SKU: 1.542 filas de CERRADO eran 365 veces. El árbol ya cuenta
veces; el cruce hace lo mismo.

**Motivo:** `id_rechazo = 1`, no el `ILIKE '%cerrad%'` que usa hoy el árbol y que
matchearía cualquier motivo futuro que contenga «cerrad».

**La siesta no se detecta por horario fijo**, sino cuando la hora cae *entre* `t1` y
`t2` de un horario partido. Por eso el `modo_carga` importa.

**Zona gris ±15 min:** `completed_timestamp` es cuando el chofer *cerró* la parada,
no cuando llegó — trae un atraso estructural de minutos. Sin margen explícito, cada
caso de borde es una discusión. Con los patrones vistos en (2a), conviene probar
±20/±30 y ver cuánto se mueve.

---

## 5. Qué sigue, por orden de valor

| # | Qué | Por qué ahora | Frente |
|---|---|---|---|
| 1 | **Detector de horario mal relevado**: contrastar los DENTRO contra las entregas exitosas del mismo cliente (`attempt_status = 'SUCCESSFUL'`) | Limpia el 41,2 % y devuelve una lista de correcciones **con evidencia** para el promotor: *«dice 8–12, pero le entregamos OK 47 veces entre 15 y 19»* | D3 |
| 2 | **Diagnóstico de las 129 sin hora** | Es el techo de la cobertura del indicador | B |
| 3 | **Cuántos CERRADO son de ene–mar** | Decide si el indicador arranca en enero o en abril | A |
| 4 | Materializar `cerrado_horario_analisis` (una fila por vez, con la etiqueta y el desvío en minutos) + cron diario + backfill | La base de Supabase es Micro y está ahogada de CPU: esto **no** se calcula en vivo. Guardar el desvío permite mover el margen sin recalcular | C |
| 5 | Lista accionable de reincidentes (ya se puede armar hoy) | Valor inmediato para comercial, no depende del árbol | D2 |
| 6 | Pestaña en el nodo `cerrado` del árbol | `sueno-rechazo-detalle.tsx` ya tiene 3 pestañas; no hay mecanismo genérico de desglose, hay que sumar una RPC estilo `sueno_rechazo_clientes` | D1 |
| 7 | Revisar la ventana de reparto de la tarde con quien rutea | El hallazgo de la siesta no es de sistemas, es una decisión operativa | — |

**Cómo nombrarlo en el árbol.** «Tasa de cumplimiento» se lee como *mejor si sube*, y
acá una tasa alta significa que los clientes no cumplen su horario. Es un
**repartidor de culpa, no un score**. Sugerencia: colgar del nodo `cerrado` dos
hijos —**«Cerrado con nosotros en horario»** y **«Fuimos fuera de horario»**— cada
uno con su meta propia. Se lee solo y cada mitad tiene un dueño distinto.
