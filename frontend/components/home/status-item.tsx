type StatusItemProps = {
  label: string;
  value: string;
  border?: boolean;
};

export function StatusItem({
  label,
  value,
  border = false,
}: StatusItemProps) {
  return (
    <div className={`px-2 ${border ? "border-l border-border" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}
