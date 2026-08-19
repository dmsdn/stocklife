interface SimpleMarkdownProps {
  content: string;
}

export function SimpleMarkdown({ content }: SimpleMarkdownProps) {
  const lines = content.split("\n");

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return null;

        if (line.startsWith("## ")) {
          return (
            <p key={i} className="pt-2 text-base font-medium">
              {line.replace("## ", "")}
            </p>
          );
        }

        if (line.startsWith("- ")) {
          return (
            <p key={i} className="pl-4 text-muted-foreground">
              · {line.replace("- ", "")}
            </p>
          );
        }

        return (
          <p key={i} className="text-muted-foreground">
            {line}
          </p>
        );
      })}
    </div>
  );
}
