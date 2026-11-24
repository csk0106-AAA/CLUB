// 활동 진행자(사회자) 여러 명. EventActivities.hosts = [{memberId, code, teamId?}] JSON.
// 예전에 한 명만 저장하던 hostId/hostCode 도 읽는다(hosts 가 비어 있으면 그 한 명).
// teamId 가 있으면 조 진행자: 조별 진행(lib/team-run.ts)일 때 그 조만 진행한다. 없으면 활동 전체 진행자.
export type Host = { memberId: string; code: string; teamId?: string };

export function readHosts(act: { hosts?: string; hostId?: string; hostCode?: string } | undefined): Host[] {
  if (!act) return [];
  try {
    const v = JSON.parse(act.hosts || "null");
    if (Array.isArray(v)) {
      return v
        .filter((h) => h && typeof h.memberId === "string" && h.memberId)
        .map((h) => ({ memberId: String(h.memberId), code: String(h.code ?? ""), ...(h.teamId ? { teamId: String(h.teamId) } : {}) }));
    }
  } catch {
    // 아래 예전 값으로
  }
  return act.hostId ? [{ memberId: act.hostId, code: act.hostCode ?? "" }] : [];
}

export const isHost = (act: Parameters<typeof readHosts>[0], mid: string) => readHosts(act).some((h) => h.memberId === mid);
// 이 회원이 맡은 조(조 진행자면 Teams id, 활동 전체 진행자이거나 진행자가 아니면 "")
export const hostTeamOf = (act: Parameters<typeof readHosts>[0], mid: string): string =>
  readHosts(act).find((h) => h.memberId === mid)?.teamId ?? "";
// 이 회원이 이 번호로 진행자 로그인할 수 있는지
export const hostCodeMatches = (act: Parameters<typeof readHosts>[0], mid: string, code: string) =>
  readHosts(act).some((h) => h.memberId === mid && h.code && h.code === code.trim());
