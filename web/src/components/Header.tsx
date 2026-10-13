import Link from "next/link";

export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between py-2">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-8 w-8" />
        Ghar
      </Link>
      {children}
    </header>
  );
}
