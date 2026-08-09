'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  changePasswordAction,
  importExcelAction,
  recalculateStockAction,
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
      description="Yazdirilan tum ciktilarin ustunde bu bilgiler gorunur."
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
        <Field id="companyName" label="Firma adi">
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
      title="Parola"
      description="Sisteme giris parolasi. Musteriye teslim etmeden once mutlaka degistirin."
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
              toast.success(result.message ?? 'Parola degistirildi.');
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
            } else {
              toast.error(result.error ?? 'Degistirilemedi.');
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
          {pending ? 'Degistiriliyor...' : 'Parolayi degistir'}
        </Button>
      </form>
    </Section>
  );
}

export function ImportPanel() {
  return (
    <Section
      title="Excel ile ice aktarma"
      description="Once sablonu indirin, doldurun, sonra yukleyin. Hatali satir varsa hicbiri aktarilmaz."
    >
      <div className="space-y-4">
        <ImportForm
          kind="musteri"
          label="Musteri listesi"
          templateHref="/api/disa-aktar/sablon-musteri"
        />
        <ImportForm kind="stok" label="Stok kartlari" templateHref="/api/disa-aktar/sablon-stok" />
      </div>
    </Section>
  );
}

function ImportForm({
  kind,
  label,
  templateHref,
}: {
  kind: 'musteri' | 'stok';
  label: string;
  templateHref: string;
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
            toast.success(result.message ?? 'Aktarildi.');
            if (inputRef.current) inputRef.current.value = '';
            router.refresh();
          } else {
            toast.error(result.error ?? 'Aktarilamadi.', { duration: 8000 });
          }
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <a href={templateHref} className="text-xs text-neutral-500 underline">
          Sablonu indir
        </a>
      </div>
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
          {pending ? 'Aktariliyor...' : 'Yukle'}
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
      title="Bakim"
      description="Stok bakiyeleri hareket defteriyle karsilastirilir, kayma varsa duzeltilir."
    >
      <Button
        variant="outline"
        className="h-11"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await recalculateStockAction();
            if (result.ok) {
              toast.success(result.message ?? 'Tamamlandi.');
              router.refresh();
            } else {
              toast.error(result.error ?? 'Islem basarisiz.');
            }
          })
        }
      >
        {pending ? 'Hesaplaniyor...' : 'Stok bakiyelerini yeniden hesapla'}
      </Button>
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
