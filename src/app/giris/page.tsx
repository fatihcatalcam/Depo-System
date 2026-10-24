import { isDemo } from '@/lib/demo';
import { DemoLogin } from './demo-login';
import { LoginForm } from './login-form';

export default function GirisPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      {isDemo() ? <DemoLogin /> : <LoginForm />}
    </main>
  );
}
