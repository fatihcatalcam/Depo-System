import { demoLoginAction } from './actions';

const ENTRIES = [
  {
    code: 'S1',
    label: 'Merkez olarak gir',
    hint: 'İki şubenin siparişlerini, sipariş özetini ve raporları görür.',
  },
  {
    code: 'S2',
    label: 'Şube 2 olarak gir',
    hint: 'Yalnızca kendi müşterilerini ve siparişlerini görür; depo ortak.',
  },
];

/** Demonun giris ekrani: parola yok, hangi hesapla girilecegi secilir. */
export function DemoLogin() {
  return (
    <div className="w-full max-w-sm space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Depo Sistemi</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Yatak ve mobilya mağazası için stok, sipariş ve teslimat takibi. Parola yok; bir hesap
          seçip dolaşın.
        </p>
      </div>

      {ENTRIES.map((entry) => (
        <form key={entry.code} action={demoLoginAction}>
          <input type="hidden" name="branch" value={entry.code} />
          <button
            type="submit"
            className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-left hover:border-neutral-900"
          >
            <span className="block text-base font-medium">{entry.label}</span>
            <span className="mt-0.5 block text-xs text-neutral-500">{entry.hint}</span>
          </button>
        </form>
      ))}

      <p className="text-xs text-neutral-500">
        Veriler uydurmadır ve her gece sıfırlanır; istediğiniz gibi sipariş girip teslim edebilirsiniz.
      </p>
    </div>
  );
}
