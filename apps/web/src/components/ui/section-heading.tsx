export function SectionHeading({
  number,
  title,
  copy,
}: {
  number: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="section-heading">
      <span className="eyebrow">{number} / AURA EDITORIAL</span>
      <h2>{title}</h2>
      <p>{copy}</p>
    </div>
  );
}
