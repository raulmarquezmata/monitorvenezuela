/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // los comentarios de Research se leen del repositorio también en las regeneraciones (ISR)
    outputFileTracingIncludes: { "/**": ["./content/**"] },
  },
};
export default nextConfig;
