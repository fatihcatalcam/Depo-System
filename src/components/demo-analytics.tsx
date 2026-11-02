'use client';

import Script from 'next/script';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { DemoAnalyticsConfig } from '@/lib/demo-analytics';

/**
 * Demonun cerez onayi. Ne olculecegini sunucu soyluyor
 * (`lib/demo-analytics.ts`); bu bilesen yalnizca onayi soruyor, tercihi
 * sakliyor ve onaydan sonra verilen betikleri yukluyor. Kimlik ya da adres
 * icermiyor: tarayiciya giden kodda olcume dair bir sey yok.
 *
 * Onay verilmeden hicbir betik yuklenmez, hicbir istek gitmez.
 */
const COOKIE = 'cerez-tercihi';
const ROOT_DOMAIN = 'catalcamyazilim.online';
const OPEN_EVENT = 'cerez-tercihi-ac';

type Choice = 'evet' | 'hayir' | null;

// Cerez bir dis kaynak: useSyncExternalStore ile okunuyor, yazinca dinleyenler
// haberdar ediliyor. Sunucuda "henuz bilinmiyor": bildirim de betik de cizilmez,
// ilk boyamada istemciyle uyusmazlik olmaz.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readChoice(): Choice {
  const match = document.cookie.match(/(?:^|;\s*)cerez-tercihi=(evet|hayir)(?:;|$)/);
  return match ? (match[1] as Choice) : null;
}

/** Alt alan adlarinin hepsinde gecerli olsun diye kok alan adina yaziliyor. */
function domainAttribute(): string {
  const host = window.location.hostname;
  return host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`) ? `; domain=.${ROOT_DOMAIN}` : '';
}

function writeChoice(value: 'evet' | 'hayir') {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE}=${value}; path=/; max-age=31536000; SameSite=Lax${domainAttribute()}${secure}`;
  listeners.forEach((listener) => listener());
}

/**
 * Olcum cerezlerini (_ga, _ga_*, _clck, _clsk) siler. Hangi alan adina
 * yazildiklarini bilmiyoruz (GA kok alan adini secer); her olasi alan adi
 * icin ayri ayri siliniyor.
 */
function deleteMeasurementCookies() {
  const names = new Set(['_ga', '_clck', '_clsk']);
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0].trim();
    if (name.startsWith('_ga_')) names.add(name);
  }
  const host = window.location.hostname;
  const domains = ['', `; domain=${host}`, `; domain=.${host}`, `; domain=.${ROOT_DOMAIN}`];
  for (const name of names) {
    for (const domain of domains) {
      document.cookie = `${name}=; path=/; max-age=0${domain}`;
    }
  }
}

export function DemoAnalytics({ message, scripts }: DemoAnalyticsConfig) {
  const choice = useSyncExternalStore<Choice | 'bilinmiyor'>(subscribe, readChoice, () => 'bilinmiyor');
  const [reopened, setReopened] = useState(false);

  // Reddedilmisse cerezler her acilista da silinir: kabulden sonra reddedince
  // sayfa yenilenirken GA cerezi yeniden yazabiliyor (kapanirken son olay).
  useEffect(() => {
    if (choice === 'hayir') deleteMeasurementCookies();
  }, [choice]);

  // Seritteki "Cerez tercihi" bildirimi yeniden acar.
  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  if (choice === 'bilinmiyor') return null;

  function accept() {
    writeChoice('evet');
    setReopened(false);
  }

  function reject() {
    const wasAccepted = readChoice() === 'evet';
    writeChoice('hayir');
    deleteMeasurementCookies();
    setReopened(false);
    // Betikler bu sayfada zaten calisiyor; durmalari icin sayfa yenileniyor.
    if (wasAccepted) window.location.reload();
  }

  return (
    <>
      {choice === 'evet'
        ? scripts.map((script) =>
            script.src ? (
              <Script key={script.id} id={script.id} src={script.src} strategy="afterInteractive" />
            ) : (
              <Script key={script.id} id={script.id} strategy="afterInteractive">
                {script.code}
              </Script>
            ),
          )
        : null}
      {choice === null || reopened ? (
        <div
          role="dialog"
          aria-label="Çerez tercihi"
          className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-700 shadow-lg md:bottom-4 print:hidden"
        >
          <p>{message}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={accept}
              className="h-10 rounded-md bg-neutral-900 text-sm font-medium text-white"
            >
              Kabul et
            </button>
            <button
              type="button"
              onClick={reject}
              className="h-10 rounded-md border border-neutral-300 text-sm font-medium text-neutral-900"
            >
              Reddet
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Demo seridindeki kucuk dugme: kapanmis bildirimi yeniden acar. */
export function CookieSettingsButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="underline"
    >
      Çerez tercihi
    </button>
  );
}
