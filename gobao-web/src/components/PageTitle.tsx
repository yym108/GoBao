export function PageTitle({
  title,
  desc,
  extra,
}: {
  title: string;
  desc: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="page__header">
      <div>
        <div className="page__title">{title}</div>
        <div className="page__desc">{desc}</div>
      </div>
      {extra}
    </div>
  );
}
