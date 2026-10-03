import Link from "next/link";

export type Crumb = { label: string; href?: string };

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="현재 위치" className="text-sm text-muted-foreground print:hidden">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link href="/" className="hover:text-foreground">
            홈
          </Link>
        </li>
        {items.map((item, i) => (
          <li key={i} className="before:mr-1 before:content-['/']">
            {item.href ? (
              <Link href={item.href} className="hover:text-foreground">
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={i === items.length - 1 ? "page" : undefined}
                className={i === items.length - 1 ? "text-foreground" : undefined}
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
