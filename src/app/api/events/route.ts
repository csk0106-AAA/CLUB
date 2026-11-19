import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { memberFee, payable } from "@/lib/fee";
import { eventJoinable, eventVisible, inClubOrObserver } from "@/lib/audience";
import { parseJson } from "@/lib/api";
import { fixLegacyTypes, migrateMinutesPosts } from "@/lib/event-migrate";
import { effectivePerms, getPermGroups } from "@/lib/perms";
import { readEditors } from "@/lib/editors";
import { activityShortcut } from "@/lib/activity-shortcut";
import { defaultCoverUrl, eventCoverUrl, readCovers } from "@/lib/covers";
import { getStore } from "@/lib/store";
import { eventFreshness } from "@/lib/unread";

export const dynamic = "force-dynamic";

// 한국 시간 오늘(YYYY-MM-DD)
const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

// 회원이 보는 예정된 일정 목록. 공개된 일정만, 내 신청과 회비 상태를 함께 내려준다.
// 다른 클럽의 일정도 보이지만(읽기만) 참석 신청은 그 클럽 회원·참관자만 할 수 있다(canApply).
//
// 순서(group):
//  0 관리자가 맨 위에 고정한 일정(pinned, 지나지 않은 것)
//  1 아직 참석 여부를 안 알린 일정 / 참석으로 알린 일정 / 내 클럽 일정 — 가까운 날짜 먼저
//  2 불참으로 알린 일정 / 내가 속하지 않은 클럽 일정 — 가까운 날짜 먼저
//  3 지난 일정 — 최근 것 먼저
// 날짜가 아직 없는 일정은 같은 묶음의 맨 뒤.
// 일정 관리 권한(all/events/fees, 지금 DB 기준)이 있으면 공개 전 초안도 draft: true 로 함께 내려준다(관리 화면으로 가는 길).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  if (session.host) return NextResponse.json({ error: "진행자 접속 중에는 활동 진행 화면만 볼 수 있어요.", hostOnly: true }, { status: 403 });

  // 예전 데이터 옮기기(여러 번 불러도 같다): 게시판 회의록 → 회의 일정, 전체정기모임 → 정기모임
  await migrateMinutesPosts().catch(() => 0);
  const s = await getStore();
  const [events, applies, members, photos] = await Promise.all([s.list("Events"), s.list("EventApplies"), s.list("Members"), s.list("EventPhotos")]);
  // 일정 카드 사진: 회원이 올린 사진 중 좋아요가 가장 많은 사진(좋아요가 같거나 없으면 가장 먼저 올린 사진).
  //  회원 사진이 없으면 대표사진(클럽 일정은 클럽 대표사진 → 모임 대표사진, lib/covers.ts). 사진 내용은 읽지 않는다(목록 행만).
  const covers = await readCovers();
  const coverOf = new Map<string, { id: string; likes: number; at: string; n: number }>();
  for (const p of photos) {
    const likes = parseJson<string[]>(p.likes, []).length;
    const c = coverOf.get(p.eventId);
    if (!c) coverOf.set(p.eventId, { id: p.id, likes, at: p.createdAt ?? "", n: 1 });
    else {
      c.n++;
      if (likes > c.likes || (likes === c.likes && (p.createdAt ?? "") < c.at)) Object.assign(c, { id: p.id, likes, at: p.createdAt ?? "" });
    }
  }
  // 일정별 참석 인원
  const goingOf = new Map<string, number>();
  for (const a of applies) if (a.answer === "참석") goingOf.set(a.eventId, (goingOf.get(a.eventId) ?? 0) + 1);
  await fixLegacyTypes(events);
  const mine = applies.filter((a) => a.memberId === session.mid);
  const me = members.find((m) => m.id === session.mid);
  const today = todayKst();
  const perms = me ? effectivePerms(me, await getPermGroups()) : [];
  const manager = ["all", "events"].some((p) => perms.includes(p));
  // 내가 만들었거나 만든 사람이 편집자로 추가한 일정
  const ownEv = (e: { createdBy?: string; editors?: string }) => e.createdBy === session.mid || readEditors(e.editors).includes(session.mid);
  // NEW / UP 표시(하단 일정 탭 숫자와 같은 기준). 화면이 목록을 받은 뒤 "봤음"으로 표시한다.
  const freshness = await eventFreshness(session.mid);

  const list = events
    // 공개된 일정은 공개 대상이 아니어도 모두 목록에 보인다(outside: true — 눌러도 열 수 없고 안내만, 회원은 "나에게 공개된 일정만"으로 거를 수 있다).
    // 공개전(초안)은 일정 관리 권한자·만든 사람·편집자에게만.
    .filter((e) => e.published === "true" || manager || ownEv(e))
    .map((e) => {
      const draft = e.published !== "true";
      // 공개됐지만 나는 공개 대상이 아닌 일정: 목록에만 보이고 열 수 없다
      const outside = !draft && !eventVisible(e, me ?? session.mid);
      const a = mine.find((x) => x.eventId === e.id);
      const attending = a?.answer === "참석";
      const canApply = inClubOrObserver(e, { id: session.mid, clubs: me?.clubs, kind: me?.kind });
      const end = (e.endsAt || e.startsAt || "").slice(0, 10);
      const past = !!end && end < today;
      const myAnswer = canApply ? a?.answer ?? "" : "";
      const group = past ? 3 : e.pinned === "true" ? 0 : canApply && myAnswer !== "불참" ? 1 : 2;
      // 이 회원의 참석일·회원구분·직책에 맞는 회비가 있는지(0원이면 회비 없음)
      const mf = memberFee(e, { kind: me?.kind, position: me?.position }, a);
      const hasFee = canApply && mf.known && payable(mf.amount);
      return {
        id: e.id,
        type: e.type,
        name: e.name,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        place: e.place,
        status: e.status,
        club: e.club ?? "",
        pinned: e.pinned === "true",
        past,
        group,
        canApply, // false: 내가 속하지 않은 클럽 일정(읽기만)
        myAnswer,
        // 참석 여부를 아직 안 알림(날짜가 정해지고 지나지 않은, 신청할 수 있는 일정만)
        needsAnswer: !draft && !outside && canApply && myAnswer === "" && !!e.startsAt && !past,
        mine: ownEv(e), // 내가 만들었거나 편집자인 일정(일정 만들기 권한자는 이 일정만 관리 화면으로 고친다)
        draft, // 공개 전 초안(관리자에게만 보임)
        outside, // 공개 대상 밖(관리자에게만 보임)
        fresh: draft ? null : freshness.get(e.id) ?? null, // "new" | "updated" | null
        // 참석 신청하고 회비를 내지 않았으면 회비 알림
        feeDue: attending && hasFee && a?.paid !== "true",
        feePaid: attending && hasFee && a?.paid === "true",
        payNotice: attending && hasFee && a?.paid !== "true" && Boolean(a?.payNotice),
        going: goingOf.get(e.id) ?? 0, // 참석 인원
        // 카드 사진 주소: 일정 대표사진 → 회원 사진(사진첩을 볼 수 있는 사람에게만) → 클럽·모임 대표사진 → 없음("")
        coverUrl: (() => {
          if (e.coverAt) return eventCoverUrl({ id: e.id, coverAt: e.coverAt }, covers);
          const c = coverOf.get(e.id);
          // 사진첩을 볼 수 있는 사람(lib/event-photos.ts photoAccess 와 같은 기준): 참석 대상 회원, 또는 관리자 2차 인증을 마친
          // 일정관리 권한자·만든 사람·편집자·(클럽 일정이면) 클럽관리 권한자
          const canSee = eventJoinable(e, me ?? session.mid) || (session.admin && (manager || perms.includes("clubs") && !!(e.club ?? "").trim() || ownEv(e)));
          if (c && canSee) return `/api/events/${e.id}/photos/${c.id}?size=thumb`;
          return defaultCoverUrl(covers, e.club);
        })(),
        photoCount: coverOf.get(e.id)?.n ?? 0,
      };
    })
    .sort((x, y) => {
      if (x.group !== y.group) return x.group - y.group;
      if (!x.startsAt !== !y.startsAt) return x.startsAt ? -1 : 1; // 날짜 없는 일정은 뒤로
      const c = x.startsAt.localeCompare(y.startsAt);
      return x.group === 3 ? -c : c;
    });
  // "활동 바로가기"(홈 다가오는 나의 일정 카드): 내가 참석 신청한, 지나지 않은 공개 일정에만 붙인다(lib/activity-shortcut.ts)
  const going = list.filter((x) => x.myAnswer === "참석" && !x.past && !x.draft && !x.outside);
  const actHref = new Map<string, string>();
  if (going.length) {
    const [acts, lives] = await Promise.all([s.list("EventActivities"), s.list("LiveState")]);
    for (const x of going) {
      const ev = events.find((e) => e.id === x.id);
      if (ev && eventJoinable(ev, me ?? session.mid)) actHref.set(x.id, await activityShortcut(ev, acts, lives, session.mid));
    }
  }
  return NextResponse.json({ events: list.map((x) => ({ ...x, actHref: actHref.get(x.id) ?? "" })) });
}
