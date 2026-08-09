import { useEffect, useState } from "react";
import { Clock, Trash2, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  listGaitSessions,
  deleteGaitSession,
  type GaitSessionRecord,
} from "@/lib/gait/persistence";
import type { AnalysisResult } from "@/lib/gait/types";

export function SessionHistoryDrawer({
  isOpen,
  onClose,
  onLoadSession,
}: {
  isOpen: boolean;
  onClose: () => void;
  onLoadSession: (result: AnalysisResult, name: string) => void;
}) {
  const [sessions, setSessions] = useState<GaitSessionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setErr(null);
      listGaitSessions()
        .then(setSessions)
        .catch((e) => {
          console.error(e);
          setErr("Sign-in required or failed to load sessions.");
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const handleDelete = async (id: string) => {
    try {
      await deleteGaitSession({ data: id });
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-md flex-col bg-[var(--color-bg)] p-6 shadow-xl border-l border-[var(--color-border)] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="size-5 text-[var(--color-primary)]" /> Saved Gait Sessions
          </h2>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        {loading ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <Loader2 className="size-6 animate-spin text-[var(--color-primary)]" />
          </div>
        ) : err ? (
          <div className="p-8 text-center text-sm text-[var(--color-subtle)]">
            {err}
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-subtle)]">
            No saved sessions found. Analyze a video and click "Save Session".
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {sessions.map((s) => (
              <Card key={s.id} className="p-4 border-[var(--color-border)]">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-sm">{s.sessionName}</h3>
                    <p className="text-xs text-[var(--color-subtle)]">
                      {new Date(s.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Badge tone="primary">{s.overallScore.toFixed(0)} / 100</Badge>
                </div>
                <div className="mt-2 text-xs text-[var(--color-muted)] flex flex-wrap gap-2">
                  <span>Cadence: {s.cadenceSpm.toFixed(0)} spm</span>
                  <span>SA: {s.symmetryAngle != null ? `${s.symmetryAngle.toFixed(1)}%` : "—"}</span>
                  <span>HR: {s.harmonicRatio != null ? s.harmonicRatio.toFixed(2) : "—"}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      onLoadSession(
                        {
                          metrics: s.metricsJson,
                          guesses: s.guessesJson,
                          personId: 1,
                          analyzedFrames: s.stepCount * 10,
                          notes: [`Loaded from saved session: ${s.sessionName}`],
                          taskMode: (s.taskMode as any) || "single",
                          dualTaskCost: s.dualTaskJson,
                        },
                        s.sessionName,
                      );
                      onClose();
                    }}
                  >
                    <FolderOpen className="size-3.5 mr-1" /> Load
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleDelete(s.id)}
                  >
                    <Trash2 className="size-3.5 text-[var(--color-danger)]" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
