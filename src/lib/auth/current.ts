import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { getBranch } from '@/domain/branches';
import { adminScope, branchScope, type Scope } from '@/domain/scope';
import { SESSION_COOKIE, readSessionToken } from './session';

export interface CurrentUser {
  scope: Scope;
  /** Baslikta gosterilecek ad: "Sube 1" ya da "Yonetici". */
  label: string;
  isAdmin: boolean;
}

/**
 * Istegin kapsami. Panel sayfalari ve **her sunucu eylemi** bunu cagirir.
 *
 * Kapsam yalnizca imzali oturum cerezinden turetilir; istemcinin gonderdigi
 * hicbir alan dikkate alinmaz. Bir eylem sube kimligini formdan alsaydi,
 * istekte o alani degistiren biri diger subenin verisine erisirdi.
 *
 * Oturum yoksa `/giris`e yonlendirir. `proxy.ts` zaten oturumsuz istekleri
 * ceviriyor; buradaki kontrol ikinci kat — proxy'nin eslesme deseni bir gun
 * degisirse veri yine korunur.
 */
export async function currentUser(): Promise<CurrentUser> {
  const store = await cookies();
  const payload = await readSessionToken(store.get(SESSION_COOKIE)?.value);

  if (!payload) redirect('/giris');

  if (payload.role === 'admin') {
    return { scope: adminScope, label: 'Yonetici', isAdmin: true };
  }

  // Sube silinmis ya da kapatilmis olabilir; jetonun gecerli olmasi subenin
  // hala var oldugunu gostermez.
  try {
    const branch = await getBranch(db, payload.branchId);
    if (!branch.isActive) redirect('/giris');
    return { scope: branchScope(branch.id, branch.code), label: branch.name, isAdmin: false };
  } catch {
    redirect('/giris');
  }
}

/** Yalnizca kapsam gerektiginde — cogu sunucu eylemi bunu kullanir. */
export async function currentScope(): Promise<Scope> {
  return (await currentUser()).scope;
}
