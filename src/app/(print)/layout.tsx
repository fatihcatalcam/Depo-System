import { PrintTrigger } from '@/components/print-trigger';

export const dynamic = 'force-dynamic';

/**
 * Yazdirma sayfalari icin sade duzen: menu yok, kenar boslugu A4'e gore.
 * Cikti "Yazdir" penceresinden kagida ya da "PDF olarak kaydet" ile dosyaya
 * gider; Turkce karakterler tarayicinin kendi fontuyla dogru cikar.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[210mm] bg-white p-6 text-neutral-900 print:p-0">
      <PrintTrigger />
      {children}
    </div>
  );
}
