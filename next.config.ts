import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  // pdfkit lee archivos .afm via fs.readFileSync — debe quedar como native
  // require de Node para que los assets se resuelvan correctamente en runtime.
  // pg (driver Postgres) también debe quedar externo: usa bindings nativos y no
  // debe bundlearse (server action que consulta la base del dashboard Mercosur).
  serverExternalPackages: ["pdfkit", "xlsx", "pg"],
};

export default nextConfig;
