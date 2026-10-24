'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import {
  addPaletteCodeAction,
  changePasswordAction,
  createPaletteAction,
  importExcelAction,
  recalculateStockAction,
  renameBranchAction,
  setBranchPasswordAction,
  removePaletteCodeAction,
  setUnlockPasswordAction,
  updateCompanyAction,
} from './actions';

interface CompanyValues {
  companyName: string;
  address: string;
  phone: string;
  email: string;
  taxInfo: string;
}

export function CompanyPanel({ initial }: { initial: CompanyValues }) {
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function set<K extends keyof CompanyValues>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <Section
      title="Firma bilgileri"
      description="Yazdırılan tüm çıktıların üstünde bu bilgiler görünür."
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await updateCompanyAction(values);
            if (result.ok) {
              toast.success(result.message ?? 'Kaydedildi.');
              router.refresh();
            } else {
              toast.error(result.error ?? 'Kaydedilemedi.');
            }
          });
        }}
      >
        <Field id="companyName" label="Firma adı">
          <Input
            id="companyName"
            value={values.companyName}
            onChange={(event) => set('companyName', event.target.value)}
            className="h-11"
            required
          />
        </Field>
        <Field id="address" label="Adres">
          <Input
            id="address"
            value={values.address}
            onChange={(event) => set('address', event.target.value)}
            className="h-11"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="phone" label="Telefon">
            <Input
              id="phone"
              value={values.phone}
              onChange={(event) => set('phone', event.target.value)}
              className="h-11"
            />
          </Field>
          <Field id="email" label="E-posta">
            <Input
              id="email"
              value={values.email}
              onChange={(event) => set('email', event.target.value)}
              className="h-11"
            />
          </Field>
        </div>
        <Field id="taxInfo" label="Vergi dairesi / no">
          <Input
            id="taxInfo"
            value={values.taxInfo}
            onChange={(event) => set('taxInfo', event.target.value)}
            className="h-11"
          />
        </Field>
        <Button type="submit" disabled={pending} className="h-11">
          {pending ? 'Kaydediliyor...' : 'Kaydet'}
        </Button>
      </form>
    </Section>
  );
}

export function PasswordPanel() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, startTransition] = useTransition();

  return (
    <Section
      title="Giriş parolası"
      description="Bu şubenin giriş parolası. Stok ve rapor kilidini açmaz."
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await changePasswordAction({
              currentPassword,
              newPassword,
              confirmPassword,
            });
            if (result.ok) {
              toast.success(result.message ?? 'Parola değiştirildi.');
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
            } else {
              toast.error(result.error ?? 'Değiştirilemedi.');
            }
          });
        }}
      >
        <Field id="currentPassword" label="Mevcut parola">
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="h-11"
            required
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="newPassword" label="Yeni parola">
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="h-11"
              required
            />
          </Field>
          <Field id="confirmPassword" label="Yeni parola (tekrar)">
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-11"
              required
            />
          </Field>
        </div>
        <Button type="submit" disabled={pending} className="h-11">
          {pending ? 'Değiştiriliyor...' : 'Parolayı değiştir'}
        </Button>
      </form>
    </Section>
  );
}

/**
 * Stok ve rapor kilidinin parolasi — yalnizca merkez gorur.
 *
 * Giris parolasi degil: bu parolayla sisteme girilmez, yalnizca kilitli
 * ekranlar acilir. Ikisinin ayni olmasi yasak, cunku o zaman calisan kilidi
 * kendi parolasiyla acardi.
 */
export function UnlockPasswordPanel() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, startTransition] = useTransition();

  return (
    <Section
      title="Stok ve rapor parolası"
      description="Kilitli stok ve rapor ekranlarını açan parola. Sisteme giriş için kullanılmaz."
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await setUnlockPasswordAction({ newPassword, confirmPassword });
            if (result.ok) {
              toast.success(result.message ?? 'Parola değiştirildi.');
              setNewPassword('');
              setConfirmPassword('');
            } else {
              toast.error(result.error ?? 'Değiştirilemedi.');
            }
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="unlockPassword" label="Yeni parola">
            <Input
              id="unlockPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="h-11"
              required
            />
          </Field>
          <Field id="unlockPasswordConfirm" label="Yeni parola (tekrar)">
            <Input
              id="unlockPasswordConfirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-11"
              required
            />
          </Field>
        </div>
        <Button type="submit" disabled={pending} className="h-11">
          {pending ? 'Değiştiriliyor...' : 'Kilit parolasını değiştir'}
        </Button>
      </form>
    </Section>
  );
}

