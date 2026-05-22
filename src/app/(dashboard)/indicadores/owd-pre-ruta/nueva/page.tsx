import { redirect } from "next/navigation"
import { getTemplate11Id } from "@/actions/owd-pre-ruta"

export default async function NuevaOwdRedirect() {
  const id = await getTemplate11Id()
  redirect(id ? `/owd/${id}/nueva` : "/owd")
}
