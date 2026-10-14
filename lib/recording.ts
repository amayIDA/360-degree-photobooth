export const DURATION = 10; // seconds captured
export const SLOW_SECONDS = 5; // the last N captured seconds are played in slow motion
export const SLOW_RATE = 0.5;
export const FPS = 30;
export const UPLOAD_BPS = 2_500_000; // smaller file = faster upload (about 5 MB for the 15 s clip)

const SLOW_AT = DURATION - SLOW_SECONDS;
/** Length of the finished video: 5 s normal + 5 s of footage stretched to 10 s. */
export const OUTPUT_SECONDS = SLOW_AT + SLOW_SECONDS / SLOW_RATE;

// White logos shown at the bottom centre of the video, one after another.
const OVERLAY_LOGOS = ["/logos/proud2026-white.png", "/logos/proud-white.png", "/logos/dha-white.png"];
const LOGO_FADE = 0.45; // seconds to fade each logo in and out
const EDGE_FADE = 0.25; // fade from / to black at the very start and end

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function pickMime(): string {
  const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return types.find(t => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

type Frame = { t: number; blob: Blob };
export type Capture = { frames: Frame[]; width: number; height: number };

/**
 * Phase 1: grabs ~30 frames per second from the live preview for DURATION seconds and keeps them as JPEGs.
 * Reading frames from the playing preview works in every browser, unlike replaying a recorded clip from script
 * (which iOS blocks), and gives the editor exact timestamps to re-time.
 */
export function captureFrames(video: HTMLVideoElement, onTick: (secondsLeft: number, percent: number) => void): Promise<Capture> {
  return new Promise((resolve, reject) => {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return reject(new Error("Camera is not ready yet"));
    const scale = Math.min(1, 1280 / vw);
    const width = Math.round(vw * scale) & ~1;
    const height = Math.round(vh * scale) & ~1;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    const frames: Frame[] = [];
    const t0 = performance.now();
    let last = -1, pending = 0, finished = false;
    const finish = () => {
      if (!finished || pending > 0) return;
      frames.sort((a, b) => a.t - b.t);
      if (frames.length < 2) return reject(new Error("No video frames were captured"));
      resolve({ frames, width, height });
    };

    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      if (t >= DURATION) {
        finished = true;
        onTick(0, 100);
        return finish();
      }
      if (t - last >= 1 / FPS - 0.005) {
        last = t;
        ctx.drawImage(video, 0, 0, width, height);
        pending++;
        canvas.toBlob(
          b => {
            if (b) frames.push({ t, blob: b });
            pending--;
            finish();
          },
          "image/jpeg",
          0.85
        );
      }
      onTick(Math.max(0, Math.ceil(DURATION - t)), (t / DURATION) * 100);
      setTimeout(loop, 1000 / FPS / 2); // timer, not requestAnimationFrame: that is paused for hidden tabs
    };
    loop();
  });
}

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
function drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, logos: HTMLImageElement[]) {
  if (!logos.length) return;
  const scrimH = h * 0.28;
  const g = ctx.createLinearGradient(0, h - scrimH, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = g;
  ctx.fillRect(0, h - scrimH, w, scrimH);

  const seg = OUTPUT_SECONDS / logos.length;
  const idx = Math.min(logos.length - 1, Math.floor(t / seg));
  const local = t - idx * seg;
  const alpha = Math.max(0, Math.min(1, local / LOGO_FADE, (seg - local) / LOGO_FADE));
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

/** Output time (s) to captured time (s): normal speed first, then slow motion. */
const sourceTime = (t: number) => (t < SLOW_AT ? t : SLOW_AT + (t - SLOW_AT) * SLOW_RATE);

/**
 * Phase 2: edits the captured frames into the finished video and records it.
 * - last SLOW_SECONDS in slow motion, with frame blending so it stays smooth instead of stuttering
 * - logos fading in and out one after another at the bottom centre
 * - short fade from and to black
 */
export async function renderFinal(cap: Capture, onProgress?: (percent: number) => void): Promise<Blob> {
  const { frames, width, height } = cap;
  const logos = await loadLogos();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const bitmaps = new Map<number, ImageBitmap>();
  const bitmap = async (i: number) => {
    let b = bitmaps.get(i);
    if (!b) {
      b = await createImageBitmap(frames[i].blob);
      bitmaps.set(i, b);
      for (const [k, v] of bitmaps) if (k < i - 2) { v.close(); bitmaps.delete(k); }
    }
    return b;
  };

  // paint the first frame before recording starts so the stream never begins empty
  ctx.drawImage(await bitmap(0), 0, 0, width, height);

  const mimeType = pickMime();
  const rec = new MediaRecorder(canvas.captureStream(FPS), mimeType ? { mimeType, videoBitsPerSecond: UPLOAD_BPS } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const finished = new Promise<Blob>(r => {
    rec.onstop = () => r(new Blob(chunks, { type: rec.mimeType }));
  });
  rec.start(1000);

  const lastT = frames[frames.length - 1].t;
  const start = performance.now();
  let idx = 0;
  try {
    for (let k = 0; ; k++) {
      const t = k / FPS;
      if (t >= OUTPUT_SECONDS) break;
      const s = Math.min(sourceTime(t), lastT);
      while (idx < frames.length - 2 && frames[idx + 1].t <= s) idx++;

      // Load everything this frame needs BEFORE drawing: awaiting in the middle of a draw lets the recorder
      // capture a half-painted canvas (a frame without logos).
      const a = await bitmap(idx);
      let blend: ImageBitmap | null = null;
      let w = 0;
      if (t >= SLOW_AT) {
        const f0 = frames[idx].t, f1 = frames[idx + 1].t;
        w = Math.min(1, Math.max(0, (s - f0) / (f1 - f0 || 1)));
        if (w > 0.02) blend = await bitmap(idx + 1);
      }

      ctx.globalAlpha = 1;
      ctx.drawImage(a, 0, 0, width, height);
      if (blend) {
        ctx.globalAlpha = w;
        ctx.drawImage(blend, 0, 0, width, height);
        ctx.globalAlpha = 1;
      }

      drawOverlay(ctx, width, height, t, logos);

      const fade = Math.min(1, t / EDGE_FADE, (OUTPUT_SECONDS - t) / EDGE_FADE);
      if (fade < 1) {
        ctx.fillStyle = `rgba(0,0,0,${1 - fade})`;
        ctx.fillRect(0, 0, width, height);
      }

      onProgress?.((t / OUTPUT_SECONDS) * 100);
      const wait = start + ((k + 1) / FPS) * 1000 - performance.now(); // keep real-time pace for the recorder
      if (wait > 0) await sleep(wait);
    }
    await sleep(250);
  } finally {
    if (rec.state !== "inactive") rec.stop();
    bitmaps.forEach(b => b.close());
    bitmaps.clear();
  }
  return finished;
}
