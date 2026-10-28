/* eslint-disable @next/next/no-img-element */
"use client";
import { ImageUpload } from "@/features/admin/components/image-upload";
import styles from "@/features/admin/components/admin.module.css";

export function ProductImageField({
  images,
  value,
  onChange,
  onPending,
}: {
  images: string[];
  value: string;
  onChange: (url: string) => void;
  onPending: (pending: boolean) => void;
}) {
  const choices = [...new Set([...images, ...(value ? [value] : [])])];
  return (
    <div className={styles.imageField}>
      <div className={styles.imageStage}>
        {value ? (
          <img src={value} alt="선택한 대표 이미지 미리보기" />
        ) : (
          <span>이미지를 선택해 주세요</span>
        )}
        <span className={styles.imageCaption}>PRODUCT IMAGE</span>
      </div>
      <div className={styles.imageControls}>
        <label>
          <span>대표 이미지</span>
          <select required value={value} onChange={(event) => onChange(event.target.value)}>
            {!choices.length && <option value="">이미지를 업로드해 주세요</option>}
            {choices.map((image, index) => (
              <option key={image} value={image}>
                {image.startsWith("/api/media/")
                  ? `업로드한 이미지 ${index + 1}`
                  : image
                      .split("/")
                      .pop()
                      ?.replace(/\.[^.]+$/, "")
                      .replaceAll("-", " ")}
              </option>
            ))}
          </select>
        </label>
        <p className={styles.help}>
          기존 이미지를 고르거나 새 사진을 업로드하세요. 선택한 사진은 상품 카드와 상세 화면에
          사용돼요.
        </p>
        <ImageUpload onUploaded={onChange} onPending={onPending} />
      </div>
    </div>
  );
}
