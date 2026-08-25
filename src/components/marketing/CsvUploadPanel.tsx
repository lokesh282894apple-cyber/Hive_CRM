"use client";

import { useState, useTransition } from "react";
import {
  importCostCsv,
  importMetaAdCsv,
  importSocialCsv,
} from "@/app/actions/marketing-dashboard";

export function CsvUploadPanel() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const onUpload = (kind: "meta" | "cost" | "social", platform?: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      start(async () => {
        setMsg(null);
        let res;
        if (kind === "meta") res = await importMetaAdCsv(text);
        else if (kind === "cost") res = await importCostCsv(text);
        else res = await importSocialCsv(text, platform as "instagram" | "youtube" | "linkedin" | "whatsapp");
        setMsg(res.ok ? `Imported ${res.count} rows` : res.error);
      });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <section className="panel p-5 space-y-4">
      <div>
        <p className="eyebrow">Data imports</p>
        <p className="text-sm text-muted">Hybrid ingest: CSV upload for Meta weekly export, Non-Meta costs, social logs.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 rounded-xl border border-border p-3 text-sm cursor-pointer hover:bg-navy/[0.02]">
          <span className="font-medium text-navy">Meta ad performance CSV</span>
          <span className="text-xs text-muted">Tab 10 — PGP offline meta ads</span>
          <input type="file" accept=".csv" className="mt-2 text-xs" disabled={pending} onChange={onUpload("meta")} />
        </label>
        <label className="flex flex-col gap-1 rounded-xl border border-border p-3 text-sm cursor-pointer hover:bg-navy/[0.02]">
          <span className="font-medium text-navy">Non-Meta cost CSV</span>
          <span className="text-xs text-muted">date, category, amount_inr, is_organic</span>
          <input type="file" accept=".csv" className="mt-2 text-xs" disabled={pending} onChange={onUpload("cost")} />
        </label>
        {(["instagram", "youtube", "linkedin", "whatsapp"] as const).map((p) => (
          <label
            key={p}
            className="flex flex-col gap-1 rounded-xl border border-border p-3 text-sm cursor-pointer hover:bg-navy/[0.02]"
          >
            <span className="font-medium text-navy capitalize">{p} post log CSV</span>
            <input type="file" accept=".csv" className="mt-2 text-xs" disabled={pending} onChange={onUpload("social", p)} />
          </label>
        ))}
      </div>
      {msg && <p className="text-sm text-navy">{msg}</p>}
    </section>
  );
}
