"use client";

import { useCallback, useEffect, useState } from "react";
import { SajuPanel, type SajuInfo } from "./SajuPanel";
import { api } from "@/lib/client";

type Data = {
  enabled: boolean;
  open?: boolean;
  published?: boolean;
  reading?: { readingStatus: string; readingMd: string; traitsMd: string; traitsShown: boolean; sajuInfo: SajuInfo | null };
};

// 기능 블록 "명리학 사주풀이"를 넣은 활동의 회원 화면에 붙인다(나의 고민은?, 타임캡슐 등).
// 사주풀이가 없는 활동이거나 참여 대상이 아니면 아무것도 보이지 않는다. 여는 시점이 아니면 받은 풀이만 보인다.
export function ActivitySaju({ aid }: { aid: string }) {
  const [d, setD] = useState<Data | null>(null);
  const load = useCallback(async () => {
    const r = await api<Data>(`/api/saju/${aid}`);
    if (r.ok) setD(r.data);
  }, [aid]);
  useEffect(() => {
    load();
  }, [load]);
  if (!d?.enabled || !d.reading) return null;
  if (!d.open && d.reading.readingStatus !== "done") return null;
  return <SajuPanel aid={aid} base={`/api/saju/${aid}`} r={d.reading} canWrite={!!d.open} published={!!d.published} onChanged={load} />;
}
