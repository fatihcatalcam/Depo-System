import { PrintTrigger } from '@/components/print-trigger';

export const dynamic = 'force-dynamic';

/**
 * Yazdirma sayfalari icin sade duzen: menu yok, kenar boslugu A4'e gore.
 * Cikti "Yazdir" penceresinden kagida ya da "PDF olarak kaydet" ile dosyaya
 * gider; Turkce karakterler tarayicinin kendi fontuyla dogru cikar.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    // Baskida genislik sayfanin kendisine birakiliyor: yatay basilan sayfalar
    // (siparis ozeti) 210 mm'ye sikismasin.
    <div className="mx-auto max-w-[210mm] bg-white p-6 text-neutral-900 print:max-w-none print:p-0">
      <PrintTrigger />
      {children}
    </div>
  );
}
