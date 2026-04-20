import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  // pdfkit necesita sus fonts (.afm) incluidas en el deploy de Vercel
  outputFileTracingIncludes: {
    "/api/linea-etica/qr": ["./node_modules/pdfkit/js/data/**/*"],
  },
};

export default nextConfig;