export interface BranchRow {
  id: string;
  code: string;
  name: string;
  hasPassword: boolean;
}

/**
 * Sube yonetimi — yalnizca merkez gorur.
 *
 * Parolasi belirlenmemis subeye giris yapilamaz; bu yuzden eksik parolayi
 * sessizce gecmiyoruz, acikca uyariyoruz.
 */
export function BranchPanel({ branches }: { branches: BranchRow[] }) {
  return (
    <Section
      title="Şubeler"
      description="Her şubenin kendi girişi ve kendi deposu var. Merkez bütün siparişleri görür, stoklar ayrı kalır."
    >
      <div className="space-y-4">
        {branches.map((branch) => (
          <BranchRowForm key={branch.id} branch={branch} />
        ))}
      </div>
    </Section>
  );
}

function BranchRowForm({ branch }: { branch: BranchRow }) {
  const [name, setName] = useState(branch.name);
  const [password, setPassword] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600">
          {branch.code}
        </span>
        {branch.hasPassword ? null : (
          <span className="text-xs text-amber-700">
            Parola belirlenmedi — bu şubeye henüz giriş yapılamaz.
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`name-${branch.id}`} label="Şube adı">
          <Input
            id={`name-${branch.id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-11"
          />
        </Field>
        <Field id={`pass-${branch.id}`} label="Yeni parola">
          <Input
            id={`pass-${branch.id}`}
            type="password"
            autoComplete="new-password"
            value={password}
            placeholder={branch.hasPassword ? 'Değiştirmek için doldurun' : 'En az 6 karakter'}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11"
          />
        </Field>
      </div>

      <Button
        type="button"
        disabled={pending}
        className="mt-3 h-11"
        onClick={() =>
          startTransition(async () => {
            const messages: string[] = [];

            if (name.trim() !== branch.name) {
              const result = await renameBranchAction({ branchId: branch.id, name });
              if (!result.ok) {
                toast.error(result.error ?? 'Şube adı güncellenemedi.');
                return;
              }
              messages.push('ad güncellendi');
            }

            if (password !== '') {
              const result = await setBranchPasswordAction({
                branchId: branch.id,
                newPassword: password,
              });
              if (!result.ok) {
                toast.error(result.error ?? 'Parola belirlenemedi.');
                return;
              }
              setPassword('');
              messages.push('parola belirlendi');
            }

            if (messages.length === 0) {
              toast.info('Değişiklik yok.');
              return;
            }
            toast.success(`${branch.name}: ${messages.join(', ')}.`);
            router.refresh();
          })
        }
      >
        {pending ? 'Kaydediliyor...' : 'Kaydet'}
      </Button>
    </div>
  );
}

export function ImportPanel() {
  return (
    <Section
      title="Excel ile içe aktarma"
      description="Önce şablonu indirin, doldurun, sonra yükleyin. Hatalı satır varsa hiçbiri aktarılmaz."
    >
      <div className="space-y-4">
        <ImportForm
          kind="musteri"
          label="Müşteri listesi"
          templateHref="/api/disa-aktar/sablon-musteri"
        />
        <ImportForm kind="stok" label="Stok kartları" templateHref="/api/disa-aktar/sablon-stok" />
        <ImportForm
          kind="sayim"
          label="Stok sayımı (adet güncelleme)"
          templateHref="/api/disa-aktar/sablon-sayim"
          hint="Şablon mevcut kartlarla dolu iner. Yalnızca değiştirmek istediğiniz satırların
                'Sayılan adet' sütununu doldurun; boş bırakılan satıra dokunulmaz."
        />
      </div>
    </Section>
  );
}

function ImportForm({
  kind,
  label,
  templateHref,
  hint,
}: {
  kind: 'musteri' | 'stok' | 'sayim';
  label: string;
  templateHref: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      className="space-y-2 rounded-lg border border-neutral-200 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await importExcelAction(kind, formData);
          if (result.ok) {
            toast.success(result.message ?? 'Aktarıldı.');
            if (inputRef.current) inputRef.current.value = '';
            router.refresh();
          } else {
            toast.error(result.error ?? 'Aktarılamadı.', { duration: 8000 });
          }
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <a href={templateHref} className="text-xs text-neutral-500 underline">
          Şablonu indir
        </a>
      </div>
      {hint ? <p className="text-xs text-neutral-500">{hint}</p> : null}
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept=".xlsx"
          required
          className="h-11 flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-neutral-900 file:px-3 file:py-1 file:text-xs file:text-white"
        />
        <Button type="submit" disabled={pending} className="h-11">
          {pending ? 'Aktarılıyor...' : 'Yükle'}
        </Button>
      </div>
    </form>
  );
}

export function MaintenancePanel() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Section
      title="Bakım"
      description="Bu şubenin stok bakiyeleri hareket defteriyle karşılaştırılır, kayma varsa düzeltilir."
    >
      <Button
        variant="outline"
        className="h-11"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await recalculateStockAction();
            if (result.ok) {
              toast.success(result.message ?? 'Tamamlandı.');
              router.refresh();
            } else {
              toast.error(result.error ?? 'İşlem başarısız.');
            }
          })
        }
      >
        {pending ? 'Hesaplanıyor...' : 'Stok bakiyelerini yeniden hesapla'}
      </Button>
    </Section>
  );
}

export interface PaletteView {
  id: string;
  name: string;
  codes: string[];
  /** Bu kartelayi kullanan kalem sayisi (Latex Master bazasi gibi). */
  itemCount: number;
}

/**
 * Kumas kartelalari. Hangi kalemin hangi kartelayi kullandigi stok kartinda
 * secilir; burada kodlar eklenir, kaldirilir.
 */
export function ColorPalettesPanel({ palettes }: { palettes: PaletteView[] }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>, done?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message ?? 'Kaydedildi.');
        done?.();
        router.refresh();
      } else {
        toast.error(result.error ?? 'İşlem başarısız.');
      }
    });
  }

  return (
    <Section
      title="Renk kodları"
      description="Baza ve başlıkların kumaş kartelaları. Bir kalemin kartelası stok kartından seçilir. Kod kaldırmak o renkteki stoğu silmez; yalnızca yeni seçimlerde çıkmaz."
    >
      <div className="space-y-4">
        {palettes.map((palette) => (
          <div key={palette.id} className="space-y-2 rounded-md border border-neutral-200 p-3">
            <p className="text-sm font-medium">
              {palette.name}{' '}
              <span className="text-xs font-normal text-neutral-500">
                {palette.codes.length} renk · {palette.itemCount} kalem
              </span>
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {palette.codes.map((code) => (
                <li
                  key={code}
                  className="flex items-center gap-1 rounded border border-neutral-300 bg-neutral-50 py-0.5 pl-2 pr-1 text-sm tabular-nums"
                >
                  {code}
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`${code} kodunu kaldır`}
                    onClick={() => {
                      if (!window.confirm(`${code} kartelada kaldırılsın mı? Stoktaki adetler durur.`)) return;
                      run(() => removePaletteCodeAction({ paletteId: palette.id, code }));
                    }}
                    className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200 hover:text-red-600"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const code = drafts[palette.id] ?? '';
                run(
                  () => addPaletteCodeAction({ paletteId: palette.id, code }),
                  () => setDrafts((current) => ({ ...current, [palette.id]: '' })),
                );
              }}
            >
              <Input
                value={drafts[palette.id] ?? ''}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [palette.id]: event.target.value }))
                }
                placeholder="Yeni kod, örnek: BK-183"
                aria-label={`${palette.name} için yeni renk kodu`}
                className="h-10 max-w-48"
              />
              <Button type="submit" variant="outline" className="h-10" disabled={pending}>
                Ekle
              </Button>
            </form>
          </div>
        ))}

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => createPaletteAction(newName), () => setNewName(''));
          }}
        >
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Yeni kartela adı"
            aria-label="Yeni kartela adı"
            className="h-10 max-w-64"
          />
          <Button type="submit" variant="outline" className="h-10" disabled={pending}>
            Kartela ekle
          </Button>
        </form>
      </div>
    </Section>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-neutral-500">{description}</p>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
