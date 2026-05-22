import { redirect } from "next/navigation"
import { getTemplate11Id } from "@/actions/owd-pre-ruta"

export default async function DetalleOwdRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const tpl = await getTemplate11Id()
  redirect(tpl ? `/owd/${tpl}/${id}` : "/owd")
}
