import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, HelpCircle, FlaskConical, GitCommit, SearchCheck, Smartphone, RefreshCw, Check, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

// Development updates & asks — the feed between Daniel and the coding agents
// (server/routes-dev-updates.ts). Questions and test requests wait for Daniel's answer here;
// changes, reviews and UX tests are the record of what was done, with screenshots.

type Kind = "question" | "test_request" | "change" | "review" | "ux_test";
type Status = "open" | "answered" | "done";

interface DevUpdate {
  id: string;
  kind: Kind;
  title: string;
  body: string;
  platforms: string[];
  status: Status;
  answer: string | null;
  answeredAt: string | null;
  author: string;
  createdAt: string;
  images: { id: string; caption: string | null }[];
}

const KIND_META: Record<Kind, { label: string; icon: typeof HelpCircle; tone: string }> = {
  question:     { label: "Question",     icon: HelpCircle,   tone: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  test_request: { label: "Test to run",  icon: FlaskConical, tone: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  change:       { label: "Change",       icon: GitCommit,    tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  review:       { label: "Review",       icon: SearchCheck,  tone: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  ux_test:      { label: "UX testing",   icon: Smartphone,   tone: "bg-pink-500/15 text-pink-400 border-pink-500/30" },
};

const FILTERS: { key: string; label: string; match: (u: DevUpdate) => boolean }[] = [
  { key: "asks", label: "Needs you", match: u => (u.kind === "question" || u.kind === "test_request") && u.status === "open" },
  { key: "all", label: "Everything", match: () => true },
  { key: "change", label: "Changes", match: u => u.kind === "change" },
  { key: "review", label: "Reviews", match: u => u.kind === "review" },
  { key: "ux_test", label: "UX testing", match: u => u.kind === "ux_test" },
  { key: "answered", label: "Answered", match: u => (u.kind === "question" || u.kind === "test_request") && u.status !== "open" },
];

function getAuthToken(): string | null {
  try {
    const stored = localStorage.getItem("userProfile");
    const parsed = stored ? JSON.parse(stored) : null;
    return parsed?.token ?? null;
  } catch { return null; }
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** Minimal, safe rendering of the posts' markdown: headings, bullets, **bold**, `code`, paragraphs. */
function Body({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactElement[] = [];
  let list: string[] = [];
  const inline = (s: string, key: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return (
      <span key={key}>
        {parts.map((p, i) =>
          p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="text-foreground">{p.slice(2, -2)}</strong>
          : p.startsWith("`") && p.endsWith("`") ? <code key={i} className="px-1 rounded bg-muted text-[0.85em]">{p.slice(1, -1)}</code>
          : <span key={i}>{p}</span>)}
      </span>
    );
  };
  const flush = () => {
    if (list.length) {
      blocks.push(<ul key={`l${blocks.length}`} className="list-disc pl-5 space-y-1">{list.map((li, i) => <li key={i}>{inline(li, `li${i}`)}</li>)}</ul>);
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^\s*[-*] /.test(line)) { list.push(line.replace(/^\s*[-*] /, "")); return; }
    flush();
    if (!line.trim()) return;
    if (line.startsWith("### ") || line.startsWith("## ")) {
      blocks.push(<p key={i} className="font-semibold text-foreground mt-2">{inline(line.replace(/^#+ /, ""), `h${i}`)}</p>);
    } else {
      blocks.push(<p key={i}>{inline(line, `p${i}`)}</p>);
    }
  });
  flush();
  return <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">{blocks}</div>;
}

/** Screenshots need the JWT, so they're fetched and shown as blob URLs. */
function Screenshot({ id, caption, onOpen }: { id: string; caption: string | null; onOpen: (src: string, caption: string | null) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    fetch(`/api/dev-updates/images/${id}`, { headers: { Authorization: `Bearer ${getAuthToken()}` } })
      .then(r => (r.ok ? r.blob() : null))
      .then(b => { if (b) { url = URL.createObjectURL(b); setSrc(url); } })
      .catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id]);
  return (
    <figure className="w-40 shrink-0">
      <button
        className="block w-40 h-72 rounded-lg overflow-hidden border border-border bg-muted/30"
        onClick={() => src && onOpen(src, caption)}
        data-testid={`screenshot-${id}`}
      >
        {src ? <img src={src} alt={caption ?? "Screenshot"} className="w-full h-full object-cover object-top" />
             : <div className="w-full h-full animate-pulse" />}
      </button>
      {caption && <figcaption className="text-xs text-muted-foreground mt-1 leading-snug">{caption}</figcaption>}
    </figure>
  );
}

function UpdateCard({ u, onSaved, onOpenImage }: {
  u: DevUpdate; onSaved: () => void; onOpenImage: (src: string, caption: string | null) => void;
}) {
  const meta = KIND_META[u.kind] ?? KIND_META.change;
  const Icon = meta.icon;
  const isAsk = u.kind === "question" || u.kind === "test_request";
  const [answer, setAnswer] = useState(u.answer ?? "");
  const [editing, setEditing] = useState(isAsk && u.status === "open");
  const [saving, setSaving] = useState(false);

  const save = async (status?: Status) => {
    setSaving(true);
    try {
      const r = await fetch(`/api/dev-updates/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ answer: answer.trim() || undefined, status }),
      });
      if (!r.ok) throw new Error();
      toast.success(isAsk ? "Answer saved" : "Saved");
      setEditing(false);
      onSaved();
    } catch {
      toast.error("Couldn't save — try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border" data-testid={`update-${u.id}`}>
      <CardContent className="p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-md border ${meta.tone}`}>
            <Icon className="w-3.5 h-3.5" /> {meta.label}
          </span>
          {u.platforms.map(p => <Badge key={p} variant="outline" className="text-xs">{p}</Badge>)}
          {isAsk && (
            <Badge variant={u.status === "open" ? "default" : "secondary"} className="text-xs">
              {u.status === "open" ? "Waiting for you" : u.status === "answered" ? "Answered" : "Done"}
            </Badge>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{u.author} · {formatWhen(u.createdAt)}</span>
        </div>
        <h2 className="text-lg font-semibold text-foreground leading-snug">{u.title}</h2>
        {u.body && <Body text={u.body} />}
        {u.images.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {u.images.map(img => <Screenshot key={img.id} id={img.id} caption={img.caption} onOpen={onOpenImage} />)}
          </div>
        )}
        {isAsk && (
          <div className="pt-2 border-t border-border space-y-2">
            {editing ? (
              <>
                <Textarea
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  placeholder={u.kind === "question" ? "Your answer…" : "What happened when you ran it?"}
                  className="min-h-[90px]"
                  data-testid={`answer-${u.id}`}
                />
                <div className="flex gap-2">
                  <Button size="sm" disabled={saving || !answer.trim()} onClick={() => save("answered")}>
                    <Check className="w-4 h-4 mr-1" /> {u.kind === "question" ? "Save answer" : "Save result"}
                  </Button>
                  {u.status !== "open" && (
                    <Button size="sm" variant="ghost" onClick={() => { setAnswer(u.answer ?? ""); setEditing(false); }}>
                      <X className="w-4 h-4 mr-1" /> Cancel
                    </Button>
                  )}
                  {u.status === "open" && (
                    <Button size="sm" variant="ghost" disabled={saving} onClick={() => save("done")}>
                      Close without answering
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-1">
                {u.answer ? (
                  <>
                    <p className="text-xs font-semibold text-foreground">Your answer{u.answeredAt ? ` · ${formatWhen(u.answeredAt)}` : ""}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{u.answer}</p>
                  </>
                ) : <p className="text-sm text-muted-foreground">Closed without an answer.</p>}
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="px-0" onClick={() => setEditing(true)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => save("open")}>Reopen</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminDevUpdates() {
  const [, setLocation] = useLocation();
  const [updates, setUpdates] = useState<DevUpdate[] | null>(null);
  const [filter, setFilter] = useState("asks");
  const [lightbox, setLightbox] = useState<{ src: string; caption: string | null } | null>(null);

  const load = useCallback(async () => {
    const token = getAuthToken();
    if (!token) { setLocation("/login"); return; }
    const r = await fetch("/api/dev-updates", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (!r) { toast.error("Couldn't load updates"); return; }
    if (r.status === 403) { setLocation("/"); return; }
    if (!r.ok) { toast.error("Couldn't load updates"); return; }
    setUpdates(await r.json());
  }, [setLocation]);

  useEffect(() => { load(); }, [load]);

  const openAsks = useMemo(() => (updates ?? []).filter(FILTERS[0].match).length, [updates]);
  // Open on "Everything" when nothing is waiting, so the page is never empty on arrival.
  useEffect(() => { if (updates && openAsks === 0 && filter === "asks") setFilter("all"); }, [updates, openAsks]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = (updates ?? []).filter(FILTERS.find(f => f.key === filter)?.match ?? (() => true));

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => setLocation("/admin")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
          data-testid="button-back-admin"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to Admin</span>
        </button>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-primary uppercase tracking-wider mb-2">Development</h1>
            <p className="text-muted-foreground">Questions and tests waiting for you, and a record of every change, review and UX test.</p>
          </div>
          <Button variant="outline" size="icon" onClick={load} aria-label="Refresh"><RefreshCw className="w-4 h-4" /></Button>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                filter === f.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`filter-${f.key}`}
            >
              {f.label}{f.key === "asks" && openAsks > 0 ? ` (${openAsks})` : ""}
            </button>
          ))}
        </div>

        {updates === null ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : shown.length === 0 ? (
          <p className="text-muted-foreground text-center py-16">
            {filter === "asks" ? "Nothing is waiting for you." : "Nothing here yet."}
          </p>
        ) : (
          <div className="space-y-4">
            {shown.map(u => (
              <UpdateCard key={u.id} u={u} onSaved={load} onOpenImage={(src, caption) => setLightbox({ src, caption })} />
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox.src} alt={lightbox.caption ?? "Screenshot"} className="max-h-[85vh] max-w-full rounded-lg" />
          {lightbox.caption && <p className="text-sm text-white/80 mt-3 max-w-xl text-center">{lightbox.caption}</p>}
        </div>
      )}
    </div>
  );
}
