import { db } from '@/db/client';
import { listSalespeople } from '@/domain/parties/salespeople';
import { currentUser } from '@/lib/auth/current';
import { OrderForm } from '../order-form';

export default async function YeniSiparisPage() {
  const [salespeople, user] = await Promise.all([listSalespeople(db), currentUser()]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Yeni siparis</h1>
        <p className="text-sm text-neutral-500">
          Musteri, satici, teslimat adresi ve satirlari girin. Siparis once taslak olarak olusur.
        </p>
      </div>

      {/*
        Siparisin hangi subeye yazilacagi oturumdan geliyor ve sonradan
        degistirilemiyor. Yanlis hesapla girilmis bir siparis en gec fark
        edilen hatalardan; kaydin sahibi formun basinda yaziyor.
      */}
      {user.isAdmin ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Yonetici hesabiyla siparis olusturulamaz: siparisin hangi subeye yazilacagi belli
          olmaz. Subenin kendi parolasiyla giris yapin.
        </p>
      ) : (
        <p className="rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-600">
          Bu siparis <strong className="text-neutral-900">{user.label}</strong> adina
          kaydedilecek.
        </p>
      )}

      <OrderForm
        salespeople={salespeople.map((person) => ({ id: person.id, name: person.name }))}
      />
    </div>
  );
}
