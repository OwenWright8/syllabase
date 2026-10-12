import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layers, Plus, Search } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CourseChip } from "@/components/CourseChip";
import { DeckSummary, useDecks } from "@/hooks/useFlashcards";
import { deckLinkText } from "@/lib/flashcards";

const ALL = "all";
const NO_COURSE = "none";

export default function Flashcards() {
  const { data: decks = [], isLoading } = useDecks();
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState(ALL);

  const courses = useMemo(() => {
    const byId = new Map<string, NonNullable<DeckSummary["course"]>>();
    for (const deck of decks) if (deck.course) byId.set(deck.course.id, deck.course);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [decks]);

  const shown = decks.filter((deck) => {
    if (course === NO_COURSE && deck.course_id) return false;
    if (course !== ALL && course !== NO_COURSE && deck.course_id !== course) return false;
    const query = search.trim().toLowerCase();
    return !query || deck.title.toLowerCase().includes(query) || deck.description.toLowerCase().includes(query);
  });

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">Flashcards</h1>
            <p className="text-muted-foreground mt-1">Make decks, then study them as flashcards, by typing answers, or with a graded test.</p>
          </div>
          <Button asChild className="gap-2 rounded-xl h-10">
            <Link to="/flashcards/new">
              <Plus className="h-4 w-4" />
              New deck
            </Link>
          </Button>
        </div>

        {decks.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input aria-label="Search decks" placeholder="Search decks" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 rounded-xl" />
            </div>
            {courses.length > 0 && (
              <Select value={course} onValueChange={setCourse}>
                <SelectTrigger aria-label="Filter by course" className="sm:w-56 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All courses</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.short_code} · {c.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NO_COURSE}>No course</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
          </div>
        ) : decks.length === 0 ? (
          <div className="glass-strong rounded-2xl p-10 text-center space-y-3">
            <Layers className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="text-lg text-foreground">No flashcard decks yet</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              A deck is a set of terms and definitions. Link it to an exam or quiz and it shows up there too. You can type cards in or paste a list
              (for example, exported from Quizlet).
            </p>
            <Button asChild className="gap-2 rounded-xl">
              <Link to="/flashcards/new">
                <Plus className="h-4 w-4" />
                Make your first deck
              </Link>
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">No decks match.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((deck) => (
              <li key={deck.id}>
                <DeckTile deck={deck} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}

function DeckTile({ deck }: { deck: DeckSummary }) {
  const link = deckLinkText(deck);
  const knownPercent = deck.cardCount ? Math.round((deck.knownCount / deck.cardCount) * 100) : 0;
  return (
    <Link
      to={`/flashcards/${deck.id}`}
      className="block h-full glass-strong rounded-2xl p-4 space-y-3 transition-colors hover:border-primary/40 border border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold text-foreground leading-snug">{deck.title}</h2>
        {deck.course && <CourseChip shortCode={deck.course.short_code} color={deck.course.color} className="shrink-0" />}
      </div>
      {link && <p className="text-xs text-muted-foreground">{link}</p>}
      {deck.description && <p className="text-sm text-muted-foreground line-clamp-2">{deck.description}</p>}
      <div className="space-y-1.5">
        <Progress value={knownPercent} className="h-1.5" aria-label={`${deck.knownCount} of ${deck.cardCount} known`} />
        <p className="text-xs text-muted-foreground">
          {deck.cardCount} card{deck.cardCount === 1 ? "" : "s"}
          {deck.cardCount > 0 && ` · ${deck.knownCount} known`}
        </p>
      </div>
    </Link>
  );
}
