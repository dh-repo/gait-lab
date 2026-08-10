import { BookOpen, Brain, ClipboardList, GitBranch } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DETERMINATION_LADDER } from "@/lib/gait/guesses";

export function GuidePanel() {
  return (
    <div className="flex flex-col gap-4 font-['Google_Sans',sans-serif]">
      {/* Determination Ladder */}
      <Card className="border border-[var(--color-border)] bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-card)]">
        <CardHeader className="border-b border-[var(--color-surface-2)] pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-[var(--color-fg)]">
            <BookOpen className="size-4 text-[var(--color-primary)]" />
            What we can determine vs diagnose
          </CardTitle>
          <CardDescription className="text-xs text-[var(--color-muted)] mt-1">
            A fixed ladder for every analysis. Measures are facts about the clip; diagnoses are
            never produced.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-4">
          {DETERMINATION_LADDER.map((layer) => (
            <div
              key={layer.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3.5"
            >
              <h4 className="text-xs font-semibold text-[var(--color-fg)]">{layer.title}</h4>
              <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-[#CEEAD6] bg-[var(--color-success-bg)]/60 p-2.5">
                  <div className="mb-1.5 flex items-center gap-1">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--color-success-bg)] text-[var(--color-success-text)]">
                      CAN
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {layer.can.map((c) => (
                      <li key={c} className="text-xs leading-snug text-[var(--color-fg)] flex items-start gap-1.5">
                        <span className="text-[var(--color-success-text)] font-bold">•</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border border-[#FAD2CF] bg-[var(--color-danger-bg)]/60 p-2.5">
                  <div className="mb-1.5 flex items-center gap-1">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]">
                      CANNOT
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {layer.cannot.map((c) => (
                      <li key={c} className="text-xs leading-snug text-[var(--color-fg)] flex items-start gap-1.5">
                        <span className="text-[var(--color-danger-text)] font-bold">•</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Cognition & Dual-Task Protocol */}
      <Card className="border border-[var(--color-border)] bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-card)]">
        <CardHeader className="border-b border-[var(--color-surface-2)] pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-[var(--color-fg)]">
            <Brain className="size-4 text-[var(--color-primary)]" />
            Cognition & dual-task protocol
          </CardTitle>
          <CardDescription className="text-xs text-[var(--color-muted)] mt-1">
            Research (e.g. dual-task gait reviews in aging neuroscience) treats dual-task cost and
            stride-time variability as <em>group-level</em> markers of motor–cognitive interference —
            not individual cognitive ability scores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs text-[var(--color-muted)] pt-4">
          <ol className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[11px] font-semibold text-[var(--color-primary-fg)] mt-0.5">
                1
              </span>
              <div>
                <strong className="font-semibold text-[var(--color-fg)]">Clip A — single task:</strong> same path,
                walk normally, minimal talking. Label analysis{" "}
                <Badge className="bg-[var(--color-info-bg)] text-[var(--color-info-text)] border border-[color-mix(in_srgb,var(--color-info)_25%,transparent)] text-[11px]">Walk only</Badge>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[11px] font-semibold text-[var(--color-primary-fg)] mt-0.5">
                2
              </span>
              <div>
                <strong className="font-semibold text-[var(--color-fg)]">Clip B — dual task:</strong> same path while
                counting backward by 3s, naming animals, or holding a conversation. Label{" "}
                <Badge className="bg-[var(--color-warn-bg)] text-[var(--color-warn-text)] border border-[color-mix(in_srgb,var(--color-danger)_22%,transparent)] text-[11px]">Walk + cognitive</Badge>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[11px] font-semibold text-[var(--color-primary-fg)] mt-0.5">
                3
              </span>
              <div>
                After both analyses in one session, the app computes{" "}
                <strong className="font-semibold text-[var(--color-fg)]">dual-task cost</strong> on cadence,
                step-time variability, stability, and automaticity.
              </div>
            </li>
          </ol>
          <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-info)_25%,transparent)] bg-[var(--color-info-bg)] p-3 text-xs leading-relaxed text-[var(--color-info-text)]">
            A large dual-task cost is a hypothesis generator (interference, task hardness, fatigue,
            environment) — never “MCI”, “dementia”, or an IQ estimate.
          </div>
        </CardContent>
      </Card>

      {/* Observational Pattern Language */}
      <Card className="border border-[var(--color-border)] bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-card)]">
        <CardHeader className="border-b border-[var(--color-surface-2)] pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-[var(--color-fg)]">
            <GitBranch className="size-4 text-[var(--color-warn-text)]" />
            Pattern language (observational)
          </CardTitle>
          <CardDescription className="text-xs text-[var(--color-muted)] mt-1">
            Soft clusters inspired by classic observational categories (antalgic, Trendelenburg,
            hypokinetic / parkinsonian-spectrum, wide-based / cautious). Always multi-cause.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2.5 text-xs text-[var(--color-muted)] sm:grid-cols-2 pt-4">
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
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5"
            >
              <p className="font-semibold text-[var(--color-fg)] text-xs">{t}</p>
              <p className="text-[var(--color-muted)] text-[11px] mt-0.5">{d}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Recording Quality Guidelines */}
      <Card className="border border-[var(--color-border)] bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-card)]">
        <CardHeader className="border-b border-[var(--color-surface-2)] pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-[var(--color-fg)]">
            <ClipboardList className="size-4 text-[var(--color-primary)]" />
            Better recordings
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs leading-relaxed text-[var(--color-muted)] pt-4">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            Full body in frame · 5–20 s continuous walk · side view for knees/stride · front view for
            sway/width · steady phone · H.264 MP4 from iPhone (“Most Compatible”) · avoid heavy
            occlusion · multi-person: select the subject before analyze.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
