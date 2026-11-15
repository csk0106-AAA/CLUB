import type { TemplateConfig } from "./template-schema";

// 화면용: GET /api/admin/templates 의 행(버전 하나)과 v1 기준 묶음
export type TplRow = {
  id: string;
  origin: string; // default | custom (v1) / version (v2 이상)
  version: number;
  familyId: string; // v1 id
  createdAt: string;
  uses: number; // 이 버전을 쓰는 일정 활동 수
  useEvents: string[]; // 이 버전을 쓰는 일정 id(겹치지 않게)
  deletable: boolean;
  deleteWhy: string;
  config: TemplateConfig;
};

export type Family = {
  id: string;
  root: TplRow; // v1
  versions: TplRow[]; // 최신 버전부터
  latest: TplRow;
  nextVersion: number;
};

// v1 순서대로 묶는다. v1 이 없는 버전은(있으면 안 되지만) 자기 자신을 v1 으로 본다.
export function families(rows: TplRow[]): Family[] {
  const byFamily = new Map<string, TplRow[]>();
  for (const r of rows) {
    const fid = rows.some((x) => x.id === r.familyId) ? r.familyId : r.id;
    byFamily.set(fid, [...(byFamily.get(fid) ?? []), r]);
  }
  return [...byFamily.entries()].map(([id, list]) => {
    const versions = [...list].sort((a, b) => b.version - a.version);
    const root = list.find((x) => x.id === id) ?? versions[versions.length - 1];
    return { id, root, versions, latest: versions[0], nextVersion: (versions[0]?.version ?? 0) + 1 };
  });
}

// 이 버전이 어디서 만들어졌는지
export function sourceLabel(t: Pick<TplRow, "origin" | "config">): string {
  if (t.config.sourceEvent) return `${t.config.sourceEvent.name}_${t.config.sourceEvent.date}에서 수정`;
  if (t.origin === "version") return "템플릿 화면에서 수정";
  if (t.origin === "default") return "기본 템플릿";
  return "새로 만든 템플릿";
}
