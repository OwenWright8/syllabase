import { useState } from "react";
import { ChevronDown, ChevronRight, Download, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CourseDocument } from "@/hooks/useCourseDocuments";
import { DocumentChapter, useDeleteChapter, useDocumentChapters, useSaveChapter } from "@/hooks/useDocumentChapters";
import { usePageDownloads } from "@/hooks/usePageDownloads";
import { chapterLabel, downloadFilename, pagesText, rangeProblem } from "@/lib/documentPages";

const SOURCE_NOTE: Record<DocumentChapter["source"], string> = {
  outline: "from the PDF's bookmarks",
  toc: "from the contents page",
  manual: "added by you",
};

/** Where the chapters came from, in a sentence — so it's clear how far to trust them. */
function provenance(chapters: DocumentChapter[]): string {
  const sources = new Set(chapters.map((chapter) => chapter.source));
  if (sources.size === 1) {
    const [only] = [...sources];
    return only === "manual" ? "Chapters you added." : `Found automatically ${SOURCE_NOTE[only]}. Check the page numbers before relying on them.`;
  }
  return "Some found automatically, some added by you. Check the page numbers before relying on them.";
}

export function TextbookChapters({ doc }: { doc: CourseDocument }) {
  const [open, setOpen] = useState(false);
  const { data: chapters = [], isLoading } = useDocumentChapters(doc.id, open);
  const downloads = usePageDownloads();
  const deleteChapter = useDeleteChapter();

  const [editing, setEditing] = useState<{ chapter: DocumentChapter | null } | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocumentChapter | null>(null);

  const pageCount = doc.page_count ?? 0;
  const bookPage = (page: number) => page - doc.page_offset;

  const downloadRange = (start: number, end: number, label: string) =>
    downloads.download({ documentId: doc.id, start, end, filename: downloadFilename(doc.filename, label, start, end) });

  return (
    <div className="mt-3 border-t border-border pt-2">
      <button
        type="button"
        className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Chapters and downloads
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : chapters.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No chapters were found automatically. Add them yourself, or download any range of pages.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{provenance(chapters)}</p>
              <ul className="space-y-1.5">
                {chapters.map((chapter) => {
                  const label = chapterLabel(chapter);
                  const busy = downloads.isBusy({ documentId: doc.id, start: chapter.start_page, end: chapter.end_page });
                  return (
                    <li key={chapter.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{label}</p>
                        <p className="text-xs text-muted-foreground">
                          PDF {pagesText(chapter.start_page, chapter.end_page)}
                          {doc.page_offset !== 0 && chapter.end_page - doc.page_offset >= 1 && (
                            <> · book {pagesText(Math.max(bookPage(chapter.start_page), 1), bookPage(chapter.end_page))}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={busy}
                          aria-label={`Download ${label}`}
                          onClick={() => downloadRange(chapter.start_page, chapter.end_page, label)}
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          Download
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${label}`} onClick={() => setEditing({ chapter })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Remove ${label}`} onClick={() => setDeleteTarget(chapter)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditing({ chapter: null })}>
              <Plus className="h-3.5 w-3.5" />
              Add chapter
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setRangeOpen(true)}>
              <Download className="h-3.5 w-3.5" />
              Download pages…
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <ChapterDialog
          key={editing.chapter?.id ?? "new"}
          documentId={doc.id}
          chapter={editing.chapter}
          pageCount={pageCount}
          onClose={() => setEditing(null)}
        />
      )}

      {rangeOpen && (
        <RangeDialog
          pageCount={pageCount}
          onClose={() => setRangeOpen(false)}
          onDownload={(start, end) => {
            setRangeOpen(false);
            downloadRange(start, end, "");
          }}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <AlertDialogContent className="glass-strong border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this chapter?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? chapterLabel(deleteTarget) : ""} is removed from the list. The book itself isn't changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  await deleteChapter.mutateAsync(deleteTarget.id);
                } catch {
                  // Surfaced by the global mutation error handler.
                } finally {
                  setDeleteTarget(null);
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const toInt = (text: string) => (text.trim() === "" ? NaN : Number(text));

function ChapterDialog({
  documentId,
  chapter,
  pageCount,
  onClose,
}: {
  documentId: string;
  chapter: DocumentChapter | null;
  pageCount: number;
  onClose: () => void;
}) {
  const save = useSaveChapter(documentId);
  const [number, setNumber] = useState(chapter?.number?.toString() ?? "");
  const [title, setTitle] = useState(chapter?.title ?? "");
  const [start, setStart] = useState(chapter?.start_page.toString() ?? "");
  const [end, setEnd] = useState(chapter?.end_page.toString() ?? "");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const first = toInt(start);
    const last = toInt(end);
    const chapterNumber = number.trim() === "" ? null : Number(number);
    if (chapterNumber !== null && (!Number.isInteger(chapterNumber) || chapterNumber < 0 || chapterNumber > 999)) {
      setProblem("The chapter number must be a whole number.");
      return;
    }
    if (chapterNumber === null && !title.trim()) {
      setProblem("Give the chapter a number or a title.");
      return;
    }
    const range = rangeProblem(first, last, pageCount);
    if (range) {
      setProblem(range);
      return;
    }
    try {
      await save.mutateAsync({ id: chapter?.id, number: chapterNumber, title, start_page: first, end_page: last });
      toast.success(chapter ? "Chapter updated" : "Chapter added");
      onClose();
    } catch {
      // Surfaced by the global mutation error handler.
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="glass-strong border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle>{chapter ? "Edit chapter" : "Add a chapter"}</DialogTitle>
          <DialogDescription>Page numbers are the PDF's own (the first page of the file is page 1).</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="chapterNumber">Number</Label>
              <Input id="chapterNumber" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="5" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="chapterTitle">Title</Label>
              <Input id="chapterTitle" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Cell Structure" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="chapterStart">First page</Label>
              <Input id="chapterStart" inputMode="numeric" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chapterEnd">Last page</Label>
              <Input id="chapterEnd" inputMode="numeric" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {chapter ? "Save" : "Add chapter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RangeDialog({
  pageCount,
  onClose,
  onDownload,
}: {
  pageCount: number;
  onClose: () => void;
  onDownload: (start: number, end: number) => void;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="glass-strong border-border/50 max-w-sm">
        <DialogHeader>
          <DialogTitle>Download pages</DialogTitle>
          <DialogDescription>
            Get just these pages as their own PDF. The book has {pageCount} page{pageCount === 1 ? "" : "s"} (PDF page numbers).
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const first = toInt(start);
            const last = toInt(end);
            const range = rangeProblem(first, last, pageCount);
            if (range) return setProblem(range);
            setProblem(null);
            onDownload(first, last);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rangeStart">First page</Label>
              <Input id="rangeStart" inputMode="numeric" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rangeEnd">Last page</Label>
              <Input id="rangeEnd" inputMode="numeric" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Download</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
