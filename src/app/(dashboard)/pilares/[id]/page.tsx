import { redirect } from "next/navigation"

export default async function PilarPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/pilares/${id}/checklist`)
}
