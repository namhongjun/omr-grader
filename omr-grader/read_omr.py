# -*- coding: utf-8 -*-
"""
OMR 카드 이미지에서 답안(볼펜 색칠) 읽기.
스캔/촬영한 이미지 경로를 주면 문항별 선택 번호(1~5) 리스트 반환.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

import cv2
import numpy as np


def _find_bubbles(gray: np.ndarray, min_radius_ratio: float = 0.008) -> list[tuple[int, int, int]]:
    """이미지에서 원형 버블 영역 검출. (x, y, radius) 리스트 반환."""
    # 노이즈 제거 후 이진화에 유리하게
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    # 적응형 이진화: 조명 불균일·볼펜 색에 더 잘 대응
    binary = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 10
    )
    contours, _ = cv2.findContours(
        binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    h, w = gray.shape
    min_r = int(min(w, h) * min_radius_ratio)
    max_r = int(min(w, h) * 0.08)
    bubbles = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 30:
            continue
        (x, y), r = cv2.minEnclosingCircle(cnt)
        r = int(r)
        if not (min_r <= r <= max_r):
            continue
        # 원에 가까운지 (타원이 아닌지)
        if area < 0.6 * (np.pi * r * r):
            continue
        bubbles.append((int(x), int(y), r))
    return bubbles


def _is_bubble_filled(gray: np.ndarray, cx: int, cy: int, r: int, threshold_ratio: float = 0.45) -> bool:
    """버블 영역 내부가 색칠되었는지 판단. (어두운 픽셀 비율로 판단)"""
    # 버블만 잘라내기
    y1, y2 = max(0, cy - r), min(gray.shape[0], cy + r + 1)
    x1, x2 = max(0, cx - r), min(gray.shape[1], cx + r + 1)
    roi = gray[y1:y2, x1:x2]
    if roi.size == 0:
        return False
    # 원 마스크 (타원이 아닌 정원)
    yy, xx = np.ogrid[y1 - cy : y2 - cy, x1 - cx : x2 - cx]
    mask = (xx * xx + yy * yy) <= (r * r)
    pixels = roi[mask[: roi.shape[0], : roi.shape[1]]]
    if pixels.size == 0:
        return False
    # 어두운 픽셀 비율 (볼펜은 검정/파랑으로 어두움)
    dark = np.sum(pixels < 180)
    return (dark / pixels.size) >= threshold_ratio


def read_omr(
    image_path: str | Path,
    num_questions: int = 40,
    choices_per_question: int = 5,
    filled_threshold: float = 0.45,
) -> list[int]:
    """
    OMR 카드 이미지에서 문항별 선택 번호(1~5) 리스트 반환.

    - image_path: 스캔/촬영한 카드 이미지 (jpg, png 등)
    - num_questions: 문항 수 (기본 40)
    - choices_per_question: 문항당 선택지 수 (기본 5)
    - filled_threshold: 버블 내 어두운 픽셀 비율이 이 값 이상이면 '색칠됨' (0~1)

    반환: 길이 num_questions 리스트. 각 원소는 1~5 (미표시 시 0).
    """
    path = Path(image_path)
    if not path.exists():
        raise FileNotFoundError(f"이미지를 찾을 수 없습니다: {path}")
    img = cv2.imread(str(path))
    if img is None:
        raise ValueError(f"이미지를 열 수 없습니다: {path}")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    bubbles = _find_bubbles(gray)
    if len(bubbles) < num_questions * choices_per_question:
        # 버블 개수가 부족하면 더 작은 원도 허용해서 재시도
        bubbles = _find_bubbles(gray, min_radius_ratio=0.005)

    # 위치로 정렬: 위→아래, 왼쪽→오른쪽 (대략 한 행에 여러 문항이 있을 수 있음)
    # 행 단위로 묶기 위해 y를 일정 구간으로 나눔
    bubble_h = np.median([r * 2 for (_, _, r) in bubbles]) if bubbles else 30
    row_gap = bubble_h * 1.5
    def row_key(b):
        x, y, r = b
        return (int(y // row_gap), x)
    bubbles.sort(key=row_key)

    needed = num_questions * choices_per_question
    if len(bubbles) > needed:
        # 중복/노이즈 제거: 인접한 버블끼리 하나만 남기기
        def dist(a, b):
            return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
        kept = []
        for b in bubbles:
            if any(dist(b, k) < (b[2] + k[2]) ** 2 for k in kept):
                continue
            kept.append(b)
            if len(kept) >= needed:
                break
        bubbles = kept[:needed]
    else:
        bubbles = bubbles[:needed]

    answers = []
    for i in range(num_questions):
        start = i * choices_per_question
        row = bubbles[start : start + choices_per_question]
        filled_index = None
        for j, (cx, cy, r) in enumerate(row):
            if _is_bubble_filled(gray, cx, cy, r, threshold_ratio=filled_threshold):
                if filled_index is not None:
                    # 두 개 색칠됨 → 더 많이 색칠된 쪽 선택
                    f1 = np.sum(gray[max(0, cy - r) : cy + r + 1, max(0, cx - r) : cx + r + 1] < 180)
                    f2 = np.sum(gray[max(0, row[filled_index][1] - row[filled_index][2]) : row[filled_index][1] + row[filled_index][2] + 1, max(0, row[filled_index][0] - row[filled_index][2]) : row[filled_index][0] + row[filled_index][2] + 1] < 180)
                    if f2 >= f1:
                        continue
                filled_index = j
        answers.append((filled_index + 1) if filled_index is not None else 0)
    return answers


def get_id_from_filename(filename: str) -> Optional[str]:
    """파일명에서 사번 추출. 예: '12345.png' -> '12345', 'OMR_12345.jpg' -> '12345'."""
    stem = Path(filename).stem
    # 숫자만 있는 경우 그대로
    if stem.isdigit():
        return stem
    # 숫자 조각 찾기 (가장 긴 연속 숫자열을 사번으로 가정)
    match = re.search(r"\d+", stem)
    return match.group(0) if match else None


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("사용법: python read_omr.py <OMR이미지경로> [문항수=40] [선택지수=5]")
        sys.exit(1)
    path = sys.argv[1]
    nq = int(sys.argv[2]) if len(sys.argv) > 2 else 40
    nc = int(sys.argv[3]) if len(sys.argv) > 3 else 5
    answers = read_omr(path, num_questions=nq, choices_per_question=nc)
    print("문항별 선택:", answers)
    print("총 표시한 문항 수:", sum(1 for a in answers if a != 0))
