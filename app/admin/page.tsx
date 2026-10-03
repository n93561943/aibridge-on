import { redirect } from "next/navigation";

// 관리자 대시보드는 P6에서 만든다. 그 전까지는 메뉴 관리로 보낸다.
export default function AdminHomePage() {
  redirect("/admin/menus");
}
