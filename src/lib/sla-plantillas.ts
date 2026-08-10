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

  ent_nps: {
    objeto:
      "Acuerdo de nivel de servicio para la atención de los clientes que la encuesta de NPS deja como detractores o pasivos. Compromete el TIEMPO en que cada caso queda cerrado: la queja de un cliente no se archiva ni se diluye en el promedio del mes, se atiende con un plan de acción con responsable y se cierra dentro de un plazo pactado.",
    nivelServicio: [
      "Toda encuesta de NPS que deja al cliente como DETRACTOR abre un caso que debe cerrarse dentro de los 30 días corridos.",
      "Toda encuesta que lo deja como PASIVO abre un caso que debe cerrarse dentro de los 45 días corridos.",
      "El plazo se cuenta desde la FECHA DE LA ENCUESTA, no desde la fecha en que se abre el plan de acción.",
      "Un cliente detractor o pasivo al que nunca se le abre un plan cuenta como incumplido al vencer el plazo: el universo del acuerdo son todas las encuestas, no los planes cargados.",
      "Objetivo de cumplimiento mensual: ≥ 95 % de los casos cerrados en plazo.",
    ],
    medicion: [
      "La medición es automática a partir del módulo NPS de la plataforma DPO: cada fila de la encuesta con categoría Detractor o Passive es un caso.",
      "El caso se cierra cuando un plan de acción de ESE cliente (plan con cliente foco) queda en estado «completado». La fecha de cierre es la del avance que lo dejó completado, con su evidencia cargada.",
      "Un caso cumple si el cierre ocurre entre la fecha de la encuesta y su vencimiento (30 o 45 días según la categoría). Un plan cerrado antes de la encuesta no cuenta: estaba atendiendo un caso anterior.",
      "Mientras el plazo no vence, el caso figura «en curso» y no computa: no cuenta ni como cumplido ni como incumplido.",
      "El indicador mensual se calcula como: casos cerrados en plazo ÷ casos con plazo vencido o ya cerrados, agrupados por el mes de la encuesta.",
      "🚨 El porcentaje de un mes sigue moviéndose hasta 45 días después de terminado: un caso pasivo del 30 de agosto recién vence el 14 de octubre. Es propio de un acuerdo con plazo de un mes y medio y hay que tenerlo en cuenta al leerlo en la reunión.",
    ],
    roles: [
      {
        label: "Carga de datos / medición",
        valor:
          "Automática: el sync quincenal del Power BI de Quilmes baja las encuestas de NPS a la plataforma.",
      },
      {
        label: "Apertura del plan de acción",
        valor:
          "Jefe de Logística o Jefe de Ventas, según el driver de insatisfacción del cliente.",
      },
      {
        label: "Cierre del caso y evidencia",
        valor:
          "Responsable asignado al plan (registra el avance que lo deja completado).",
      },
      {
        label: "Seguimiento del cumplimiento",
        valor:
          "Gerencia, como parte cliente del acuerdo: es quien responde por el NPS y quien reclama si los casos no se cierran.",
      },
    ],
    gestionIncumplimiento:
      "Los casos vencidos se repasan en la reunión de Logística-Ventas. El caso vencido se cierra igual —el cliente no deja de importar porque se pasó el plazo— y el motivo del atraso se registra como tarea en el Action Log. Si los vencimientos se repiten sobre el mismo driver o el mismo responsable, se ataca la causa de fondo y no el caso puntual.",
    vigencia:
      "La medición del acuerdo comienza el 1 de agosto de 2026. Las encuestas anteriores quedan cargadas como referencia pero no se evalúan: el acuerdo no se aplica de forma retroactiva. Vigencia de 1 año desde la fecha de firma, con revisión anual o inmediata si cambia la frecuencia de la encuesta de NPS.",
    // Proveedor compartido: el NPS se mueve por drivers comerciales Y de
    // entrega, así que firman las dos jefaturas, no sólo Ventas.
    firmantes: [
      "Gerencia",
      "Nicolás Lescoulie — Jefe de Ventas",
      "Sebastián Roselli — Jefe de Logística",
    ],
    secciones: [
      {
        titulo: "Premisas y condiciones operativas",
        bullets: [
          "Un mismo plan puede cerrar más de un caso del mismo cliente, siempre que el cierre caiga dentro del plazo de cada uno.",
          "El plan tiene que tener cliente foco cargado: un plan general, sin cliente, no cierra ningún caso.",
          "El cierre exige evidencia en el avance (comentario o archivo): sin registro de lo que se hizo, el caso no se da por atendido.",
          "Los clientes promotores no generan caso.",
        ],
      },
    ],
  },

  ent_rmd: {
    objeto:
      "Acuerdo de nivel de servicio para la atención de los clientes que puntúan bajo la entrega en la encuesta de Rate My Delivery (RMD). Compromete el TIEMPO en que cada caso queda cerrado, de modo que una mala experiencia de entrega se trabaje mientras el cliente todavía la recuerda y no varias encuestas después.",
    nivelServicio: [
      "Toda entrega puntuada 1, 2 o 3 (DETRACTORA) abre un caso que debe cerrarse dentro de los 30 días corridos.",
      "Toda entrega puntuada 4 (PASIVA) abre un caso que debe cerrarse dentro de los 45 días corridos.",
      "Las entregas puntuadas 5 no generan caso.",
      "El plazo se cuenta desde la FECHA DE LA PUNTUACIÓN, no desde la fecha en que se abre el plan de acción.",
      "Una puntuación baja a la que nunca se le abre un plan cuenta como incumplida al vencer el plazo: el universo del acuerdo son todas las puntuaciones 1-4, no los planes cargados.",
      "Objetivo de cumplimiento mensual: ≥ 95 % de los casos cerrados en plazo.",
    ],
    medicion: [
      "La medición es automática a partir del módulo RMD de la plataforma DPO: cada entrega puntuada 1 a 4 es un caso.",
      "El caso se cierra cuando un plan de acción de ESE cliente (plan con cliente foco) queda en estado «completado». La fecha de cierre es la del avance que lo dejó completado, con su evidencia cargada.",
      "Un caso cumple si el cierre ocurre entre la fecha de la puntuación y su vencimiento (30 días para 1-3, 45 días para 4). Un plan cerrado antes de la puntuación no cuenta: estaba atendiendo un caso anterior.",
      "Mientras el plazo no vence, el caso figura «en curso» y no computa: no cuenta ni como cumplido ni como incumplido.",
      "El indicador mensual se calcula como: casos cerrados en plazo ÷ casos con plazo vencido o ya cerrados, agrupados por el mes de la puntuación.",
      "🚨 El porcentaje de un mes sigue moviéndose hasta 45 días después de terminado: un caso pasivo del 30 de agosto recién vence el 14 de octubre.",
    ],
    roles: [
      {
        label: "Carga de datos / medición",
        valor:
          "Automática: el sync de los lunes baja las puntuaciones de RMD del Power BI de Quilmes a la plataforma.",
      },
      {
        label: "Apertura del plan de acción",
        valor:
          "Supervisor de Distribución (el motivo de la baja puntuación suele estar en la entrega: chofer, horario, faltante o estado de la mercadería).",
      },
      {
        label: "Cierre del caso y evidencia",
        valor:
          "Responsable asignado al plan (registra el avance que lo deja completado).",
      },
      {
        label: "Seguimiento del cumplimiento",
        valor:
          "Jefe de Ventas, como parte cliente del acuerdo: es la cara ante el punto de venta y quien recibe el reclamo en la visita siguiente.",
      },
    ],
    gestionIncumplimiento:
      "Los casos vencidos se repasan en la reunión semanal de Logística. El caso vencido se cierra igual y el motivo del atraso se registra como tarea en el Action Log. Cuando las puntuaciones bajas se concentran en un chofer, una ruta o un motivo, se abre un plan de foco sobre esa causa en vez de tratar cada caso por separado.",
    vigencia:
      "La medición del acuerdo comienza el 1 de agosto de 2026. Las puntuaciones anteriores quedan cargadas como referencia pero no se evalúan: el acuerdo no se aplica de forma retroactiva. Vigencia de 1 año desde la fecha de firma, con revisión anual o inmediata si cambia la mecánica de la encuesta de RMD.",
    // Firma el cliente (Ventas, que reclama) y el proveedor (Logística, que se
    // compromete a cerrar el caso). El punto de venta es el beneficiario final
    // del acuerdo, pero no es parte: no firma ni reclama internamente.
    firmantes: [
      "Nicolás Lescoulie — Jefe de Ventas",
      "Sebastián Roselli — Jefe de Logística",
    ],
    secciones: [
      {
        titulo: "Premisas y condiciones operativas",
        bullets: [
          "Un mismo plan puede cerrar más de un caso del mismo cliente, siempre que el cierre caiga dentro del plazo de cada uno: un cliente que puntúa bajo dos entregas seguidas no exige dos planes.",
          "El plan tiene que tener cliente foco cargado: un plan general, o uno con foco sólo en un motivo o en un chofer, no cierra ningún caso.",
          "El cierre exige evidencia en el avance (comentario o archivo): sin registro de lo que se hizo, el caso no se da por atendido.",
          "Las entregas que recibieron la encuesta y el cliente nunca contestó no generan caso: sin puntuación no hay queja que atender.",
        ],
      },
    ],
  },

  plan_equipos_frio: {
    objeto:
      "Acuerdo de nivel de servicio entre Ventas y Logística para ordenar la entrega y el retiro de equipos de frío (heladeras, choperas y equipos eléctricos) en los puntos de venta. Un equipo de frío ocupa un lugar significativo en el camión y exige tiempo de maniobra en el punto de venta: concentrar estos movimientos en los primeros días de la semana permite planificar la carga sin resentir la entrega de producto ni la puntualidad del reparto.",
    nivelServicio: [
      "Los equipos de frío que salen DENTRO DE LA CARGA DE UN CAMIÓN se entregan (comodato) o se retiran (contracomodato) únicamente los días lunes, martes y miércoles.",
      "No se mueven equipos de frío los días feriados ni el día hábil inmediatamente posterior a un feriado, aunque caiga dentro de la ventana: ese día el camión sale con la carga acumulada de dos días y no admite el espacio ni el tiempo de maniobra que exige un equipo. Por ejemplo, siendo feriado el lunes 17 de agosto de 2026, esa semana el único día habilitado es el miércoles 19.",
      "Toda solicitud de movimiento fuera de esa ventana requiere autorización CONJUNTA del Jefe de Logística y el Jefe de Ventas. La autorización se registra en la plataforma DPO con su motivo.",
      "Quedan excluidos del acuerdo, y son posibles cualquier día de la semana: el retiro del equipo por parte del cliente en el depósito y todo documento emitido fuera de una carga de camión.",
      "Objetivo de cumplimiento mensual: ≥ 95 % de los días medibles, exigible desde el primer mes de vigencia.",
    ],
    medicion: [
      "La medición es automática a partir de los pedidos de Chess: se toman los documentos COPOP (entrega de equipo) y CTRCO (retiro / contracomodato) por su fecha de entrega.",
      "Se considera que el movimiento salió dentro de la carga de un camión cuando el campo Reparto del pedido es una patente. Si el Reparto es un canal de mostrador o el documento se emitió fuera de una carga, el movimiento no entra en la medición.",
      "El equipo de frío se identifica por el maestro de artículos de Chess (artículos marcados como activo fijo y agrupación de material POP heladera o chopera), no por el texto de la descripción.",
      "Un día cumple si todos los movimientos en camión de ese día salieron en un día habilitado —lunes, martes o miércoles, que no sea feriado ni día posterior a feriado—, o cuentan con excepción autorizada registrada.",
      "El calendario de feriados nacionales es el que ya usa la plataforma para el resto de los indicadores, de modo que la exclusión del día posterior se aplica sola, sin carga manual.",
      "El indicador mensual se calcula como: días cumplidos ÷ días con movimientos de equipos de frío en camión.",
      "Los movimientos con excepción autorizada se computan como cumplidos y se identifican en color amarillo, para poder seguir por separado la evolución de las excepciones.",
    ],
    roles: [
      {
        label: "Solicitud del movimiento",
        valor: "Ventas (emite el comodato o contracomodato en Chess).",
      },
      {
        label: "Programación en la carga",
        valor: "Logística / Ruteo (asigna el movimiento a la carga de un camión).",
      },
      {
        label: "Autorización de excepciones",
        valor:
          "Jefe de Logística (Sebastián Roselli) y Jefe de Ventas (Nicolás Lescoulie), en conjunto.",
      },
      {
        label: "Registro y seguimiento",
        valor:
          "Jefe de Logística y Jefe de Ventas (registran la excepción en la plataforma DPO durante la reunión Ventas-Logística).",
      },
    ],
    gestionIncumplimiento:
      "Los movimientos fuera de ventana sin excepción registrada se revisan en la reunión semanal de Ventas-Logística. Si el volumen de excepciones autorizadas crece mes a mes, se abre una tarea en el Action Log para atacar la causa de fondo en la programación de las solicitudes, no el caso puntual.",
    vigencia:
      "La medición del acuerdo comienza el 1 de agosto de 2026. Los movimientos anteriores quedan registrados como referencia pero no se evalúan: el acuerdo no se aplica de forma retroactiva. Vigencia de 1 año desde la fecha de firma, con revisión anual o inmediata si cambia la política de comodatos, el esquema de ruteo o los días de reparto.",
    firmantes: [
      "Sebastián Roselli — Jefe de Logística",
      "Nicolás Lescoulie — Jefe de Ventas",
    ],
    secciones: [
      {
        titulo: "Premisas y condiciones operativas",
        parrafos: [
          "El acuerdo ordena la PROGRAMACIÓN del movimiento, no la venta ni la colocación del equipo: la decisión comercial de colocar o retirar un equipo sigue siendo de Ventas.",
        ],
        bullets: [
          "La solicitud debe estar emitida en Chess con antelación suficiente para que Logística la incluya en la carga del lunes, martes o miércoles siguiente.",
          "Un punto de venta que queda sin frío por rotura de equipo constituye motivo válido de excepción y se resuelve por la vía de autorización conjunta.",
          "Cuando el movimiento implique recambio (retirar un equipo y dejar otro en el mismo punto de venta), ambos documentos deben programarse en la misma visita.",
          "La excepción se registra después del hecho: no requiere aprobación previa a la salida del camión, para no demorar la operación.",
          "El registro de la excepción exige identificar el motivo y a los dos jefes que la autorizaron.",
        ],
      },
      {
        titulo: "Fuera de alcance",
        bullets: [
          "Retiro del equipo por el propio cliente en el depósito.",
          "Documentos de comodato o contracomodato emitidos fuera de una carga de camión.",
          "Movimientos de material POP que no sea equipo de frío (mesas, sillas, sombrillas, góndolas) y movimientos de envases.",
        ],
      },
    ],
  },
}
