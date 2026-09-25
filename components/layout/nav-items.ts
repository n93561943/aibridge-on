export type NavItem = {
  title: string;
  href: string;
  external?: boolean;
  children?: NavItem[];
};

// P2에서 menus 테이블을 읽어 채운다. 지금은 비어 있다.
export const navItems: NavItem[] = [];
