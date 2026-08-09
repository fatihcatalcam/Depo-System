'use client';

import { useRouter } from 'next/navigation';

export function PrintTrigger() {
  const router = useRouter();

  return (
    <div className="mb-4 flex gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white"
      >
        Yazdir / PDF kaydet
      </button>
      <button
        type="button"
        onClick={() => router.back()}
        className="h-11 rounded-md border border-neutral-300 px-4 text-sm"
      >
        Geri
      </button>
    </div>
  );
}
