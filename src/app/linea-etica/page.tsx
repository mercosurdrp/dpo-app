import Image from "next/image"
import { Shield, Phone, Globe, Mail, Lock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const EMPRESA = process.env.NEXT_PUBLIC_EMPRESA_NOMBRE ?? "Mercosur Región Pampeana"
const EMPRESA_CORTO = process.env.NEXT_PUBLIC_EMPRESA_NOMBRE_CORTO ?? "Mercosur"

export const metadata = {
  title: `Línea Ética - ${EMPRESA_CORTO}`,
  description: `Línea Ética externa de ${EMPRESA}, gestionada por BDO`,
}

const BDO_TELEFONO_LABEL = "0800 - 34 - LINEA (54632)"
const BDO_TELEFONO_TEL = "08003454632"
const BDO_WEB = "https://www2.bdolineaetica.com/MERCOSUR"
const BDO_WEB_LABEL = "www2.bdolineaetica.com/MERCOSUR"
const BDO_EMAIL = "mercosur@bdolineaetica.com"

const CANALES = [
  {
    href: `tel:${BDO_TELEFONO_TEL}`,
    icon: Phone,
    label: "Llamar",
    valor: BDO_TELEFONO_LABEL,
    externo: false,
  },
  {
    href: BDO_WEB,
    icon: Globe,
    label: "Cargar la denuncia online",
    valor: BDO_WEB_LABEL,
    externo: true,
  },
  {
    href: `mailto:${BDO_EMAIL}`,
    icon: Mail,
    label: "Escribir un mail",
    valor: BDO_EMAIL,
    externo: false,
  },
]

export default function LineaEticaPublicPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
        <div className="text-center">
          <div className="mx-auto inline-flex rounded-xl bg-slate-900 px-4 py-2">
            <Image
              src="/logo-mercosur-blanco.png"
              alt="Mercosur"
              width={140}
              height={24}
              className="h-7 w-auto"
              priority
            />
          </div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-1.5 text-white">
            <Shield className="size-4" />
            <span className="text-sm font-semibold">Línea Ética</span>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Canal para reportar conductas indebidas
          </p>
        </div>

        <Card className="border-blue-200 bg-blue-50/60">
          <CardContent className="py-3">
            <div className="flex items-start gap-2 text-sm text-blue-900">
              <Lock className="mt-0.5 size-4 shrink-0" />
              <p>
                <span className="font-semibold">
                  Nuestra Línea Ética es externa.
                </span>{" "}
                La gestiona <span className="font-semibold">BDO</span>, una
                consultora independiente de la empresa. Tu denuncia es anónima y
                confidencial, y podés hacerla las 24 horas, los 7 días de la
                semana.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 py-4">
            {CANALES.map(({ href, icon: Icon, label, valor, externo }) => (
              <a
                key={href}
                href={href}
                {...(externo
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="flex items-center gap-3 rounded-lg border bg-white px-4 py-3 transition-colors hover:border-slate-400 hover:bg-slate-50"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs uppercase tracking-wide text-muted-foreground">
                    {label}
                  </span>
                  <span className="block break-all font-semibold text-slate-900">
                    {valor}
                  </span>
                </span>
              </a>
            ))}
          </CardContent>
        </Card>

        <a
          href={BDO_WEB}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-xl border bg-white"
        >
          <Image
            src="/linea-etica-bdo.jpeg"
            alt="Afiche de la Línea Ética de BDO: 0800-34-LINEA, www2.bdolineaetica.com/MERCOSUR, mercosur@bdolineaetica.com"
            width={555}
            height={701}
            className="h-auto w-full"
          />
        </a>

        <p className="pb-4 text-center text-xs text-muted-foreground">
          Ninguna denuncia hecha de buena fe puede dar lugar a represalias.
        </p>
      </div>
    </div>
  )
}
