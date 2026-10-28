import type { ReactNode } from "react";
import styles from "@/features/admin/components/admin.module.css";

export function AdminFormSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.formSection}>
      <div className={styles.sectionIntro}>
        <span className={styles.sectionNumber}>{number}</span>
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
