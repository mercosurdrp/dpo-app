import { getMiCil } from "@/actions/mi-cil"
import { getMiProgramacionCil } from "@/actions/cil-programacion"
import { MiCilClient } from "./mi-cil-client"

export default async function MiCilPage() {
  // La programación va en el mismo viaje: es lo primero que el chofer tiene que
  // ver al entrar (¿me toca hoy?) y pedirla aparte agregaba una espera.
  const [res, progRes] = await Promise.all([getMiCil(), getMiProgramacionCil()])

  if ("error" in res) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mi CIL</h1>
        <p className="mt-2 text-red-500">Error: {res.error}</p>
      </div>
    )
  }

  return (
    <MiCilClient
      data={res.data}
      // Si la programación falla, la pantalla de carga tiene que seguir andando:
      // el chofer viene a registrar el trabajo, no a mirar el calendario.
      programacion={"data" in progRes ? progRes.data : null}
    />
  )
}
