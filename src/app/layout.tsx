import type { Metadata } from "next"
import { Inter, IBM_Plex_Mono } from "next/font/google"
import { Toaster } from "sonner"
import { EMPRESA_NOMBRE } from "@/lib/empresa"
import "./globals.css"

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
})

// Mono tipo "control panel / auditoría" para números, fechas, %, IDs (usado en /planes).
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["500", "600"],
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: `DPO - ${EMPRESA_NOMBRE}`,
  description: "Plataforma de gestión DPO",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${inter.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
