"use client";

import { updateStageTriggerRule, type StageTriggerRule } from "@/app/actions/triggers";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function TriggerRulesPanel({ rules: initial }: { rules: StageTriggerRule[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rules, setRules] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);

  function save(id: string, patch: Partial<StageTriggerRule>) {
    startTransition(async () => {
      const res = await updateStageTriggerRule(id, patch);
      setMsg(res.ok ? "Saved" : res.error ?? "Error");
      if (res.ok) {
        setRules((prev) =>
          prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-[#F7F8FC] px-4 py-3 text-sm text-muted">
        One engine, many templates. Toggle any stage on/off. WhatsApp needs
        pre-approved template names (AiSensy campaign / Meta template). Email uses
        Resend when <code className="text-xs">RESEND_API_KEY</code> +{" "}
        <code className="text-xs">EMAIL_FROM</code> are set.
      </div>
      {msg ? <p className="text-sm text-navy">{msg}</p> : null}
      <div className="overflow-x-auto rounded-panel border border-border bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-[#F7F8FC] text-[11px] uppercase tracking-eyebrow text-muted">
            <tr>
              <th className="px-3 py-2">Trigger</th>
              <th className="px-3 py-2">On</th>
              <th className="px-3 py-2">WA</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">WA template</th>
              <th className="px-3 py-2">Email subject</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium text-navy">{r.label}</td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    disabled={pending}
                    onChange={(e) => save(r.id, { enabled: e.target.checked })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={r.wa_enabled}
                    disabled={pending}
                    onChange={(e) => save(r.id, { wa_enabled: e.target.checked })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={r.email_enabled}
                    disabled={pending}
                    onChange={(e) =>
                      save(r.id, { email_enabled: e.target.checked })
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="input-field py-1.5 text-xs"
                    defaultValue={r.wa_template_name ?? ""}
                    disabled={pending}
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== r.wa_template_name) {
                        save(r.id, { wa_template_name: v });
                      }
                    }}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="input-field py-1.5 text-xs"
                    defaultValue={r.email_subject ?? ""}
                    disabled={pending}
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== r.email_subject) {
                        save(r.id, { email_subject: v });
                      }
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
