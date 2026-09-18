/**
 * Instructivos del depósito (Pampeana) — el paso a paso que los maquinistas,
 * pickeadores y auxiliares consultan desde el celular en la cancha.
 *
 * El contenido vive acá y no en base de datos a propósito: son procedimientos
 * que cambian pocas veces al año y se revisan con el jefe de depósito antes de
 * publicarse. Si mañana hay que cargarlos desde una pantalla de admin, esta
 * estructura es la que tiene que devolver la tabla.
 *
 * 🚨 Los números (metas por cancha, ventana de recepción, días de bloqueo) son
 * los vigentes al 18/09/2026. Al cambiarlos, avisar en el cambio de turno: la
 * pantalla es la fuente que mira el operario.
 */

export type TonoNumero = "ok" | "warn" | "stop" | "neutro"

export interface PasoInstructivo {
  titulo: string
  detalle: string
  /** Marca los pasos que se hacen en la pantalla/handheld, no en el piso. */
  sistema?: boolean
}

export interface NumeroInstructivo {
  etiqueta: string
  valor: string
  unidad: string
  tono?: TonoNumero
}

export interface CasoInstructivo {
  caso: string
  que: string
}

export interface Procedimiento {
  id: string
  numero: string
  area: string
  titulo: string
  resumen: string
  quien: string
  cuando: string
  conQue: string
  reglaDeOro: string
  porQue: string[]
  pasos: PasoInstructivo[]
  numeros?: NumeroInstructivo[]
  notaNumeros?: string
  siPasa: CasoInstructivo[]
  nunca: string[]
  check: string[]
}

