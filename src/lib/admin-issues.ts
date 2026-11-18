import { canHandle } from "./club-requests";
import { clubLeaders } from "./clubs";
import { kstYear, readDues } from "./dues";
import { canDues, postsOf } from "./published";
import { getPermGroups } from "./perms";
import { getStore } from "./store";
import type { Row } from "./store/types";

// 관리자가 처리할 일(설정 화면 관리자 아이콘의 빨간 숫자, 회원관리 화면 위쪽 목록).
//  - dues-year : 연회비 입금 기간의 끝 해가 올해(한국 시간)보다 이전이거나, 마지막으로 올린 회비 글이 올해 전에 올라왔을 때
//                → "새해 연회비를 정해 주세요" (회비·모든 권한 관리자)
//  - club-req  : 직책자가 없는 클럽이라 관리자가 대신 처리해야 하는 가입·참관 신청
export type AdminIssue = { id: string; title: string; detail: string; href: string; action: string };

const yearOf = (iso: string): number | null => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : kstYear(ms);
};

export async function adminIssues(me: Row, perms: string[], now = Date.now()): Promise<AdminIssue[]> {
  const out: AdminIssue[] = [];
  if (perms.length === 0) return out;
  const year = kstYear(now);

  if (canDues(perms)) {
    const d = await readDues();
    if (d.period === "annual") {
      const endYear = /^\d{4}/.test(d.periodEnd) ? Number(d.periodEnd.slice(0, 4)) : null;
      const pub = await postsOf({ kind: "dues" });
      const post = pub.posts.find((p) => p.id === pub.linked);
      const postYear = post ? yearOf(post.updatedAt) : null;
      if ((endYear !== null && endYear < year) || (postYear !== null && postYear < year)) {
        out.push({
          id: "dues-year",
          title: "새해 연회비를 정해 주세요",
          detail: `${year}년이 됐어요. 회비설정에서 올해 입금 기간과 금액을 확인하고 저장한 뒤 회비 글을 다시 올려 주세요.`,
          href: "/admin/dues",
          action: "회비설정으로",
        });
      }
    }
  }

  const s = await getStore();
  const [rows, members, groups] = await Promise.all([s.list("ClubRequests"), s.list("Members"), getPermGroups()]);
  const pending = rows.filter((r) =>
    r.status === "pending" && r.memberId !== me.id && clubLeaders(members, r.club).length === 0 && canHandle(members, r.club, me.id, groups),
  );
  if (pending.length > 0) {
    const clubs = [...new Set(pending.map((r) => r.club))];
    out.push({
      id: "club-req",
      title: `처리할 클럽 신청 ${pending.length}건`,
      detail: `${clubs.join(", ")} 클럽에 회장(대표)이 없어서 관리자가 대신 승인·거절해야 해요.`,
      href: "/board?alerts=1",
      action: "알림에서 처리",
    });
  }
  return out;
}
