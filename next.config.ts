import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Mal kabulde irsaliye yukleniyor. Varsayilan 1 MB bir PDF'e yetmiyor;
      // Vercel'in 4,5 MB istek sinirinin altinda kaliyoruz. Fotograflar
      // tarayicida zaten kucultulup geliyor.
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
