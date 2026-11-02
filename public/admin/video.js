// Everything that happens to a video on the professional's own computer, before upload.
import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, Quality } from "./vendor/mediabunny.min.mjs";

const LONG_EDGE = 1920;              // the same 1080p size as the existing clips
const TARGET_BITRATE = 4_500_000;    // matches the README's "14 seconds under about 8 MB"
const COPY_BITRATE_LIMIT = 6_000_000; // files already this small are left at their current quality
const MAX_SECONDS = 20 * 60;         // the finished file is held in memory while it is built

const UNREADABLE = "This browser can't read that video. Export it as an H.264 MP4 and try again.";

/** Loads a local file into the preview player. Rejects if the browser can't decode it. */
export function loadPreview(video, url) {
  return new Promise((resolve, reject) => {
    const done = () => { video.removeEventListener("loadeddata", ok); video.removeEventListener("error", bad); clearTimeout(timer); };
    const ok = () => {
      done();
      // Some formats (often iPhone HEVC on Windows) load with sound but no picture
      if (!video.videoWidth || !video.videoHeight) return reject(new Error(UNREADABLE));
      resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
    };
    const bad = () => { done(); reject(new Error(UNREADABLE)); };
    const timer = setTimeout(bad, 30000);
    video.addEventListener("loadeddata", ok);
    video.addEventListener("error", bad);
    video.muted = true;
    video.src = url;
  });
}

const whenSeeked = (video) => new Promise((resolve) => {
  if (!video.seeking && video.readyState >= 2) return resolve();
  const timer = setTimeout(resolve, 8000);
  video.addEventListener("seeked", () => { clearTimeout(timer); resolve(); }, { once: true });
});

const toJpeg = (canvas, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't create the cover image."))), "image/jpeg", quality);
});

function drawScaled(video, longEdge) {
  const scale = Math.min(1, longEdge / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** A soft, properly blurred copy of the frame. Stretching a small unblurred image looks blocky. */
function drawBlurred(video, longEdge) {
  const canvas = drawScaled(video, longEdge);
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext("2d");
  const blur = Math.round(longEdge / 24);
  ctx.imageSmoothingQuality = "high";
  if ("filter" in ctx) {
    ctx.filter = `blur(${blur}px)`;
    const pad = blur * 3; // draw past the edges, so the blur doesn't fade to black there
    ctx.drawImage(video, -pad, -pad, w + pad * 2, h + pad * 2);
    ctx.filter = "none";
  } else { // Safari: shrinking a lot and enlarging again gives a similar softness
    const tiny = drawScaled(video, 24);
    ctx.drawImage(tiny, 0, 0, w, h);
  }
  return canvas;
}

/** Creates the still and the blurred-background image from the frame on screen. */
export async function makeCovers(video) {
  await whenSeeked(video);
  return {
    poster: await toJpeg(drawScaled(video, LONG_EDGE), 0.82),
    bg: await toJpeg(drawBlurred(video, 720), 0.85),
  };
}

const even = (n) => Math.max(2, Math.round(n / 2) * 2); // the H.264 format needs even dimensions

/** Produces an MP4 that starts playing straight away, shrunk only if it needs to be. */
export async function compressVideo(file, { start, end, trimmed, keepSound, job, onProgress }) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const stop = () => input.dispose?.();
  try {
    let track;
    try { track = await input.getPrimaryVideoTrack(); } catch { throw new Error(UNREADABLE); }
    if (!track) throw new Error(UNREADABLE);

    const seconds = end - start;
    if (seconds > MAX_SECONDS) {
      throw new Error("Videos over 20 minutes are too long to process here. Set a start and end to upload a short preview, and add the full film as a Vimeo or YouTube link.");
    }

    const w = track.displayWidth, h = track.displayHeight;
    const scale = Math.min(1, LONG_EDGE / Math.max(w, h));
    const width = even(w * scale), height = even(h * scale);
    const codec = await track.getCodec();
    const bitrate = (file.size * 8) / Math.max(1, await input.computeDuration());
    const reencode = codec !== "avc" || scale < 1 || bitrate > COPY_BITRATE_LIMIT || trimmed;

    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      ...(trimmed ? { trim: { start, end } } : {}),
      video: reencode
        ? { codec: "avc", width, height, fit: "fill", quality: new Quality({ bitrate: Math.min(TARGET_BITRATE, Math.max(bitrate, 1_000_000)) }), forceTranscode: true }
        : {},
      audio: keepSound ? { codec: "aac" } : { discard: true },
    });

    if (!conversion.isValid) {
      const noEncoder = conversion.discardedTracks.some((d) => d.track.type === "video" && d.reason !== "discarded_by_user");
      throw new Error(noEncoder ? "This browser can't compress video. Please use a current version of Chrome or Edge." : UNREADABLE);
    }
    const soundDropped = keepSound && conversion.discardedTracks.some((d) => d.track.type === "audio");

    if (job) job.stop = () => conversion.cancel();
    conversion.onProgress = (p) => onProgress?.(Math.min(0.99, p));
    await conversion.execute();

    return {
      blob: new Blob([output.target.buffer], { type: "video/mp4" }),
      width: reencode ? width : w,
      height: reencode ? height : h,
      duration: seconds,
      soundDropped,
    };
  } finally {
    stop();
  }
}
