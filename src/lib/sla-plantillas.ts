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
          "Lunes a viernes: Ramallo (San Nicolás + Ramallo) 8400 Ceq (6 × 1400), Pergamino 2800 (2 × 1400), Arrecifes martes y jueves 1400 Ceq, Colón todos los días 1400 Ceq. Máximo 45 clientes por camión.",
          "Sábados y feriados: capacidad de carga al 60% y 25 clientes por ruta; Colón y Arrecifes pasan a Ramallo. Ramallo 7560 Ceq (9 × 1400 × 0,6) / 225 clientes, Pergamino 1680 Ceq (2 × 1400 × 0,6) / 50 clientes.",
          "Las recargas son de un máximo de 1400 Ceq por ruta (cualquier localidad).",
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
      "Ruteo se compromete a asignar a cada camión una carga que alcance, como mínimo, la capacidad de carga pactada, de modo que Entrega opere con camiones aprovechados y se optimice el costo por viaje. El parámetro es un piso de carga: no existe un máximo.",
    nivelServicio: [
      "Mínimo de carga por camión: 525 CEq (cajas equivalentes).",
      "El cumplimiento se evalúa por el promedio de CEq de todos los camiones del día (mismo criterio que el indicador de Ocupación de Bodega).",
      "Un día cumple si el promedio de CEq de los camiones del día alcanza el mínimo de 525 CEq.",
      "No se fija un máximo de carga.",
      "Objetivo de cumplimiento mensual: ≥ 95 % de los días.",
    ],
    medicion: [
      "La medición es automática a partir de la Ocupación de Bodega de la plataforma DPO (CEq por camión, calculado desde la facturación de Chess).",
      "Se promedia el CEq de todos los camiones de cada día.",
      "Un día cumple si ese promedio es mayor o igual al mínimo pactado (525 CEq).",
      "El indicador mensual se calcula como: días cumplidos ÷ días con reparto registrado.",
    ],
    roles: [
      {
        label: "Carga de datos / medición",
        valor: "Ruteador (arma la carga de cada camión en el ruteo).",
      },
      { label: "Respuesta / seguimiento", valor: "Supervisor de Distribución." },
    ],
    gestionIncumplimiento:
      "Ante un incumplimiento se registra una tarea en el Action Log de las reuniones (Logística / Logística-Ventas) de forma manual, con su responsable y plan de acción.",
    vigencia:
      "Vigencia de 1 año desde la fecha de firma, salvo que se modifique el parámetro mínimo de carga del camión, en cuyo caso se revisa de inmediato.",
    firmantes: ["Ruteador", "Supervisor de Distribución"],
  },

  plan_ruteo_pushed: {
    objeto:
      "Acuerdo sobre el tratamiento del volumen no ruteado (Pushed Volume): los bultos que quedan sin entrar en ninguna ruta del día. El SLA no fija un límite de cantidad; compromete el procedimiento de gestión de ese volumen para que ningún pedido quede sin atender.",
    nivelServicio: [
      "Ante cualquier bulto que quede sin rutear, Ruteo avisa a Ventas (por WhatsApp) y reprograma la entrega con prioridad.",
      "El volumen no ruteado no se mide por cantidad de bultos: el cumplimiento consiste en seguir el procedimiento de aviso y reprogramación.",
      "Se lleva un acumulado mensual (MTD) de bultos no despachados a modo informativo y de seguimiento.",
    ],
    medicion: [
      "El Ruteador registra, al cerrar el ruteo, la cantidad de bultos que quedaron sin rutear ese día.",
      "En la pestaña Cumplimientos, la columna del mes muestra el acumulado de bultos no despachados (informativo), no un porcentaje.",
      "El cumplimiento diario es siempre afirmativo mientras se aplique el procedimiento (aviso a Ventas y reprogramación con prioridad).",
    ],
    roles: [
      {
        label: "Responsable de medir",
        valor: "Ruteador (registra los bultos no ruteados al cerrar el ruteo).",
      },
      {
        label: "Responsable de actuar / seguimiento",
        valor: "Supervisor de Distribución.",
      },
    ],
    gestionIncumplimiento:
      "Las acciones se registran de forma manual en el Action Log de las reuniones (Logística / Logística-Ventas), con el motivo del volumen no ruteado y la reprogramación acordada.",
    vigencia:
      "Vigencia de 1 año desde la fecha de firma, o si cambia el procedimiento de tratamiento del volumen no ruteado.",
    firmantes: ["Jefe de Logística", "Jefe de Ventas"],
  },

  alm_recepcion: {
    objeto:
      "Acuerdo de nivel de servicio entre Almacén y el equipo de Acarreo / Abastecimiento para la recepción de la mercadería. Almacén se compromete a recibir y descargar los camiones de abastecimiento dentro de una ventana horaria y un tiempo de descarga pactados, de modo de asegurar la disponibilidad de stock sin demorar al transporte.",
    nivelServicio: [
      "Ventana de recepción: los camiones de Acarreo / Abastecimiento se reciben de 07:00 a 17:00 hs.",
      "Tiempo de descarga: Almacén se compromete a descargar cada camión dentro de las 3 horas posteriores a su arribo.",
      "El cumplimiento del tiempo de descarga (≤ 3 hs) se exige para los camiones que arriban dentro de la ventana de 08:00 a 16:00 hs; los arribos fuera de esa franja (07:00–08:00 y 16:00–17:00) se reciben pero no se computan en el indicador.",
      "Objetivo de cumplimiento mensual: ≥ 95 % de las recepciones medidas.",
    ],
    medicion: [
      "El chofer del acarreo se autoanuncia al llegar (escaneando un QR) y queda registrada la hora de arribo; Almacén marca el inicio y la finalización de la descarga.",
      "Una recepción cumple si: (a) el arribo ocurre entre las 08:00 y las 16:00 hs, y (b) el tiempo transcurrido entre el arribo y el fin de descarga es menor o igual a 3 horas.",
      "Los arribos fuera de la franja 08:00–16:00, o las recepciones sin fin de descarga registrado, no se computan en el indicador.",
      "El indicador mensual se calcula como: recepciones cumplidas ÷ recepciones medidas del mes.",
    ],
    roles: [
      {
        label: "Responsable de medir",
        valor:
          "Responsable de recepción de Almacén (registra el arribo y el fin de descarga de cada camión).",
      },
      {
        label: "Responsable de actuar / seguimiento",
        valor: "Supervisor de Almacén.",
      },
    ],
    gestionIncumplimiento:
      "Ante un incumplimiento se registra una tarea en el Action Log de las reuniones de forma manual, con su responsable y plan de acción.",
    vigencia:
      "Vigencia de 1 año desde la fecha de firma, salvo que se modifique la ventana horaria de recepción o el tiempo de descarga comprometido, en cuyo caso se revisa de inmediato.",
    firmantes: ["Supervisor de Almacén", "Responsable de Acarreo / Abastecimiento"],
  },

  alm_carga: {
    objeto:
      "Acuerdo de nivel de servicio entre Entrega y Almacén para reducir retrasos en la salida de reparto. Almacén se compromete a dejar todos los camiones cargados antes del cierre del día en que se rutean, de modo que al día siguiente la entrega salga sin demoras con los camiones listos.",
    nivelServicio: [
      "Todos los camiones ruteados en el día deben quedar cargados antes de las 23:59 hs de ese mismo día.",
      "Esto equivale a que los camiones estén cargados antes de las 07:00 hs del día de reparto (la carga se hace el día previo a la salida).",
      "Un día cumple si la totalidad de los camiones ruteados ese día quedó cargada dentro de ese horario.",
      "Objetivo de cumplimiento mensual: ≥ 95 % de los días.",
    ],
    medicion: [
      "La medición es automática a partir del módulo Ruteo de la plataforma DPO, tomando la hora en que cada camión queda cargado (dato del WMS).",
      "Un día cumple si todos los camiones ruteados ese día quedaron cargados antes de las 07:00 hs del día de reparto (es decir, ese mismo día o antes de las 07:00 hs del día siguiente).",
      "El indicador mensual se calcula como: días cumplidos ÷ días con ruteo registrado.",
      "El detalle por camión (hora de carga de cada patente) puede consultarse en el módulo Ruteo y en la pestaña Cumplimientos al hacer clic en el día.",
    ],
    roles: [
      {
        label: "Responsable de medir",
        valor: "Personal operativo de Almacén (registra la carga de cada camión).",
      },
      {
        label: "Responsable de actuar / seguimiento",
        valor: "Supervisor de Almacén.",
      },
    ],
    gestionIncumplimiento:
      "Ante un día incumplido se registra una tarea en el Action Log de las reuniones de forma manual, con su responsable y plan de acción.",
    vigencia:
      "Vigencia de 1 año desde la fecha de firma. Revisión anual, o de forma inmediata si se modifica el proceso u horario de carga.",
    firmantes: ["Supervisor de Almacén", "Supervisor de Distribución"],
  },
}
