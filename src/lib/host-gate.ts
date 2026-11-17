import type { Session } from "./auth";
import { readHosts } from "./hosts";
import type { Row } from "./store/types";
import type { TemplateConfig } from "./template-schema";

// 진행자가 꼭 있어야 하는 활동(템플릿 host.required)인데 이 일정 활동에 진행자가 없을 때:
//  - 관리자가 직접 진행하면 막지 않고 알려만 준다(warn)
//  - 그 밖의 경우(진행자 세션 등)는 시작을 막는다(block)
export function hostGate(cfg: TemplateConfig, act: Row, s: Session): { block?: string; warn?: string } {
  if (!cfg.host?.required || readHosts(act).length) return {};
  if (s.host) return { block: "이 활동은 진행자가 있어야 시작할 수 있어요. 관리자에게 일정 › 활동에서 진행자를 정해 달라고 알려 주세요." };
  return { warn: "이 활동은 진행자가 필요한데 아직 정하지 않았어요. 관리자가 직접 진행하는 중이에요. 일정 › 활동의 “진행자”에서 정할 수 있어요." };
}
