"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { getSupabase, CHANNEL } from "@/lib/supabase";
import ConfigGate from "@/components/ConfigGate";

type Step = "form" | "ready" | "progress" | "result";
type Guest = { id: string; name: string };

const STATES: Record<string, [string, string]> = {
  countdown: ["Get ready!", "Look at the camera."],
  recording: ["Recording…", "Smile and move!"],
  processing: ["Adding slow motion…", "About 15 seconds."],
  uploading: ["Uploading…", "Almost done."],
};

export default function RegisterPage() {
  return (
    <ConfigGate>
      <Register />
    </ConfigGate>
  );
}

function Register() {
  const [step, setStep] = useState<Step>("form");
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; err?: boolean }>({ text: "" });
  const [progress, setProgress] = useState<[string, string]>(["", ""]);
  const [link, setLink] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [guest, setGuest] = useState<Guest | null>(null);

  const guestRef = useRef<Guest | null>(null);
  const sendRef = useRef<(event: string, payload?: object) => void>(() => {});
  const ackTimer = useRef<ReturnType<typeof setTimeout>>();
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const sb = getSupabase();
    const ch = sb.channel(CHANNEL, { config: { broadcast: { self: false } } });
    sendRef.current = (event, payload = {}) => void ch.send({ type: "broadcast", event, payload });
    const mine = (p: { id: string }) => guestRef.current?.id === p.id;

    ch.on("broadcast", { event: "hello" }, () => {
      // camera (re)loaded: tell it who is registered right now
      if (guestRef.current) sendRef.current("registered", guestRef.current);
    })
      .on("broadcast", { event: "status" }, ({ payload }) => {
        if (!mine(payload)) return;
        clearTimeout(ackTimer.current);
        setProgress(STATES[payload.state] ?? ["Working…", ""]);
        setStep("progress");
        setNote({ text: "" });
      })
      .on("broadcast", { event: "ready" }, ({ payload }) => {
        if (!mine(payload)) return;
        // The QR points to a page that waits for the upload to finish, so it can be scanned right away.
        setLink(`${location.origin}/v?f=${encodeURIComponent(payload.path)}`);
        setUploaded(false);
        setStep("result");
        setNote({ text: "" });
      })
      .on("broadcast", { event: "done" }, ({ payload }) => {
        if (mine(payload)) setUploaded(true);
      })
      .on("broadcast", { event: "error" }, ({ payload }) => {
        if (!mine(payload)) return;
        clearTimeout(ackTimer.current);
        setStep("ready");
        setNote({ text: "Capture failed: " + payload.message, err: true });
      })
      .subscribe();

    return () => {
      sb.removeChannel(ch);
    };
  }, []);

  useEffect(() => {
    if (step === "result" && link && qrRef.current) {
      QRCode.toCanvas(qrRef.current, link, { width: 280, margin: 1 }).catch(e =>
        setNote({ text: "QR failed: " + e, err: true })
      );
    }
  }, [step, link]);

  async function register(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote({ text: "Registering…" });
    const row = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
    };
    const { error } = await getSupabase().from("sessions").insert(row);
    setBusy(false);
    if (error) return setNote({ text: "Registration failed: " + error.message, err: true });
    const g = { id: row.id, name: row.name };
    guestRef.current = g;
    setGuest(g);
    sendRef.current("registered", g);
    setStep("ready");
    setNote({ text: "" });
  }

  function startCapture() {
    if (!guestRef.current) return;
    setBusy(true);
    setNote({ text: "Contacting camera…" });
    sendRef.current("capture", { id: guestRef.current.id });
    ackTimer.current = setTimeout(() => {
      setBusy(false);
      setNote({ text: "Camera isn't responding. Is the camera app open?", err: true });
    }, 5000);
  }

  function nextPerson() {
    guestRef.current = null;
    setGuest(null);
    sendRef.current("reset");
    setForm({ name: "", email: "", phone: "" });
    setLink(null);
    setBusy(false);
    setStep("form");
    setNote({ text: "" });
  }

  // re-enable the button whenever we come back to the ready step
  useEffect(() => {
    if (step === "ready") setBusy(false);
  }, [step]);

  return (
    <div className="page">
      <div className="card boxed">
        {step === "form" && (
          <form onSubmit={register}>
            <h1>Welcome 👋</h1>
            <p className="lead">Register to start your video.</p>
            <label htmlFor="name">Name</label>
            <input id="name" autoComplete="name" required value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" required value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })} />
            <label htmlFor="phone">Phone</label>
            <input id="phone" type="tel" autoComplete="tel" required value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })} />
            <button type="submit" disabled={busy}>Register</button>
          </form>
        )}

        {step === "ready" && (
          <div>
            <h1>Hi {guest?.name}!</h1>
            <p className="lead">You&apos;re registered. Get in front of the camera and press the button.</p>
            <button onClick={startCapture} disabled={busy}>Start Capture</button>
          </div>
        )}

        {step === "progress" && (
          <div>
            <h1>{progress[0]}</h1>
            <p className="lead">{progress[1]}</p>
          </div>
        )}

        {step === "result" && (
          <div>
            <h1>Your video is ready 🎉</h1>
            <p className="lead">
              {uploaded
                ? "Uploaded! Scan this QR code to download your video."
                : "Scan this QR code with your phone. Your video will be ready in a moment."}
            </p>
            <canvas ref={qrRef} className="qr" />
            <button className="secondary" onClick={nextPerson}>Next person</button>
          </div>
        )}

        <div className={`note ${note.err ? "err" : ""}`}>{note.text}</div>
      </div>
    </div>
  );
}
