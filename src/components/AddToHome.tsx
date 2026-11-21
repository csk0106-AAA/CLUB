"use client";

import { useEffect, useState } from "react";
import { fs } from "@/lib/fs";

// 설정 › "홈 화면에 추가": 아이폰·안드로이드·노트북(PC)에서 앱처럼 설치하는 방법.
// 지금 쓰는 기기·브라우저 쪽 안내만 펼쳐 두고, 이미 설치한 아이콘으로 열었으면 그렇다고 알려 준다.
// 노트북은 Chrome·Edge(윈도우·맥)와 맥 Safari 를 따로 보여 준다(Firefox 는 PC 설치를 지원하지 않는다).
// 안드로이드는 Chrome 과 삼성 인터넷의 메뉴가 달라서 따로 보여 준다. Firefox 는 아이콘이 기본 로봇 모양으로 붙어서 다른 브라우저를 권한다.
export function AddToHome() {
  const [os, setOs] = useState<"ios" | "chrome" | "samsung" | "firefox" | "">("");
  const [pc, setPc] = useState<"chromium" | "safari" | "firefox" | "">(""); // 노트북·PC 브라우저
  const [installed, setInstalled] = useState(false);
  const [url, setUrl] = useState(""); // 이 앱 주소(지금 연 주소 그대로)
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setUrl(window.location.host);
    const ua = navigator.userAgent;
    // iPad 는 PC 처럼 보이기도 해서 터치 화면인 Mac 도 iOS 로 본다
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    setOs(ios ? "ios" : !/Android/.test(ua) ? "" : /SamsungBrowser/.test(ua) ? "samsung" : /Firefox/.test(ua) ? "firefox" : "chrome");
    if (!ios && !/Android|Mobile/.test(ua)) setPc(/Firefox/.test(ua) ? "firefox" : /Chrome|Edg/.test(ua) ? "chromium" : /Safari/.test(ua) ? "safari" : "");
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`https://${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 복사가 막힌 브라우저: 주소를 보고 직접 입력
    }
  }
  const addr = <b style={{ color: "var(--violet-t)", wordBreak: "break-all" }}>{url || "이 앱 주소"}</b>;

  const step = { margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column" as const, gap: 4, fontSize: fs(13), lineHeight: 1.6 };
  const sum = { cursor: "pointer", fontWeight: 700, fontSize: fs(14), padding: "6px 0" };

  return (
    <section className="sect" aria-labelledby="s-home">
      <h2 id="s-home">홈 화면에 추가 · 노트북 설치</h2>
      <div className="sect-body" style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 14 }}>
        <span className="small" style={{ fontSize: fs(12) }}>
          {installed ? "지금 홈 화면 아이콘으로 열었어요. 이 상태에서 알림을 켤 수 있어요." : "홈 화면에 추가하면 아이콘을 눌러 주소창 없이 앱처럼 바로 열 수 있어요. iPhone 은 홈 화면에 추가해야 휴대폰 알림을 받을 수 있어요."}
        </span>
        {url && (
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: fs(13) }}>앱 주소 {addr}</span>
            <button type="button" className="mini" onClick={copy}>{copied ? "복사했어요 ✓" : "주소 복사"}</button>
          </div>
        )}
        <details key={`i-${os}`} open={os === "ios"}>
          <summary style={sum}>iPhone (Safari){os === "ios" ? <span className="small"> · 지금 쓰는 폰</span> : null}</summary>
          <ol style={step}>
            <li>Safari 주소창에 {addr} 를 입력해 열어요.</li>
            <li>화면 아래(또는 위)의 <b>공유 버튼</b>(네모에서 화살표가 위로 나온 모양)을 눌러요. 안 보이면 <b>“⋯”</b> 버튼을 누른 뒤 <b>공유</b>를 눌러요.</li>
            <li>메뉴를 아래로 내려 <b>“홈 화면에 추가”</b>를 눌러요.</li>
            <li>오른쪽 위 <b>“추가”</b>를 누르면 홈 화면에 아이콘이 생겨요.</li>
            <li>알림을 받으려면 <b>그 아이콘으로 앱을 연 뒤</b> 설정 › 알림에서 켜 주세요. (iOS 16.4 이상)</li>
          </ol>
        </details>
        {os === "firefox" && (
          <div className="msg info" role="note" style={{ fontSize: fs(13) }}>Firefox 로 설치하면 아이콘이 기본 안드로이드 모양으로 나올 수 있어요. <b>Chrome</b> 이나 <b>삼성 인터넷</b>으로 이 주소를 열어 설치해 주세요.</div>
        )}
        <details key={`c-${os}`} open={os === "chrome"}>
          <summary style={sum}>안드로이드 · Chrome{os === "chrome" ? <span className="small"> · 지금 쓰는 브라우저</span> : null}</summary>
          <ol style={step}>
            <li>Chrome 에서 {addr} 를 열어요.</li>
            <li><b>⋮</b> (점 세 개)를 눌러요.</li>
            <li><b>“설치 및 바로가기 만들기”</b>를 눌러요.</li>
            <li><b>“설치”</b>를 누르면 홈 화면에 앱 아이콘이 생겨요.</li>
            <li>“바로가기 만들기”로 추가하면 열 때마다 브라우저에 새 탭이 생겨요. 꼭 <b>“설치”</b>를 골라 주세요.</li>
          </ol>
        </details>
        <details key={`s-${os}`} open={os === "samsung"}>
          <summary style={sum}>안드로이드 · 삼성 인터넷{os === "samsung" ? <span className="small"> · 지금 쓰는 브라우저</span> : null}</summary>
          <ol style={step}>
            <li>삼성 인터넷에서 {addr} 를 열어요.</li>
            <li><b>⋮</b> (점 세 개)를 눌러요.</li>
            <li><b>“현재 페이지 추가”</b>를 눌러요.</li>
            <li><b>“홈 화면”</b>을 고르고 <b>“추가”</b>를 누르면 홈 화면에 아이콘이 생겨요.</li>
          </ol>
        </details>
        <details key={`p-${pc}`} open={pc === "chromium" || pc === "firefox"}>
          <summary style={sum}>노트북·PC · Chrome / Edge{pc === "chromium" ? <span className="small"> · 지금 쓰는 브라우저</span> : null}</summary>
          <ol style={step}>
            <li>Chrome 이나 Edge 에서 {addr} 를 열어요.</li>
            <li>주소창 오른쪽의 <b>설치 아이콘</b>(모니터에 화살표 모양)을 눌러요. 안 보이면 오른쪽 위 <b>⋮</b> 또는 <b>⋯</b> (점 세 개)를 눌러요.</li>
            <li>Chrome 은 <b>“전송, 저장, 공유 › 페이지를 앱으로 설치”</b> 또는 <b>“설치”</b>, Edge 는 <b>“앱 › 이 사이트를 앱으로 설치”</b>를 눌러요.</li>
            <li><b>“설치”</b>를 누르면 따로 창으로 열리고, 바탕화면·시작 메뉴(맥은 Launchpad)에 아이콘이 생겨요. 작업 표시줄이나 Dock 에 고정해 두면 편해요.</li>
          </ol>
          {pc === "firefox" && <div className="msg info" role="note" style={{ fontSize: fs(13) }}>Firefox 는 PC 에서 앱 설치를 지원하지 않아요. <b>Chrome</b> 이나 <b>Edge</b> 로 이 주소를 열어 설치해 주세요.</div>}
        </details>
        <details key={`m-${pc}`} open={pc === "safari"}>
          <summary style={sum}>맥 · Safari{pc === "safari" ? <span className="small"> · 지금 쓰는 브라우저</span> : null}</summary>
          <ol style={step}>
            <li>Safari 에서 {addr} 를 열어요.</li>
            <li>위쪽 메뉴의 <b>파일 › “Dock에 추가”</b>를 누르거나, 도구 막대의 <b>공유 버튼</b>을 눌러 <b>“Dock에 추가”</b>를 골라요.</li>
            <li><b>“추가”</b>를 누르면 Dock 에 아이콘이 생겨요. (macOS 소노마 14 이상)</li>
          </ol>
        </details>
        <span className="small" style={{ fontSize: fs(12) }}>안드로이드는 <b>Chrome</b> 이나 <b>삼성 인터넷</b>으로 설치해 주세요. Firefox 는 아이콘이 기본 모양으로 나와요.</span>
        <span className="small" style={{ fontSize: fs(12) }}>이미 추가했는데 아이콘이 예전 모양이면, 홈 화면에서 지우고 다시 추가해 주세요.</span>
      </div>
    </section>
  );
}
