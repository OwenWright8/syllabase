import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, BellOff, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";

const LEAD_DAY_OPTIONS = [7, 3, 1, 0];
const leadDayLabel = (d: number) => (d === 0 ? "Day of" : `${d} day${d === 1 ? "" : "s"} before`);

function DayChips({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const toggle = (d: number) => {
    onChange(value.includes(d) ? value.filter((v) => v !== d) : [...value, d].sort((a, b) => b - a));
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {LEAD_DAY_OPTIONS.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => toggle(d)}
          className={cn(
            "text-xs px-2.5 py-1 rounded-full border transition-colors",
            value.includes(d)
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          )}
        >
          {leadDayLabel(d)}
        </button>
      ))}
    </div>
  );
}

const DIGEST_TIME_OPTIONS = ["06:00", "07:00", "08:00", "09:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"];

export function PushoverNotificationSettings() {
  const { settings, loading, updateSettings, sendTestNotification, isSaving } = useNotificationSettings();
  const [form, setForm] = useState(settings);
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    if (!loading) setForm(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, settings.user_id]);

  if (loading) return null;

  const handleSave = async () => {
    await updateSettings(form);
  };

  const handleTest = async () => {
    if (!form.pushover_user_key || !form.pushover_app_token) return;
    setSendingTest(true);
    await sendTestNotification(form.pushover_user_key, form.pushover_app_token, form.pushover_device);
    setSendingTest(false);
  };

  return (
    <div className="col-span-12 lg:col-span-6 glass-strong rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        {form.enabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        <h3 className="text-lg font-semibold text-foreground">Notifications</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Push notifications via{" "}
        <a href="https://pushover.net" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
          Pushover
        </a>{" "}
        — arrive on your phone or desktop even when the app is closed. Each person brings their own
        Pushover account, so nothing here depends on how this instance is hosted.
      </p>

      <div className="space-y-4">
        <div>
          <Label htmlFor="pushoverKey" className="text-sm">Pushover User Key</Label>
          <Input
            id="pushoverKey"
            value={form.pushover_user_key ?? ""}
            onChange={(e) => setForm({ ...form, pushover_user_key: e.target.value })}
            placeholder="u1a2b3c4d5..."
            className="rounded-xl mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Shown on your{" "}
            <a href="https://pushover.net" target="_blank" rel="noreferrer" className="underline">
              Pushover dashboard
            </a>{" "}
            after creating an account and installing the app on your phone.
          </p>
        </div>

        <div>
          <Label htmlFor="pushoverAppToken" className="text-sm">Pushover App Token</Label>
          <div className="flex gap-2 mt-1">
            <Input
              id="pushoverAppToken"
              value={form.pushover_app_token ?? ""}
              onChange={(e) => setForm({ ...form, pushover_app_token: e.target.value })}
              placeholder="a1z2y3x4w5..."
              className="rounded-xl"
            />
            <Button
              type="button"
              variant="outline"
              className="rounded-xl shrink-0 gap-1.5"
              disabled={!form.pushover_user_key || !form.pushover_app_token || sendingTest}
              onClick={handleTest}
            >
              <Send className="h-3.5 w-3.5" />
              {sendingTest ? "Sending..." : "Test"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Create a free application at{" "}
            <a href="https://pushover.net/apps/build" target="_blank" rel="noreferrer" className="underline">
              pushover.net/apps/build
            </a>{" "}
            (any name works, e.g. "Study Planner") to get this token — takes about 30 seconds, no approval needed.
          </p>
        </div>

        <div>
          <Label htmlFor="pushoverDevice" className="text-sm">Device (optional)</Label>
          <Input
            id="pushoverDevice"
            value={form.pushover_device ?? ""}
            onChange={(e) => setForm({ ...form, pushover_device: e.target.value })}
            placeholder="e.g. iphone"
            className="rounded-xl mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Leave blank to notify all your devices, or enter one device name from your{" "}
            <a href="https://pushover.net" target="_blank" rel="noreferrer" className="underline">
              Pushover dashboard
            </a>{" "}
            to only notify that one.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm">Enable Notifications</Label>
            <p className="text-xs text-muted-foreground">Master switch for everything below</p>
          </div>
          <Switch
            checked={form.enabled}
            onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
          />
        </div>

        {form.enabled && (
          <div className="space-y-4 pt-1 border-t border-border/50">
            {/* Assignments */}
            <div className="pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Assignments</Label>
                <Switch
                  checked={form.assignments_enabled}
                  onCheckedChange={(checked) => setForm({ ...form, assignments_enabled: checked })}
                />
              </div>
              {form.assignments_enabled && (
                <Select
                  value={String(form.assignments_lead_hours)}
                  onValueChange={(v) => setForm({ ...form, assignments_lead_hours: parseInt(v) })}
                >
                  <SelectTrigger className="rounded-xl h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">Due within 6 hours</SelectItem>
                    <SelectItem value="12">Due within 12 hours</SelectItem>
                    <SelectItem value="24">Due within 24 hours</SelectItem>
                    <SelectItem value="48">Due within 48 hours</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Exams */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Exams</Label>
                <Switch
                  checked={form.exams_enabled}
                  onCheckedChange={(checked) => setForm({ ...form, exams_enabled: checked })}
                />
              </div>
              {form.exams_enabled && (
                <DayChips
                  value={form.exams_lead_days}
                  onChange={(v) => setForm({ ...form, exams_lead_days: v })}
                />
              )}
            </div>

            {/* Quizzes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Quizzes</Label>
                <Switch
                  checked={form.quizzes_enabled}
                  onCheckedChange={(checked) => setForm({ ...form, quizzes_enabled: checked })}
                />
              </div>
              {form.quizzes_enabled && (
                <DayChips
                  value={form.quizzes_lead_days}
                  onChange={(v) => setForm({ ...form, quizzes_lead_days: v })}
                />
              )}
            </div>

            {/* Daily digest */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Daily Digest</Label>
                <Switch
                  checked={form.daily_digest_enabled}
                  onCheckedChange={(checked) => setForm({ ...form, daily_digest_enabled: checked })}
                />
              </div>
              {form.daily_digest_enabled && (
                <Select
                  value={form.daily_digest_time.slice(0, 5)}
                  onValueChange={(v) => setForm({ ...form, daily_digest_time: `${v}:00` })}
                >
                  <SelectTrigger className="rounded-xl h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIGEST_TIME_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {new Date(`2000-01-01T${t}:00`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        )}

        <Button onClick={handleSave} disabled={isSaving} className="rounded-xl">
          {isSaving ? "Saving..." : "Save Notification Settings"}
        </Button>
      </div>
    </div>
  );
}
