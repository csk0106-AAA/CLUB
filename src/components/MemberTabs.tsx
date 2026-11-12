import Link from "next/link";
import { IconGear, IconHome, IconProfileBook } from "./Icons";

// 회원 화면 하단 탭: 행사 / 프로필 북 / 설정. 이 탭을 쓰는 화면은 <main className="app with-tabs"> 로 감싼다.
export function MemberTabs({ on }: { on: "events" | "profiles" | "settings" }) {
  const items = [
    { key: "events", href: "/events", label: "행사", icon: <IconHome /> },
    { key: "profiles", href: "/profiles", label: "프로필 북", icon: <IconProfileBook /> },
    { key: "settings", href: "/settings", label: "설정", icon: <IconGear /> },
  ] as const;
  return (
    <nav className="tabs" aria-label="회원 메뉴">
      {items.map((t) => (
        <Link key={t.key} href={t.href} className={`tab ${on === t.key ? "on" : ""}`} aria-current={on === t.key ? "page" : undefined}>
          {t.icon}
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
