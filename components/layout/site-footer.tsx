import { siteConfig } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="container-site flex flex-col gap-1 py-8 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">{siteConfig.name}</p>
        <p>{siteConfig.tagline}</p>
        <p>
          © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
