import { MenuPage, menuPageMetadata } from "./menu-page";

type Props = { params: Promise<{ menu: string }> };

export async function generateMetadata({ params }: Props) {
  const { menu } = await params;
  return menuPageMetadata([menu]);
}

export default async function TopMenuPage({ params }: Props) {
  const { menu } = await params;
  return <MenuPage segments={[menu]} />;
}
