import { redirect } from "next/navigation"
import { getTemplate11Id } from "@/actions/owd-pre-ruta"

// El OWD se generalizó a /owd. El 1.1 PRE RUTA ahora vive en su plantilla.
export default async function OwdPreRutaRedirect() {
  const id = await getTemplate11Id()
  redirect(id ? `/owd/${id}` : "/owd")
}
