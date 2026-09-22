"use client";

/** Shared 1–5 profile/intent + notes fields (SC-1 / SC-2). */
export function StageScoreFields({
  profileScore,
  intentScore,
  notes,
  onProfileChange,
  onIntentChange,
  onNotesChange,
  notesLabel,
  notesPlaceholder,
  required = true,
}: {
  profileScore: number | "";
  intentScore: number | "";
  notes: string;
  onProfileChange: (v: number | "") => void;
  onIntentChange: (v: number | "") => void;
  onNotesChange: (v: string) => void;
  notesLabel: string;
  notesPlaceholder: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-[#F7F8FC] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
        Scores {required ? "(required)" : ""}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Profile (1–5)
          <select
            className="input-field mt-1 py-1.5"
            value={profileScore === "" ? "" : String(profileScore)}
            required={required}
            onChange={(e) =>
              onProfileChange(e.target.value ? Number(e.target.value) : "")
            }
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Intent (1–5)
          <select
            className="input-field mt-1 py-1.5"
            value={intentScore === "" ? "" : String(intentScore)}
            required={required}
            onChange={(e) =>
              onIntentChange(e.target.value ? Number(e.target.value) : "")
            }
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs text-muted">
        {notesLabel}
        <textarea
          className="input-field mt-1 min-h-[64px] text-sm"
          placeholder={notesPlaceholder}
          value={notes}
          required={required}
          onChange={(e) => onNotesChange(e.target.value)}
        />
      </label>
    </div>
  );
}
