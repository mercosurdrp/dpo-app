// Plantillas del CUERPO de cada acuerdo SLA, indexadas por código.
// Se renderizan en la hoja imprimible (/sla/[id]/imprimir) para firmar.
// Vamos completando una por SLA a medida que los confeccionamos con el usuario.
// Los SLA sin plantilla caen a un cuerpo genérico armado con la descripción.

export interface SlaSeccion {
  titulo: string
  parrafos?: string[]
  bullets?: string[]
}

export interface SlaPlantilla {
  objeto: string
  nivelServicio: string[]
  medicion: string[]
  roles: { label: string; valor: string }[]
  gestionIncumplimiento: string
  vigencia: string
  /** Quiénes firman el acuerdo (una línea de firma por cada uno). */
  firmantes: string[]
  /** Secciones adicionales (premisas, condiciones operativas, etc.). */
  secciones?: SlaSeccion[]
}

export const SLA_PLANTILLAS: Record<string, SlaPlantilla> = {
  plan_ruteo_tiempo: {
    objeto:
      "Ruteo se compromete a entregar el ruteo diario finalizado dentro de la ventana horaria pactada, de modo que Almacén disponga del tiempo necesario para preparar la carga sin retrasos en la salida de reparto.",
    nivelServicio: [
      "Lunes a viernes: ruteo finalizado antes de las 09:00 hs.",
      "Sábados: ruteo finalizado antes de las 07:30 hs.",
      "Objetivo de cumplimiento mensual: ≥ 95 %.",
    ],
    medicion: [
      "La medición es automática a partir del módulo Ruteo de la plataforma DPO.",
      "El Ruteador registra el inicio del ruteo y, al terminar, el fin de ruteo (queda guardada la fecha y hora real del cierre).",
      "Un día cumple si la hora de fin es anterior al límite del día (09:00 hs L-V / 07:30 hs sábados).",
      "El indicador mensual se calcula como: días cumplidos ÷ días con ruteo registrado.",
    ],
    roles: [
      {
        label: "Carga de datos",
        valor: "Ruteador (registra inicio y fin de ruteo en la plataforma).",
      },
      {
        label: "Seguimiento del cumplimiento",
        valor: "Supervisor de Distribución.",
      },
    ],
    gestionIncumplimiento:
      "Ante un día incumplido se genera una tarea en el Action Log de las reuniones diarias de Logística o Logística-Ventas, con su responsable y plan de acción.",
    vigencia:
      "Vigente desde la fecha de firma. Revisión anual, o de forma inmediata si se modifica el horario del proceso de ruteo.",
    firmantes: ["Supervisor de Almacén", "Supervisor de Distribución"],
  },

  plan_syop: {
    objeto:
      "Acuerdo de nivel de servicio entre Ventas y Operaciones (Logística). Los criterios se determinan en consenso entre las partes, teniendo en cuenta las proyecciones de ambas áreas, para asegurar la correcta sincronización entre la toma de pedidos y la operación de entrega.",
    nivelServicio: [
      "Horario de entrega de preventa: la preventa debe entregarse a Logística (Ruteo) de lunes a viernes a las 08:00 hs y los sábados a las 07:00 hs, para poder iniciar el ruteo de la entrega del día siguiente.",
      "Pasado ese horario no se realizan modificaciones de pedidos (cantidades, altas o bajas), salvo excepción validada previamente por Gerente, JDV o JDL.",
      "Objetivo de cumplimiento mensual del horario de preventa: ≥ 95 %.",
    ],
    medicion: [
      "La medición es automática a partir del módulo Ruteo de la plataforma DPO.",
      "El Ruteador registra el horario de fin de preventa (por aviso de WhatsApp o clic en el sistema; editable).",
      "Un día cumple si la entrega de la preventa ocurrió antes del límite del día (08:00 hs L-V / 07:00 hs sábados).",
      "El indicador mensual se calcula como: días cumplidos ÷ días con preventa registrada.",
    ],
    roles: [
      {
        label: "Carga de datos / medición",
        valor: "Ruteador (registra el fin de preventa en la plataforma).",
      },
      {
        label: "Respuesta / seguimiento",
        valor: "Supervisor de Distribución.",
      },
    ],
    gestionIncumplimiento:
      "Ante un incumplimiento se registra una tarea en el Action Log de las reuniones (Logística / Logística-Ventas) de forma manual, con su responsable y plan de acción.",
    vigencia:
      "Vigencia de 1 año desde la fecha de firma. Puede revisarse en caso de que haya alguna modificación en los procesos acordados.",
    firmantes: ["Jefe de Logística", "Jefe de Ventas"],
    secciones: [
      {
        titulo: "Drop size",
        parrafos: [
          "El drop mínimo en todos los canales será de acuerdo a la Orden Mínima Monetaria (OMM) de cada canal: 1.5 del valor de 1 bulto de 7038 Brahma 1 lt para clientes del segmento alcohólico, y 1 vez ese valor para el segmento no alcohólico. El control de cumplimiento y envío de la orden queda a cargo del asistente de ventas. La actualización de la OMM para nuevos clientes es responsabilidad de Logística.",
        ],
      },
      {
        titulo: "Fuera de ruta",
        parrafos: [
          "Los fuera de ruta se realizan excepcionalmente según motivos validados por Gerente, JDV o JDL, debiendo ser mínimamente un pedido de 5 bultos y próximos a la zona de entrega del día. Se verificará que el cliente no tuviera pedidos rechazados en su última visita. Se habilitan fuera de ruta para clientes potenciales en las rutas previas a un feriado. Estos pedidos deben cargarse y autorizarse antes del inicio del ruteo.",
        ],
      },
      {
        titulo: "Capacidad de flota",
        bullets: [
          "Capacidad total: 11 camiones — 8 para Ramallo (SN + Ramallo + Arrecifes), 2 para Pergamino y 1 para Colón.",
          "Lunes a viernes: Ramallo (San Nicolás + Ramallo) 3150 Ceq (6 × 525), Pergamino 1050 (2 × 525), Arrecifes martes y jueves 525 Ceq, Colón todos los días 525 Ceq. Máximo 45 clientes por camión.",
          "Sábados y feriados: capacidad de carga al 60% y 25 clientes por ruta; Colón y Arrecifes pasan a Ramallo. Ramallo 2835 UP / 225 clientes, Pergamino 630 UP / 50 clientes.",
          "Las recargas son de un máximo de 525 Ceq por ruta (cualquier localidad).",
        ],
      },
      {
        titulo: "Toma de pedidos",
        parrafos: [
          "Garantizar que, al llegar el camión al PDV, el cliente cuente con los cajones y envases (calibre y tipo correspondiente, debidamente encanastillados) y el dinero, para no retrasar la entrega. La entrega y el cobro se realizan en la dirección cargada en el sistema. Si el cliente paga por método electrónico, debe entregar el comprobante al momento de la entrega.",
        ],
      },
      {
        titulo: "Facturación de contado",
        parrafos: [
          "Toda factura de contado debe abonarse al momento de la visita al PDV (efectivo, cheque al día o transferencia). Si no se realiza el pago, no se baja la mercadería, salvo los clientes del listado autorizado por gerencia y comunicado al equipo de reparto. Toda factura en presupuesto debe abonarse en el momento, sin poder cargarse en cuenta corriente.",
        ],
      },
      {
        titulo: "Informe de novedades",
        bullets: [
          "Compartir en el link de novedades de preventa las novedades para la ruta del día siguiente.",
          "Clientes con ventanas horarias excepcionales u horarios particulares.",
          "Solicitudes de entrega/retiro de comodatos y consignaciones (con nombre del cliente y descripción; comodatos cargados por Chess).",
          "Solicitudes de entrega y descuento de notas de crédito, y autorizaciones particulares de los clientes.",
          "Las novedades deben cargarse antes de informar el fin de zona al encargado de ruteo para ser consideradas en ese ruteo.",
        ],
      },
      {
        titulo: "Pedidos a retirar por depósito",
        bullets: [
          "Una vez cargado el pedido en BEES, avisar al asistente de ventas indicando facturas a retirar, datos de quien retira (vehículo y nombre) y forma de pago.",
          "El asistente de ventas genera el camión (transporte 22 - MOSTRADOR RAMALLO) y avisa a administración para emitir la planilla de carga.",
          "Horario de pasar pedido: L-V 10:30 hs (entrega 12:00 a 13:30 hs); sábado 09:00 hs (entrega 11:00 a 12:30 hs).",
          "Emitida la planilla, se carga en WMS, se pickea la mercadería y se deja en zona de stay; recién ahí se permite el ingreso del cliente a retirar.",
          "La preparación demora aprox. 1 a 1.5 hs (más si supera 50 bultos o muchos SKU). Recomendación: avisar con anticipación y, si es de muchos bultos, pedir el día anterior.",
        ],
      },
    ],
  },

  plan_ruteo_capacidad: {
    objeto:
      "Ruteo se compromete a planificar la carga de cada camión aprovechando su capacidad, de modo que la flota salga con un nivel de ocupación adecuado y se optimice el costo de distribución.",
    nivelServicio: [
      "Cada camión debe rutearse buscando aprovechar su capacidad de carga (referencia: 450 CEq por viaje).",
      "Objetivo de ocupación promedio diaria: ≥ 90 % de la capacidad.",
      "Objetivo de cumplimiento mensual: ≥ 95 % de los días dentro del nivel de ocupación.",
    ],
    medicion: [
      "La medición es automática a partir de la ocupación de bodega (CEq por patente y día) que se sincroniza desde Chess.",
      "El % de ocupación del día es el promedio de CEq ÷ 450 de las patentes que salieron a reparto.",
      "Un día cumple si el promedio de ocupación es ≥ 90 %.",
      "El indicador mensual se calcula como: días cumplidos ÷ días con reparto registrado.",
    ],
    roles: [
      {
        label: "Carga de datos / medición",
        valor: "Automática (ocupación de bodega desde Chess).",
      },
      { label: "Seguimiento del cumplimiento", valor: "Supervisor de Distribución." },
    ],
    gestionIncumplimiento:
      "Ante días por debajo del nivel de ocupación se genera una tarea en el Action Log de las reuniones de Logística, con su responsable y plan de acción.",
    vigencia:
      "Vigente desde la fecha de firma. Revisión anual, o si cambia la composición/capacidad de la flota.",
    firmantes: ["Supervisor de Distribución", "Supervisor de Entrega"],
  },

  plan_ruteo_pushed: {
    objeto:
      "Ruteo se compromete a minimizar el volumen no ruteado (Pushed Volume), es decir, los bultos que quedan sin entrar en ninguna ruta del día, y a aplicar el procedimiento acordado cuando este volumen exista.",
    nivelServicio: [
      "Objetivo diario de volumen no ruteado: ≤ 5 % del total del día.",
      "Todo volumen no ruteado debe quedar registrado y reprogramado o gestionado con Ventas según el procedimiento.",
      "Objetivo de cumplimiento mensual: ≥ 95 % de los días dentro del umbral.",
    ],
    medicion: [
      "El Ruteador registra, al cerrar el ruteo, la cantidad de bultos que quedaron sin rutear ese día.",
      "El % no ruteado del día es bultos no ruteados ÷ (no ruteados + bultos ruteados).",
      "Un día cumple si el % no ruteado es ≤ 5 %.",
      "El indicador mensual se calcula como: días cumplidos ÷ días con ruteo cerrado.",
    ],
    roles: [
      {
        label: "Carga de datos",
        valor: "Ruteador (registra los bultos no ruteados al cerrar el ruteo).",
      },
      { label: "Seguimiento del cumplimiento", valor: "Supervisor de Distribución." },
    ],
    gestionIncumplimiento:
      "Ante días por encima del umbral se genera una tarea en el Action Log de las reuniones de Logística-Ventas, con el motivo del volumen no ruteado y el plan de acción.",
    vigencia:
      "Vigente desde la fecha de firma. Revisión anual, o si cambia el procedimiento de tratamiento del volumen no ruteado.",
    firmantes: ["Supervisor de Distribución", "Jefe de Ventas"],
  },
}
