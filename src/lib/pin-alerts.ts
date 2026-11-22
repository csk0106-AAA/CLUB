import { addAlerts } from "./member-alerts";
import { effectivePerms, getPermGroups } from "./perms";
import { pushTo } from "./push";
import { getStore } from "./store";

// PIN 관련 알림: 회원관리(members)·모든 권한(all) 관리자에게
export async function tellMemberAdmins(text: string, exceptId = ""): Promise<void> {
  const [members, groups] = await Promise.all([(await getStore()).list("Members"), getPermGroups()]);
  const ids = members.filter((m) => m.id !== exceptId && effectivePerms(m, groups).some((p) => p === "all" || p === "members")).map((m) => m.id);
  if (!ids.length) return;
  await addAlerts(ids, { eventId: "", text, href: "/admin/members" });
  await pushTo(ids, "alerts").catch(() => undefined);
}
export async function tellMember(mid: string, text: string): Promise<void> {
  await addAlerts([mid], { eventId: "", text, href: "/settings" });
  await pushTo([mid], "alerts").catch(() => undefined);
}
