import { notifyPostPush } from "./push";

// 게시글이 올라오거나 수정되면 공개 대상에게 알린다(작성자 제외).
// 하단 아이콘 숫자는 Posts.createdAt/updatedAt 으로 계산되고(lib/unread.ts), 휴대폰 알림은 lib/push.ts 가 보낸다.
export async function notifyPost(postId: string, _kind: "new" | "update"): Promise<void> {
  await notifyPostPush(postId);
}
