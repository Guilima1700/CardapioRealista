import { Brand, Spinner } from "@/components/ui";
export default function Loading() {
  return (
    <div className="tracking-shell">
      <Brand />
      <div className="empty">
        <Spinner />
        <p>Preparando sua experiência…</p>
      </div>
    </div>
  );
}
