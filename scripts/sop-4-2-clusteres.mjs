// Genera el "4.2 SOP Uso de los Clústeres de Clientes" (Planeamiento 4.2) en PDF.
//
//   node scripts/sop-4-2-clusteres.mjs [salida.pdf]
//
// Arma el SOP en HTML (encabezado DPO repetido en cada página vía <thead>),
// lo imprime a PDF con Edge o Chrome headless y después estampa "PÁGINA: n / N"
// con pdf-lib, porque el navegador no numera páginas al imprimir.
//
// Las reglas que describe (tope de Ganadores, rechazos, RMD) viven en
// src/actions/clusterizacion-tipos.ts: si cambian, cambiar acá el texto, subir la
// revisión y cargar el PDF como nueva versión en dpo_archivos (Planeamiento 4.2).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

const REVISION = "04"
const FECHA = "15/09/26"
const TITULO = "SOP USO DE LOS CLÚSTERES DE CLIENTES"
const SECTOR = "CD RAMALLO"

// Corrida de referencia (1º semestre 2026) con el tope del 5 %.
const REF = {
  cartera: "1.811",
  tope: "91",
  umbral: "$20.626.727",
  umbralAnterior: "$10.048.012",
  filas: [
    ["Ganador", "76", "4,2%", "34,3%", "15", "0"],
    ["Básico", "14", "0,8%", "6,3%", "1", "0"],
    ["En Crecimiento (Productor)", "1.168", "64,5%", "46,0%", "142", "15"],
    ["Ventas Bajas", "553", "30,5%", "13,4%", "0", "143"],
  ],
  bajas: "158", bajasPct: "8,7%", bajasRechazos: "118", bajasRmd: "35", bajasNps: "12", bajasSinRechazo: "40",
}

const aqui = dirname(fileURLToPath(import.meta.url))
const logoMercosur = `data:image/jpeg;base64,${readFileSync(resolve(aqui, "sop-assets/logo-mercosur.jpg")).toString("base64")}`
const logoDpo = `data:image/jpeg;base64,${readFileSync(resolve(aqui, "sop-assets/logo-dpo.jpg")).toString("base64")}`

const salida = resolve(
  process.argv[2] ??
    `C:/Users/TERMINAL/OneDrive - Mercosur DRP/Escritorio/Sops/4.2 SOP Uso de los Clústeres de Clientes - Rev ${REVISION}.pdf`,
)
const html = salida.replace(/\.pdf$/i, "") + ".html"

const encabezado = `
<table class="hdr">
  <tr>
    <td class="logos" rowspan="2"><img src="${logoMercosur}" class="lm"><img src="${logoDpo}" class="ld"></td>
    <td class="c2"></td>
    <td class="c3">REVISIÓN N°: ${REVISION} – FECHA: ${FECHA}</td>
  </tr>
  <tr>
    <td class="c2 pag"></td>
    <td class="c3">SECTOR: ${SECTOR}</td>
  </tr>
  <tr><td colspan="3" class="tit">TÍTULO: ${TITULO}</td></tr>
</table>`

