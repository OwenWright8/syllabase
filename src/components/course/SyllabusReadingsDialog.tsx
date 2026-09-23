import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CourseDocument } from "@/hooks/useCourseDocuments";
import { useReadings, type NewReading } from "@/hooks/useReadings";
import { useCourseBooks, useSyllabusText } from "@/hooks/useSyllabusReadings";
import { useUserPreferences } from "@/hooks/useUserTimezone";
import { getTodayInTimezone, parseInTimezone } from "@/lib/dateUtils";
import { extractReadings, plainPagesText, resolveInBook, resolveInBooks, type Book, type Candidate, type Resolution } from "@/lib/syllabus";

const NO_BOOK = "none";

interface Row {
  candidate: Candidate;
  checked: boolean;
  /** null = follow the automatic title (which changes with the textbook chosen). */
  title: string | null;
  date: string;
  bookId: string;
  /** Why it starts unticked, if it does. */
  alreadyAdded: boolean;
}

const DATE_SOURCE_NOTE = {
  line: null,
  heading: "Date taken from the heading above it",
  week: "Date estimated from the week number",
} as const;

function resolve(candidate: Candidate, books: Book[], bookId: string): Resolution | null {
  if (bookId === NO_BOOK) return null;
  const book = books.find((b) => b.id === bookId);
  return book ? resolveInBook(candidate.reference, book) : null;
}

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function SyllabusReadingsDialog({ doc, onClose }: { doc: CourseDocument; onClose: () => void }) {
  const { data: text, isLoading: loadingText, isError } = useSyllabusText(doc.id, true);
  const { books, loading: loadingBooks } = useCourseBooks(doc.course_id, true);
  const { readings: existing, loading: loadingExisting } = useReadings(doc.course_id);
  const { timezone, semesterStart } = useUserPreferences();

  const loading = loadingText || loadingBooks || loadingExisting;
  const candidates = useMemo(
    () => (text === undefined ? [] : extractReadings(text, { semesterStart, today: getTodayInTimezone(timezone) })),
    [text, semesterStart, timezone]
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glass-strong border-border/50 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Readings found in your syllabus</DialogTitle>
          <DialogDescription>
            From "{doc.filename}". Check that these look right: nothing is added until you press the button below.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : isError ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn't load the syllabus text. Try again.
          </p>
        ) : (
          <ReviewList
            // a fresh list if the books or the syllabus change while it's open
            key={`${doc.id}:${candidates.length}:${books.map((b) => b.id).join(",")}`}
            courseId={doc.course_id}
            candidates={candidates}
            books={books}
            existing={existing.map((r) => ({ title: r.title, date: r.due_date }))}
            timezone={timezone}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewList({
  courseId,
  candidates,
  books,
  existing,
  timezone,
  onClose,
}: {
  courseId: string;
  candidates: Candidate[];
  books: Book[];
  existing: Array<{ title: string; date: string | null }>;
  timezone: string;
  onClose: () => void;
}) {
  const today = getTodayInTimezone(timezone);
  /** Whether a reading with this due date has already come and gone. */
  const isPast = (date: string) => date !== "" && date < today;
  const { createReadings } = useReadings(courseId);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const [rows, setRows] = useState<Row[]>(() =>
    candidates.map((candidate) => {
      const match = resolveInBooks(candidate.reference, books);
      const title = match?.title ?? candidate.title;
      const alreadyAdded = existing.some((e) => sameText(e.title, title) && (e.date ?? "") === (candidate.date ?? ""));
      return { candidate, checked: !alreadyAdded, title: null, date: candidate.date ?? "", bookId: match?.bookId ?? NO_BOOK, alreadyAdded };
    })
  );

  const update = (id: string, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.candidate.id === id ? { ...row, ...patch } : row)));
  const chosen = rows.filter((row) => row.checked);

  if (candidates.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm">We couldn't find any readings in this syllabus.</p>
        <p className="text-sm text-muted-foreground">
          We look for things like "Read Chapter 5", "Ch. 3–4 due 10/18" or "pp. 101–130" next to a date or a week. You can always add readings by hand on the
          Readings tab.
        </p>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </div>
    );
  }

  const confirm = async () => {
    const readings: NewReading[] = [];
    for (const row of chosen) {
      const resolution = resolve(row.candidate, books, row.bookId);
      const title = (row.title ?? resolution?.title ?? row.candidate.title).trim();
      if (!title) {
        setProblem("Every reading needs a title.");
        return;
      }
      readings.push({
        course_id: courseId,
        title,
        pages: resolution?.pages ?? plainPagesText(row.candidate.reference),
        ...(row.date ? { due_date: row.date } : {}),
        // A reading that was due before today has been dealt with (or missed for good): add it as done,
        // dated to its due date so it doesn't count as something finished this week.
        ...(isPast(row.date) ? { status: "done" as const, completed_at: parseInTimezone(row.date, "23:59", timezone) } : {}),
        ...(resolution ? { document_id: resolution.bookId, start_page: resolution.start, end_page: resolution.end } : {}),
      });
    }
    setProblem(null);
    setSaving(true);
    const { success } = await createReadings(readings);
    setSaving(false);
    if (success) {
      toast.success(`Added ${readings.length} reading${readings.length === 1 ? "" : "s"}`);
      onClose();
    }
  };

  return (
    <div className="space-y-3">
      {books.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Upload a textbook for this course and its chapters can be matched to these readings, so each one can offer a download of just its pages.
        </p>
      )}

      <ul className="space-y-2">
        {rows.map((row) => {
          const { candidate } = row;
          const resolution = resolve(candidate, books, row.bookId);
          const note = candidate.dateSource ? DATE_SOURCE_NOTE[candidate.dateSource] : null;
          return (
            <li key={candidate.id} className="rounded-xl border border-border p-3 space-y-2">
              <div className="flex items-start gap-3">
                <Checkbox
                  className="mt-2.5"
                  checked={row.checked}
                  aria-label={`Add ${row.title ?? resolution?.title ?? candidate.title}`}
                  onCheckedChange={(checked) => update(candidate.id, { checked: checked === true })}
                />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                    <Input
                      aria-label={`Title for ${candidate.title} from line ${candidate.lineNumber}`}
                      value={row.title ?? resolution?.title ?? candidate.title}
                      maxLength={200}
                      onChange={(e) => update(candidate.id, { title: e.target.value })}
                    />
                    <Input
                      type="date"
                      aria-label={`Due date for ${candidate.title} from line ${candidate.lineNumber}`}
                      value={row.date}
                      onChange={(e) => update(candidate.id, { date: e.target.value })}
                    />
                  </div>

                  <p className="text-xs text-muted-foreground truncate" title={candidate.line}>
                    “{candidate.line}”
                  </p>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {books.length > 0 && (
                      <label className="flex items-center gap-1.5 text-muted-foreground">
                        Textbook
                        <select
                          aria-label={`Textbook for ${candidate.title} from line ${candidate.lineNumber}`}
                          className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
                          value={row.bookId}
                          onChange={(e) => update(candidate.id, { bookId: e.target.value })}
                        >
                          <option value={NO_BOOK}>None</option>
                          {books.map((book) => (
                            <option key={book.id} value={book.id}>
                              {book.filename}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {resolution ? (
                      <span className="text-success">Download: {resolution.pages}</span>
                    ) : books.length > 0 ? (
                      row.bookId !== NO_BOOK ? (
                        <span className="text-warning">Not found in that textbook</span>
                      ) : resolveInBooks(candidate.reference, books) ? (
                        <span className="text-muted-foreground">No download</span>
                      ) : (
                        <span className="text-warning">Not found in your textbooks</span>
                      )
                    ) : null}
                    {resolution?.note && <span className="text-muted-foreground">{resolution.note}</span>}
                    {!row.date && (
                      <span className="flex items-center gap-1 text-warning">
                        <CalendarDays className="h-3 w-3" /> No date found
                      </span>
                    )}
                    {note && row.date === candidate.date && <span className="text-muted-foreground">{note}</span>}
                    {candidate.ambiguousDate && row.date === candidate.date && (
                      <span className="flex items-center gap-1 text-warning">
                        <AlertTriangle className="h-3 w-3" /> Read as month/day
                      </span>
                    )}
                    {isPast(row.date) && <span className="text-muted-foreground">Due in the past: added as done</span>}
                    {row.alreadyAdded && <span className="text-muted-foreground">Already in your readings</span>}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={confirm} disabled={chosen.length === 0 || saving}>
          {chosen.length === 0 ? "Nothing selected" : `Add ${chosen.length} reading${chosen.length === 1 ? "" : "s"}`}
        </Button>
      </DialogFooter>
    </div>
  );
}
