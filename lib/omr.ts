/**
 * 템플릿 기반 OMR 읽기 (Node.js / Vercel)
 * 40문항 4지선다 - 2열 레이아웃 (1~20 왼쪽, 21~40 오른쪽)
 */
import sharp from "sharp";

const NUM_QUESTIONS = 40;
const CHOICES_PER_QUESTION = 4;

// OMR 카드: 상단(이름/사번) ~55%, 답안 영역 55%~95%
// 2열: 왼쪽 1~20번, 오른쪽 21~40번
const ANSWER_TOP = 0.55;
const ANSWER_BOTTOM = 0.95;
const ROWS_PER_COL = 20;

function getBubblePositions(width: number, height: number) {
  const positions: { q: number; c: number; x: number; y: number }[] = [];
  const y0 = height * ANSWER_TOP;
  const y1 = height * ANSWER_BOTTOM;
  const rowHeight = (y1 - y0) / ROWS_PER_COL;

  // 왼쪽 열: 1~20번
  const leftX0 = width * 0.08;
  const leftX1 = width * 0.42;
  const leftColWidth = (leftX1 - leftX0) / CHOICES_PER_QUESTION;
  for (let r = 0; r < ROWS_PER_COL; r++) {
    for (let c = 0; c < CHOICES_PER_QUESTION; c++) {
      const x = leftX0 + leftColWidth * (c + 0.5);
      const y = y0 + rowHeight * (r + 0.5);
      positions.push({ q: r + 1, c: c + 1, x: Math.round(x), y: Math.round(y) });
    }
  }

  // 오른쪽 열: 21~40번
  const rightX0 = width * 0.52;
  const rightX1 = width * 0.92;
  const rightColWidth = (rightX1 - rightX0) / CHOICES_PER_QUESTION;
  for (let r = 0; r < ROWS_PER_COL; r++) {
    for (let c = 0; c < CHOICES_PER_QUESTION; c++) {
      const x = rightX0 + rightColWidth * (c + 0.5);
      const y = y0 + rowHeight * (r + 0.5);
      positions.push({ q: ROWS_PER_COL + r + 1, c: c + 1, x: Math.round(x), y: Math.round(y) });
    }
  }

  return positions;
}

/** 버블 반경 (샘플링 영역) */
function getBubbleRadius(width: number, height: number): number {
  const minDim = Math.min(width, height);
  return Math.max(12, Math.floor(minDim * 0.02));
}

/** 원형 영역 내 어두운 픽셀 비율 (raw 버퍼에서 샘플링) */
function getDarknessFromRaw(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  cx: number,
  cy: number,
  r: number
): number {
  let dark = 0;
  let total = 0;
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = Math.round(cx) + dx;
      const y = Math.round(cy) + dy;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const i = (y * width + x) * channels;
      const rv = data[i];
      const gv = channels > 1 ? data[i + 1] : rv;
      const bv = channels > 2 ? data[i + 2] : rv;
      const gray = 0.299 * rv + 0.587 * gv + 0.114 * bv;
      total++;
      if (gray < 200) dark++;
    }
  }
  return total > 0 ? dark / total : 0;
}

export interface OMRResult {
  answers: number[];
  studentAnswers: string;
}

export async function readOMRFromBuffer(
  buffer: Buffer,
  filledThreshold = 0.32
): Promise<OMRResult> {
  const image = sharp(buffer);
  const meta = await image.metadata();
  let w = meta.width ?? 2480;
  let h = meta.height ?? 3508;

  const maxDim = 2480;
  if (w > maxDim || h > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    image.resize(w, h);
  }

  const { data, info } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;

  const positions = getBubblePositions(w, h);
  const radius = getBubbleRadius(w, h);

  const answers: number[] = new Array(NUM_QUESTIONS).fill(0);

  for (let i = 0; i < NUM_QUESTIONS; i++) {
    const rowPositions = positions.filter((p) => p.q === i + 1);
    let bestChoice = 0;
    let bestDarkness = 0;

    for (const pos of rowPositions) {
      const darkness = getDarknessFromRaw(
        data,
        w,
        h,
        channels,
        pos.x,
        pos.y,
        radius
      );
      if (darkness >= filledThreshold && darkness > bestDarkness) {
        bestDarkness = darkness;
        bestChoice = pos.c;
      }
    }
    answers[i] = bestChoice;
  }

  const studentAnswers = answers.map((a) => (a === 0 ? "" : String(a))).join(",");

  return { answers, studentAnswers };
}
