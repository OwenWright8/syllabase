import { useRef, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, FileText, Loader2, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
import {
  CourseDocument,
  DocumentKind,
  acceptFor,
  checkUpload,
  formatBytes,
  useCourseDocuments,
  useDeleteDocument,
  useDocumentLimits,
  useDocumentUsage,
  useRetryDocument,
  useUploadDocument,
} from "@/hooks/useCourseDocuments";

interface CourseMaterialsTabProps {
  courseId: string;
}

/** A file being sent from this browser right now. */
interface InFlightUpload {
  key: string;
  name: string;
  kind: DocumentKind;
  fraction: number;
  documentId?: string;
  cancel: () => void;
}

const KIND_COPY: Record<DocumentKind, { title: string; empty: string; button: string; hint: string; icon: typeof BookOpen }> = {
  textbook: {
    title: "Textbooks",
    empty: "No textbooks yet.",
    button: "Upload textbook",
    hint: "PDF. Scanned books work too, but only the first pages are read for the contents.",
    icon: BookOpen,
  },
  syllabus: {
    title: "Syllabus",
    empty: "No syllabus yet.",
    button: "Upload syllabus",
    hint: "PDF, Word (.docx), or a photo (PNG or JPG). Scans and photos are read with OCR.",
    icon: FileText,
  },
};

export function CourseMaterialsTab({ courseId }: CourseMaterialsTabProps) {
  const { data: documents = [], isLoading } = useCourseDocuments(courseId);
  const { data: limits } = useDocumentLimits();
  const { data: usedBytes = 0 } = useDocumentUsage();
  const upload = useUploadDocument();
  const deleteDocument = useDeleteDocument();
  const retryDocument = useRetryDocument();

  const [inFlight, setInFlight] = useState<InFlightUpload[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<CourseDocument | null>(null);

  const startUpload = async (file: File, kind: DocumentKind) => {
    if (!limits) return;
    const problem = checkUpload(file, kind, limits, usedBytes);
    if (problem) {
      toast.error(problem);
      return;
    }

    const controller = new AbortController();
    const entry: InFlightUpload = {
      key: `${Date.now()}-${Math.random()}`,
      name: file.name,
      kind,
      fraction: 0,
      cancel: () => controller.abort(),
    };
    setInFlight((current) => [...current, entry]);
    const update = (patch: Partial<InFlightUpload>) =>
      setInFlight((current) => current.map((item) => (item.key === entry.key ? { ...item, ...patch } : item)));

    try {
      await upload.mutateAsync({
        file,
        courseId,
        kind,
        signal: controller.signal,
        onStarted: (documentId) => update({ documentId }),
        onProgress: (fraction) => update({ fraction }),
      });
      toast.success(kind === "syllabus" ? "Syllabus uploaded. Reading it now…" : "Textbook uploaded. Reading it now…");
    } catch {
      // Surfaced by the global mutation error handler.
    } finally {
      setInFlight((current) => current.filter((item) => item.key !== entry.key));
    }
  };

  const uploadingIds = new Set(inFlight.map((item) => item.documentId).filter(Boolean));

  if (isLoading || !limits) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!limits.enabled && (
        <div role="status" className="rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
          Uploading course materials is switched off on this server. Anything already uploaded is still here.
        </div>
      )}

      {(["syllabus", "textbook"] as DocumentKind[]).map((kind) => (
        <MaterialsSection
          key={kind}
          kind={kind}
          documents={documents.filter((doc) => doc.kind === kind && !uploadingIds.has(doc.id))}
          inFlight={inFlight.filter((item) => item.kind === kind)}
          canUpload={limits.enabled}
          onChoose={(file) => startUpload(file, kind)}
          onDelete={setDeleteTarget}
          onRetry={(doc) => retryDocument.mutate(doc.id)}
        />
      ))}

      {limits.enabled && (
        <p className="text-xs text-muted-foreground">
          Using {formatBytes(usedBytes)} of {formatBytes(limits.maxUserBytes)} across all your courses. One file can be up to{" "}
          {formatBytes(limits.maxFileBytes)}.
        </p>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="glass-strong border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.filename}" and everything read from it will be removed. Readings already added from it stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  await deleteDocument.mutateAsync(deleteTarget.id);
                  toast.success("Deleted");
                } catch {
                  // Surfaced by the global mutation error handler.
                } finally {
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface MaterialsSectionProps {
  kind: DocumentKind;
  documents: CourseDocument[];
  inFlight: InFlightUpload[];
  canUpload: boolean;
  onChoose: (file: File) => void;
  onDelete: (doc: CourseDocument) => void;
  onRetry: (doc: CourseDocument) => void;
}

function MaterialsSection({ kind, documents, inFlight, canUpload, onChoose, onDelete, onRetry }: MaterialsSectionProps) {
  const copy = KIND_COPY[kind];
  const Icon = copy.icon;
  const input = useRef<HTMLInputElement>(null);

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Icon className="h-5 w-5" />
              {copy.title}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{copy.hint}</p>
          </div>
          {canUpload && (
            <>
              <Button size="sm" className="shrink-0 gap-2" onClick={() => input.current?.click()}>
                <Upload className="h-4 w-4" />
                {copy.button}
              </Button>
              <input
                ref={input}
                type="file"
                accept={acceptFor(kind)}
                className="sr-only"
                tabIndex={-1}
                aria-label={`Choose a ${kind} file`}
                data-testid={`upload-${kind}`}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = ""; // so choosing the same file again still fires
                  if (file) onChoose(file);
                }}
              />
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-2 sm:pt-2 space-y-2">
        {documents.length === 0 && inFlight.length === 0 && <p className="text-sm text-muted-foreground">{copy.empty}</p>}

        {inFlight.map((item) => (
          <div key={item.key} className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{item.name}</p>
              <Button size="sm" variant="ghost" onClick={item.cancel}>
                Cancel
              </Button>
            </div>
            <Progress value={Math.round(item.fraction * 100)} className="h-2" aria-label={`Uploading ${item.name}`} />
            <p className="text-xs text-muted-foreground">Uploading… {Math.round(item.fraction * 100)}%</p>
          </div>
        ))}

        {documents.map((doc) => (
          <DocumentRow key={doc.id} doc={doc} onDelete={onDelete} onRetry={onRetry} />
        ))}
      </CardContent>
    </Card>
  );
}

function DocumentRow({ doc, onDelete, onRetry }: { doc: CourseDocument; onDelete: (doc: CourseDocument) => void; onRetry: (doc: CourseDocument) => void }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{doc.filename}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{formatBytes(doc.size_bytes)}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {doc.status === "failed" && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => onRetry(doc)}>
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Delete ${doc.filename}`} onClick={() => onDelete(doc)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <DocumentStatus doc={doc} />
    </div>
  );
}

function DocumentStatus({ doc }: { doc: CourseDocument }) {
  switch (doc.status) {
    case "uploading":
      // Not being sent from this browser (it isn't in the in-flight list): the tab was closed mid-upload.
      return (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5" />
          Upload interrupted. Delete it and upload again.
        </p>
      );
    case "queued":
      return (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Waiting to be read…
        </p>
      );
    case "processing":
      return (
        <div className="mt-2 space-y-1.5">
          <Progress value={doc.progress} className="h-2" aria-label={`Reading ${doc.filename}`} />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Reading… {doc.progress}%
          </p>
        </div>
      );
    case "failed":
      return (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{doc.error || "Couldn't read this file."}</span>
        </p>
      );
    case "ready":
      return (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Ready · {doc.page_count ?? 0} page{doc.page_count === 1 ? "" : "s"}
        </p>
      );
  }
}
