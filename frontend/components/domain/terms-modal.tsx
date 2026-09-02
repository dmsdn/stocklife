"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RiArrowRightSLine } from "@remixicon/react";
import { SimpleMarkdown } from "./simple-markdown";
import { legalDocs } from "@/lib/legal-content";

export function TermsModal({ docId }: { docId: string }) {
  const doc = legalDocs[docId];
  if (!doc) return null;

  return (
    <Dialog>
      <DialogTrigger className="flex shrink-0 items-center text-muted-foreground" aria-label="자세히 보기">
        <RiArrowRightSLine size={18} />
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