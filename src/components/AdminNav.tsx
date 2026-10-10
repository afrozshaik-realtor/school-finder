import Link from "next/link";

const LINKS = [
  { href: "/admin/sources", label: "Sources" },
  { href: "/admin/authorities", label: "Authorities" },
  { href: "/admin/schools", label: "Schools" },
  { href: "/admin/programs", label: "Programs" },
  { href: "/admin/boundary-versions", label: "Boundary versions" },
];

export function AdminNav({ current }: { current: string }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3 text-sm">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={
            l.href === current
              ? "rounded bg-blue-100 px-3 py-1.5 font-medium text-blue-800"
              : "rounded px-3 py-1.5 text-slate-600 hover:bg-slate-100"
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
