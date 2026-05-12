import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  // pdfkit lee archivos .afm via fs.readFileSync — debe quedar como native
  // require de Node para que los assets se resuelvan correctamente en runtime.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
