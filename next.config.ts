import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone es para la imagen Docker (Linux). En Windows el trazado crea
  // symlinks que requieren permisos elevados, así que ahí se omite.
  output: process.platform === "win32" ? undefined : "standalone",
  // El paquete `postgres` usa APIs de Node que no deben empaquetarse en el bundle.
  serverExternalPackages: ["postgres"],
  // Ancla la raíz del trazado a este proyecto: sin esto, Next.js la infiere
  // buscando lockfiles hacia arriba y puede terminar apuntando al $HOME del
  // usuario si hay uno suelto ahí, tracing el disco entero.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
