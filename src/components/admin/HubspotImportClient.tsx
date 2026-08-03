"use client";

import { importLeadsFromCsv } from "@/app/actions/import-leads";
import { STAGE_LABELS, STAGES, type Stage } from "@/lib/constants";
import {
  IMPORT_FIELDS,
  parseCsv,
  suggestColumnMapping,
  suggestStageMap,
  uniqueStageValues,
  type ColumnMapping,
  type ImportFieldId,
} from "@/lib/hubspot-import";
import { useMemo, useState, useTransition } from "react";

const SAMPLE_HEADERS =
  "Record ID,First Name,Last Name,Phone Number,Email,Deal Stage,Contact Owner,Contact Owner Email,Program,Cohort,Create Date,Intent Score";

export function HubspotImportClient() {
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [stageMap, setStageMap] = useState<Record<string, Stage>>({});
  const [defaultStage, setDefaultStage] = useState<Stage>("new_lead");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    if (!csvText.trim()) return { headers: [] as string[], rows: [] as Record<string, string>[] };
    return parseCsv(csvText);
  }, [csvText]);

  const stageValues = useMemo(
    () => uniqueStageValues(parsed.rows, mapping.stage),
    [parsed.rows, mapping.stage]
  );

  function onFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setCsvText(text);
      const { headers } = parseCsv(text);
      const suggested = suggestColumnMapping(headers);
      setMapping(suggested);
      const stages = uniqueStageValues(parseCsv(text).rows, suggested.stage);
      setStageMap(suggestStageMap(stages));
      setResult(null);
      setError(null);
    };
    reader.readAsText(file);
  }

  function setField(field: ImportFieldId, header: string) {
    setMapping((m) => {
      const next = { ...m };
      if (!header) delete next[field];
      else next[field] = header;
      if (field === "stage") {
        const stages = uniqueStageValues(parsed.rows, header || undefined);
        setStageMap(suggestStageMap(stages));
      }
      return next;
    });
  }

  function runImport(dryRun: boolean) {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await importLeadsFromCsv({
        csvText,
        mapping,
        stageMap,
        defaultStage,
        dryRun,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const errHint =
        res.errors.length > 0
          ? ` · ${res.errors.length} row error(s) e.g. row ${res.errors[0].row}: ${res.errors[0].error}`
          : "";
      setResult(
        dryRun
          ? `Dry run OK — ${res.created} rows would import${errHint}`
          : `Imported: ${res.created} created, ${res.updated} updated, ${res.skipped} skipped${errHint}`
      );
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        Import HubSpot CSV
      </button>
    );
  }

  return (
    <div className="mb-6 rounded-panel border border-border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">HubSpot cutover</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Import open leads CSV</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Export open contacts/deals from HubSpot, map columns + stages once, then import.
            Matches existing rows by HubSpot ID or phone so re-runs are safe.
          </p>
        </div>
        <button type="button" className="btn-ghost text-sm" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <label className="label-field">CSV file</label>
          <input
            type="file"
            accept=".csv,text/csv"
            className="input-field py-2"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <p className="mt-2 text-xs text-muted">
            Expected-ish headers: {SAMPLE_HEADERS}
          </p>
          {parsed.rows.length > 0 ? (
            <p className="mt-2 text-sm text-navy">
              <strong>{parsed.rows.length}</strong> data rows ·{" "}
              <strong>{parsed.headers.length}</strong> columns
            </p>
          ) : null}
        </div>
        <div>
          <label className="label-field">Default Hive stage (if unmapped)</label>
          <select
            className="input-field"
            value={defaultStage}
            onChange={(e) => setDefaultStage(e.target.value as Stage)}
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {parsed.headers.length > 0 ? (
        <>
          <h3 className="mt-6 text-sm font-semibold text-navy">Column mapping</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_FIELDS.map((f) => (
              <div key={f.id}>
                <label className="label-field">
                  {f.label}
                  {f.required ? " *" : ""}
                </label>
                <select
                  className="input-field py-1.5 text-sm"
                  value={mapping[f.id] ?? ""}
                  onChange={(e) => setField(f.id, e.target.value)}
                >
                  <option value="">— skip —</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {stageValues.length > 0 ? (
            <>
              <h3 className="mt-6 text-sm font-semibold text-navy">
                Stage mapping ({stageValues.length} HubSpot values)
              </h3>
              <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
                {stageValues.map((v) => (
                  <div
                    key={v}
                    className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-sm text-navy">{v}</span>
                    <select
                      className="input-field max-w-xs py-1 text-sm"
                      value={stageMap[v] ?? ""}
                      onChange={(e) =>
                        setStageMap((m) => {
                          const next = { ...m };
                          if (!e.target.value) delete next[v];
                          else next[v] = e.target.value as Stage;
                          return next;
                        })
                      }
                    >
                      <option value="">Use default ({STAGE_LABELS[defaultStage]})</option>
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {STAGE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={pending || !csvText}
              onClick={() => runImport(true)}
            >
              Dry run
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={pending || !csvText}
              onClick={() => runImport(false)}
            >
              {pending ? "Importing…" : "Import leads"}
            </button>
          </div>
        </>
      ) : null}

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {result ? <p className="mt-3 text-sm text-navy">{result}</p> : null}
    </div>
  );
}
