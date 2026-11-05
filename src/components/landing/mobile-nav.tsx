"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";

/** Section links for phones: a disclosure that closes on pick, on Escape and on outside tap. */
export function MobileNav({ links }: { links: readonly (readonly [string, string])[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => ref.current?.removeAttribute("open");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return (
    <details ref={ref} className="md:hidden">
      <summary aria-label="Menu" className="flex h-11 w-11 cursor-(--cursor-hand) list-none items-center justify-center rounded-full hover:bg-ink/5 [&::-webkit-details-marker]:hidden">
        <Menu size={20} />
      </summary>
      <ul className="absolute inset-x-4 top-full mt-2 rounded-2xl border border-line bg-surface p-2 text-[15px] shadow-float">
        {links.map(([label, href]) => (
          <li key={href}>
            <a href={href} onClick={close} className="flex min-h-11 items-center rounded-xl px-4 hover:bg-ink/5">{label}</a>
          </li>
        ))}
        <li>
          <Link href="/app" className="flex min-h-11 items-center rounded-xl px-4 hover:bg-ink/5">Open the app</Link>
        </li>
      </ul>
    </details>
  );
}
