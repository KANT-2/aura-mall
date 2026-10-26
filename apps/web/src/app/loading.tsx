import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

export default function Loading() {
  return (
    <main className="page-width" aria-busy="true">
      <LoadingSkeleton />
    </main>
  );
}
