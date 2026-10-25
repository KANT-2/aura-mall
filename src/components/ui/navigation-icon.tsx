export function Icon({ name }: { name: string }) {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      {name === "search" ? (
        <>
          <circle cx="10" cy="10" r="6.5" />
          <path d="m15 15 6 6" />
        </>
      ) : name === "user" ? (
        <>
          <circle cx="12" cy="7" r="3.5" />
          <path d="M4 21v-3a8 8 0 0 1 16 0v3" />
        </>
      ) : (
        <>
          <path d="M5 8h14l1 13H4L5 8Z" />
          <path d="M8 9V6a4 4 0 0 1 8 0v3" />
        </>
      )}
    </svg>
  );
}
