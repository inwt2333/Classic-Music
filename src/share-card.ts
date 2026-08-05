import QRCode from "qrcode";
import type { ConcertEvent } from "./types";
import { formatEventVenue } from "./utils";

const cardWidth = 1080;
const cardHeight = 1440;
const coverHeight = 320;
const coverImagePromise = loadCoverImage();
const qrCanvasCache = new Map<string, Promise<HTMLCanvasElement>>();

export async function createEventShareCard(event: ConcertEvent, eventUrl: string) {
  const canvas = document.createElement("canvas");
  canvas.width = cardWidth;
  canvas.height = cardHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法生成分享图片");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#eef1ed";
  context.fillRect(0, 0, cardWidth, cardHeight);
  await drawCover(context);

  context.fillStyle = "#ffffff";
  context.fillRect(64, 260, 952, 1120);
  context.fillStyle = "#934454";
  context.fillRect(64, 260, 10, 1120);

  context.fillStyle = "#2f6e66";
  context.font = font(700, 28);
  context.fillText("古典乐演出日历", 118, 332);
  context.fillStyle = "#7b8782";
  context.font = font(400, 21);
  context.textAlign = "right";
  context.fillText(event.sourceName, 954, 332);
  context.textAlign = "left";

  context.fillStyle = "#202725";
  context.font = font(700, 49);
  drawWrappedText(context, event.title, 118, 408, 836, 61, 3);

  context.fillStyle = "#edf3f0";
  context.fillRect(104, 575, 872, 100);
  context.fillStyle = "#883c4b";
  context.font = font(700, 36);
  context.fillText(formatCardDate(event), 130, 637);
  context.textAlign = "right";
  context.fillStyle = "#26312e";
  context.font = font(700, 28);
  context.fillText(event.price || "票价待公布", 946, 635);
  context.textAlign = "left";

  context.fillStyle = "#6e7975";
  context.font = font(600, 20);
  context.fillText("地点", 118, 721);
  context.fillStyle = "#27312e";
  context.font = font(500, 29);
  drawWrappedText(context, `${event.city} · ${formatEventVenue(event)}`, 118, 763, 836, 40, 2);

  drawDivider(context, 822);
  context.fillStyle = "#2f6e66";
  context.font = font(700, 24);
  context.fillText("人物与乐团", 118, 862);
  drawInfoRow(context, "乐团", event.ensemble || "待公布", 900, 2);
  drawInfoRow(context, "指挥", event.conductor || "待公布", 980, 1);
  drawInfoRow(context, "演奏", formatPerformers(event.performers), 1030, 2);

  drawDivider(context, 1100);
  context.fillStyle = "#2f6e66";
  context.font = font(700, 24);
  context.fillText("核心曲目", 118, 1142);

  context.fillStyle = "#38433f";
  context.font = font(500, 23);
  if (event.program.length) {
    event.program.slice(0, 3).forEach((item, index) => {
      const label = `${item.composer ? `${item.composer} · ` : ""}${item.title}`;
      context.fillStyle = "#934454";
      context.fillRect(118, 1182 + index * 43, 7, 7);
      context.fillStyle = "#38433f";
      drawSingleLine(context, label, 142, 1192 + index * 43, 600);
    });
  } else {
    context.fillStyle = "#7b8782";
    context.fillText("节目单待公布", 118, 1192);
  }

  const qrCanvas = await getQrCanvas(eventUrl);
  context.drawImage(qrCanvas, 800, 1150, 166, 166);
  context.fillStyle = "#6f7a76";
  context.font = font(400, 18);
  context.textAlign = "center";
  context.fillText("扫码查看详情", 883, 1340);
  context.textAlign = "left";

  context.fillStyle = "#8a9490";
  context.font = font(400, 17);
  drawSingleLine(context, `数据来源：${event.sourceName}`, 118, 1350, 610);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("分享图片生成失败")),
      "image/png",
    );
  });
}

async function drawCover(context: CanvasRenderingContext2D) {
  try {
    const image = await coverImagePromise;
    const sourceRatio = image.width / image.height;
    const targetRatio = cardWidth / coverHeight;
    const sourceWidth = sourceRatio > targetRatio ? image.height * targetRatio : image.width;
    const sourceHeight = sourceRatio > targetRatio ? image.height : image.width / targetRatio;
    context.drawImage(
      image,
      (image.width - sourceWidth) / 2,
      (image.height - sourceHeight) / 2,
      sourceWidth,
      sourceHeight,
      0,
      0,
      cardWidth,
      coverHeight,
    );
    context.fillStyle = "rgba(18, 31, 27, 0.42)";
    context.fillRect(0, 0, cardWidth, coverHeight);
  } catch {
    context.fillStyle = "#1d302d";
    context.fillRect(0, 0, cardWidth, coverHeight);
  }
}

function loadCoverImage() {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("封面图片加载失败"));
    image.src = `${import.meta.env.BASE_URL}images/concert-orchestra.webp`;
  });
}

function getQrCanvas(eventUrl: string) {
  const cached = qrCanvasCache.get(eventUrl);
  if (cached) return cached;
  const pending = (async () => {
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, eventUrl, {
      width: 166,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#1d302d", light: "#ffffff" },
    });
    return canvas;
  })();
  qrCanvasCache.set(eventUrl, pending);
  if (qrCanvasCache.size > 12) qrCanvasCache.delete(qrCanvasCache.keys().next().value!);
  return pending;
}

function drawInfoRow(
  context: CanvasRenderingContext2D,
  label: string,
  value: string,
  y: number,
  maxLines: number,
) {
  context.fillStyle = "#7b8782";
  context.font = font(600, 20);
  context.fillText(label, 118, y);
  context.fillStyle = "#303a37";
  context.font = font(500, 24);
  drawWrappedText(context, value, 220, y, 734, 32, maxLines);
}

function drawDivider(context: CanvasRenderingContext2D, y: number) {
  context.fillStyle = "#e2e7e4";
  context.fillRect(118, y, 836, 2);
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const characters = Array.from(compact(text));
  const lines: string[] = [];
  let line = "";
  let truncated = false;
  for (const character of characters) {
    const next = line + character;
    if (context.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = character;
      if (lines.length === maxLines) {
        truncated = true;
        break;
      }
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (truncated && lines.length) lines[lines.length - 1] = ellipsize(context, lines.at(-1)!, maxWidth);
  lines.forEach((value, index) => context.fillText(value, x, y + index * lineHeight));
}

function drawSingleLine(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
) {
  context.fillText(ellipsize(context, compact(text), maxWidth), x, y);
}

function ellipsize(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text;
  const characters = Array.from(text);
  while (characters.length && context.measureText(`${characters.join("")}…`).width > maxWidth) characters.pop();
  return `${characters.join("")}…`;
}

function formatCardDate(event: ConcertEvent) {
  const date = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(event.startTime));
  return date.replace(/\//g, ".");
}

function formatPerformers(performers: string[]) {
  return performers.length ? performers.slice(0, 5).join("、") : "待公布";
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function font(weight: number, size: number) {
  return `${weight} ${size}px Microsoft YaHei, Noto Sans SC, sans-serif`;
}
