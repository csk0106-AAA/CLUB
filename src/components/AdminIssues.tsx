"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";

type Issue = { id: string; title: string; detail: string; href: string; action: string };

// 관리자가 처리할 일(새해 연회비, 대신 처리할 클럽 신청 …). 없으면 아무것도 보이지 않는다(lib/admin-issues.ts).
export function AdminIssues() {
  const [items, setItems] = useState<Issue[]>([]);
  useEffect(() => {
    api<{ issues: Issue[] }>("/api/admin/issues").then((r) => r.ok && setItems(r.data.issues));
  }, []);
  if (items.length === 0) return null;
  return (
    <section className="card" aria-labelledby="ai-h" style={{ display: "flex", flexDirection: "column", gap: 10, borderColor: "var(--red-line)", background: "var(--red-bg)" }}>
      <b id="ai-h" style={{ font: `700 ${fs(17)} var(--display)`, color: "var(--red-t)" }}>처리할 일 {items.length}개</b>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((it) => (
          <li key={it.id} className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
            <span className="grow" style={{ minWidth: 180 }}>
              <b style={{ display: "block" }}>{it.title}</b>
              <span className="small" style={{ color: "var(--ink2)" }}>{it.detail}</span>
            </span>
            <Link href={it.href} className="btn" style={{ width: "auto", minHeight: 44, fontSize: fs(15), textDecoration: "none", padding: "0 14px" }}>{it.action}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
