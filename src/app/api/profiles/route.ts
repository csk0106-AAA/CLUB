import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { avatarView } from "@/lib/avatar";
import { consentRequired, hasConsent } from "@/lib/consent";
import { memberClubs } from "@/lib/lists";
import { bookHidden, inBook, isGuest, isNewMember, memberSinceOf } from "@/lib/member-kind";
import { ensureAlias, maskedMembers } from "@/lib/profile-book";
import { getStore } from "@/lib/store";
import { profileFreshness } from "@/lib/unread";

export const dynamic = "force-dynamic";

// 회원 프로필 북: 모든 회원을 이름으로 보여 준다(2진실 1거짓, 인터뷰, 고민, 타임캡슐, 생년월일 등은 절대 포함하지 않는다).
//  - 실명 공개 전인 '내가 누굴까요?' 활동에 참여 중인 회원은 이름 대신 별칭(랜덤 닉네임)으로만 보이고,
//    회사·직책·클럽·프로필 사진도 내려주지 않는다(별칭의 주인을 알아챌 수 없게). 실명 공개 시점이 지나면 실명으로.
//  - key: 상세 화면 주소(별칭 회원은 프로필 번호, 그 밖에는 "m-회원번호"). 별칭 회원의 회원 번호는 내려주지 않는다.
export async function GET() {
  const g = await guard();
  if ("err" in g) return g.err;
  if (!(await hasConsent(g.s.mid))) return consentRequired();
  const s = await getStore();
  const [members, profiles, masked] = await Promise.all([s.list("Members"), s.list("Profiles"), maskedMembers()]);
  const freshness = await profileFreshness(g.s.mid);

  // 프로필 북 노출을 끈 회원은 빠진다(본인에게는 내 카드가 보인다 — 소개를 쓰고 노출 여부를 확인할 수 있게)
  const live = members.filter((m) => inBook(m) || (m.id === g.s.mid && !isGuest(m.kind)));
  // 별칭으로 가릴 회원은 별칭이 꼭 있어야 한다(없으면 랜덤으로 정해 둔다)
  for (const m of live) if (masked.has(m.id)) await ensureAlias(m.id, profiles);

  const items = live.map((m) => {
    const p = profiles.find((x) => x.memberId === m.id);
    const hasIntro = p?.introStatus === "approved";
    const fresh = hasIntro && p ? freshness.get(p.id) ?? null : null;
    // 신규 회원(승인 후 한 달): 맨 위에 "신규 회원" 표시. 별칭으로 가린 회원은 드러나지 않게 표시·순서를 바꾸지 않는다
    const isNew = !masked.has(m.id) && isNewMember(m);
    const since = isNew ? memberSinceOf(m) : "";
    if (masked.has(m.id) && p) {
      return { key: p.id, masked: true, name: p.alias, hasIntro, mine: m.id === g.s.mid, fresh, isNew: false, since: "" };
    }
    return {
      key: `m-${m.id}`, masked: false, name: m.name, hasIntro, mine: m.id === g.s.mid, fresh, hiddenMine: bookHidden(m),
      company: m.company ?? "", title: m.title ?? "", clubs: memberClubs(m).map((c) => c.name), avatar: avatarView(m),
      isNew, since,
    };
  });

  return NextResponse.json({
    // 신규 회원(승인 후 한 달)이 맨 위(최근 승인 먼저), 그다음 이름순
    items: items.sort((a, b) => Number(b.isNew) - Number(a.isNew) || (a.isNew && b.isNew ? b.since.localeCompare(a.since) : 0) || a.name.localeCompare(b.name, "ko")),
    maskedCount: items.filter((i) => i.masked).length,
  });
}
