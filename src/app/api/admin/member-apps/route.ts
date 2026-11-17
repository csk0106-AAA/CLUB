import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { SOURCE_LABEL, TYPE_LABEL, targetKind, type AppType } from "@/lib/member-apps";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 관리자 › 회원관리 › 회원신청관리: 회원 신청 전체(대기 중 먼저, 그다음 처리한 내역 최근 순)
export async function GET() {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const s = await getStore();
  const [apps, members] = await Promise.all([s.list("MemberApps"), s.list("Members")]);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  const rank = (st: string) => (st === "pending" ? 0 : 1);
  const list = apps
    .sort((a, b) => rank(a.status) - rank(b.status) || (b.handledAt || b.createdAt || "").localeCompare(a.handledAt || a.createdAt || ""))
    .map((a) => {
      const m = members.find((x) => x.id === a.memberId);
      return {
        id: a.id,
        memberId: a.memberId,
        // 지금 명단의 이름(지웠으면 신청할 때 이름)
        name: m?.name ?? a.name,
        removed: !m,
        phone: m?.phone ?? a.phone,
        kind: m?.kind ?? "",
        type: a.type,
        typeLabel: TYPE_LABEL[a.type as AppType] ?? a.type,
        edu: a.edu,
        recommenders: a.recommenders ?? "",
        message: a.message ?? "",
        source: a.source,
        sourceLabel: SOURCE_LABEL[a.source] ?? "",
        status: a.status,
        reason: a.reason ?? "",
        createdAt: a.createdAt,
        handledAt: a.handledAt,
        handledByName: a.handledBy ? name(a.handledBy) : "",
        // 승인하면 바뀔 회원구분(대기 중) / 승인 때 바뀐 회원구분(처리됨)
        toKind: a.status === "approved" ? a.toKind ?? "" : targetKind(a),
        fromKind: a.status === "pending" ? m?.kind ?? "" : a.fromKind ?? "",
        note: a.note ?? "", // 예: 탈퇴회원과 이름·전화번호가 같아요
      };
    });
  return NextResponse.json({ apps: list });
}