const definiciones = [
  ["CLUSTERIZACIÓN", `Agrupación de los PDV (clientes) en 4 clústeres según dos variables: ingresos del período y crecimiento vs el período anterior. El umbral que separa facturación alta de baja NO ES LA MEDIANA: es la facturación del cliente Nº N en el ranking de los que crecen, donde N es el <b>5 % de la cartera analizada</b> (${REF.tope} PDV en el 1º semestre 2026), de modo que el clúster Ganador nunca supere ese 5 % y lo integren los que más facturan.`],
  ["CARTERA ANALIZADA", `PDV que compraron en los últimos 45 días del período (drop size mayor a cero). Es la población que muestra la pantalla y sobre la que se calcula el 5 % de Ganadores; los que no compraron en esa ventana no son representativos del servicio reciente y quedan fuera del análisis.`],
  ["GANADOR", `Ingresos altos y crecimiento positivo. Como máximo el 5 % de la cartera analizada. Es el cliente a proteger: máxima prioridad de servicio en ruteo, entrega e inventario.`],
  ["EN CRECIMIENTO (“Productor” en la app)", `No alcanza el umbral de facturación alta, pero crece. Cliente con potencial: prioridad alta, no deteriorar su experiencia de entrega.`],
  ["BÁSICO", `Supera el umbral de facturación alta pero sin crecer (estancado o en caída). Mantener el servicio estándar y cuidar la relación.`],
  ["VENTAS BAJAS", `No alcanza el umbral de facturación alta y no crece. Es el clúster más caro de servir en proporción a lo que aporta: candidato a menor frecuencia, rutas consolidadas y ventanas amplias. Ante capacidad limitada, el ajuste comienza aquí.`],
  ["BAJA DE CLÚSTER", `Descenso de un escalón por falla de servicio del cliente (rechazos, RMD o NPS). El cliente pierde uno de los atributos que lo separan de Ventas Bajas. No modifica su facturación ni su crecimiento reales: es una penalización de servicio, y la app la muestra marcada con el motivo.`],
  ["DROP SIZE", `Bultos promedio por entrega. Se usa como aproximación (proxy) del costo de servir: a menor drop size, más caro resulta atender el PDV.`],
  ["OTIF", `On Time In Full: entregas a tiempo y completas. En esta operación el OTIF se mide a través del RECHAZO: una entrega cumple si no fue rechazada por causa del cliente. Es el estado pasa / no-pasa que muestra la pantalla de clusterización, y se compara por clúster en cada análisis.`],
  ["RECHAZO POR CULPA DEL CLIENTE", `Entrega rechazada por SIN DINERO, CERRADO o SIN ENVASES. Los rechazos por error interno (preventa, distribución, falta de stock) NO cuentan: no son responsabilidad del PDV y no hacen bajar de clúster.`],
  ["RMD", `Rate My Delivery: calificación de la entrega por el cliente (1 a 5). Se compara por clúster en cada análisis y, por debajo de 4,99 de promedio, hace bajar de clúster.`],
  ["NPS", `Net Promoter Score: encuesta de recomendación (0 a 10) que clasifica al cliente como Promotor, Pasivo o Detractor. Haber respondido como Detractor en la ventana hace bajar de clúster.`],
  ["SGL ROUTING", `Software de ruteo. Recibe clientes y pedidos exportados desde CHESS (interfaces .txt), arma las rutas de reparto y devuelve el resultado a CHESS.`],
  ["DPO-APP — CLUSTERIZACIÓN 4.2", `Sección Indicadores > Planeamiento > Clusterización de Clientes (4.2) de la dpo-app. Calcula los 4 clústeres a partir de la facturación real (comprobantes CHESS), aplica el tope de Ganadores (5 % de la cartera) y la baja por servicio, y muestra la matriz 2×2 con PDV, % de ingresos, drop size, RMD, NPS y No pasa/Atención por clúster, con tabla filtrable por clúster, por cliente y por baja de clúster.`],
  ["DPO-APP — PRIORIZACIÓN DE ENTREGA", `Sección Planeamiento > Priorización de entrega de la dpo-app. Clasifica los pedidos del día con las MISMAS reglas y el MISMO tope de Ganadores que la clusterización (código compartido), así el corte de pedidos y la pantalla 4.2 dicen lo mismo del cliente.`],
]

const raci = [
  ["Corrida semestral del análisis de clusterización (dpo-app)", "A/R", "C", "I", "I", "I"],
  ["Revisión de los clientes que bajaron de clúster por servicio", "A/R", "I", "C", "I", "C"],
  ["Comparación de OTIF, RMD y NPS por clúster", "A/R", "I", "C", "-", "I"],
  ["Cascadeo del resultado a Ventas y Operaciones", "A/R", "I", "I", "I", "I"],
  ["Actualización de prioridades, ventanas y frecuencias en SGL Routing", "A", "R", "I", "-", "C"],
  ["Armado de rutas diarias aplicando prioridades por clúster", "A", "R", "C", "-", "-"],
  ["Priorización de entregas en calle y reintentos por clúster", "A", "C", "R", "-", "I"],
  ["Asignación de inventario y corte de pedidos ante quiebre", "A", "I", "I", "R", "C"],
  ["Seguimiento mensual de adherencia al plan por clúster", "A/R", "I", "C", "C", "I"],
]

const historial = [
  ["01", "Emisión inicial", "06/07/26"],
  ["02", "Devolución de la auditoría DPO H1 2026 sobre el punto 4.2 (“foco en variables definidas; tener en cuenta variables pasa/no pasa”). El umbral de facturación alta deja de ser la mediana y pasa a ser el que acota el clúster Ganador a 200 PDV. Se incorpora la baja de clúster por rechazos, RMD y NPS (nuevo punto 2), con la aclaración de cómo tratar a los clientes degradados. Se actualizan las definiciones, el cuadro de referencia con la corrida del 1º semestre 2026 y el RACI. Se agrega el punto 8 con los parámetros del modelo.", "05/08/26"],
  ["03", "Ajuste del umbral de rechazos que dispara la baja de clúster: pasa de 2 a 3 entregas rechazadas por culpa del cliente en el semestre. Con 2 bajaban 285 PDV y entraba demasiado ruido; con 3 son 142 y el patrón es real. Se descartó exigir uno por mes (6 en el semestre) porque solo 27 PDV lo alcanzan y la baja quedaría decidida por RMD y NPS. Se actualiza el cuadro de referencia del punto 1 con la corrida recalculada del 1º semestre 2026 y el flujograma del punto 9. En la app, al abrir un clúster se indica cuántos PDV llegaron bajando y desde dónde.", "06/08/26"],
  ["04", `El clúster Ganador deja de tener un tope fijo de 200 PDV y pasa a ser el 5 % de la cartera analizada (los PDV que compraron en los últimos 45 días del período): ${REF.tope} PDV en el 1º semestre 2026. Se mantiene el criterio (los que más facturan entre los que crecen) y las tres condiciones de baja de clúster. El corte de facturación alta sube de ${REF.umbralAnterior} a ${REF.umbral} por semestre y el Ganador queda en ${REF.filas[0][1]} PDV con el ${REF.filas[0][3]} de la facturación. Un tope proporcional acompaña el tamaño real de la cartera de cada semestre y de cada centro, cosa que el número fijo no hacía. Se actualizan las definiciones (nueva entrada Cartera analizada y Priorización de entrega), el cuadro de referencia del punto 1, los parámetros del punto 8 (PCT_GANADORES) y el flujograma. La priorización diaria de entrega usa el mismo tope.`, FECHA],
]

