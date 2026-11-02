import type { Metadata, Viewport } from 'next';
import { DemoAnalytics } from '@/components/demo-analytics';
import { DemoBanner } from '@/components/demo-banner';
import { Toaster } from '@/components/ui/sonner';
import { demoAnalyticsConfig } from '@/lib/demo-analytics';
import './globals.css';

export const metadata: Metadata = {
  title: 'Depo Sistemi',
  description: 'Stok, sipariş, teslimat ve ödeme takibi',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#171717',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const analytics = demoAnalyticsConfig();

  return (
    <html lang="tr">
      <body className="bg-neutral-50 text-neutral-900 antialiased">
        <DemoBanner />
        {children}
        <Toaster position="top-center" richColors />
        {/* Yalnizca demoda ve ayri olcum bayragiyla; gercek kurulumda hic yok. */}
        {analytics ? <DemoAnalytics {...analytics} /> : null}
      </body>
    </html>
  );
}
