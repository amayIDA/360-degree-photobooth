"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import ConfigGate from "@/components/ConfigGate";
import Logo from "@/components/Logo";
import { getSupabase, BUCKET } from "@/lib/supabase";
import { captureFrames, renderFinal, sleep } from "@/lib/recording";

const COUNTDOWN = 3;

type Step = "register" | "ready" | "running" | "result" | "error";
type Guest = { id: string; name: string };

export default function Page() {
  return (
    <ConfigGate>
      <Booth />
    </ConfigGate>
  );
}

function Booth() {
  const [step, setStep] = useState<Step>("register");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [guest, setGuest] = useState<Guest | null>(null);
  const [phase, setPhase] = useState("");
  const [percent, setPercent] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  const [rec, setRec] = useState<{ left: number; pct: number } | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<{ text: string; canRetry: boolean }>({ text: "", canRetry: false });

  const previewRef = useRef<HTMLVideoElement>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  const inBooth = step !== "register";

  // Start the camera once the guest has registered.
  useEffect(() => {
    if (!inBooth) return;
    let cancelled = false;
    (async () => {
      try {
        if (!streamRef.current) {
          streamRef.current = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: { ideal: "user" } }, // front camera; falls back to any camera (e.g. a laptop)
            audio: false,
          });
        }
        if (!cancelled && previewRef.current) previewRef.current.srcObject = streamRef.current;
      } catch (e) {
        setError({ text: (e as Error).message + " (the camera needs HTTPS and permission)", canRetry: false });
        setStep("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inBooth]);

  // Draw the QR code once the link is known.
  useEffect(() => {
    if (step === "result" && link && qrRef.current) {
      QRCode.toCanvas(qrRef.current, link, { width: 240, margin: 1 }).catch(() => {});
    }
  }, [step, link]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    []
  );

  function showResult(blob: Blob | null) {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = blob ? URL.createObjectURL(blob) : null;
    setResultUrl(resultUrlRef.current);
  }

  async function register(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote("Registering…");
    const row = { id: crypto.randomUUID(), name: name.trim() };
    // email/phone are blank: sent so older tables that still require them keep working
    const { error } = await getSupabase().from("sessions").insert({ ...row, email: "", phone: "" });
    setBusy(false);
    if (error) return setNote("Registration failed: " + error.message);
    setGuest(row);
    setNote("");
    setStep("ready");
  }

  async function upload(blob: Blob, id: string, path: string) {
    const sb = getSupabase();
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

  async function capture() {
    const stream = streamRef.current;
    if (!stream || !guest) return;
    setStep("running");
    setPhase("");
    setPercent(0);
    try {
      for (let i = COUNTDOWN; i > 0; i--) {
        setCount(i);
        await sleep(1000);
      }
      setCount(null);

      const video = previewRef.current;
      if (!video) throw new Error("Camera is not ready yet");
      const cap = await captureFrames(video, (left, pct) => setRec({ left, pct }));
      setRec(null);

      setPhase("Editing your video…");
      const final = await renderFinal(cap, pct => setPercent(Math.round(pct)));
      if (!final.size) throw new Error("The edited video came out empty");

      // The file name is known before the upload finishes, so the QR code can be shown straight away.
      const ext = final.type.includes("mp4") ? "mp4" : "webm";
      const path = `${guest.id}-${Date.now()}.${ext}`;
      showResult(final);
      setLink(`${location.origin}/v?f=${encodeURIComponent(path)}`);
      setUploaded(false);
      setStep("result");

      await upload(final, guest.id, path);
      setUploaded(true);
    } catch (e) {
      const text = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
      console.error(e);
      setCount(null);
      setRec(null);
      showResult(null);
      setError({ text, canRetry: true });
      setStep("error");
    }
  }

  function nextPerson() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    showResult(null);
    setGuest(null);
    setName("");
    setLink(null);
    setUploaded(false);
    setNote("");
    setStep("register");
  }

  if (step === "register") {
    return (
      <div className="page">
        <form className="card boxed" onSubmit={register}>
          <Logo className="brand" priority />
          <h1>Welcome 👋</h1>
          <p className="lead">Enter your name to start your video.</p>
          <label htmlFor="name">Name</label>
          <input id="name" autoComplete="name" required autoFocus value={name} onChange={e => setName(e.target.value)} />
          <button type="submit" disabled={busy}>Start</button>
          <div className="note">{note}</div>
        </form>
      </div>
    );
  }

  return (
    <div className={`camera ${step === "result" ? "has-result" : ""}`}>
      <video ref={previewRef} className="preview" autoPlay muted playsInline />
      {step === "result" && resultUrl && <video className="result" src={resultUrl} autoPlay muted loop playsInline />}

      {step !== "result" && (
        <div className="badge">
          <Logo />
        </div>
      )}

      {step === "ready" && (
        <div className="overlay msg clear">
          <h1>Hi {guest?.name}!</h1>
          <p>Get in position, then press the button.</p>
          <button onClick={capture}>Start Capture</button>
        </div>
      )}

      {step === "running" && count === null && !rec && (
        <div className="overlay msg">
          <div className="spinner" />
          <h1>{phase || "Get ready…"}</h1>
          {phase && <p>Adding slow motion and logos… {percent}%</p>}
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

      {step === "result" && (
        <div className="overlay msg">
          <Logo className="brand" />
          <h1>{uploaded ? "Scan to download" : "Your video is ready!"}</h1>
          <canvas ref={qrRef} className="qr" />
          <p>
            {uploaded
              ? "Uploaded! Scan this QR code with your phone."
              : "Uploading… scan now, your video will be ready in a moment."}
          </p>
          <button className="secondary" onClick={nextPerson}>Next person</button>
        </div>
      )}

      {step === "error" && (
        <div className="overlay msg">
          <h1>Something went wrong</h1>
          <p>{error.text}</p>
          {error.canRetry && <button onClick={() => setStep("ready")}>Try again</button>}
          <button className="secondary" onClick={nextPerson}>Start over</button>
        </div>
      )}
    </div>
  );
}
