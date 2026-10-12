import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DeckSettings } from "@/lib/flashcards";
import { useDeck, useSaveDeckSettings } from "@/hooks/useFlashcards";
import { STUDY_MODES, StudyMode } from "@/components/flashcards/studyModes";
import { StudyOptionsDialog } from "@/components/flashcards/StudyOptionsDialog";
import { FlipMode } from "@/components/flashcards/FlipMode";
import { WriteMode } from "@/components/flashcards/WriteMode";
import { TestMode } from "@/components/flashcards/TestMode";

const isMode = (value: string | undefined): value is StudyMode => STUDY_MODES.some((m) => m.mode === value);

export default function FlashcardStudy() {
  const { deckId, mode } = useParams();
  const { data, isLoading } = useDeck(deckId);
  const saveSettings = useSaveDeckSettings();
  const [optionsOpen, setOptionsOpen] = useState(false);
  // What's in use right now: the deck's saved options, until changed here.
  const [localSettings, setLocalSettings] = useState<DeckSettings | null>(null);
  const [run, setRun] = useState(0);

  if (!isMode(mode)) return <Navigate to={`/flashcards/${deckId}`} replace />;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }
  const deck = data?.deck;
  if (!deck) {
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

  const settings = localSettings ?? deck.settings;
  const cards = data.cards;
  const props = { deckId: deck.id, cards, settings, onOpenOptions: () => setOptionsOpen(true) };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" className="gap-2 -ml-2 min-w-0">
            <Link to={`/flashcards/${deck.id}`}>
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span className="truncate">{deck.title}</span>
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-2 rounded-xl shrink-0" onClick={() => setOptionsOpen(true)}>
            <Settings2 className="h-4 w-4" />
            Options
          </Button>
        </div>

        <nav aria-label="Study mode" className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1">
          {STUDY_MODES.map(({ mode: m, label, icon: Icon }) => (
            <Link
              key={m}
              to={`/flashcards/${deck.id}/${m}`}
              aria-current={m === mode ? "page" : undefined}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors",
                m === mode ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* A new key starts the mode afresh (after options change, or switching mode). */}
        <div key={`${mode}-${run}`}>
          {mode === "cards" && <FlipMode {...props} />}
          {mode === "write" && <WriteMode {...props} />}
          {mode === "test" && <TestMode {...props} />}
        </div>
      </div>

      <StudyOptionsDialog
        mode={mode}
        settings={settings}
        cards={cards}
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
        onApply={(next) => {
          setLocalSettings(next);
          setRun((r) => r + 1);
          setOptionsOpen(false);
          saveSettings.mutate(
            { deckId: deck.id, settings: next },
            { onError: () => toast.error("Couldn't save these options for next time (they still apply now).") }
          );
        }}
      />
    </Layout>
  );
}