const tabla = (clase, cab, filas) => `
<table class="${clase}">
  ${cab ? `<thead><tr>${cab.map((c) => `<th>${c}</th>`).join("")}</tr></thead>` : ""}
  <tbody>${filas.map((f) => `<tr>${f.map((c, i) => `<td class="k${i}">${c}</td>`).join("")}</tr>`).join("")}</tbody>
</table>`

const caja = (clase, texto) => `<div class="fbox ${clase}">${texto}</div>`
const flecha = `<div class="farrow"></div>`

const cuerpo = `
<h1>OBJETIVO</h1>
<p>Establecer cómo se utiliza la clusterización de clientes (agrupación en 4 clústeres por ingresos y crecimiento, punto 4.2 del manual DPO) para diferenciar el servicio logístico: qué prioridad recibe cada clúster en el ruteo (SGL Routing), en la entrega en calle y en la asignación de inventario en el almacén. El SOP define, además, cómo el resultado de cada análisis semestral se cascadea a los equipos de Ventas y Operaciones y cómo se actualiza la información dentro del sistema/ruteador (requisitos R4.2.3 y R4.2.4).</p>
<p>El principio rector: no todos los clientes se atienden igual. Ante capacidad limitada, quiebre de stock o contingencias en calle, el clúster define a quién se protege primero y dónde se ajusta el servicio.</p>
<div class="nota">Novedad de esta revisión: el clúster Ganador deja de tener un tope fijo de 200 PDV y pasa a ser el <b>5 % de la cartera analizada</b> (${REF.tope} PDV en el 1º semestre 2026). Se mantienen el criterio —los que más facturan entre los que crecen— y los disparadores de baja por rechazos, RMD y NPS. La priorización diaria de entrega usa el mismo tope. Ver los puntos 1 y 8 del Desarrollo.</div>

<h1>ALCANCE</h1>
<p>Involucra al Jefe de Logística, el Ruteador, el Supervisor de Distribución, el Supervisor / Encargado de Almacén y, como informados, a los Supervisores de Venta. Aplica a la operación de la Región Pampeana (CD Ramallo; zonas de reparto Pergamino, Ramallo, Colón, Arrecifes y San Nicolás).</p>

<h1>SEGURIDAD</h1>
<h2>ELEMENTOS DE PROTECCIÓN PERSONAL (EPP) REQUERIDOS</h2>
<p>No requiere (tarea administrativa y de planificación).</p>
<h2>OPLS/SOP SEGURIDAD RELACIONADOS</h2>
<p>No requiere.</p>

<h1>DEFINICIONES</h1>
${tabla("def", null, definiciones)}

<h1>RACI</h1>
<p class="leyenda">R: RESPONSABLE DE LA EJECUCIÓN · A: DUEÑO · C: CONSULTADO · I: INFORMADO</p>
${tabla("raci", ["ACTIVIDADES", "JEFE DE LOGÍSTICA", "RUTEADOR", "SUP. DISTRIBUCIÓN", "SUP. ALMACÉN", "VENTAS"], raci)}

<h1>DESARROLLO</h1>
<h2>1. El análisis de clusterización en dpo-app</h2>
<p>El Jefe de Logística ejecuta el análisis en dpo-app > Indicadores > Planeamiento > Clusterización de Clientes (4.2), como mínimo 2 veces al año (enero y julio) y, además, cada vez que la operación entra en problemas de capacidad sostenidos. La pantalla trabaja por semestre calendario fijo: en el selector se elige el semestre cerrado (ej. “1º semestre 2026”), que compara contra el mismo semestre del año anterior y queda congelado como corrida oficial. Como evidencia de cada corrida se guarda una captura o export de la matriz junto con la minuta del cascadeo.</p>
<ul>
<li>La pantalla clasifica automáticamente la cartera analizada —los PDV con facturación en el período que además compraron en los últimos 45 días— en los 4 clústeres (Ganador / En Crecimiento / Básico / Ventas Bajas), cruzando ingresos contra crecimiento.</li>
<li>El umbral de facturación alta es el que deja el clúster Ganador en su tope del <b>5 % de la cartera analizada</b>: la facturación del cliente Nº N entre los que crecen, con N = 5 % de los PDV analizados (redondeado). Así el Ganador son siempre los que más facturan, y el tamaño del grupo acompaña el tamaño real de la cartera de cada semestre. En la corrida del 1º semestre 2026 la cartera analizada fue de ${REF.cartera} PDV, el tope ${REF.tope} y el umbral ${REF.umbral} de facturación en el semestre (con el tope fijo anterior de 200 era ${REF.umbralAnterior}).</li>
<li>La matriz 2×2 muestra por clúster: cantidad de PDV, % de los ingresos totales, drop size promedio, RMD promedio, No pasa / Atención y cuántos clientes salieron o entraron por la baja de servicio. La tabla inferior permite filtrar por clúster, por baja de clúster y buscar un cliente puntual: es la fuente para bajar el listado a ruteo, distribución y almacén.</li>
<li>Al abrir un clúster, la app avisa arriba de la tabla cuántos de esos PDV llegaron bajando y desde qué clúster vienen, y pinta esas filas de rojo suave. Es la lectura obligada al entrar a Productor o a Ventas Bajas: distingue al cliente que de verdad es chico del que está ahí penalizado por servicio, que puede facturar alto o venir creciendo. Para aislarlos, el filtro “Baja de clúster” tiene la opción “Solo los que bajaron”.</li>
</ul>
<p class="refttl">Referencia — corrida 1º semestre 2026 (${REF.cartera} PDV analizados, tope de Ganadores ${REF.tope}):</p>
${tabla("ref", ["Clúster", "PDV", "% cartera", "% facturación", "Bajaron", "Recibidos"], REF.filas)}
<p>En total ${REF.bajas} clientes (${REF.bajasPct} de la cartera) bajaron de clúster por servicio: ${REF.bajasRechazos} por rechazos, ${REF.bajasRmd} por RMD y ${REF.bajasNps} por NPS (un cliente puede tener más de un motivo). Con el 5 %, el Ganador queda en ${REF.filas[0][1]} PDV que concentran el ${REF.filas[0][3]} de la facturación: un grupo chico, al que la operación puede proteger de verdad. Los clústeres de baja facturación siguen mostrando el menor drop size: son los más caros de servir.</p>
<p>En cada corrida, el Jefe de Logística compara OTIF, RMD y NPS por clúster contra la corrida anterior y detecta los PDV que cambiaron de clúster —un Ganador que cae, un En Crecimiento que se consolida, y en particular los que bajaron por servicio—. Esos movimientos son los que disparan cambios de servicio.</p>

<h2>2. Baja de clúster por las variables pasa / no pasa</h2>
<p>La clusterización no mira solo cuánto factura y cuánto crece el cliente: mira también si el cliente deja que le entreguemos y cómo califica el servicio. Un PDV que rechaza entregas por su culpa consume capacidad, ocupa lugar en la ruta y devuelve mercadería, aunque facture bien. Por eso baja de clúster.</p>
<p><b>Qué dispara la baja.</b> Alcanza con cumplir UNA de estas tres condiciones:</p>
${tabla("cond", ["Condición", "Criterio", "Ventana"], [
  ["Rechazos", "3 o más entregas rechazadas por culpa del cliente (SIN DINERO, CERRADO o SIN ENVASES)", "El semestre completo"],
  ["RMD", "Promedio de calificación menor a 4,99", "Últimos 6 meses"],
  ["NPS", "Haber respondido como Detractor al menos una vez", "Últimos 6 meses"],
])}
<p>El corte está en 3 porque la ventana es de seis meses: un rechazo aislado le ocurre a cualquier cliente que recibe entregas todas las semanas, y con 2 todavía entra mucho ruido (285 PDV alcanzados contra 142 con 3). Tres rechazos es más de uno cada dos meses: ahí ya hay un patrón. Se evaluó exigir uno por mes (6 en el semestre) y vacía la regla —solo 27 PDV llegan— dejando la baja en manos de RMD y NPS, que son las señales más flojas. Los rechazos por error interno no cuentan.</p>
<p><b>A dónde baja cada clúster.</b> La regla es que el cliente pierde uno de los atributos que lo separan de Ventas Bajas. Ganador tiene dos (factura alto y crece), Básico y En Crecimiento tienen uno cada uno, y Ventas Bajas no tiene ninguno:</p>
${tabla("cond", ["Clúster de origen", "Atributo que pierde", "Clúster de destino"], [
  ["GANADOR (factura alto y crece)", "La facturación alta; conserva el crecimiento", "EN CRECIMIENTO (Productor)"],
  ["BÁSICO (factura alto)", "La facturación alta, que era el único que tenía", "VENTAS BAJAS"],
  ["EN CRECIMIENTO (crece)", "El crecimiento, que era el único que tenía", "VENTAS BAJAS"],
  ["VENTAS BAJAS", "No tiene atributos que perder", "Se mantiene (es el piso)"],
])}
<p>Por eso un Ganador que falla no cae hasta el fondo: como tenía dos atributos, una falla le cuesta uno solo y sigue clasificado como un cliente que crece.</p>
<p><b>Cómo leer un cliente degradado — importante.</b> La baja es una penalización de servicio, no un dato de facturación. Un Ganador que bajó a En Crecimiento SIGUE FACTURANDO ALTO, y un En Crecimiento que bajó a Ventas Bajas SIGUE CRECIENDO. La app los identifica de tres formas: el encabezado de la tabla dice cuántos bajaron y desde qué clúster vienen, la fila va con fondo rojo suave, y debajo del clúster de cada cliente figura “bajó desde [clúster] · [motivo]”. El filtro “Baja de clúster” los aísla. En consecuencia, el ajuste de servicio de un cliente degradado se decide junto con Ventas y por la causa del rechazo (deuda, horario de apertura, envases), no aplicando automáticamente el recorte de frecuencia del clúster de destino. Bajar la frecuencia a un cliente que crece pero que estaba cerrado en la visita no resuelve el problema: lo resuelve acordar el horario de entrega.</p>

<h2>3. Servicio diferenciado por clúster</h2>
<p>La siguiente matriz de servicio es la regla general que aplican los tres roles. Cualquier excepción la aprueba el Jefe de Logística.</p>
${tabla("serv", ["CLÚSTER", "PRIORIDAD", "RUTEO / FRECUENCIA", "REINTENTO DE ENTREGA", "INVENTARIO ANTE QUIEBRE"], [
  ["GANADOR", "Máxima", "Entra siempre en la ruta del día; ventana horaria comprometida se respeta; primeras posiciones de la secuencia cuando la ventana lo exige", "En el día, si la logística lo permite", "Stock reservado primero"],
  ["EN CRECIMIENTO", "Alta", "No perder la ventana acordada; mantener frecuencia", "Dentro de las 24 hs", "Asegurado después de Ganador"],
  ["BÁSICO", "Media", "Servicio estándar; ante saturación puede reprogramarse avisando a Ventas", "24 a 48 hs", "Según disponibilidad"],
  ["VENTAS BAJAS", "Estándar / a optimizar", "Consolidar en rutas densas; evaluar menor frecuencia y ventanas amplias con Ventas", "Se reprograma a la próxima visita de la zona", "Último en la asignación; el corte de pedidos comienza aquí"],
])}
<p>Para los clientes que llegaron a su clúster por una baja de servicio, ver la aclaración del punto 2 antes de reducir frecuencia.</p>

<h2>4. Aplicación al ruteo (Ruteador — SGL Routing)</h2>
<p>El Ruteador es quien traduce la clusterización al armado de rutas. Después de cada corrida semestral (o cuando el Jefe de Logística comunica movimientos de clúster):</p>
<ul>
<li>Actualiza en SGL Routing los atributos de los clientes que cambiaron de clúster: prioridad, ventana horaria, frecuencia de atención y posición preferida en la secuencia. La base de clientes de SGL se alimenta de la exportación de CHESS (clientes.txt > carpeta destinos); los atributos de servicio se ajustan sobre el destino en SGL.</li>
<li>En el armado diario: verifica que los PDV Ganador y En Crecimiento queden dentro de su ventana. Si la capacidad del día no alcanza para todos los pedidos, el recorte o la reprogramación comienza por Ventas Bajas, sigue por Básico y nunca alcanza a Ganador sin aprobación del Jefe de Logística. La pantalla Priorización de entrega de dpo-app ordena los pedidos del día con el mismo clúster que la corrida 4.2 y propone el corte.</li>
<li>Propone al Jefe de Logística y a Ventas los cambios estructurales que surgen del análisis: bajar frecuencia de PDV Ventas Bajas, consolidarlos en rutas densas, ampliar ventanas. Estos cambios se implementan en SGL Routing una vez acordados.</li>
</ul>

<h2>5. Aplicación en distribución (Supervisor de Distribución)</h2>
<ul>
<li>Recibe tras cada corrida el listado de PDV por clúster (export de la tabla de dpo-app) y lo baja a los repartos: los choferes deben saber qué clientes de su ruta son Ganador.</li>
<li>Ante contingencias en calle (demoras, camión caído, cliente cerrado), reordena la ruta protegiendo primero a Ganador y En Crecimiento; coordina reintentos según la matriz del punto 3.</li>
<li>Ante rechazos o entregas fallidas de PDV Ganador, escala en el día al Jefe de Logística y a Ventas (no espera la reunión). Cada rechazo por culpa del cliente acerca al PDV a bajar de clúster en la próxima corrida.</li>
<li>Monitorea OTIF y RMD de su operación mirándolos por clúster: una caída de RMD en Ganador vale más que la misma caída en Ventas Bajas.</li>
</ul>

<h2>6. Aplicación en almacén (Supervisor de Almacén)</h2>
<ul>
<li>Ante quiebre de stock durante el armado de pedidos, aplica el corte por clúster: los pedidos de Ventas Bajas se recortan primero y los de Ganador se completan siempre que haya stock físico. El listado de PDV por clúster está disponible en la tabla de la dpo-app.</li>
<li>Coordina con el Ruteador la prioridad de armado y carga: las rutas con Ganadores en las primeras entregas se cargan de forma de respetar la secuencia y la ventana.</li>
<li>Informa al Jefe de Logística todo corte aplicado a un PDV Ganador o En Crecimiento (queda registrado para la revisión mensual).</li>
</ul>

<h2>7. Cascadeo y actualización del sistema (R4.2.4)</h2>
<p>Después de cada corrida semestral, el Jefe de Logística ejecuta el cascadeo dentro de los 15 días corridos:</p>
<ul>
<li>Reunión de cascadeo con Ventas y Operaciones: se presentan la matriz 2×2, los movimientos de clúster relevantes, el listado de clientes que bajaron por servicio con su motivo y los cambios de servicio propuestos. La minuta de la reunión es la evidencia DPO del cascadeo.</li>
<li>Actualización del sistema/ruteador: el Ruteador aplica en SGL Routing los cambios de prioridad, ventana y frecuencia acordados (punto 4). Sin este paso el análisis no llega a la operación.</li>
<li>Distribución de los listados por clúster al Supervisor de Distribución y al Supervisor de Almacén.</li>
<li>Seguimiento: en la reunión mensual de Logística se revisan OTIF, RMD y NPS por clúster y la adherencia a la matriz de servicio (cortes aplicados, reintentos, ventanas cumplidas). Los desvíos alimentan la próxima corrida.</li>
</ul>

<h2>8. Parámetros del modelo</h2>
<p>Los tres parámetros de la clusterización están definidos en el código de la dpo-app (src/actions/clusterizacion-tipos.ts, reglas compartidas con la priorización de entrega) y solo se modifican con aprobación del Jefe de Logística, dejando constancia en el historial de revisiones de este SOP:</p>
${tabla("param", ["Parámetro", "Valor vigente", "Qué controla"], [
  ["PCT_GANADORES", "5 %", `Proporción de la cartera analizada que puede ser Ganador (${REF.tope} PDV en el 1º semestre 2026) y, por lo tanto, el umbral de facturación alta. Reemplaza al tope fijo MAX_GANADORES = 200 de las revisiones 02 y 03.`],
  ["MIN_RECHAZOS_BAJA", "3", "Rechazos por culpa del cliente en el semestre que hacen bajar de clúster"],
  ["RMD_MINIMO_BAJA", "4,99", "Promedio de RMD por debajo del cual el cliente baja de clúster"],
])}
<p>Limitación conocida: la cobertura de encuestas condiciona el peso real de RMD y NPS. En el 1º semestre 2026 el 99,3% de las calificaciones RMD fueron de 5 estrellas y solo el 16% de la cartera tenía encuesta NPS, por lo que solo ${REF.bajasSinRechazo} de las ${REF.bajas} bajas se explican sin que haya rechazos de por medio. Ampliar la base de encuestados es condición para que estas dos variables pesen en la clasificación.</p>

<h2 class="salto">9. Flujograma</h2>
<div class="flujo">
  <div class="fase">FASE 1 — ANÁLISIS SEMESTRAL (enero y julio, o ante problemas de capacidad)</div>
  <div class="col">
    ${caja("azul", "El Jefe de Logística corre la clusterización en dpo-app<br>(Indicadores > Planeamiento > Clusterización 4.2, semestre cerrado)")}
    ${flecha}
    ${caja("azul", "Lee la matriz 2×2 (facturación × crecimiento), con el clúster Ganador<br>acotado al 5 % de la cartera analizada: Ganador · En Crecimiento · Básico · Ventas Bajas")}
    ${flecha}
    ${caja("amarillo", "Revisa los clientes que BAJARON DE CLÚSTER por servicio<br>(3 o más rechazos por culpa del cliente, RMD &lt; 4,99 o detractor de NPS)<br>y el motivo de cada uno")}
    ${flecha}
    ${caja("azul", "Compara OTIF, RMD y NPS por clúster vs la corrida anterior<br>y detecta los PDV que cambiaron de clúster")}
  </div>
  <div class="fase">FASE 2 — CASCADEO (dentro de los 15 días corridos desde la corrida)</div>
  <div class="dos">
    <div class="col">${caja("azul", "Reunión de cascadeo con Ventas y Operaciones:<br>matriz, movimientos de clúster y listado de bajas por servicio<br>(la minuta es la evidencia DPO)")}${flecha}</div>
    <div class="col">${caja("azul", "El Ruteador actualiza SGL Routing:<br>prioridad, secuencia, ventanas y frecuencia según clúster")}${flecha}</div>
  </div>
  <div class="col ancho">${caja("azul", "Distribución y Almacén reciben el listado de PDV por clúster<br>y las reglas de servicio diferenciado")}</div>
  <div class="fase">FASE 3 — OPERACIÓN DIARIA</div>
  <div class="decision">
    <span class="si">SÍ</span>
    <div class="rombo"><div class="rombo-in">¿La capacidad del día alcanza<br>para todos los pedidos?</div></div>
    <span class="no">NO</span>
  </div>
  <div class="dos">
    <div class="col">${flecha}${caja("verde", "RUTEO: rutas normales.<br>Ganador y En Crecimiento en la ventana comprometida")}${flecha}${caja("azul", "DISTRIBUCIÓN: ante contingencia en calle protege a Ganador<br>y En Crecimiento; reintento según la matriz de servicio")}</div>
    <div class="col">${flecha}${caja("rojo", "RUTEO: el recorte empieza por Ventas Bajas y sigue por Básico.<br>Ganador NO se corta sin aprobación del Jefe de Logística")}${flecha}${caja("azul", "ALMACÉN: ante quiebre asigna stock por clúster;<br>el corte de pedidos empieza por Ventas Bajas")}</div>
  </div>
  <div class="col ancho">${flecha}${caja("amarillo", "MONITOREO: OTIF, RMD y NPS por clúster en la reunión mensual de Logística.<br>Los desvíos alimentan la próxima corrida semestral")}</div>
</div>

<h1 class="salto">HISTORIAL DE REVISIONES</h1>
${tabla("hist", ["N.º DE REVISIÓN", "Nombre del responsable", "CARGO", "Descripción de modificación", "Fecha"], historial.map(([n, d, f]) => [n, "", "JEFE DE LOGÍSTICA", d, f]))}
`

