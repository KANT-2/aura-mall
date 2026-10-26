export function UtilityIcon({
  name,
}: {
  name: "arrow" | "reset" | "heart" | "share" | "copy" | "adjust" | "close" | "info";
}) {
  const paths = {
    arrow: "M5 12h14m-6-6 6 6-6 6",
    reset: "M20 7v5h-5M20 12a8 8 0 1 1-2-6",
    heart: "M12 20S3 15 3 8a5 5 0 0 1 9-2 5 5 0 0 1 9 2c0 7-9 12-9 12Z",
    share: "M12 16V3m-4 4 4-4 4 4M6 11H4v10h16V11h-2",
    copy: "M8 8h11v13H8zM5 16H4V3h12v2",
    adjust: "M3 6h18M3 12h18M3 18h18M7 3v6M16 9v6M10 15v6",
    close: "m6 6 12 12M18 6 6 18",
    info: "M12 10v7m0-11v1",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
      {name === "info" && <circle cx="12" cy="12" r="9" />}
    </svg>
  );
}
