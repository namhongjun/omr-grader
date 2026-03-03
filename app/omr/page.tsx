"use client";

import { useState } from "react";

export default function OMRPage() {
  const [images, setImages] = useState<File[]>([]);
  const [pdf, setPdf] = useState<File | null>(null);
  const [excel, setExcel] = useState<File | null>(null);
  const [examCode, setExamCode] = useState("");
  const [examDate, setExamDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [examName, setExamName] = useState("OMR 시험평가");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setImages((prev) => [...prev, ...files]);
  };

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setPdf(f ?? null);
  };

  const handleExcelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setExcel(f ?? null);
  };

  const removeImage = (i: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (images.length === 0 && !pdf) {
      setError("JPG/PNG 이미지 또는 PDF 파일을 업로드해 주세요.");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      images.forEach((f) => formData.append("images", f));
      if (pdf) formData.append("pdf", pdf);
      if (excel) formData.append("excel", excel);
      if (examCode) formData.append("examCode", examCode);
      formData.append("examDate", examDate);
      formData.append("examName", examName);

      const res = await fetch("/api/grade", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `오류 ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evaluation_${examDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "채점 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">
          OMR 자동 채점
        </h1>
        <p className="text-slate-600 mb-8">
          JPG/PNG 이미지 또는 PDF를 업로드하면 평가결과 엑셀을 다운로드할 수 있습니다.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              1. OMR 이미지 (JPG/PNG)
            </label>
            <input
              type="file"
              accept=".jpg,.jpeg,.png"
              multiple
              onChange={handleImageChange}
              className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300"
            />
            {images.length > 0 && (
              <ul className="mt-2 text-sm text-slate-600">
                {images.map((f, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span>{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="text-red-600 hover:underline"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              2. 또는 PDF (한 페이지 = 1명)
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={handlePdfChange}
              className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300"
            />
            {pdf && <p className="mt-1 text-sm text-slate-600">{pdf.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              3. 응시생 명단 엑셀 (선택)
            </label>
            <p className="text-xs text-slate-500 mb-1">
              시트1: 시험번호/시험정답, 시트2: 학번(오직 숫자만 가능), 이름
            </p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelChange}
              className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300"
            />
            {excel && <p className="mt-1 text-sm text-slate-600">{excel.name}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                시험번호
              </label>
              <input
                type="text"
                value={examCode}
                onChange={(e) => setExamCode(e.target.value)}
                placeholder="예: 2024-01"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                시험일자
              </label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                시험명
              </label>
              <input
                type="text"
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white placeholder:text-slate-400"
              />
            </div>
          </div>

          {error && (
            <div className="rounded bg-red-50 text-red-700 px-4 py-2 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-800 text-white py-3 font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "채점 중..." : "채점 후 엑셀 다운로드"}
          </button>
        </form>
      </div>
    </div>
  );
}
