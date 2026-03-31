import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  "https://tpafgmbhnucdiavvxbcg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwYWZnbWJobnVjZGlhdnZ4YmNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDYyMDMyNSwiZXhwIjoyMDkwMTk2MzI1fQ.FL6WovR_X3L03JBjOI7oGdreZung9BetifnnhSLJWuI",
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const capacitaciones = [
  {
    titulo: "PRE RUTA - Preparacion de ruta y carga",
    descripcion: "SOPs de preparacion de ruta. Proceso de carga de vehiculos. Verificacion de pedidos. Documentacion de entrega.",
    instructor: "Por definir",
    fecha: "2026-04-06",
    duracion_horas: 1,
    estado: "programada",
  },
  {
    titulo: "EN RUTA - Ejecucion de entrega",
    descripcion: "SOPs de ejecucion de entrega. Protocolo con clientes. Manejo de devoluciones. Registro de novedades en ruta.",
    instructor: "Por definir",
    fecha: "2026-04-14",
    duracion_horas: 1,
    estado: "programada",
  },
  {
    titulo: "Documentos y habilitaciones de flota",
    descripcion: "Documentacion vehicular requerida. Habilitaciones ante autoridades de transito. Mantenimiento de legajo de flota.",
    instructor: "Por definir",
    fecha: "2026-04-20",
    duracion_horas: 1,
    estado: "programada",
  },
  {
    titulo: "Atencion al cliente en entrega",
    descripcion: "Protocolo de atencion al cliente. Manejo de reclamos en punto de entrega. Imagen y presentacion personal.",
    instructor: "Por definir",
    fecha: "2026-04-27",
    duracion_horas: 1,
    estado: "programada",
  },
  {
    titulo: "Checklist de flota",
    descripcion: "Uso de checklist digital de salida/retorno. Identificacion de problemas criticos que impiden uso del equipo.",
    instructor: "Por definir",
    fecha: "2026-05-04",
    duracion_horas: 1,
    estado: "programada",
  },
  {
    titulo: "Autonomia de equipos de entrega",
    descripcion: "Toma de decisiones en campo. Resolucion de problemas en ruta. Comunicacion con base. Gestion autonoma de incidencias.",
    instructor: "Por definir",
    fecha: "2026-05-11",
    duracion_horas: 1,
    estado: "programada",
  },
  {
    titulo: "Estandares de flota",
    descripcion: "Estandares de seguridad y calidad ABI para flota. Normas visuales para autoelevadores y camiones.",
    instructor: "Por definir",
    fecha: "2026-05-18",
    duracion_horas: 1,
    estado: "programada",
  },
  {
    titulo: "Optimizacion de rutas y tiempos",
    descripcion: "Optimizacion de rutas. Gestion de tiempos de entrega (TML). Indicadores de eficiencia. Uso de herramientas digitales.",
    instructor: "Por definir",
    fecha: "2026-05-25",
    duracion_horas: 1,
    estado: "programada",
  },
]

async function main() {
  // Get admin profile for created_by
  const { data: admin } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .single()

  const createdBy = admin?.id ?? null

  // Get all empleados to enroll them
  const { data: empleados } = await supabase
    .from("empleados")
    .select("id")
    .eq("activo", true)

  const empleadoIds = (empleados ?? []).map((e: { id: string }) => e.id)

  console.log(`Creando ${capacitaciones.length} capacitaciones con ${empleadoIds.length} empleados cada una...\n`)

  for (const cap of capacitaciones) {
    // Create capacitacion
    const { data: created, error } = await supabase
      .from("capacitaciones")
      .insert({
        ...cap,
        created_by: createdBy,
      })
      .select()
      .single()

    if (error) {
      console.log(`ERROR ${cap.titulo}: ${error.message}`)
      continue
    }

    // Enroll all empleados
    const asistencias = empleadoIds.map((empleadoId: string) => ({
      capacitacion_id: created.id,
      empleado_id: empleadoId,
      presente: false,
      resultado: "pendiente",
    }))

    const { error: asistError } = await supabase
      .from("asistencias")
      .insert(asistencias)

    if (asistError) {
      console.log(`  WARN asistencias: ${asistError.message}`)
    }

    console.log(`OK  ${cap.fecha}  ${cap.titulo} (${empleadoIds.length} inscriptos)`)
  }

  console.log("\nListo!")
}

main()
