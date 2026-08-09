import { useEffect, useState } from "react";
import { Clock, Trash2, FolderOpen, Loader2, GitCompare, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  listGaitSessions,
  deleteGaitSession,
  type GaitSessionRecord,
} from "@/lib/gait/persistence";
import type { AnalysisResult } from "@/lib/gait/types";

export interface SessionHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadSession: (result: AnalysisResult, name: string) => void;
  onCompareSessions?: (sessionA: GaitSessionRecord, sessionB: GaitSessionRecord) => void;
}

export function SessionHistoryDrawer({
  isOpen,
  onClose,
  onLoadSession,
  onCompareSessions,
}: SessionHistoryDrawerProps) {
  const [sessions, setSessions] = useState<GaitSessionRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
    } else {
      setSelectedIds([]);
    }
  }, [isOpen]);

  const handleDelete = async (id: string) => {
    try {
      await deleteGaitSession({ data: id });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((i) => i !== id);
      }
      if (prev.length >= 2) {
        return [prev[1], id];
      }
      return [...prev, id];
    });
  };

  if (!isOpen) return null;

  const canCompare = selectedIds.length === 2 && Boolean(onCompareSessions);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px]">
      <div className="flex h-full w-full max-w-md flex-col bg-[var(--color-bg)] shadow-xl border-l border-[var(--color-border)]">
        {/* Drawer Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)] shrink-0">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-[var(--color-fg)]">
            <Clock className="size-5 text-[var(--color-primary)]" /> Saved Gait Sessions
          </h2>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {/* Sessions List Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center p-8">
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
            <div className="flex flex-col gap-3">
              {onCompareSessions && (
                <p className="text-xs text-[var(--color-subtle)] mb-1">
                  Select 2 sessions to perform side-by-side comparative analysis ({selectedIds.length}/2 selected):
                </p>
              )}
              {sessions.map((s) => {
                const isSelected = selectedIds.includes(s.id);
                return (
                  <Card
                    key={s.id}
                    data-testid={`session-card-${s.id}`}
                    className={`p-4 border-[var(--color-border)] transition-colors ${
                      isSelected ? "border-[var(--color-primary)] bg-[color-mix(in_oklab,var(--color-primary)_8%,var(--color-surface))]" : ""
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-start gap-2.5">
                        {onCompareSessions && (
                          <button
                            type="button"
                            onClick={() => toggleSelect(s.id)}
                            aria-label={`Select ${s.sessionName} for comparison`}
                            data-testid={`checkbox-select-${s.id}`}
                            className="mt-0.5 text-[var(--color-primary)] hover:opacity-80 focus:outline-none"
                          >
                            {isSelected ? (
                              <CheckSquare className="size-4" />
                            ) : (
                              <Square className="size-4 text-[var(--color-muted)]" />
                            )}
                          </button>
                        )}
                        <div>
                          <h3 className="font-semibold text-sm text-[var(--color-fg)]">{s.sessionName}</h3>
                          <p className="text-xs text-[var(--color-subtle)]">
                            {new Date(s.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <Badge tone="primary">{s.overallScore.toFixed(0)} / 100</Badge>
                    </div>
                    <div className="mt-2 text-xs text-[var(--color-muted)] flex flex-wrap gap-2">
                      <span>Cadence: {s.cadenceSpm.toFixed(0)} spm</span>
                      <span>SA: {s.symmetryAngle != null ? `${s.symmetryAngle.toFixed(1)}%` : "—"}</span>
                      {s.taskMode && <span className="capitalize">Mode: {s.taskMode}</span>}
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
                              // The frame count was never persisted. Derive it from the
                              // stored series length when present, else 0 — an invented
                              // `stepCount * 10` fed the displayed data-quality rating
                              // with a number no measurement ever produced.
                              analyzedFrames: s.metricsJson?.series?.length ?? 0,
                              notes: [`Loaded from saved session: ${s.sessionName}`],
                              taskMode: (s.taskMode as any) || "single",
                              dualTaskCost: s.dualTaskJson,
                              angleAnalysis: s.angleAnalysisJson,
                              patientMeta: s.patientMetaJson,
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
                );
              })}
            </div>
          )}
        </div>

        {/* Sticky Footer Compare Action */}
        {canCompare && (
          <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg shrink-0">
            <Button
              className="w-full gap-2"
              data-testid="compare-selected-button"
              onClick={() => {
                const sA = sessions.find((s) => s.id === selectedIds[0]);
                const sB = sessions.find((s) => s.id === selectedIds[1]);
                if (sA && sB && onCompareSessions) {
                  onCompareSessions(sA, sB);
                  onClose();
                }
              }}
            >
              <GitCompare className="size-4" /> Compare Selected (2 Sessions)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

