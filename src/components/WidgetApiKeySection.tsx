import { useState } from "react";
import { Puzzle, Copy, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
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
import { useWidgetApiKeys, useCreateWidgetApiKey, useDeleteWidgetApiKey } from "@/hooks/useWidgetApiKeys";
import { SUPABASE_URL } from "@/lib/runtimeConfig";

export function WidgetApiKeySection() {
  const { data: keys = [] } = useWidgetApiKeys();
  const createKey = useCreateWidgetApiKey();
  const deleteKey = useDeleteWidgetApiKey();
  const [label, setLabel] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const functionsUrl = `${SUPABASE_URL}/functions/v1/widget-stats`;

  const handleCreate = async () => {
    try {
      const plaintext = await createKey.mutateAsync(label.trim() || "Homepage");
      setNewKey(plaintext);
      setLabel("");
    } catch {
      // Surfaced by the global mutation error handler.
    }
  };

  const handleCopy = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = async () => {
    if (!revokeId) return;
    try {
      await deleteKey.mutateAsync(revokeId);
      toast.success("Key revoked");
    } catch {
      // Surfaced by the global mutation error handler.
    } finally {
      setRevokeId(null);
    }
  };

  const yamlSnippet = `- Study Planner:
    icon: mdi-notebook-outline
    href: https://your-study-planner-url/
    widget:
      type: customapi
      url: ${functionsUrl}
      headers:
        X-Api-Key: ${newKey ?? "YOUR_API_KEY"}
      mappings:
        - field: tasks_due_today
          label: Due Today
          format: number
        - field: tasks_overdue
          label: Overdue
          format: number
        - field: week_completion_pct
          label: This Week
          format: percent
        - field: next_exam_title
          label: Next Exam
        - field: next_exam_days
          label: In Days
          format: number`;

  return (
    <div className="col-span-12 glass-strong rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Puzzle className="h-5 w-5" />
        <h3 className="text-lg font-semibold text-foreground">Homepage Widget</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Generate an API key to show your stats on a{" "}
        <a
          href="https://gethomepage.dev/widgets/services/customapi/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Homepage
        </a>{" "}
        dashboard via its Custom API widget.
      </p>

      {newKey ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 mb-4 space-y-3">
          <p className="text-sm font-medium text-foreground">
            Copy this key now — it won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <Input value={newKey} readOnly className="rounded-xl font-mono text-xs" />
            <Button aria-label="Copy API key" size="icon" variant="outline" className="rounded-xl shrink-0" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              services.yaml snippet
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-[11px] leading-relaxed">
              {yamlSnippet}
            </pre>
          </details>
          <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => setNewKey(null)}>
            Done
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2 mb-4">
          <div className="flex-1">
            <Label htmlFor="widgetKeyLabel" className="text-sm">
              Label
            </Label>
            <Input
              id="widgetKeyLabel"
              placeholder="e.g. Homepage"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 rounded-xl"
            />
          </div>
          <Button onClick={handleCreate} disabled={createKey.isPending} className="rounded-xl">
            Generate Key
          </Button>
        </div>
      )}

      {keys.length > 0 && (
        <div className="space-y-2">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{key.label || "Untitled"}</p>
                <p className="text-xs text-muted-foreground">
                  Created {format(new Date(key.created_at), "MMM d, yyyy")}
                  {key.last_used_at && ` • Last used ${format(new Date(key.last_used_at), "MMM d, yyyy")}`}
                </p>
              </div>
              <Button
                aria-label={`Revoke ${key.label || "key"}`}
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => setRevokeId(key.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!revokeId} onOpenChange={(open) => !open && setRevokeId(null)}>
        <AlertDialogContent className="glass-strong border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
            <AlertDialogDescription>
              Any dashboard using this key will stop being able to fetch your stats.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
