"use client";
import { useState } from "react";
import { request } from "@/lib/api/client";
import styles from "@/features/admin/components/admin.module.css";

export function ImageUpload({
  onUploaded,
  onPending,
}: {
  onUploaded: (url: string) => void;
  onPending?: (value: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [filename, setFilename] = useState("");
  return (
    <div className={styles.upload} aria-busy={pending}>
      <label className={styles.uploadButton}>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M10 13V3m0 0L6.5 6.5M10 3l3.5 3.5M4 12v4h12v-4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{pending ? "이미지 업로드 중…" : "이미지 업로드"}</span>
        <input
          className={styles.fileInput}
          aria-label="이미지 업로드"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={pending}
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) {
              return;
            }

            if (file.size > 2 * 1024 * 1024) {
              setError("2MB 이하의 이미지를 선택해 주세요.");
              return;
            }

            if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
              setError("JPEG·PNG·WebP 형식의 이미지를 선택해 주세요.");
              return;
            }

            setPending(true);
            onPending?.(true);
            setError("");
            setFilename("");
            try {
              const data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result).split(",")[1]);
                reader.onerror = () => reject(new Error("파일을 읽지 못했어요."));
                reader.readAsDataURL(file);
              });
              const asset = await request<{ url: string }>("/admin/media", {
                method: "POST",
                body: JSON.stringify({ data }),
              });
              onUploaded(asset.url);
              setFilename(file.name);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "이미지를 업로드하지 못했어요.");
            } finally {
              setPending(false);
              onPending?.(false);
            }
          }}
        />
      </label>
      <small className={styles.help}>JPEG, PNG, WebP · 최대 2MB</small>
      {filename && (
        <p className={styles.success} role="status">
          {filename} 업로드 완료
        </p>
      )}
      {pending && (
        <span className={styles.srOnly} role="status">
          이미지를 업로드하고 있어요.
        </span>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
