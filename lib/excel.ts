/**
 * 평가결과 형식 엑셀 생성
 */
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

export interface ExamineeRow {
  id: string;
  name: string;
  phone?: string;
}

export interface OMRGradeResult {
  filename: string;
  answers: number[];
  studentAnswers: string;
  score: number;
  correctCount: number;
  wrongCount: number;
  wrongQuestions: number[];
}

export interface EvaluationRow {
  시험일자: string;
  파일명: string;
  전화번호: string;
  학생명: string;
  점수: number;
  등급: number;
  맞은갯수: number;
  틀린갯수: number;
  틀린문항: string;
  학생번호: string;
  시험번호: string;
  저장완료: string;
  SMS: string;
  학생이작성한답: string;
  시험명: string;
  채점오류내역: string;
  기타정보: string;
}

const HEADERS: (keyof EvaluationRow)[] = [
  "시험일자",
  "파일명",
  "전화번호",
  "학생명",
  "점수",
  "등급",
  "맞은갯수",
  "틀린갯수",
  "틀린문항",
  "학생번호",
  "시험번호",
  "저장완료",
  "SMS",
  "학생이작성한답",
  "시험명",
  "채점오류내역",
  "기타정보",
];

export function gradeAnswers(
  answers: number[],
  answerKey: number[],
  pointsPerQuestion = 1
): { score: number; correctCount: number; wrongCount: number; wrongQuestions: number[] } {
  let correctCount = 0;
  const wrongQuestions: number[] = [];
  const n = Math.min(answers.length, answerKey.length);

  for (let i = 0; i < n; i++) {
    if (answers[i] === answerKey[i]) {
      correctCount++;
    } else if (answers[i] !== 0) {
      wrongQuestions.push(i + 1);
    }
  }

  const wrongCount = wrongQuestions.length;
  const score = correctCount * pointsPerQuestion;

  return { score, correctCount, wrongCount, wrongQuestions };
}

/**
 * 시트1에서 정답 키 추출.
 * 지원 형식:
 * - 형식 A: 한 행에 시험번호 + 40자리 정답 (예: 2024-01, 12341234...)
 * - 형식 B: 40행, 각 행에 문제번호(1~40) + 답(1~4)
 */
export function parseAnswerKeyFromExcel(
  excelBuffer: Buffer,
  examCode: string
): number[] | null {
  const wb = XLSX.read(excelBuffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return null;

  const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as (string | number)[][];
  const target = String(examCode).trim();

  // 형식 B: 40행 (문제번호 1~40, 시험정답 1~4)
  const numRows = data.filter((r) => r && r.length >= 2).length;
  const firstCol = data[1]?.[0];
  const isFormatB =
    numRows >= 40 &&
    (firstCol === 1 || firstCol === "1" || Number(firstCol) === 1);

  if (isFormatB) {
    const answers: number[] = [];
    for (let i = 1; i <= 40 && i < data.length; i++) {
      const row = data[i];
      if (!row || row.length < 2) break;
      const ans = Number(row[1]);
      answers.push(ans >= 1 && ans <= 4 ? ans : 1);
    }
    if (answers.length === 40) return answers;
  }

  // 형식 A: 한 행에 시험번호 + 40자리 정답
  for (const row of data) {
    if (!row || row.length < 2) continue;
    const code = String(row[0] ?? "").trim();
    const keyStr = String(row[1] ?? "").trim();
    if (code === target || (!target && keyStr.length >= 40)) {
      const digits = keyStr.match(/[1-4]/g);
      if (digits && digits.length >= 40) {
        return digits.slice(0, 40).map(Number);
      }
    }
  }
  return null;
}

export function getExamineeListFromExcel(excelBuffer: Buffer): ExamineeRow[] {
  const wb = XLSX.read(excelBuffer, { type: "buffer" });
  const sheetNames = wb.SheetNames;
  const ws = sheetNames.length >= 2
    ? wb.Sheets[sheetNames[1]]
    : wb.Sheets[sheetNames[0]];
  if (!ws) return [];

  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  const idCol = "학번(오직 숫자만 가능)";
  const nameCol = "이름";

  return data
    .map((row) => {
      const id = row[idCol] ?? row["학번"] ?? row["사번"];
      const name = row[nameCol] ?? row["이름"];
      return { id: String(id ?? "").trim(), name: String(name ?? "").trim(), phone: "" };
    })
    .filter((r) => r.id);
}

export async function createEvaluationExcel(
  results: (OMRGradeResult & { examinee?: ExamineeRow })[],
  examDate: string,
  examName: string,
  examCode: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("평가결과");

  ws.addRow(HEADERS);

  for (const r of results) {
    const row: EvaluationRow = {
      시험일자: examDate,
      파일명: r.filename,
      전화번호: r.examinee?.phone ?? "",
      학생명: r.examinee?.name ?? "",
      점수: r.score,
      등급: r.correctCount,
      맞은갯수: r.correctCount,
      틀린갯수: r.wrongCount,
      틀린문항: r.wrongQuestions.join(", "),
      학생번호: r.examinee?.id ?? "",
      시험번호: examCode,
      저장완료: "True",
      SMS: "",
      학생이작성한답: r.studentAnswers,
      시험명: examName,
      채점오류내역: "",
      기타정보: "",
    };
    ws.addRow(HEADERS.map((h) => row[h]));
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
