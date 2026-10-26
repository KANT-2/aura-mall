import styles from "@/components/ui/loading-skeleton.module.css";

type LoadingVariant = "page" | "atelier" | "cart" | "checkout" | "account" | "orders";

function Lines() {
  return (
    <div className={styles.lines}>
      <div className={styles.line} />
      <div className={styles.line} />
      <div className={styles.line} />
    </div>
  );
}

function Cards() {
  return (
    <div className={styles.cards}>
      {[0, 1, 2].map((card) => (
        <div className={styles.card} key={card}>
          <div className={styles.image} />
          <Lines />
        </div>
      ))}
    </div>
  );
}

export function LoadingSkeleton({
  variant = "page",
  label = "정보를 불러오고 있어요.",
}: {
  variant?: LoadingVariant;
  label?: string;
}) {
  return (
    <div className={styles.root} data-variant={variant} role="status">
      <span className={styles.srOnly}>{label}</span>
      <div className={styles.preview} aria-hidden="true">
        {variant !== "orders" && (
          <div className={styles.heading}>
            <div className={styles.eyebrow} />
            <div className={styles.title} />
            <div className={styles.line} />
          </div>
        )}
        {variant === "cart" || variant === "checkout" ? (
          <div className={styles.commerce}>
            <div className={styles.lines}>
              {(variant === "cart" ? [0, 1] : [0, 1, 2, 3, 4]).map((row) => (
                <div className={styles.row} key={row}>
                  {variant === "cart" ? <div className={styles.thumbnail} /> : null}
                  <div className={styles.fields}>
                    <Lines />
                    <div className={styles.control} />
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.summary}>
              <div className={styles.title} />
              <Lines />
              <Lines />
              <div className={styles.control} />
            </div>
          </div>
        ) : variant === "atelier" ? (
          <div className={styles.atelier}>
            <div className={styles.visual} />
            <div className={styles.lines}>
              <Lines />
              <Cards />
              <div className={styles.control} />
            </div>
          </div>
        ) : variant === "orders" ? (
          <div className={styles.lines}>
            {[0, 1].map((order) => (
              <div className={styles.summary} key={order}>
                <Lines />
              </div>
            ))}
          </div>
        ) : (
          <>
            {variant === "account" && (
              <div className={styles.tabs}>
                {[0, 1, 2, 3].map((tab) => (
                  <div className={styles.control} key={tab} />
                ))}
              </div>
            )}
            <Cards />
          </>
        )}
      </div>
    </div>
  );
}
