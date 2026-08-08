'use client';

import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  onDetected: (text: string) => void;
  onClose: () => void;
}

/**
 * Telefon kamerasiyla barkod okur. HTTPS gerektirir (Vercel'de mevcut,
 * yerelde localhost istisnasi gecerlidir). Kamera yoksa veya izin
 * reddedilirse kullaniciya arama kutusuna donmesini soyler.
 */
export function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let cancelled = false;

    const reader = new BrowserMultiFormatReader();

    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
        if (result && !cancelled) {
          cancelled = true;
          controls?.stop();
          onDetected(result.getText());
        }
      })
      .then((scannerControls) => {
        controls = scannerControls;
        if (cancelled) scannerControls.stop();
      })
      .catch(() => {
        setError(
          'Kameraya erisilemedi. Tarayici izni verilmemis olabilir; arama kutusunu kullanin.',
        );
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4">
      <div className="flex items-center justify-between pb-3">
        <span className="text-sm font-medium text-white">Barkod okut</span>
        <Button variant="ghost" className="text-white" onClick={onClose}>
          Kapat
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg bg-white p-4 text-sm text-red-600">{error}</p>
      ) : (
        <video
          ref={videoRef}
          className="min-h-0 w-full flex-1 rounded-lg object-cover"
          muted
          playsInline
        />
      )}

      <p className="pt-3 text-center text-xs text-white/70">
        Barkodu kameranin ortasina getirin.
      </p>
    </div>
  );
}
