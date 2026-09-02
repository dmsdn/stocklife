package com.storeflow.chat.entity;

/** 첨부파일 종류. 프론트 첨부 버튼(카메라/갤러리/파일/영수증)과 1:1로 대응. */
public enum ChatAttachmentType {
    IMAGE,      // 카메라 촬영 / 갤러리에서 고른 사진
    DOCUMENT,   // 일반 파일(PDF 등)
    RECEIPT     // 영수증 사진 — OCR/지출 분석 연계 대상이라 IMAGE와 구분해서 둠
}