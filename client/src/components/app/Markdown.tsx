import { Fragment, type ReactNode } from "react";

/** Minimal, safe markdown (headings, lists, bold/italic) for the coach's freeform analyses. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={i++} className="font-semibold text-ink">{tok.slice(2, -2)}</strong>);
    else out.push(<em key={i++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list;
    blocks.push(
      L.ordered ? (
        <ol key={blocks.length} className="ml-5 list-decimal space-y-1.5 text-sm leading-relaxed text-ink-2 marker:text-brand">
          {L.items.map((t, i) => <li key={i}>{inline(t)}</li>)}
        </ol>
      ) : (
        <ul key={blocks.length} className="space-y-1.5">
          {L.items.map((t, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              <span>{inline(t)}</span>
            </li>
          ))}
        </ul>
      ),
    );
    list = null;
  };
  lines.forEach((raw) => {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const lvl = h[1].length;
      blocks.push(
        <div key={blocks.length} className={lvl <= 2 ? "pt-2 text-base font-semibold text-ink" : "pt-1 text-sm font-semibold uppercase tracking-wide text-brand"}>
          {inline(h[2])}
        </div>,
      );
    } else if (ul || ol) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]);
    } else if (!line.trim()) {
      flush();
    } else {
      flush();
      blocks.push(
        <p key={blocks.length} className="text-sm leading-relaxed text-ink-2">
          {inline(line)}
        </p>,
      );
    }
  });
  flush();
  return <div className="space-y-3">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
