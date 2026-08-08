'use client';

export function PrintButton({ count }: { count: number }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      disabled={count === 0}
      className="h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50"
    >
      {count} etiketi yazdir
    </button>
  );
}
