import { activityKind, guessStatus, liveView, preStatus, readConfig, windowBase } from "./activities";
import { canJoin } from "./participants";
import type { Row } from "./store/types";

// 홈 "다가오는 나의 일정" 카드의 "활동 바로가기": 이 회원이 지금 가장 먼저 할 활동 화면 주소.
// 일정 상세의 활동 길(components/LiveActivities.tsx nodeOf)과 같은 기준으로 고른다:
//  1) 현장 진행 중  2) 사전 작성 중  3) (내가 누구일까요?) 맞히기 중  4) 그 밖에는 참여할 수 있는 첫 활동
// 회원 화면이 있는 활동(내가 누구일까요? / 나의 고민은? / 타임캡슐)만, 참여 대상이 아닌 활동은 건너뛴다. 없으면 "".
// 부르는 쪽에서 이 회원이 일정에 참여할 수 있는지(eventJoinable)를 먼저 확인한다.
export async function activityShortcut(ev: Row, acts: Row[], lives: Row[], memberId: string): Promise<string> {
  const mine = acts
    .filter((a) => a.eventId === ev.id)
    .sort((a, b) => Number(a.order) - Number(b.order));
  let first = "";
  for (const a of mine) {
    const cfg = readConfig(a.config);
    if (!cfg) continue;
    const kind = activityKind(cfg);
    const page = kind === "who" ? `/events/${ev.id}/who/${a.id}` : kind === "worry" ? `/events/${ev.id}/worry/${a.id}` : kind === "capsule" ? `/events/${ev.id}/capsule/${a.id}` : "";
    if (!page || !(await canJoin(cfg, a, ev, memberId))) continue;
    const now =
      // 조별 진행이면 조마다 줄이 있다: 어느 줄이든 진행 중이면 진행 중으로 본다
      lives.some((l) => l.eventActivityId === a.id && liveView(cfg, l).active)
      || preStatus(cfg, windowBase(a, ev)).status === "open"
      || (kind === "who" && guessStatus(cfg, windowBase(a, ev)).status === "open");
    if (now) return page;
    if (!first) first = page;
  }
  return first;
}
