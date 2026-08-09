import { BookOpen, Brain, ClipboardList, GitBranch } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DETERMINATION_LADDER } from "@/lib/gait/guesses";

export function GuidePanel() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <BookOpen className="size-4 text-[var(--color-primary)]" />
            What we can determine vs diagnose
          </CardTitle>
          <CardDescription>
            A fixed ladder for every analysis. Measures are facts about the clip; diagnoses are
            never produced.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {DETERMINATION_LADDER.map((layer) => (
            <div
              key={layer.id}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
            >
              <h4 className="text-sm font-semibold text-[var(--color-fg)]">{layer.title}</h4>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-success)]">
                    Can
                  </p>
                  <ul className="space-y-1">
                    {layer.can.map((c) => (
                      <li key={c} className="text-xs leading-snug text-[var(--color-muted)]">
                        · {c}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-danger)]">
                    Cannot
                  </p>
                  <ul className="space-y-1">
                    {layer.cannot.map((c) => (
                      <li key={c} className="text-xs leading-snug text-[var(--color-muted)]">
                        · {c}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Brain className="size-4 text-[var(--color-accent)]" />
            Cognition & dual-task protocol
          </CardTitle>
          <CardDescription>
            Research (e.g. dual-task gait reviews in aging neuroscience) treats dual-task cost and
            stride-time variability as <em>group-level</em> markers of motor–cognitive interference —
            not individual cognitive ability scores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-[var(--color-muted)]">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-[var(--color-fg)]">Clip A — single task:</strong> same path,
              walk normally, minimal talking. Label analysis <Badge tone="primary">Walk only</Badge>
            </li>
            <li>
              <strong className="text-[var(--color-fg)]">Clip B — dual task:</strong> same path while
              counting backward by 3s, naming animals, or holding a conversation. Label{" "}
              <Badge tone="accent">Walk + cognitive</Badge>
            </li>
            <li>
              After both analyses in one session, the app computes{" "}
              <strong className="text-[var(--color-fg)]">dual-task cost</strong> on cadence,
              step-time variability, stability, and automaticity.
            </li>
          </ol>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs leading-relaxed text-[var(--color-subtle)]">
            A large dual-task cost is a hypothesis generator (interference, task hardness, fatigue,
            environment) — never “MCI”, “dementia”, or an IQ estimate.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <GitBranch className="size-4 text-[var(--color-warn)]" />
            Pattern language (observational)
          </CardTitle>
          <CardDescription>
            Soft clusters inspired by classic observational categories (antalgic, Trendelenburg,
            hypokinetic / parkinsonian-spectrum, wide-based / cautious). Always multi-cause.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-xs text-[var(--color-muted)] sm:grid-cols-2">
          {[
            ["Antalgic-like", "Shortened / asymmetric loading clues"],
            ["Trendelenburg-ish", "Pelvic height asymmetry proxy"],
            ["Hypokinetic-like", "Low arm swing + limited excursion cluster"],
            ["Wide-based / cautious", "Width + sway + slow options"],
            ["High variability", "Step-time CV research marker"],
            ["Dual-task cost", "Paired clip interference marker"],
          ].map(([t, d]) => (
            <div
              key={t}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
            >
              <p className="font-medium text-[var(--color-fg)]">{t}</p>
              <p className="text-[var(--color-subtle)]">{d}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardList className="size-4" />
            Better recordings
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs leading-relaxed text-[var(--color-muted)]">
          Full body in frame · 5–20 s continuous walk · side view for knees/stride · front view for
          sway/width · steady phone · H.264 MP4 from iPhone (“Most Compatible”) · avoid heavy
          occlusion · multi-person: select the subject before analyze.
        </CardContent>
      </Card>
    </div>
  );
}
