import { MenuPage, menuPageMetadata } from "../menu-page";

type Props = { params: Promise<{ menu: string; sub: string }> };

export async function generateMetadata({ params }: Props) {
  const { menu, sub } = await params;
  return menuPageMetadata([menu, sub]);
}

export default async function SubMenuPage({ params }: Props) {
  const { menu, sub } = await params;
  return <MenuPage segments={[menu, sub]} />;
}
