import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowLeftRight, ArrowUp, ClipboardPaste, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { cn } from "@/lib/utils";
import { useCourses } from "@/hooks/useCourses";
import { useExams } from "@/hooks/useExams";
import { useQuizzes } from "@/hooks/useQuizzes";
import { CardDraft, useDeck, useDeleteDeck, useSaveDeck } from "@/hooks/useFlashcards";
import { ImportCardsDialog } from "@/components/flashcards/ImportCardsDialog";
import { format, parseISO } from "date-fns";

const NONE = "none";

interface Row extends CardDraft {
  /** Stable React key (new cards have no id yet). */
  key: string;
}

let nextKey = 0;
const blankRow = (): Row => ({ key: `new-${nextKey++}`, term: "", definition: "", starred: false });
const isBlank = (row: Row) => !row.term.trim() && !row.definition.trim();
const isHalf = (row: Row) => !isBlank(row) && (!row.term.trim() || !row.definition.trim());

export default function FlashcardEditor() {
  const { deckId } = useParams();
  const editing = !!deckId;
  const { data, isLoading } = useDeck(deckId);

  if (editing && isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }
  if (editing && !data?.deck) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto text-center space-y-3 py-16">
          <p className="text-lg">That deck doesn't exist.</p>
          <Button asChild variant="outline">
            <Link to="/flashcards">Back to flashcards</Link>
          </Button>
        </div>
      </Layout>
    );
  }
  // Remount when switching decks so the form starts from that deck.
  return <EditorForm key={deckId ?? "new"} deckId={deckId} initial={data ?? null} />;
}

