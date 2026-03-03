/**
 * OMR 채점 API
 * POST: FormData { images: File[], pdf?: File, excel?: File, examCode?, examDate?, examName? }
 */
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300; // Vercel 5분
import { readOMRFromBuffer } from "@/lib/omr";
import {
  gradeAnswers,
  parseAnswerKeyFromExcel,
  getExamineeListFromExcel,
  createEvaluationExcel,
  type OMRGradeResult,
} from "@/lib/excel";

const NUM_QUESTIONS = 40;
const DEFAULT_ANSWER_KEY = Array(NUM_QUESTIONS).fill(1); // 임시 기본값

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const examCode = (formData.get("examCode") as string)?.trim() || "";
    const examDate = (formData.get("examDate") as string)?.trim() || new Date().toISOString().slice(0, 10);
    const examName = (formData.get("examName") as string)?.trim() || "OMR 시험평가";

    const excelFile = formData.get("excel") as File | null;
    const imageFiles = formData.getAll("images") as File[];
    const pdfFile = formData.get("pdf") as File | null;

    let answerKey: number[] = DEFAULT_ANSWER_KEY;
    let examineeList: { id: string; name: string; phone?: string }[] = [];

    if (excelFile && excelFile.size > 0) {
      const excelBuf = Buffer.from(await excelFile.arrayBuffer());
      if (examCode) {
        const key = parseAnswerKeyFromExcel(excelBuf, examCode);
        if (key) answerKey = key;
      }
      examineeList = getExamineeListFromExcel(excelBuf);
    }

    const imageBuffers: { buffer: Buffer; filename: string }[] = [];

    // JPG/PNG 이미지
    for (const f of imageFiles) {
      if (!f?.size) continue;
      const buf = Buffer.from(await f.arrayBuffer());
      imageBuffers.push({ buffer: buf, filename: f.name });
    }

    // PDF → 이미지 (동적 로드)
    if (pdfFile && pdfFile.size > 0) {
      const { pdfToImages } = await import("@/lib/pdf");
      const pdfBuf = Buffer.from(await pdfFile.arrayBuffer());
      const pages = await pdfToImages(pdfBuf);
      pages.forEach((buf, i) => {
        imageBuffers.push({
          buffer: buf,
          filename: `${pdfFile.name.replace(/\.pdf$/i, "")}_p${i + 1}.jpg`,
        });
      });
    }

    if (imageBuffers.length === 0) {
      return NextResponse.json(
        { error: "이미지(JPG/PNG) 또는 PDF 파일을 업로드해 주세요." },
        { status: 400 }
      );
    }

    const results: (OMRGradeResult & { examinee?: { id: string; name: string; phone?: string } })[] = [];

    for (let i = 0; i < imageBuffers.length; i++) {
      const { buffer, filename } = imageBuffers[i];
      const { answers, studentAnswers } = await readOMRFromBuffer(buffer);
      const { score, correctCount, wrongCount, wrongQuestions } = gradeAnswers(
        answers,
        answerKey,
        1
      );

      const examinee = examineeList[i] ?? null;

      results.push({
        filename,
        answers,
        studentAnswers,
        score,
        correctCount,
        wrongCount,
        wrongQuestions,
        examinee: examinee ?? undefined,
      });
    }

    const excelBuffer = await createEvaluationExcel(
      results,
      examDate,
      examName,
      examCode || "1"
    );

    return new NextResponse(excelBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="평가결과_${examDate}.xlsx"`,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "채점 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
