"use client";

import { useEffect, useState } from "react";
import { BUCKET, SUPABASE_URL } from "@/lib/supabase";

type State = "waiting" | "ready" | "invalid" | "timeout";

/** Page opened by the QR code. Waits for the upload to finish, then offers the video. */
export default function VideoPage() {
  const [state, setState] = useState<State>("waiting");
  const [base, setBase] = useState("");
  const [ext, setExt] = useState("mp4");

  useEffect(() => {
    const file = new URLSearchParams(location.search).get("f");
    if (!file) return setState("invalid");
    const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(file)}`;
    setBase(url);
    setExt(file.split(".").pop() ?? "mp4");

    let cancelled = false;
    (async () => {
      const started = Date.now();
      while (!cancelled) {
        try {
          const r = await fetch(`${url}?t=${Date.now()}`, { method: "HEAD", cache: "no-store" });
          if (r.ok) return setState("ready");
        } catch {
          return setState("ready"); // cannot check (network/CORS): just offer the link
        }
        if (Date.now() - started > 10 * 60 * 1000) return setState("timeout");
        await new Promise(r => setTimeout(r, 2500));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <div className="card">
        {state === "waiting" && (
          <>
            <div className="spinner" />
            <h1>Almost there…</h1>
            <p className="lead">Your video is still uploading. This page will update by itself, you can keep it open.</p>
          </>
        )}
        {state === "ready" && (
          <>
            <h1>Your video is ready 🎉</h1>
            <video src={base} controls playsInline loop />
            <a className="btn" href={`${base}?download=photobooth.${ext}`}>Download video</a>
          </>
        )}
        {state === "invalid" && <h1>Invalid link</h1>}
        {state === "timeout" && (
          <>
            <h1>Taking longer than usual</h1>
            <p className="lead">Please reload this page in a few minutes.</p>
          </>
        )}
      </div>
    </div>
  );
}