function EditorForm({ deckId, initial }: { deckId?: string; initial: ReturnType<typeof useDeck>["data"] | null }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: allCourses = [] } = useCourses();
  const { data: exams = [] } = useExams();
  const { data: quizzes = [] } = useQuizzes();
  const save = useSaveDeck();
  const deleteDeck = useDeleteDeck();

  const deck = initial?.deck ?? null;
  const [title, setTitle] = useState(deck?.title ?? "");
  const [description, setDescription] = useState(deck?.description ?? "");
  const [courseId, setCourseId] = useState(deck?.course_id ?? params.get("course") ?? NONE);
  const [examId, setExamId] = useState(deck?.exam_id ?? params.get("exam") ?? NONE);
  const [quizId, setQuizId] = useState(deck?.quiz_id ?? params.get("quiz") ?? NONE);
  const [rows, setRows] = useState<Row[]>(() =>
    initial?.cards.length
      ? initial.cards.map((c) => ({ key: c.id, id: c.id, term: c.term, definition: c.definition, starred: c.starred }))
      : [blankRow(), blankRow()]
  );
  const originalIds = useMemo(() => new Set((initial?.cards ?? []).map((c) => c.id)), [initial]);
  const [showProblems, setShowProblems] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dirty, setDirty] = useState(false);
  const focusKey = useRef<string | null>(null);

  // Ask before leaving with unsaved changes (closing the tab, reloading).
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Focus a newly added card's term box.
  useEffect(() => {
    if (!focusKey.current) return;
    document.getElementById(`term-${focusKey.current}`)?.focus();
    focusKey.current = null;
  });

  const courses = allCourses.filter((c) => !c.is_archived || c.id === courseId);
  const examChoices = exams.filter((e) => courseId === NONE || e.course?.id === courseId || e.id === examId);
  const quizChoices = quizzes.filter((q) => courseId === NONE || q.course?.id === courseId || q.id === quizId);

  const change = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setDirty(true);
  };
  const updateRows = (next: (rows: Row[]) => Row[]) => {
    setRows(next);
    setDirty(true);
  };
  const setRow = (key: string, patch: Partial<Row>) => updateRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRowAfter = (index: number) => {
    const row = blankRow();
    focusKey.current = row.key;
    updateRows((current) => [...current.slice(0, index + 1), row, ...current.slice(index + 1)]);
  };
  const move = (index: number, by: number) =>
    updateRows((current) => {
      const target = index + by;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  // Picking an exam or quiz from another course moves the deck to that course.
  const chooseExam = (id: string) => {
    change(setExamId)(id);
    const exam = exams.find((e) => e.id === id);
    if (exam?.course && courseId === NONE) setCourseId(exam.course.id);
  };
  const chooseQuiz = (id: string) => {
    change(setQuizId)(id);
    const quiz = quizzes.find((q) => q.id === id);
    if (quiz?.course && courseId === NONE) setCourseId(quiz.course.id);
  };
  const chooseCourse = (id: string) => {
    change(setCourseId)(id);
    // Unlink an exam/quiz that belongs to a different course.
    if (id !== NONE) {
      if (exams.find((e) => e.id === examId)?.course?.id !== id) setExamId(NONE);
      if (quizzes.find((q) => q.id === quizId)?.course?.id !== id) setQuizId(NONE);
    }
  };

  const cards = rows.filter((r) => !isBlank(r));
  const halfCount = rows.filter(isHalf).length;
  const problem = !title.trim() ? "Give the deck a title." : halfCount ? `${halfCount} card${halfCount === 1 ? " is" : "s are"} missing a term or a definition.` : null;

  const submit = async () => {
    if (problem) {
      setShowProblems(true);
      toast.error(problem);
      return;
    }
    const keptIds = new Set(cards.map((r) => r.id).filter(Boolean));
    try {
      const id = await save.mutateAsync({
        deckId,
        fields: {
          title,
          description,
          course_id: courseId === NONE ? null : courseId,
          exam_id: examId === NONE ? null : examId,
          quiz_id: quizId === NONE ? null : quizId,
        },
        cards: cards.map(({ id, term, definition, starred }) => ({ id, term, definition, starred })),
        removedIds: [...originalIds].filter((id) => !keptIds.has(id)),
      });
      setDirty(false);
      toast.success(deckId ? "Deck saved" : "Deck created");
      navigate(`/flashcards/${id}`);
    } catch {
      // Shown by the global mutation error handler.
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6 pb-24">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" className="gap-2 -ml-2">
            <Link to={deckId ? `/flashcards/${deckId}` : "/flashcards"}>
              <ArrowLeft className="h-4 w-4" />
              {deckId ? "Back to deck" : "Flashcards"}
            </Link>
          </Button>
          <Button onClick={submit} disabled={save.isPending} className="rounded-xl">
            {deckId ? "Save" : "Create deck"}
          </Button>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight">{deckId ? "Edit deck" : "New deck"}</h1>

        <section className="glass-strong rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="deckTitle">Title</Label>
            <Input
              id="deckTitle"
              value={title}
              maxLength={200}
              placeholder="e.g. Chapter 5: Cell Structure"
              onChange={(e) => change(setTitle)(e.target.value)}
              aria-invalid={showProblems && !title.trim()}
              className={cn(showProblems && !title.trim() && "border-destructive")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deckDescription">Description (optional)</Label>
            <Textarea id="deckDescription" value={description} maxLength={2000} rows={2} onChange={(e) => change(setDescription)(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="deckCourse">Course</Label>
              <Select value={courseId} onValueChange={chooseCourse}>
                <SelectTrigger id="deckCourse">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No course</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.short_code} · {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deckExam">For exam</Label>
              <Select value={examId} onValueChange={chooseExam}>
                <SelectTrigger id="deckExam">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {examChoices.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.title} · {format(parseISO(e.exam_at), "MMM d")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deckQuiz">For quiz</Label>
              <Select value={quizId} onValueChange={chooseQuiz}>
                <SelectTrigger id="deckQuiz">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {quizChoices.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.title} · {format(parseISO(q.quiz_at), "MMM d")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              Cards <span className="text-muted-foreground font-normal">({cards.length})</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setImportOpen(true)}>
                <ClipboardPaste className="h-4 w-4" />
                Import
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={cards.length === 0}
                onClick={() => updateRows((current) => current.map((r) => ({ ...r, term: r.definition, definition: r.term })))}
              >
                <ArrowLeftRight className="h-4 w-4" />
                Swap terms and definitions
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: Ctrl+Enter (⌘+Enter on a Mac) adds a card after the one you're typing in. Write several accepted answers separated by “;” and put optional words in
            (parentheses).
          </p>

          <ol className="space-y-3">
            {rows.map((row, index) => {
              const flagged = showProblems && isHalf(row);
              const label = `card ${index + 1}`;
              const onKeyDown = (event: React.KeyboardEvent) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  addRowAfter(index);
                }
              };
              return (
                <li key={row.key} className={cn("glass-strong rounded-2xl p-3 sm:p-4 border", flagged ? "border-destructive" : "border-transparent")}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-muted-foreground">{index + 1}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={row.starred ? `Unstar ${label}` : `Star ${label}`}
                        aria-pressed={row.starred}
                        onClick={() => setRow(row.key, { starred: !row.starred })}
                      >
                        <Star className={cn("h-4 w-4", row.starred && "fill-warning text-warning")} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Move ${label} down`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={`Delete ${label}`}
                        onClick={() => updateRows((current) => (current.length === 1 ? [blankRow()] : current.filter((r) => r.key !== row.key)))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`term-${row.key}`} className="text-xs text-muted-foreground">
                        Term
                      </Label>
                      <Textarea
                        id={`term-${row.key}`}
                        rows={1}
                        maxLength={1000}
                        value={row.term}
                        aria-label={`Term for ${label}`}
                        onKeyDown={onKeyDown}
                        onChange={(e) => setRow(row.key, { term: e.target.value })}
                        className="min-h-[2.5rem] resize-y"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`definition-${row.key}`} className="text-xs text-muted-foreground">
                        Definition
                      </Label>
                      <Textarea
                        id={`definition-${row.key}`}
                        rows={1}
                        maxLength={4000}
                        value={row.definition}
                        aria-label={`Definition for ${label}`}
                        onKeyDown={onKeyDown}
                        onChange={(e) => setRow(row.key, { definition: e.target.value })}
                        className="min-h-[2.5rem] resize-y"
                      />
                    </div>
                  </div>
                  {flagged && <p className="text-xs text-destructive mt-2">Fill in both sides, or delete this card.</p>}
                </li>
              );
            })}
          </ol>

          <Button variant="outline" className="w-full gap-2 rounded-xl h-12 border-dashed" onClick={() => addRowAfter(rows.length - 1)}>
            <Plus className="h-4 w-4" />
            Add card
          </Button>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {deckId ? (
            <Button variant="ghost" className="text-destructive gap-2" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
              Delete deck
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={submit} disabled={save.isPending} className="rounded-xl">
            {deckId ? "Save" : "Create deck"}
          </Button>
        </div>
      </div>

      <ImportCardsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={(imported, replace) => {
          const added = imported.map((c) => ({ ...blankRow(), term: c.term, definition: c.definition }));
          updateRows((current) => (replace ? added : [...current.filter((r) => !isBlank(r)), ...added]));
          toast.success(`Added ${imported.length} card${imported.length === 1 ? "" : "s"}. Save to keep them.`);
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="glass-strong border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this deck?</AlertDialogTitle>
            <AlertDialogDescription>“{deck?.title}”, all its cards and its test results are deleted. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
              onClick={async () => {
                if (!deckId) return;
                try {
                  await deleteDeck.mutateAsync(deckId);
                  setDirty(false);
                  toast.success("Deck deleted");
                  navigate("/flashcards");
                } catch {
                  // Shown by the global mutation error handler.
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
