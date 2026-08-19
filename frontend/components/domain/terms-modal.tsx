"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SimpleMarkdown } from "./simple-markdown";
import { legalDocs } from "@/lib/legal-content";

export function TermsModal({ docId }: { docId: string }) {
  const doc = legalDocs[docId];
  if (!doc) return null;

  return (
    <Dialog>
      <DialogTrigger className="text-xs text-muted-foreground underline">
        더보기
      </DialogTrigger>

      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{doc.title}</DialogTitle>
        </DialogHeader>

        <SimpleMarkdown content={doc.body} />
      </DialogContent>
    </Dialog>
  );
}