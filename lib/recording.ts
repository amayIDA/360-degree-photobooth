export const DURATION = 10; // seconds recorded
export const SLOW_SECONDS = 5; // last N seconds are slowed down
export const SLOW_RATE = 0.5;
const RAW_BPS = 6_000_000; // quality of the local recording
export const UPLOAD_BPS = 2_000_000; // smaller file = faster upload (about 4 MB for the 15 s clip)

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function pickMime(): string {
  const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return types.find(t => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

function makeRecorder(s: MediaStream, bps: number) {
  const mimeType = pickMime();
  return new MediaRecorder(s, mimeType ? { mimeType, videoBitsPerSecond: bps } : undefined);
}

/** Records the camera stream for DURATION seconds. */
export function record(stream: MediaStream, onTick: (secondsLeft: number, percent: number) => void): Promise<Blob> {
  return new Promise(resolve => {
    const rec = makeRecorder(stream, RAW_BPS);
    const chunks: Blob[] = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const t0 = performance.now();
    const tick = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      onTick(Math.max(0, Math.ceil(DURATION - s)), Math.min(100, (s / DURATION) * 100));
    }, 100);
    rec.onstop = () => {
      clearInterval(tick);
      resolve(new Blob(chunks, { type: rec.mimeType }));
    };
    rec.start(1000);
    setTimeout(() => rec.stop(), DURATION * 1000);
  });
}

/** Replays the clip onto a canvas: normal speed, then slow motion for the last SLOW_SECONDS. */
export async function applySlowMo(blob: Blob): Promise<Blob> {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.style.cssText = "position:fixed;width:2px;height:2px;opacity:0;pointer-events:none";
  const srcUrl = URL.createObjectURL(blob);
  v.src = srcUrl;
  document.body.appendChild(v);
  await new Promise<void>((res, rej) => {
    v.onloadedmetadata = () => res();
    v.onerror = () => rej(new Error("Could not read recording"));
  });

  const scale = Math.min(1, 1280 / v.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(v.videoWidth * scale) & ~1;
  canvas.height = Math.round(v.videoHeight * scale) & ~1;
  const ctx = canvas.getContext("2d")!;

  const rec = makeRecorder(canvas.captureStream(30), UPLOAD_BPS);
  const chunks: Blob[] = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const finished = new Promise<Blob>(r => {
    rec.onstop = () => r(new Blob(chunks, { type: rec.mimeType }));
  });

  const slowAt = DURATION - SLOW_SECONDS;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    setTimeout(() => rec.stop(), 150);
  };
  const draw = () => {
    if (stopped) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    if (v.currentTime >= slowAt && v.playbackRate !== SLOW_RATE) v.playbackRate = SLOW_RATE;
    requestAnimationFrame(draw);
  };
  v.onended = stop;
  setTimeout(stop, (slowAt + SLOW_SECONDS / SLOW_RATE + 8) * 1000); // safety net

  rec.start(1000);
  await v.play();
  draw();
  const out = await finished;
  v.remove();
  URL.revokeObjectURL(srcUrl);
  return out;
}
