"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase, BUCKET, CHANNEL } from "@/lib/supabase";
import ConfigGate from "@/components/ConfigGate";
import { applySlowMo, record, sleep } from "@/lib/recording";

const COUNTDOWN = 3;

type Msg = { title: string; sub?: string; spinner?: boolean; clear?: boolean } | null;
type Guest = { id: string; name: string };

export default function CameraPage() {
  return (
    <ConfigGate>
      <Camera />
    </ConfigGate>
  );
}

function Camera() {
  const previewRef = useRef<HTMLVideoElement>(null);
  const resultUrlRef = useRef<string | null>(null);
  const [msg, setMsg] = useState<Msg>({ title: "Starting camera…" });
  const [count, setCount] = useState<number | null>(null);
  const [rec, setRec] = useState<{ left: number; pct: number } | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let current: Guest | null = null;
    let busy = false;
    let dead = false;

    const sb = getSupabase();
    const ch = sb.channel(CHANNEL, { config: { broadcast: { self: false } } });
    const send = (event: string, payload: object = {}) => ch.send({ type: "broadcast", event, payload });

    const idle = () => setMsg({ title: "Register to start", sub: "Please fill in the registration form to begin." });
    const showResult = (blob: Blob | null) => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = blob ? URL.createObjectURL(blob) : null;
      setResultUrl(resultUrlRef.current);
    };

    async function upload(blob: Blob, id: string, path: string) {
      const ext = path.split(".").pop();
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
        contentType: ext === "mp4" ? "video/mp4" : "video/webm",
        upsert: false,
      });
      if (error) throw error;
      const { error: e2 } = await sb.rpc("finish_session", {
        p_id: id,
        p_url: sb.storage.from(BUCKET).getPublicUrl(path, { download: `photobooth.${ext}` }).data.publicUrl,
      });
      if (e2) throw e2;
    }

    async function run() {
      if (!current || !stream) return;
      busy = true;
      const { id, name } = current;
      try {
        send("status", { id, state: "countdown" });
        setMsg(null);
        for (let i = COUNTDOWN; i > 0; i--) {
          setCount(i);
          await sleep(1000);
        }
        setCount(null);

        send("status", { id, state: "recording" });
        const raw = await record(stream, (left, pct) => setRec({ left, pct }));
        setRec(null);

        setMsg({ title: "Making your slow-motion…", sub: "Hang tight, about 15 seconds.", spinner: true });
        send("status", { id, state: "processing" });
        const final = await applySlowMo(raw);

        showResult(final);
        setMsg({ title: "Uploading…", sub: "Your video is on the left. Scan the QR code now, it will be ready soon.", spinner: true });
        // The file name is known before the upload finishes, so the QR code can be shown straight away.
        const ext = final.type.includes("mp4") ? "mp4" : "webm";
        const path = `${id}-${Date.now()}.${ext}`;
        send("ready", { id, path });
        await upload(final, id, path);

        send("done", { id });
        setMsg({ title: `All set, ${name}!`, sub: "Scan the QR code on the registration device to get your video." });
        await sleep(8000);
        current = null;
        showResult(null);
        idle();
      } catch (e) {
        const message = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
        console.error(e);
        send("error", { id, message });
        setCount(null);
        setRec(null);
        showResult(null);
        setMsg({ title: "Something went wrong", sub: message });
        await sleep(5000);
        setMsg({ title: `Hi ${name}!`, sub: "Press “Start Capture” to try again.", clear: true });
      } finally {
        busy = false;
      }
    }

    ch.on("broadcast", { event: "registered" }, ({ payload }) => {
      if (busy) return;
      current = payload as Guest;
      setMsg({ title: `Hi ${current.name}!`, sub: "Press “Start Capture” on the registration device.", clear: true });
    })
      .on("broadcast", { event: "capture" }, ({ payload }) => {
        if (!busy && current && current.id === payload.id) run();
      })
      .on("broadcast", { event: "reset" }, () => {
        if (!busy) {
          current = null;
          idle();
        }
      })
      .subscribe(status => {
        if (status === "SUBSCRIBED") send("hello");
      });

    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" },
          audio: false,
        });
        if (dead) return s.getTracks().forEach(t => t.stop());
        stream = s;
        if (previewRef.current) previewRef.current.srcObject = s;
        if (!current) idle();
      } catch (e) {
        setMsg({ title: "Camera unavailable", sub: (e as Error).message + " (the camera needs HTTPS)" });
      }
    })();

    return () => {
      dead = true;
      sb.removeChannel(ch);
      stream?.getTracks().forEach(t => t.stop());
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  return (
    <div className={`camera ${resultUrl ? "has-result" : ""}`}>
      <video ref={previewRef} className="preview" autoPlay muted playsInline />
      {resultUrl && <video className="result" src={resultUrl} autoPlay muted loop playsInline />}

      {msg && (
        <div className={`overlay msg ${msg.clear ? "clear" : ""}`}>
          {msg.spinner && <div className="spinner" />}
          <h1>{msg.title}</h1>
          {msg.sub && <p>{msg.sub}</p>}
        </div>
      )}
      {count !== null && (
        <div key={count} className="overlay count">
          {count}
        </div>
      )}
      {rec && (
        <>
          <div className="rec">REC {rec.left}s</div>
          <div className="bar" style={{ width: `${rec.pct}%` }} />
        </>
      )}
    </div>
  );
}
