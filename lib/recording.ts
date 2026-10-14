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

// White logos shown at the bottom centre of the video, one after another.
const OVERLAY_LOGOS = ["/logos/proud2026-white.png", "/logos/proud-white.png", "/logos/dha-white.png"];
const FADE = 0.45; // seconds to fade each logo in and out

async function loadLogos(): Promise<HTMLImageElement[]> {
  const load = (src: string) =>
    new Promise<HTMLImageElement | null>(res => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = src;
    });
  return (await Promise.all(OVERLAY_LOGOS.map(load))).filter((i): i is HTMLImageElement => !!i);
}

/** Bottom scrim + the logo for the current third of the timeline, faded in and out. */
function drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, total: number, logos: HTMLImageElement[]) {
  if (!logos.length) return;
  const scrimH = h * 0.28;
  const g = ctx.createLinearGradient(0, h - scrimH, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = g;
  ctx.fillRect(0, h - scrimH, w, scrimH);

  const seg = total / logos.length;
  const idx = Math.min(logos.length - 1, Math.floor(t / seg));
  const local = t - idx * seg;
  const alpha = Math.max(0, Math.min(1, local / FADE, (seg - local) / FADE));
  if (alpha <= 0) return;

  const img = logos[idx];
  const maxW = w * 0.42, maxH = h * 0.14;
  const k = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const lw = img.naturalWidth * k, lh = img.naturalHeight * k;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = h * 0.012;
  ctx.drawImage(img, (w - lw) / 2, h - lh - h * 0.06, lw, lh);
  ctx.restore();
}

/** Replays the clip onto a canvas: normal speed, then slow motion for the last SLOW_SECONDS. */
export async function applySlowMo(blob: Blob): Promise<Blob> {
  const v = document.createElement("video");
  // iOS/Safari only allow script-started playback with these as real attributes, and on a visible element
  v.setAttribute("muted", "");
  v.setAttribute("playsinline", "");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.style.cssText = "position:fixed;left:0;bottom:0;width:160px;height:90px;opacity:0.01;pointer-events:none;z-index:-1";
  const srcUrl = URL.createObjectURL(blob);
  v.src = srcUrl;
  document.body.appendChild(v);
  await new Promise<void>((res, rej) => {
    v.onloadedmetadata = () => res();
    v.onerror = () => rej(new Error("Could not read recording"));
  });

  const logos = await loadLogos();
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
  const total = slowAt + SLOW_SECONDS / SLOW_RATE; // length of the finished video
  let t0 = 0;
  const draw = () => {
    if (stopped) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    drawOverlay(ctx, canvas.width, canvas.height, (performance.now() - t0) / 1000, total, logos);
    if (v.currentTime >= slowAt && v.playbackRate !== SLOW_RATE) v.playbackRate = SLOW_RATE;
    requestAnimationFrame(draw);
  };
  v.onended = stop;
  setTimeout(stop, (slowAt + SLOW_SECONDS / SLOW_RATE + 8) * 1000); // safety net

  rec.start(1000);
  try {
    await v.play();
  } catch (e) {
    stopped = true;
    rec.stop();
    v.remove();
    URL.revokeObjectURL(srcUrl);
    throw e;
  }
  t0 = performance.now();
  draw();
  const out = await finished;
  v.remove();
  URL.revokeObjectURL(srcUrl);
  return out;
}
