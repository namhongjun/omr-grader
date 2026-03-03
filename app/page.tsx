import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* 배경 이미지 (투명도 적용) */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/injaebaekbalwon.png"
          alt="인재개발원 전경"
          fill
          className="object-cover opacity-45"
          priority
        />
        <div className="absolute inset-0 bg-slate-900/40" />
      </div>

      {/* 메인 콘텐츠 */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-8">
        <h1 className="mb-4 text-center text-4xl font-bold tracking-tight text-white drop-shadow-lg sm:text-5xl md:text-6xl">
          인재개발원 OMR 시스템
        </h1>
        <p className="mb-12 text-center text-lg text-slate-200 drop-shadow">
          OMR 카드 자동 채점 및 평가결과 관리
        </p>

        <Link
          href="/omr"
          className="rounded-xl bg-white/95 px-8 py-4 text-lg font-semibold text-slate-800 shadow-xl transition hover:bg-white hover:shadow-2xl"
        >
          OMR 자동 채점 →
        </Link>
      </div>
    </div>
  );
}
