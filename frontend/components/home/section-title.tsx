type SectionTitleProps = {
  eyebrow: string;
  title: string;
  action?: string;
  description?: string;
};

export function SectionTitle({
  eyebrow,
  title,
  action,
  description,
}: SectionTitleProps) {
  return (
    <div className="mb-3">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            {eyebrow}
          </p>

          <h2 className="mt-1 text-lg font-semibold">{title}</h2>

          {description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {action && (
          <span className="shrink-0 text-sm text-muted-foreground">
            {action}
          </span>
        )}
      </div>
    </div>
  );
}
