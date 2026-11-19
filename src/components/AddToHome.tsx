"use client";

import { useEffect, useState } from "react";
import { fs } from "@/lib/fs";

// 설정 › "홈 화면에 추가": 아이폰·안드로이드에서 앱처럼 설치하는 방법.
// 지금 쓰는 기기 쪽 안내를 펼쳐 두고, 이미 홈 화면 아이콘으로 열었으면 그렇다고 알려 준다.
export function AddToHome() {
  const [os, setOs] = useState<"ios" | "android" | "">("");
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    // iPad 는 PC 처럼 보이기도 해서 터치 화면인 Mac 도 iOS 로 본다
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    setOs(ios ? "ios" : /Android/.test(ua) ? "android" : "");
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  }, []);

  const step = { margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column" as const, gap: 4, fontSize: fs(13), lineHeight: 1.6 };
  const sum = { cursor: "pointer", fontWeight: 700, fontSize: fs(14), padding: "6px 0" };

  return (
    <section className="sect" aria-labelledby="s-home">
      <h2 id="s-home">홈 화면에 추가</h2>
      <div className="sect-body" style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 14 }}>
        <span className="small" style={{ fontSize: fs(12) }}>
          {installed ? "지금 홈 화면 아이콘으로 열었어요. 이 상태에서 알림을 켤 수 있어요." : "홈 화면에 추가하면 아이콘을 눌러 주소창 없이 앱처럼 바로 열 수 있어요. iPhone 은 홈 화면에 추가해야 휴대폰 알림을 받을 수 있어요."}
        </span>
        <details key={`i-${os}`} open={os === "ios"}>
          <summary style={sum}>iPhone (Safari)</summary>
          <ol style={step}>
            <li>Safari 에서 이 앱 주소를 열어요.</li>
            <li>화면 아래(또는 위)의 <b>공유 버튼</b>(네모에서 화살표가 위로 나온 모양)을 눌러요. 안 보이면 <b>“⋯”</b> 버튼을 누른 뒤 <b>공유</b>를 눌러요.</li>
            <li>메뉴를 아래로 내려 <b>“홈 화면에 추가”</b>를 눌러요.</li>
            <li>오른쪽 위 <b>“추가”</b>를 누르면 홈 화면에 아이콘이 생겨요.</li>
            <li>알림을 받으려면 <b>그 아이콘으로 앱을 연 뒤</b> 설정 › 알림에서 켜 주세요. (iOS 16.4 이상)</li>
          </ol>
        </details>
        <details key={`a-${os}`} open={os === "android"}>
          <summary style={sum}>안드로이드 (Chrome)</summary>
          <ol style={step}>
            <li>Chrome 에서 이 앱 주소를 열어요.</li>
            <li>오른쪽 위 <b>⋮</b> (점 세 개) 메뉴를 눌러요.</li>
            <li><b>“홈 화면에 추가”</b> 또는 <b>“앱 설치”</b>를 눌러요.</li>
            <li><b>“추가”</b> 또는 <b>“설치”</b>를 누르면 홈 화면에 아이콘이 생겨요.</li>
            <li>삼성 인터넷이면 아래 <b>≡</b> 메뉴 › <b>“현재 페이지 추가”</b> › <b>“홈 화면”</b>을 눌러요.</li>
          </ol>
        </details>
        <span className="small" style={{ fontSize: fs(12) }}>이미 추가했는데 아이콘이 예전 모양이면, 홈 화면에서 지우고 다시 추가해 주세요.</span>
      </div>
    </section>
  );
}
