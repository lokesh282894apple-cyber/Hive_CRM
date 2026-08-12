/**
 * Turn raw CSS click paths into counselor-friendly labels.
 * Prefers ids / names / aria / tracked element_label; falls back to heuristics.
 */

export function humanizeClickLabel(
  selector: string | null | undefined,
  elementLabel?: string | null
): string {
  const fromTracker = elementLabel?.trim();
  if (fromTracker) return truncateLabel(fromTracker);

  if (!selector?.trim()) return "Something on the page";

  const sel = selector.trim();

  // Explicit id (#phone, #apply) — skip framework roots
  const idMatch = sel.match(/#([a-zA-Z][\w-]*)/);
  if (idMatch && !/^(root|app|__next|__nuxt)$/i.test(idMatch[1])) {
    return friendlyId(idMatch[1]);
  }

  const nameMatch = sel.match(/\[name=["']?([^"'\]]+)/i);
  if (nameMatch) return friendlyFieldName(nameMatch[1]);

  const ariaMatch = sel.match(/\[aria-label=["']?([^"'\]]+)/i);
  if (ariaMatch) return truncateLabel(ariaMatch[1]);

  const placeholderMatch = sel.match(/\[placeholder=["']?([^"'\]]+)/i);
  if (placeholderMatch) return `“${truncateLabel(placeholderMatch[1])}” field`;

  const typeMatch = sel.match(/input[^[\]]*\[type=["']?([^"'\]]+)/i);
  if (typeMatch) {
    const t = typeMatch[1].toLowerCase();
    if (t === "submit") return "Submit button";
    if (t === "email") return "Email field";
    if (t === "tel" || t === "phone") return "Phone field";
    if (t === "checkbox") return "Checkbox";
    if (t === "radio") return "Option";
  }

  // Admissions form: label.block:nth-of-type(N) → field N
  if (/form/i.test(sel)) {
    const fieldNth = sel.match(/label(?:\.[^\s>]*)?:nth-of-type\((\d+)\)/i);
    if (fieldNth) {
      const n = Number(fieldNth[1]);
      const guessed = GUESS_FORM_FIELDS[n - 1];
      return guessed ? `Form: ${guessed}` : `Form field ${n}`;
    }
    if (/button/i.test(sel)) {
      if (/w-full|submit|type=["']?submit/i.test(sel)) return "Submit form";
      return "Form button";
    }
    if (/input|textarea|select/i.test(sel)) return "Form field";
  }

  // Modal / overlay close
  if (/fixed(?:\.|.*)inset-0|fixed\.inset/i.test(sel) && /button/i.test(sel)) {
    return "Closed popup";
  }

  // Hero CTA row on programme pages
  if (/max-w-3xl\.text-center/i.test(sel) && /mt-6\.flex/i.test(sel)) {
    return "Hero button (Apply / CTA)";
  }

  // Headline / emphasis in hero
  if (/\bh1\b/i.test(sel) || (/\bem\b/i.test(sel) && /font-bold/i.test(sel))) {
    return "Page headline";
  }

  if (/section-container/i.test(sel)) {
    if (/button/i.test(sel)) return "Section button";
    if (/\ba\b/i.test(sel)) return "Section link";
    return "Page section";
  }

  const leaf = lastSegment(sel);

  if (/^a(?:[.:\[]|$)/i.test(leaf) || leaf === "a") return "Link";
  if (/^button/i.test(leaf)) return "Button";
  if (/^input/i.test(leaf)) return "Input field";
  if (/^textarea/i.test(leaf)) return "Text box";
  if (/^select/i.test(leaf)) return "Dropdown";
  if (/^label/i.test(leaf)) return "Form label";

  // Bare "a" from tracker
  if (/^a$/i.test(sel)) return "Link";

  return "Page element";
}

/** Stable key for merging repeated clicks (not shown to counselors). */
export function clickMergeKey(selector: string | null | undefined): string | null {
  if (!selector) return null;
  const idMatch = selector.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) return `#${idMatch[1]}`;
  if (selector.length > 120) return `${selector.slice(0, 117)}…`;
  return selector;
}

const GUESS_FORM_FIELDS = ["Name", "Email", "Phone", "City", "Message"];

function friendlyId(id: string): string {
  const lower = id.toLowerCase();
  if (/^(name|full[_-]?name|applicant)/.test(lower)) return "Name field";
  if (/email/.test(lower)) return "Email field";
  if (/phone|mobile|tel|whatsapp/.test(lower)) return "Phone field";
  if (/city|location/.test(lower)) return "City field";
  if (/submit|apply/.test(lower)) return "Apply / Submit";
  if (/close|dismiss/.test(lower)) return "Close";
  return `“${id.replace(/[-_]/g, " ")}”`;
}

function friendlyFieldName(name: string): string {
  const lower = name.toLowerCase();
  if (/email/.test(lower)) return "Email field";
  if (/phone|mobile|tel/.test(lower)) return "Phone field";
  if (/name/.test(lower)) return "Name field";
  return `“${name}” field`;
}

function lastSegment(selector: string): string {
  const parts = selector.split(">").map((p) => p.trim());
  return parts[parts.length - 1] || selector;
}

function truncateLabel(s: string, max = 48): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