export const PROCEDIMIENTOS: Procedimiento[] = [
  {
    id: "camion",
    numero: "01",
    area: "Dársena",
    titulo: "Camión que baja y después carga",
    resumen: "Primero se baja todo, después se carga",
    quien: "Maquinista + auxiliar de dársena",
    cuando: "Todo camión que descarga y sale cargado",
    conQue: "Pantalla de recepción, remito, orden de salida",
    reglaDeOro:
      "Primero se baja todo el camión. Se cierra la descarga. Recién ahí se carga.",
    porQue: [
      "Cuando se baja y se carga al mismo tiempo, los pallets de recepción y los del reparto quedan mezclados en el piso: lo que bajó vuelve a subir, y la diferencia recién aparece cuando el cliente la reclama. Con el camión adentro no hay a quién reclamarle: la pérdida queda del lado nuestro.",
    ],
    pasos: [
      {
        titulo: "El chofer se anuncia",
        detalle:
          "Escanea el QR del cartel y carga patente, transportista, origen y remito. Ahí queda sellada la hora de arribo. Si no se anunció, no arranca nada.",
        sistema: true,
      },
      {
        titulo: "Ingreso a depósito y dársena asignada",
        detalle:
          "El auxiliar da el ingreso y le indica la dársena. Un camión sin ingreso cargado no entra a la playa.",
        sistema: true,
      },
      {
        titulo: "Iniciar descarga",
        detalle:
          "Se marca al empezar a bajar, no cuando te acordás. El cronómetro corre desde ahí y es el que mide la estadía.",
        sistema: true,
      },
      {
        titulo: "Bajar el camión completo",
        detalle:
          "Todo a la zona de recepción, que está delimitada. Nunca apoyar mercadería que baja sobre la zona de carga ni sobre pallets ya armados para un reparto.",
      },
      {
        titulo: "Barrer el camión",
        detalle:
          "Mirar adentro: fondo, laterales, arriba de la carga y los rincones. Si queda un bulto, la descarga no está terminada.",
      },
      {
        titulo: "Recepción en el momento",
        detalle:
          "Con el camión todavía en la dársena, se hace el instructivo 02: contar, controlar vencimiento y asentar diferencias en el remito.",
      },
      {
        titulo: "Finalizar descarga",
        detalle:
          "Se marca cuando el camión está vacío y la recepción quedó asentada. No antes.",
        sistema: true,
      },
      {
        titulo: "Ahora sí: cargar",
        detalle:
          "Se carga contra la orden de salida del viaje. Pallets armados, contados y controlados por alguien distinto del que los armó.",
      },
      {
        titulo: "Cerrar el viaje",
        detalle:
          "Se registran los pallets del viaje y la hora de fin de carga, con el número de viaje externo (el de la hoja de ruta), no el interno del WMS.",
        sistema: true,
      },
      {
        titulo: "Marcar la salida",
        detalle:
          "Cuando el camión libera la dársena. Terminar de cargar no es haberse ido: la dársena sigue ocupada hasta que sale.",
        sistema: true,
      },
    ],
    numeros: [
      {
        etiqueta: "Ventana de recepción",
        valor: "08–16",
        unidad: "los arribos fuera de ese rango se reciben, pero se coordinan",
      },
      {
        etiqueta: "Estadía objetivo",
        valor: "≤ 3 h",
        unidad: "del arribo al fin de descarga",
        tono: "ok",
      },
      {
        etiqueta: "Semáforo en pantalla",
        valor: "60–90",
        unidad: "minutos: amarillo. Más de 90, rojo: avisá al encargado",
        tono: "warn",
      },
    ],
    siPasa: [
      {
        caso: "Falta un pallet o viene de más",
        que: "No finalices la descarga. Asentalo en el remito y llamá al encargado con el camión ahí.",
      },
      {
        caso: "Mercadería rota o mojada",
        que: "Foto, se separa aparte, se asienta en el remito y se rechaza.",
      },
      {
        caso: "El chofer apura",
        que: "La estadía se mide igual; la firma del remito sin controlar no se recupera.",
      },
      {
        caso: "El camión viene sólo a buscar vacíos",
        que: "Se registra igual como operación, pero no entra como descarga.",
      },
    ],
    nunca: [
      "Cargar el camión sin haber cerrado la descarga.",
      "Mover pallets de la zona de recepción a la cancha antes de que estén recepcionados en el sistema.",
      "Marcar inicio y fin de descarga juntos, al final del turno.",
      "Dejar salir al camión con una diferencia sin asentar.",
    ],
    check: [
      "Camión vacío y barrido antes de finalizar la descarga",
      "Recepción hecha con el camión en dársena",
      "Descarga finalizada en la pantalla antes de empezar a cargar",
      "Viaje cerrado con pallets y número de viaje externo",
      "Salida marcada cuando liberó la dársena",
    ],
  },
  {
    id: "recepcion",
    numero: "02",
    area: "Recepción",
    titulo: "Recepción en el momento",
    resumen: "Contar y controlar con el camión en dársena",
    quien: "El que recibe, con el camión en dársena",
    cuando: "Antes de finalizar la descarga",
    conQue: "Remito, handheld, celular para fotos",
    reglaDeOro:
      "Lo que no se controla con el camión adentro, después es pérdida nuestra.",
    porQue: [
      "Una vez que el camión se fue y el remito está firmado conforme, el faltante no se reclama: entra al stock como si hubiera llegado y aparece semanas después en un recuento, sin dueño. El control se hace una sola vez y es en la dársena.",
    ],
    pasos: [
      {
        titulo: "Remito en mano antes de bajar",
        detalle:
          "Mirá qué dice que trae: artículos, bultos y pallets. Ese es el papel contra el que se cuenta.",
      },
      {
        titulo: "Contar, no estimar",
        detalle:
          "Bultos por artículo. Un pallet «completo» a ojo no es un conteo: si está flejado y no se puede contar, se abre o se cuenta por capa y altura, y se deja anotado cómo se contó.",
      },
      {
        titulo: "Leer el vencimiento en el producto",
        detalle:
          "La fecha buena es la que está impresa en el pack o en la etiqueta del producto. No vale el cartel de la paleta, ni lo que diga el remito, ni lo que diga el chofer.",
      },
      {
        titulo: "Anotar el lote junto con el vencimiento",
        detalle:
          "Van siempre de a dos. Si un mismo artículo viene con dos vencimientos distintos, son dos líneas de recepción, no una.",
      },
      {
        titulo: "Controlar el estado",
        detalle:
          "Film roto, cajas golpeadas, mojado, olor, pallet inclinado. Lo dudoso se separa antes de que baje del camión, no después.",
      },
      {
        titulo: "Rechazar lo que no cumple vida útil",
        detalle:
          "Si llega con menos vida útil que la mínima acordada para ese producto, no se recibe. Se asienta en el remito y sube de vuelta.",
      },
      {
        titulo: "Asentar TODO en el remito y firmar los dos",
        detalle:
          "Faltante, sobrante, rotura, vencimiento corto, cómo se contó. Firma tuya y del chofer, con aclaración. Sacale foto al remito observado.",
      },
      {
        titulo: "Cargar la recepción",
        detalle:
          "Artículo + lote + vencimiento + ubicación, con lo que contaste de verdad. Si son muchos contenedores iguales, se recepcionan igual uno por uno: el número de contenedor es lo único que cambia.",
        sistema: true,
      },
      {
        titulo: "Ubicar la mercadería",
        detalle:
          "Recién con la recepción cargada la paleta se lleva a su posición. Antes de eso no existe para el sistema y nadie la puede pickear.",
      },
    ],
    siPasa: [
      {
        caso: "El remito dice 100 y contaste 96",
        que: "Se recibe 96, se asienta 4 de faltante y firman los dos. Nunca se recibe «lo del papel».",
      },
      {
        caso: "Viene un artículo que no pedimos",
        que: "No se recibe. Se asienta y vuelve.",
      },
      {
        caso: "El código no está en el sistema",
        que: "Se recibe físico, se deja apartado identificado y se avisa al encargado el mismo día. No lo cargues contra otro código parecido.",
      },
      {
        caso: "No llegás a contar todo antes de que el camión se tenga que ir",
        que: "Avisá al encargado antes de firmar, no después.",
      },
    ],
    nunca: [
      "Firmar conforme sin haber contado.",
      "Copiar el vencimiento del remito sin mirar el producto.",
      "Cargar la recepción «después, tranquilo», con la paleta ya guardada.",
      "Mezclar en una misma recepción dos lotes o dos vencimientos.",
    ],
    check: [
      "Conté bultos por artículo contra el remito",
      "Leí vencimiento y lote en el producto, no en el cartel",
      "Diferencias y roturas asentadas y firmadas por los dos",
      "Foto del remito observado",
      "Recepción cargada antes de ubicar la mercadería",
    ],
  },
  {
    id: "carga",
    numero: "03",
    area: "Carga",
    titulo: "Carga del camión de reparto",
    resumen: "Dos personas cuentan, el viaje se cierra",
    quien: "El que carga + un segundo que controla",
    cuando: "Con la descarga ya cerrada",
    conQue: "Orden de salida, hoja de ruta",
    reglaDeOro:
      "El que carga no es el que controla. Dos personas, dos miradas, un solo número.",
    porQue: [
      "El error de carga es el más caro: viaja hasta el cliente y vuelve como rechazo, con flete pagado dos veces. Se ataja acá, en los treinta segundos que lleva contar los pallets contra la hoja.",
    ],
    pasos: [
      {
        titulo: "Orden de salida en mano",
        detalle:
          "Un viaje, una orden. Verificá patente y reparto antes de subir el primer pallet: cargar el viaje equivocado obliga a bajar todo.",
      },
      {
        titulo: "Pallets armados y rotulados por reparto",
        detalle:
          "Cada pallet identificado con el viaje al que pertenece. Un pallet sin rótulo no sube.",
      },
      {
        titulo: "Contar contra la hoja, pallet por pallet",
        detalle:
          "En voz alta con el que controla. Se cuenta lo que sube, no lo que «tendría que haber».",
      },
      {
        titulo: "Acomodar según el orden de entrega",
        detalle:
          "Lo primero que se entrega va último adentro. Bien estibado, sin pallets sueltos que se muevan en el camino.",
      },
      {
        titulo: "Cerrar la carga",
        detalle:
          "Pallets del viaje y hora de fin de carga. Ese número es el que después se mira como pallets por viaje: si se carga y no se cierra, el viaje figura como no cargado.",
        sistema: true,
      },
      {
        titulo: "Documentación al chofer",
        detalle:
          "Remitos del viaje contra la hoja de ruta. Lo que falte de papel vuelve como rechazo aunque la mercadería esté bien.",
      },
    ],
    siPasa: [
      {
        caso: "Falta mercadería de un pedido",
        que: "Se carga lo que hay, se avisa al encargado y queda registrado como faltante del viaje. No se completa con producto de otro reparto.",
      },
      {
        caso: "No entra todo en el camión",
        que: "Avisá antes de improvisar; lo que queda se reprograma, no se acomoda encima sin estibar.",
      },
      {
        caso: "El viaje cambió de patente",
        que: "Se corrige en el sistema antes de cerrar, no después.",
      },
    ],
    nunca: [
      "Cargar sin la orden de salida a la vista.",
      "Cerrar el viaje con los pallets «aproximados».",
      "Subir un pallet sin rótulo o armado por otro sin controlarlo.",
    ],
    check: [
      "Patente y reparto verificados contra la orden",
      "Pallets contados por dos personas",
      "Carga cerrada con pallets y hora",
      "Remitos entregados al chofer",
    ],
  },
  {
    id: "picking",
    numero: "04",
    area: "Cancha",
    titulo: "Picking: se tipea siempre, en el momento",
    resumen: "La línea se confirma parado frente a la posición",
    quien: "El pickeador, con su usuario",
    cuando: "En cada línea, parado frente a la posición",
    conQue: "Handheld",
    reglaDeOro:
      "Se tipea la línea en el momento de tomarla. No al final del turno, no de memoria.",
    porQue: [
      "Cuando la línea no se confirma en el momento, el sistema sigue mostrando mercadería que ya no está: la reposición de la cancha no se dispara, el que viene atrás se encuentra la posición vacía y arma el pedido incompleto.",
      "Y hay una diferencia que se paga: el error tipeado en el momento se detecta antes de que salga el camión y se corrige en la cancha. El mismo error cargado después se detecta en el cliente, y ahí ya es rechazo, nota de crédito y una visita perdida.",
    ],
    pasos: [
      {
        titulo: "Entrar con tu usuario",
        detalle:
          "El tuyo, siempre. El sistema mide precisión por persona, y eso es lo que te protege cuando el error no fue tuyo.",
      },
      {
        titulo: "Tomar la tarea en la handheld",
        detalle: "Una tarea a la vez. Si tenés dos pedidos abiertos, se mezclan las líneas.",
        sistema: true,
      },
      {
        titulo: "Confirmar la ubicación",
        detalle:
          "Escaneá o tipeá la posición antes de tocar el producto. Es lo que evita levantar del hueco de al lado.",
      },
      {
        titulo: "Confirmar el artículo",
        detalle:
          "Escaneá el código del producto que tenés en la mano y verificá que el nombre de la pantalla sea ese. Dos productos de la misma marca cambian un solo dígito.",
      },
      {
        titulo: "Cargar la cantidad real",
        detalle:
          "La que levantaste, no la que pedía. Si levantaste 7 de 10, se carga 7 y se declara el faltante ahí mismo.",
      },
      {
        titulo: "Confirmar la línea antes de moverte",
        detalle:
          "Confirmada la línea, recién ahí caminás a la siguiente posición. Ese es todo el hábito.",
      },
      {
        titulo: "Cerrar el pedido e identificar el pallet",
        detalle: "Pallet rotulado con el pedido y el viaje, listo para el control de carga.",
      },
    ],
    numeros: [
      { etiqueta: "Meta MKPL + Latas", valor: "175", unidad: "bultos por hora hombre" },
      { etiqueta: "Meta Gaseosas", valor: "310", unidad: "bultos por hora hombre" },
      { etiqueta: "Meta Cajones", valor: "205", unidad: "bultos por hora hombre" },
    ],
    notaNumeros:
      "Las metas son distintas a propósito: en MKPL + Latas se camina mucho más por cada bulto. Nadie compara canchas entre sí.",
    siPasa: [
      {
        caso: "El código no lee",
        que: "Tipeá los dígitos del código. Nunca confirmes la línea sin identificar el artículo.",
      },
      {
        caso: "La posición está vacía",
        que: "Cargá el faltante y avisá para que repongan. No vayas a buscarlo a almacén por tu cuenta.",
      },
      {
        caso: "El producto no coincide con la pantalla",
        que: "Pará, no lo cargues y llamá al encargado. Puede estar mal ubicado.",
      },
      {
        caso: "Se cortó la handheld",
        que: "Anotá en papel ubicación, artículo y cantidad, y cargalo apenas vuelve; contale al encargado qué quedó pendiente.",
      },
    ],
    nunca: [
      "Pickear todo y tipear después de memoria.",
      "Confirmar cantidades redondeadas o «la que pedía» cuando levantaste menos.",
      "Reemplazar un artículo por otro parecido sin autorización.",
      "Trabajar con el usuario de un compañero.",
    ],
    check: [
      "Entré con mi usuario",
      "Confirmé ubicación y artículo en cada línea",
      "Cargué la cantidad real y declaré los faltantes",
      "Cerré el pedido con el pallet rotulado",
      "No me quedó ninguna línea sin tipear",
    ],
  },
  {
    id: "fefo",
    numero: "05",
    area: "Frescura",
    titulo: "Vencimientos y FEFO",
    resumen: "La fecha válida es la del producto",
    quien: "Repositor de cancha y control de frescura",
    cuando: "Al reponer, al recepcionar y en el control diario",
    conQue: "El producto en la mano",
    reglaDeOro: "La fecha válida es la del producto. El cartel de la paleta no es la fecha.",
    porQue: [
      "Declarar por vencer algo que está bien nos saca de venta mercadería sana y desordena el presupuesto de vencidos. Al revés es peor: lo que está corto de verdad sigue en el frente y sale a la calle. Los dos errores salen del mismo lugar: creerle al cartel en vez de mirar el pack.",
      "Y además: si en la cancha hay stock que vence después que el que está en almacén, el FEFO está vulnerado. Cada pedido que sale de esa posición se lleva el más nuevo y deja envejecer el más viejo.",
    ],
    pasos: [
      {
        titulo: "Leé la fecha en el pack",
        detalle:
          "Impresa en el envase o en la etiqueta. Si la paleta tiene packs con fechas distintas, la que manda es la más corta de todas.",
      },
      {
        titulo: "Comparala con el sistema",
        detalle:
          "Si no coinciden, lo que se corrige es el sistema: se avisa al encargado con el lote y la posición. No se cambia el criterio para que cierre.",
      },
      {
        titulo: "Antes de reponer, mirá qué hay en almacén",
        detalle:
          "Se baja siempre el vencimiento más corto disponible del mismo artículo. Si el que está en la cancha vence después que el de almacén, avisá antes de reponer.",
      },
      {
        titulo: "Aplicá el semáforo",
        detalle:
          "A 30 días del vencimiento entra en preaviso: se prioriza para salir. A 14 días se bloquea: no sale sin autorización del encargado.",
      },
      {
        titulo: "Dejá el frente de estiba con la fecha más corta adelante",
        detalle:
          "El que viene a levantar tiene que encontrar primero lo más viejo, sin tener que elegir.",
      },
      {
        titulo: "Antes de declarar un vencido, verificá la paleta",
        detalle:
          "Fecha, lote y cantidad contada, con foto. Un vencido declarado mal se descuenta del stock y no vuelve.",
      },
      {
        titulo: "Lo bloqueado se separa físicamente",
        detalle:
          "Identificado y fuera de la zona de picking. Si sigue accesible, alguien lo va a levantar.",
      },
    ],
    numeros: [
      {
        etiqueta: "Preaviso",
        valor: "30",
        unidad: "días antes del vencimiento: sale primero",
        tono: "warn",
      },
      {
        etiqueta: "Bloqueo",
        valor: "14",
        unidad: "días antes: no sale sin autorización",
        tono: "stop",
      },
      {
        etiqueta: "Criterio",
        valor: "FEFO",
        unidad: "primero el que vence antes, no el que entró antes",
        tono: "ok",
      },
    ],
    siPasa: [
      {
        caso: "La paleta tiene dos fechas mezcladas",
        que: "Se separa por fecha antes de ubicar. Una paleta, una fecha.",
      },
      {
        caso: "El cartel dice una fecha y el pack otra",
        que: "Vale el pack. Se reimprime el cartel y se avisa.",
      },
      {
        caso: "En cancha quedó producto más nuevo que el de almacén",
        que: "Avisá al encargado; se corrige la posición antes de seguir pickeando.",
      },
      {
        caso: "Un cliente devuelve producto corto",
        que: "No vuelve al frente de estiba; se separa identificado.",
      },
    ],
    nunca: [
      "Declarar vencido leyendo el cartel de la paleta.",
      "Reponer con vencimiento largo teniendo uno más corto en almacén.",
      "Despachar producto por debajo del bloqueo sin autorización.",
      "Dejar mercadería bloqueada dentro de la zona de picking.",
    ],
    check: [
      "Leí la fecha en el pack, no en el cartel",
      "Repuse con el vencimiento más corto disponible",
      "Frente de estiba con la fecha más corta adelante",
      "Lo bloqueado quedó separado e identificado",
      "Vencidos verificados con fecha, lote, cantidad y foto",
    ],
  },
]

/** Fecha de la última revisión del contenido, que se muestra al pie. */
export const VIGENCIA_INSTRUCTIVOS = "18/09/2026"
