import 'server-only';
import { isDemoAnalytics } from '@/lib/demo';

/**
 * Demonun olcum kimlikleri ve betikleri. Yalnizca sunucuda: tarayiciya giden
 * kodda ne kimlik ne Google/Clarity adresi var. Sunucu bunlari yalnizca demoda
 * ve NEXT_PUBLIC_DEMO_ANALYTICS=1 iken onay bilesenine veriyor; bayrak yoksa
 * sayfaya hicbir sey girmiyor.
 */
const GA_ID = 'G-SX7D3VF23M';
const CLARITY_ID = 'z2cy6gcjxh';

export interface MeasurementScript {
  id: string;
  src?: string;
  code?: string;
}

export interface DemoAnalyticsConfig {
  message: string;
  /** Yalnizca onaydan sonra, bu sirayla yuklenir. */
  scripts: MeasurementScript[];
}

export function demoAnalyticsConfig(): DemoAnalyticsConfig | null {
  if (!isDemoAnalytics()) return null;

  return {
    message:
      'Sitenin nasıl kullanıldığını görmek için Google Analytics ve Microsoft Clarity ' +
      'çerezlerini kullanmak istiyorum. Clarity sayfadaki tıklamaları ve kaydırmaları kaydeder. ' +
      'Kabul etmezseniz hiçbir ölçüm yapılmaz.',
    scripts: [
      { id: 'ga-src', src: `https://www.googletagmanager.com/gtag/js?id=${GA_ID}` },
      {
        id: 'ga-init',
        // GA4 sayfa gecislerini (history.pushState) kendisi sayiyor; elle
        // page_view gonderilmiyor, yoksa her gecis iki kez sayilirdi.
        code: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}');`,
      },
      {
        id: 'clarity-init',
        // Maskeleme varsayilaninda: parola ve form girisleri maskeli. Maskeyi
        // kaldiran bir ayar (data-clarity-unmask vb.) bilerek yok.
        code: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${CLARITY_ID}");window.clarity('consentv2',{ad_Storage:'denied',analytics_Storage:'granted'});`,
      },
    ],
  };
}
