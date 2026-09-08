/** @type {import('next').NextConfig} */
const nextConfig = {
  // Router cache del cliente: volver a una pantalla visitada hace < 30 s no
  // vuelve a renderizar en el server (las escrituras llaman router.refresh(),
  // así que lo que uno cambia lo ve al instante). Con Postgres cada render es
  // un viaje a Railway; esto hace instantáneo el ida y vuelta entre pantallas.
  experimental: { staleTimes: { dynamic: 30 } },
  // El driver de Postgres (lib/db.ts) es SERVER-ONLY: abre sockets TCP y lee
  // DATABASE_URL. Queda como dependencia externa del bundle de servidor (se
  // requiere en runtime, sin pasar por webpack) …
  serverExternalPackages: ['postgres'],
  webpack: (config, { isServer }) => {
    // … y se corta de raíz en el bundle del BROWSER: lib/kapso.ts alcanza a
    // lib/db.ts en el grafo (los componentes cliente importan de ahí
    // patchRecord/postRecord), pero esa rama nunca corre en el navegador. Sin
    // este alias webpack intentaría empaquetar un cliente de Postgres —con
    // `net`/`tls` adentro— en el JS que baja el usuario.
    if (!isServer) {
      config.resolve.alias = { ...config.resolve.alias, postgres: false }
    }
    return config
  },
}
module.exports = nextConfig
