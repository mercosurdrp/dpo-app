// Plantillas del CUERPO de cada acuerdo SLA, indexadas por código.
// Se renderizan en la hoja imprimible (/sla/[id]/imprimir) para firmar.
// Vamos completando una por SLA a medida que los confeccionamos con el usuario.
// Los SLA sin plantilla caen a un cuerpo genérico armado con la descripción.

export interface SlaPlantilla {
  objeto: string
  nivelServicio: string[]
  medicion: string[]
  roles: { label: string; valor: string }[]
  gestionIncumplimiento: string
  vigencia: string
  /** Quiénes firman el acuerdo (una línea de firma por cada uno). */
  firmantes: string[]
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
}
