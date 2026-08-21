type SectionTitleProps = {
  title: string;
  action?: string;
  onAction?: () => void;
  description?: string;
};

export function SectionTitle({
  title,
  action,
  onAction,
  description,
}: SectionTitleProps) {
  return (
    <div className="mb-3">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>

          {description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {/* ✅ 실제로 눌리게 button으로 교체 (예전엔 span이라 클릭 안 됐음) */}
        {action && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {action}
          </button>
        )}
      </div>
    </div>
  );
}
