import ExcelJS from "exceljs"

interface Capacitacion {
  pilar: string
  pilarColor: string
  bloque: string
  pregunta: string
  textoResumido: string
  capacitacionRequerida: string
  prioridad: "Alta" | "Media" | "Baja"
  peso: number
  mandatoria: boolean
}

const capacitaciones: Capacitacion[] = [
  // ═══════════════════════════════════════
  // PILAR 1: SEGURIDAD
  // ═══════════════════════════════════════
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "SIF y Gestion de Incidentes",
    pregunta: "R1.1", textoResumido: "Reporte de incidentes y accidentes",
    capacitacionRequerida: "Uso de herramienta de reporte de incidentes. Registro de condiciones inseguras. Entrenamiento conductual seguro/inseguro.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "Gestion de Procesos de Alto Riesgo",
    pregunta: "R2.4", textoResumido: "Gestion de sistemas electricos",
    capacitacionRequerida: "Calificacion de personal para trabajos electricos. Permisos de trabajo electrico. Personal autorizado propio o externo.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "Seguridad en Transporte en Lugar de Trabajo",
    pregunta: "R3.4", textoResumido: "Gestion de seguridad de peatones",
    capacitacionRequerida: "Controles de ingenieria para segregacion de peatones. Uso de barreras, sirenas, semaforos. Zonas de cruce seguro.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "Seguridad en Transporte en Lugar de Trabajo",
    pregunta: "R3.6", textoResumido: "Ejecucion segura de control de llaves",
    capacitacionRequerida: "Procedimiento de control de llaves y acceso a vehiculos. Entrenamiento completo en protocolo.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "Manipulacion de Materiales y Ergonomia",
    pregunta: "R4.3", textoResumido: "Operacion segura de equipos de elevacion mecanica",
    capacitacionRequerida: "Coaching y entrenamiento en procedimientos de operacion de equipos de elevacion. Evaluacion de competencia.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "Sustancias Peligrosas",
    pregunta: "R5.1", textoResumido: "Ejecucion segura de carga de GLP",
    capacitacionRequerida: "Procedimientos de estaciones de GLP a granel. Lista de operadores autorizados. Manejo de emergencias con GLP.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "Sustancias Peligrosas",
    pregunta: "R5.2", textoResumido: "Ejecucion segura de carga de baterias",
    capacitacionRequerida: "Procedimientos de estaciones de carga de baterias. Uso de lavaojos y ducha de seguridad. Operadores autorizados.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "Sustancias Peligrosas",
    pregunta: "R5.3", textoResumido: "Ejecucion segura de carga de Diesel/Gasoil",
    capacitacionRequerida: "Procedimientos de estaciones de diesel. Acceso controlado. Protocolos de seguridad contra incendios.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "Seguridad Vial y de Conduccion",
    pregunta: "R8.4", textoResumido: "Gestion de telemetria",
    capacitacionRequerida: "Uso y monitoreo de sistema de telemetria/GPS. Interpretacion de KPIs de conduccion segura (cinturon, velocidad).",
    prioridad: "Media", peso: 1, mandatoria: true,
  },
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "Seguridad Vial y de Conduccion",
    pregunta: "R8.5", textoResumido: "Gestion de la jornada laboral",
    capacitacionRequerida: "Limites de jornada laboral (max 12h). Gestion de fatiga. Procedimiento de investigacion cuando se excede.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "Seguridad Vial y de Conduccion",
    pregunta: "R8.6", textoResumido: "Gestion del control de pesos",
    capacitacionRequerida: "Proceso de control de carga y capacidad. Uso de maestro de flota. Controles para eliminar sobrepeso.",
    prioridad: "Media", peso: 1, mandatoria: true,
  },
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "Salud Ocupacional",
    pregunta: "R11.1", textoResumido: "Notificacion e investigacion de enfermedades profesionales",
    capacitacionRequerida: "Proceso de notificacion de enfermedades. Identificacion de trastornos musculo-esqueleticos. Conservacion auditiva.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "Respuesta ante Emergencias",
    pregunta: "R12.2", textoResumido: "Prevencion y proteccion contra incendios",
    capacitacionRequerida: "Uso de extintores, hidrantes, rociadores. Planes de evacuacion. Simulacros de emergencia. Carga de fuego.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "Formacion y Competencia",
    pregunta: "R13.2", textoResumido: "Entrenamientos calificados (CRITICO)",
    capacitacionRequerida: "Entrenamiento de calificacion formal (teoria + practica + evaluacion) para: Montacargas, Equipos de elevacion, GLP, Baterias, Diesel.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "Gestion de Seguridad Operacional",
    pregunta: "R14.1", textoResumido: "Gestion de inventarios de seguridad",
    capacitacionRequerida: "Catalogacion de riesgos (espacios confinados, bastidores, LOTO). Acceso a informacion de inventarios de seguridad.",
    prioridad: "Media", peso: 1, mandatoria: true,
  },
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "Gestion de Seguridad Operacional",
    pregunta: "R14.2", textoResumido: "Gestion de evaluacion de riesgos",
    capacitacionRequerida: "Metodologia de evaluacion de riesgos por area y tarea. Controles jerarquicos. Actualizacion periodica.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "Gestion del Trabajo No Estandar",
    pregunta: "R15.1", textoResumido: "Induccion de visitantes y empleados",
    capacitacionRequerida: "Induccion obligatoria para 100% de visitantes y empleados previo al ingreso a planta.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Seguridad", pilarColor: "FFEF4444", bloque: "Gestion del Trabajo No Estandar",
    pregunta: "R15.4", textoResumido: "Gestion de permisos de trabajo",
    capacitacionRequerida: "Sistema de permisos de trabajo. Formacion de personas autorizadas para firmar permisos.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },

  // ═══════════════════════════════════════
  // PILAR 2: GENTE
  // ═══════════════════════════════════════
  {
    pilar: "Gente", pilarColor: "FF3B82F6", bloque: "Aprendizaje y Desarrollo",
    pregunta: "R4.1", textoResumido: "Estrategia de aprendizaje conectada con negocio",
    capacitacionRequerida: "Programacion de capacitaciones (GANTT de PAC). Uso de plataformas Humand y Campus BAP. Plan anual de capacitacion.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Gente", pilarColor: "FF3B82F6", bloque: "Aprendizaje y Desarrollo",
    pregunta: "R4.2", textoResumido: "Proceso de induccion para nuevos y cambios de puesto",
    capacitacionRequerida: "Programa de induccion formal (sueno, principios, cultura ABI). Kit de bienvenida. Sistema de Tutores/Padrinos.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Gente", pilarColor: "FF3B82F6", bloque: "Aprendizaje y Desarrollo",
    pregunta: "R4.3", textoResumido: "Adquisicion de habilidades (SKAP)",
    capacitacionRequerida: "Framework SKAP: habilidades basicas por funcion. Ciclo de retroalimentacion. Herramientas SKAP estandarizadas.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Gente", pilarColor: "FF3B82F6", bloque: "Ambiente de Trabajo y Engagement",
    pregunta: "R5.2", textoResumido: "Ambiente de trabajo seguro e inclusivo",
    capacitacionRequerida: "Sensibilizacion sobre seguridad psicologica y comportamiento inclusivo. Comunicacion de expectativas laborales.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },

  // ═══════════════════════════════════════
  // PILAR 3: GESTION
  // ═══════════════════════════════════════
  {
    pilar: "Gestion", pilarColor: "FF8B5CF6", bloque: "Strategy",
    pregunta: "R1.1", textoResumido: "Compliance - Politicas de cumplimiento",
    capacitacionRequerida: "Politicas de cumplimiento. Linea Etica. Canal de compliance. Escalamiento de violaciones. Obligatoria para todos los empleados.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Gestion", pilarColor: "FF8B5CF6", bloque: "Business and Processes Mapping",
    pregunta: "R2.3", textoResumido: "Indicadores de productos y procesos",
    capacitacionRequerida: "Uso de Arbol KPI, concepto KPI-PI-SIC. Interpretacion de indicadores en estaciones de trabajo y Team Rooms.",
    prioridad: "Media", peso: 1, mandatoria: true,
  },
  {
    pilar: "Gestion", pilarColor: "FF8B5CF6", bloque: "Routine Management (SDCA)",
    pregunta: "R3.1", textoResumido: "Metodologia 5S",
    capacitacionRequerida: "Principios y metodologia 5S. Aplicacion practica en areas de trabajo. Evaluacion de conocimiento.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Gestion", pilarColor: "FF8B5CF6", bloque: "Routine Management (SDCA)",
    pregunta: "R3.4", textoResumido: "Sistema de gestion de control y reporte (MCRS)",
    capacitacionRequerida: "Estandar global de reuniones. TOR (Terms of Reference). Planes de accion. Rutinas de gestion.",
    prioridad: "Media", peso: 1, mandatoria: true,
  },
  {
    pilar: "Gestion", pilarColor: "FF8B5CF6", bloque: "Routine Management (SDCA)",
    pregunta: "R3.5", textoResumido: "Estaciones de trabajo (Workstations)",
    capacitacionRequerida: "Uso de estacion de trabajo. Como impactan las tareas diarias a los PI. Gestion visual de indicadores.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Gestion", pilarColor: "FF8B5CF6", bloque: "Routine Management (SDCA)",
    pregunta: "R3.6", textoResumido: "Team Room - Sala del equipo",
    capacitacionRequerida: "Uso de sala del equipo. Impacto en PI. Participacion activa en reuniones de equipo.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },

  // ═══════════════════════════════════════
  // PILAR 4: ENTREGA
  // ═══════════════════════════════════════
  {
    pilar: "Entrega", pilarColor: "FFF59E0B", bloque: "Procesos de Ejecucion de Entrega",
    pregunta: "R1.1", textoResumido: "PRE RUTA - Preparacion de ruta y carga",
    capacitacionRequerida: "SOPs de preparacion de ruta. Proceso de carga de vehiculos. Verificacion de pedidos. Documentacion de entrega.",
    prioridad: "Alta", peso: 1, mandatoria: false,
  },
  {
    pilar: "Entrega", pilarColor: "FFF59E0B", bloque: "Procesos de Ejecucion de Entrega",
    pregunta: "R1.2", textoResumido: "EN RUTA - Ejecucion de entrega",
    capacitacionRequerida: "SOPs de ejecucion de entrega. Protocolo con clientes. Manejo de devoluciones. Registro de novedades en ruta.",
    prioridad: "Alta", peso: 1, mandatoria: false,
  },
  {
    pilar: "Entrega", pilarColor: "FFF59E0B", bloque: "Equipos Empoderados",
    pregunta: "R2.1", textoResumido: "Autonomia de equipos de entrega",
    capacitacionRequerida: "Toma de decisiones en campo. Resolucion de problemas en ruta. Comunicacion con base. Gestion autonoma de incidencias.",
    prioridad: "Media", peso: 1, mandatoria: false,
  },
  {
    pilar: "Entrega", pilarColor: "FFF59E0B", bloque: "Eficiencia de Procesos",
    pregunta: "R3.1", textoResumido: "Optimizacion de rutas y tiempos",
    capacitacionRequerida: "Optimizacion de rutas. Gestion de tiempos de entrega (TML). Indicadores de eficiencia. Uso de herramientas digitales.",
    prioridad: "Media", peso: 1, mandatoria: false,
  },
  {
    pilar: "Entrega", pilarColor: "FFF59E0B", bloque: "Satisfaccion del Cliente",
    pregunta: "R4.1", textoResumido: "Atencion al cliente en entrega",
    capacitacionRequerida: "Protocolo de atencion al cliente. Manejo de reclamos en punto de entrega. Imagen y presentacion personal.",
    prioridad: "Alta", peso: 1, mandatoria: false,
  },

  // ═══════════════════════════════════════
  // PILAR 5: FLOTA
  // ═══════════════════════════════════════
  {
    pilar: "Flota", pilarColor: "FF10B981", bloque: "Compliance",
    pregunta: "R1.1", textoResumido: "Documentos y habilitaciones de flota",
    capacitacionRequerida: "Documentacion vehicular requerida. Habilitaciones ante autoridades de transito. Mantenimiento de legajo de flota.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Flota", pilarColor: "FF10B981", bloque: "Compliance",
    pregunta: "R1.2", textoResumido: "Estandares de flota",
    capacitacionRequerida: "Estandares de seguridad y calidad ABI para flota. Normas visuales para autoelevadores y camiones.",
    prioridad: "Media", peso: 1, mandatoria: true,
  },
  {
    pilar: "Flota", pilarColor: "FF10B981", bloque: "Compliance",
    pregunta: "R1.3", textoResumido: "Checklist de flota",
    capacitacionRequerida: "Uso de checklist digital de salida/retorno. Identificacion de problemas criticos que impiden uso del equipo.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },

  // ═══════════════════════════════════════
  // PILAR 6: ALMACEN
  // ═══════════════════════════════════════
  {
    pilar: "Almacen", pilarColor: "FF6366F1", bloque: "Layout y Capacidad",
    pregunta: "R1.1", textoResumido: "Optimizacion de layout",
    capacitacionRequerida: "Plan de layout y analisis ABC. Flujo de materiales. Optimizacion de espacios de almacenamiento.",
    prioridad: "Alta", peso: 3, mandatoria: true,
  },
  {
    pilar: "Almacen", pilarColor: "FF6366F1", bloque: "Calidad",
    pregunta: "R2.1", textoResumido: "Fundamentos de calidad en almacen",
    capacitacionRequerida: "Formacion ANUAL sobre normas de calidad. Control de plagas. Productos MKTPL con bateas antiderrame. FIFO/FEFO.",
    prioridad: "Alta", peso: 3, mandatoria: true,
  },
  {
    pilar: "Almacen", pilarColor: "FF6366F1", bloque: "Gestion de Inventario",
    pregunta: "R3.1", textoResumido: "Proceso de conteo y resultados de inventario",
    capacitacionRequerida: "Proceso de conteo ciclico y SOP de inventario. Uso de herramienta Tech (WMS). Segregacion de funciones (RACI).",
    prioridad: "Alta", peso: 3, mandatoria: true,
  },
  {
    pilar: "Almacen", pilarColor: "FF6366F1", bloque: "Gestion de Inventario",
    pregunta: "R3.4", textoResumido: "Registro y prevencion de perdidas",
    capacitacionRequerida: "Uso de codigos de motivo para perdidas. KPIs WQI, FGLI, SCL. Registro y clasificacion de perdidas.",
    prioridad: "Alta", peso: 4, mandatoria: true,
  },

  // ═══════════════════════════════════════
  // PILAR 7: PLANEAMIENTO
  // ═══════════════════════════════════════
  {
    pilar: "Planeamiento", pilarColor: "FFEC4899", bloque: "Gestion de Presupuesto",
    pregunta: "R1.1", textoResumido: "Proceso y creacion de presupuesto",
    capacitacionRequerida: "Simulador de presupuesto PxQ. RACI de paquetes almacen/entrega/flota. Para mandos medios y gerencia.",
    prioridad: "Media", peso: 1, mandatoria: true,
  },
  {
    pilar: "Planeamiento", pilarColor: "FFEC4899", bloque: "Gestion de Riesgos",
    pregunta: "R2.1", textoResumido: "Permisos y licencias para operar",
    capacitacionRequerida: "Requisitos legales de seguridad y ambientales. Registro de documentacion. Permisos vigentes.",
    prioridad: "Media", peso: 1, mandatoria: true,
  },
  {
    pilar: "Planeamiento", pilarColor: "FFEC4899", bloque: "Gestion de Riesgos",
    pregunta: "R2.2", textoResumido: "Evaluacion de riesgos y plan de reanudacion",
    capacitacionRequerida: "Matriz de evaluacion de riesgos externos. Plan de respuesta ante emergencias. Plan de reanudacion. Simulacros.",
    prioridad: "Alta", peso: 1, mandatoria: true,
  },
  {
    pilar: "Planeamiento", pilarColor: "FFEC4899", bloque: "Planeamiento a Corto Plazo",
    pregunta: "R3.1", textoResumido: "Conectando ventas y operaciones",
    capacitacionRequerida: "TOR global de reuniones ventas-logistica. KPIs centrados en cliente. Planes de accion digitales.",
    prioridad: "Media", peso: 1, mandatoria: true,
  },
  {
    pilar: "Planeamiento", pilarColor: "FFEC4899", bloque: "Planeamiento a Corto Plazo",
    pregunta: "R3.2", textoResumido: "Rutina de pronostico",
    capacitacionRequerida: "Politica de inventario por SKU. Calculo de SKU fuera de rango. Reunion de pronostico con TOR global.",
    prioridad: "Media", peso: 1, mandatoria: true,
  },
  {
    pilar: "Planeamiento", pilarColor: "FFEC4899", bloque: "Cliente en el Centro",
    pregunta: "R4.1", textoResumido: "Analisis y plan centrado en el cliente",
    capacitacionRequerida: "Encuesta NPS. Interpretacion de metricas RMD, OTIF, Nivel de Servicio. Plan de accion centrado en el cliente.",
    prioridad: "Media", peso: 1, mandatoria: true,
  },
]

async function main() {
  const wb = new ExcelJS.Workbook()
  wb.creator = "DPO - Mercosur Region Pampeana"

  // ── Sheet 1: Resumen por Pilar ──
  const resumen = wb.addWorksheet("Resumen por Pilar")
  resumen.columns = [
    { header: "Pilar", key: "pilar", width: 18 },
    { header: "Total Capacitaciones", key: "total", width: 22 },
    { header: "Prioridad Alta", key: "alta", width: 18 },
    { header: "Prioridad Media", key: "media", width: 18 },
    { header: "Prioridad Baja", key: "baja", width: 18 },
  ]

  // Style header
  resumen.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } }
    cell.alignment = { horizontal: "center", vertical: "middle" }
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } }
  })
  resumen.getRow(1).height = 30

  const pilares = [...new Set(capacitaciones.map((c) => c.pilar))]
  for (const pilar of pilares) {
    const items = capacitaciones.filter((c) => c.pilar === pilar)
    const row = resumen.addRow({
      pilar,
      total: items.length,
      alta: items.filter((c) => c.prioridad === "Alta").length,
      media: items.filter((c) => c.prioridad === "Media").length,
      baja: items.filter((c) => c.prioridad === "Baja").length,
    })
    row.eachCell((cell) => {
      cell.alignment = { horizontal: "center", vertical: "middle" }
    })
    row.getCell("pilar").alignment = { horizontal: "left", vertical: "middle" }
    row.getCell("pilar").font = { bold: true }
  }

  // Totals row
  const totalRow = resumen.addRow({
    pilar: "TOTAL",
    total: capacitaciones.length,
    alta: capacitaciones.filter((c) => c.prioridad === "Alta").length,
    media: capacitaciones.filter((c) => c.prioridad === "Media").length,
    baja: capacitaciones.filter((c) => c.prioridad === "Baja").length,
  })
  totalRow.eachCell((cell) => {
    cell.font = { bold: true, size: 12 }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }
    cell.alignment = { horizontal: "center", vertical: "middle" }
  })
  totalRow.getCell("pilar").alignment = { horizontal: "left", vertical: "middle" }

  // ── Sheet 2: Plan Completo ──
  const plan = wb.addWorksheet("Plan de Capacitaciones")
  plan.columns = [
    { header: "#", key: "num", width: 5 },
    { header: "Pilar", key: "pilar", width: 16 },
    { header: "Bloque", key: "bloque", width: 35 },
    { header: "Pregunta", key: "pregunta", width: 10 },
    { header: "Tema", key: "tema", width: 40 },
    { header: "Capacitacion Requerida", key: "capacitacion", width: 65 },
    { header: "Prioridad", key: "prioridad", width: 12 },
    { header: "Peso", key: "peso", width: 8 },
    { header: "Estado", key: "estado", width: 14 },
    { header: "Fecha Programada", key: "fecha", width: 18 },
    { header: "Instructor", key: "instructor", width: 20 },
    { header: "Observaciones", key: "obs", width: 30 },
  ]

  // Header style
  plan.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } }
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } }
  })
  plan.getRow(1).height = 35

  const prioridadColors: Record<string, string> = {
    Alta: "FFFEE2E2",
    Media: "FFFFFBEB",
    Baja: "FFF0FDF4",
  }
  const prioridadFontColors: Record<string, string> = {
    Alta: "FFDC2626",
    Media: "FFD97706",
    Baja: "FF16A34A",
  }

  capacitaciones.forEach((cap, idx) => {
    const row = plan.addRow({
      num: idx + 1,
      pilar: cap.pilar,
      bloque: cap.bloque,
      pregunta: cap.pregunta,
      tema: cap.textoResumido,
      capacitacion: cap.capacitacionRequerida,
      prioridad: cap.prioridad,
      peso: cap.peso,
      estado: "Pendiente",
      fecha: "",
      instructor: "",
      obs: "",
    })

    row.height = 45
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true }
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      }
    })

    // Pilar color stripe
    row.getCell("pilar").font = { bold: true, color: { argb: cap.pilarColor } }

    // Prioridad color
    const prioCell = row.getCell("prioridad")
    prioCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: prioridadColors[cap.prioridad] },
    }
    prioCell.font = { bold: true, color: { argb: prioridadFontColors[cap.prioridad] } }
    prioCell.alignment = { horizontal: "center", vertical: "middle" }

    // Centro otros
    row.getCell("num").alignment = { horizontal: "center", vertical: "middle" }
    row.getCell("pregunta").alignment = { horizontal: "center", vertical: "middle" }
    row.getCell("peso").alignment = { horizontal: "center", vertical: "middle" }
    row.getCell("estado").alignment = { horizontal: "center", vertical: "middle" }

    // Alternate row color
    if (idx % 2 === 0) {
      row.eachCell((cell) => {
        if (!cell.fill || (cell.fill as ExcelJS.FillPattern).fgColor?.argb === undefined) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }
        }
      })
    }
  })

  // Auto-filter
  plan.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: capacitaciones.length + 1, column: 12 },
  }

  // ── Sheet per Pilar ──
  for (const pilar of pilares) {
    const items = capacitaciones.filter((c) => c.pilar === pilar)
    const ws = wb.addWorksheet(pilar)

    ws.columns = [
      { header: "#", key: "num", width: 5 },
      { header: "Bloque", key: "bloque", width: 35 },
      { header: "Pregunta", key: "pregunta", width: 10 },
      { header: "Tema", key: "tema", width: 40 },
      { header: "Capacitacion Requerida", key: "capacitacion", width: 65 },
      { header: "Prioridad", key: "prioridad", width: 12 },
      { header: "Estado", key: "estado", width: 14 },
      { header: "Fecha", key: "fecha", width: 16 },
      { header: "Instructor", key: "instructor", width: 20 },
    ]

    const pilarColor = items[0]?.pilarColor ?? "FF1E3A5F"
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: pilarColor } }
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    })
    ws.getRow(1).height = 30

    items.forEach((cap, idx) => {
      const row = ws.addRow({
        num: idx + 1,
        bloque: cap.bloque,
        pregunta: cap.pregunta,
        tema: cap.textoResumido,
        capacitacion: cap.capacitacionRequerida,
        prioridad: cap.prioridad,
        estado: "Pendiente",
        fecha: "",
        instructor: "",
      })
      row.height = 40
      row.eachCell((cell) => {
        cell.alignment = { vertical: "middle", wrapText: true }
        cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } }
      })
      row.getCell("num").alignment = { horizontal: "center", vertical: "middle" }
      row.getCell("pregunta").alignment = { horizontal: "center", vertical: "middle" }

      const prioCell = row.getCell("prioridad")
      prioCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: prioridadColors[cap.prioridad] },
      }
      prioCell.font = { bold: true, color: { argb: prioridadFontColors[cap.prioridad] } }
      prioCell.alignment = { horizontal: "center", vertical: "middle" }
    })
  }

  const outputPath = "/root/Plan_Capacitaciones_DPO_Fundamentales.xlsx"
  await wb.xlsx.writeFile(outputPath)
  console.log(`Excel generado: ${outputPath}`)
  console.log(`${capacitaciones.length} capacitaciones en ${pilares.length} pilares`)
  console.log(`Hojas: Resumen, Plan Completo, ${pilares.join(", ")}`)
}

main()
