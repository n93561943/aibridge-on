import type { MenuRow } from "./schema";

export type MenuNode = MenuRow & { children: MenuNode[] };

export type NavItem = {
  title: string;
  href: string;
  external?: boolean;
  /** group 메뉴의 하위 메뉴. 있으면 링크 대신 펼침 메뉴로 보여 준다. */
  children?: NavItem[];
};

function bySortOrder(a: MenuRow, b: MenuRow): number {
  return a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);
}

/**
 * 평평한 메뉴 목록을 2단계 트리로 만든다.
 * 상위 메뉴가 목록에 없으면(비활성이라 조회되지 않은 경우 등) 하위 메뉴도 버린다.
 */
export function buildMenuTree(rows: MenuRow[]): MenuNode[] {
  const sorted = [...rows].sort(bySortOrder);
  const roots: MenuNode[] = sorted
    .filter((r) => r.parent_id === null)
    .map((r) => ({ ...r, children: [] }));
  const byId = new Map(roots.map((r) => [r.id, r]));
  for (const row of sorted) {
    if (row.parent_id === null) continue;
    byId.get(row.parent_id)?.children.push({ ...row, children: [] });
  }
  return roots;
}

/** 사이트 안 메뉴 주소. 하위 메뉴는 /상위/하위. link·group은 null(자체 페이지 없음). */
export function menuPath(menu: MenuRow, parent?: MenuRow | null): string | null {
  if (menu.type === "link" || menu.type === "group") return null;
  return parent ? `/${parent.slug}/${menu.slug}` : `/${menu.slug}`;
}

/** 공개 화면에 보일 메뉴만 남긴다: 활성 메뉴, 주소가 있는 링크, 하위 메뉴가 남은 그룹. */
function visibleChildren(node: MenuNode): MenuNode[] {
  return node.children.filter((c) => c.is_active && (c.type !== "link" || c.external_url));
}

/**
 * 메뉴를 눌렀을 때 이동할 주소. link는 외부 URL, group은 첫 번째 보이는 하위 메뉴.
 * 이동할 곳이 없으면 null.
 */
export function menuHref(
  node: MenuNode,
  parent?: MenuRow | null,
): { href: string; external: boolean } | null {
  if (!node.is_active) return null;
  if (node.type === "link")
    return node.external_url ? { href: node.external_url, external: true } : null;
  if (node.type === "group") {
    for (const child of visibleChildren(node)) {
      const target = menuHref(child, node);
      if (target) return target;
    }
    return null;
  }
  return { href: menuPath(node, parent)!, external: false };
}

/** 헤더에 넘길 메뉴 목록 */
export function toNavItems(tree: MenuNode[]): NavItem[] {
  const items: NavItem[] = [];
  for (const node of tree) {
    const target = menuHref(node);
    if (!target) continue;
    const item: NavItem = { title: node.title, href: target.href };
    if (target.external) item.external = true;
    if (node.type === "group") {
      item.children = visibleChildren(node).flatMap((child) => {
        const t = menuHref(child, node);
        return t
          ? [{ title: child.title, href: t.href, ...(t.external ? { external: true } : {}) }]
          : [];
      });
    }
    items.push(item);
  }
  return items;
}

/**
 * URL 경로 조각(["ai-coding", "python-basics"])에 해당하는 활성 메뉴를 찾는다.
 * 하위 메뉴는 반드시 실제 상위 메뉴 주소 아래에서만 찾는다.
 */
export function findMenuByPath(
  tree: MenuNode[],
  segments: string[],
): { menu: MenuNode; parent: MenuNode | null } | null {
  const [first, second, ...rest] = segments;
  if (!first || rest.length > 0) return null;
  const root = tree.find((n) => n.slug === first && n.is_active);
  if (!root) return null;
  if (second === undefined) return { menu: root, parent: null };
  const child = root.children.find((c) => c.slug === second && c.is_active);
  return child ? { menu: child, parent: root } : null;
}

/** 같은 상위 메뉴(parentId, 최상위는 null) 안에서 from번째 메뉴를 to번째로 옮긴 새 트리 */
export function moveSibling(
  tree: MenuNode[],
  parentId: string | null,
  from: number,
  to: number,
): MenuNode[] {
  const move = (list: MenuNode[]) => {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  };
  if (parentId === null) return move(tree);
  return tree.map((node) =>
    node.id === parentId ? { ...node, children: move(node.children) } : node,
  );
}

export function siblingsOf(tree: MenuNode[], parentId: string | null): MenuNode[] {
  if (parentId === null) return tree;
  return tree.find((n) => n.id === parentId)?.children ?? [];
}