const doc = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${TITULO}</title>
<style>
  @page { size: A4; margin: 14mm 17mm 14mm 17mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 10pt; line-height: 1.25; }
  table.page { width: 100%; border-collapse: collapse; }
  table.page > thead { display: table-header-group; }
  table.page > tbody > tr > td { padding: 0; vertical-align: top; }
  table.hdr { width: 100%; border-collapse: collapse; margin-bottom: 8mm; }
  table.hdr td { border: 1.2px solid #222; padding: 1.2mm 2.4mm; font-size: 9pt; height: 7mm; vertical-align: middle; }
  table.hdr td.logos { width: 32%; text-align: left; padding: 1mm 2.4mm; white-space: nowrap; }
  table.hdr img.lm { height: 5mm; vertical-align: middle; margin-right: 3mm; }
  table.hdr img.ld { height: 9.5mm; vertical-align: middle; }
  table.hdr td.c2 { width: 26%; font-weight: bold; }
  table.hdr td.c3 { width: 42%; }
  table.hdr td.tit { text-align: center; font-weight: bold; font-size: 10.5pt; }
  h1 { font-size: 13pt; margin: 5mm 0 1.5mm; }
  h2 { font-size: 11pt; margin: 4mm 0 1.2mm; }
  p { margin: 0 0 2mm; text-align: justify; }
  p.leyenda { text-align: left; }
  p.refttl { margin-top: 3mm; }
  ul { margin: 0 0 2mm; padding-left: 5mm; }
  li { margin-bottom: 1.2mm; text-align: justify; }
  .nota { background: #fff7e0; border-left: 1.2mm solid #f0b429; padding: 2mm 2.6mm; margin: 2.5mm 0 3mm; text-align: justify; }
  table.def, table.raci, table.ref, table.cond, table.serv, table.param, table.hist { width: 100%; border-collapse: collapse; margin: 1.5mm 0 3mm; font-size: 9pt; page-break-inside: auto; }
  table.def td, table.raci td, table.raci th, table.ref td, table.ref th, table.cond td, table.cond th, table.serv td, table.serv th, table.param td, table.param th, table.hist td, table.hist th { border: 1px solid #333; padding: 1.5mm 2mm; vertical-align: top; text-align: left; }
  th { background: #e8e8e8; font-weight: bold; }
  tr { page-break-inside: avoid; }
  table.def td.k0 { width: 30%; }
  table.raci td.k0 { width: 34%; }
  table.raci th:not(:first-child), table.raci td:not(.k0) { width: 13.2%; }
  table.ref td.k1, table.ref td.k2, table.ref td.k3, table.ref td.k4, table.ref td.k5 { text-align: right; }
  table.ref td.k0 { width: 34%; }
  table.cond td.k0 { width: 26%; } table.cond td.k2 { width: 27%; }
  table.serv td.k0 { width: 15%; } table.serv td.k1 { width: 13%; } table.serv td.k3 { width: 21%; } table.serv td.k4 { width: 19%; }
  table.param td.k0 { width: 24%; } table.param td.k1 { width: 14%; }
  table.hist td.k0 { width: 11%; } table.hist td.k1 { width: 15%; } table.hist td.k2 { width: 13%; } table.hist td.k4 { width: 12%; }
  .salto { page-break-before: always; }
  /* Flujograma */
  .flujo { font-size: 9pt; }
  .fase { background: #1f3864; color: #fff; font-weight: bold; text-align: center; padding: 2mm; margin: 3mm 0 2.5mm; }
  .col { display: flex; flex-direction: column; align-items: center; }
  .col.ancho { width: 100%; }
  .dos { display: flex; gap: 6mm; align-items: flex-start; }
  .dos > .col { flex: 1; }
  .fbox { border: 1px solid #5b7fb5; background: #dce8f7; padding: 2mm 3mm; text-align: center; width: 76%; line-height: 1.3; }
  .dos .fbox, .ancho .fbox { width: 100%; }
  .ancho .fbox { width: 88%; }
  .fbox.amarillo { background: #fff3c4; border-color: #d9a400; width: 84%; }
  .fbox.verde { background: #e2f0d9; border-color: #548235; }
  .fbox.rojo { background: #fbe5d6; border-color: #c55a11; }
  .farrow { width: 0; height: 0; border-left: 1.6mm solid transparent; border-right: 1.6mm solid transparent; border-top: 2.6mm solid #555; margin: 0.6mm auto; position: relative; }
  .farrow::before { content: ""; position: absolute; left: -0.35mm; top: -4.4mm; width: 0.7mm; height: 4.4mm; background: #555; }
  .decision { display: flex; align-items: center; justify-content: center; gap: 8mm; margin: 2mm 0 1mm; }
  .decision .si { color: #2e7d32; font-weight: bold; } .decision .no { color: #c55a11; font-weight: bold; }
  .rombo { width: 74mm; height: 22mm; background: #d9a400; clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); display: flex; align-items: center; justify-content: center; }
  .rombo-in { width: calc(100% - 1.6mm); height: calc(100% - 1.6mm); background: #fff3c4; clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); display: flex; align-items: center; justify-content: center; text-align: center; }
</style></head>
<body>
<table class="page">
  <thead><tr><td>${encabezado}</td></tr></thead>
  <tbody><tr><td>${cuerpo}</td></tr></tbody>
</table>
</body></html>`

mkdirSync(dirname(salida), { recursive: true })
writeFileSync(html, doc, "utf8")

const navegadores = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
]
const exe = navegadores.find((p) => existsSync(p))
if (!exe) {
  console.error("No encontré Edge ni Chrome. Quedó el HTML en:", html)
  process.exit(1)
}
const r = spawnSync(
  exe,
  ["--headless=new", "--disable-gpu", "--no-first-run", "--force-device-scale-factor=1", "--no-pdf-header-footer", `--print-to-pdf=${salida}`, pathToFileURL(html).href],
  { stdio: "inherit", timeout: 90_000 },
)
if (r.status !== 0 || !existsSync(salida)) {
  console.error("Falló la impresión a PDF (código", r.status, "). HTML en:", html)
  process.exit(1)
}

// Numeración "PÁGINA: n / N" en la celda vacía del encabezado (misma posición
// en todas las páginas porque el <thead> se repite idéntico).
const MM = 72 / 25.4
const pdf = await PDFDocument.load(readFileSync(salida))
const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
const total = pdf.getPageCount()
pdf.getPages().forEach((page, i) => {
  const { height } = page.getSize()
  // celda c2 de la 2ª fila: x = margen 17mm + 34% del ancho útil (176mm) + padding 2.6mm
  const x = 79.6 * MM // borde izquierdo de la celda (77 mm) + padding
  const y = height - (14 + 7 + 7 / 2 + 1.1) * MM
  page.drawText(`PÁGINA: ${i + 1} / ${total}`, { x, y, size: 9, font: bold, color: rgb(0.07, 0.07, 0.07) })
})
pdf.setTitle(`4.2 ${TITULO} - Rev ${REVISION}`)
pdf.setCreator("dpo-app · scripts/sop-4-2-clusteres.mjs")
writeFileSync(salida, await pdf.save())
console.log("PDF listo:", salida, `(${total} páginas)`)
console.log("HTML fuente:", html)
