import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, Trash2, Copy, Check, Link as LinkIcon, ArrowUp, ArrowDown, Infinity as InfinityIcon, Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Puliha — AI Chat Continuity Bridge" },
      { name: "description", content: "Chain conversations across 10 AI accounts. Bypass token limits with an infinite-loop context relay." },
    ],
  }),
  component: PulihaApp,
});

const AI_SYSTEMS = ["ChatGPT", "Claude", "Gemini", "DeepSeek"] as const;
type AiSystem = (typeof AI_SYSTEMS)[number];

const AI_LAUNCH_URLS: Record<AiSystem, string> = {
  ChatGPT: "https://chat.openai.com/",
  Claude: "https://claude.ai/new",
  Gemini: "https://gemini.google.com/app",
  DeepSeek: "https://chat.deepseek.com/",
};

type Project = { id: string; name: string; target_ai: string; created_at: string };
type Slot = { id: string; slot_number: number; ai_system: string; label: string; active: boolean };
type ChatLog = {
  id: string; project_id: string; url: string; title: string;
  order_index: number; slot_id: string | null; created_at: string;
};

function aiToneClass(ai: string) {
  switch (ai) {
    case "ChatGPT": return "text-chatgpt border-chatgpt/40 bg-chatgpt/10";
    case "Claude": return "text-claude border-claude/40 bg-claude/10";
    case "Gemini": return "text-gemini border-gemini/40 bg-gemini/10";
    case "DeepSeek": return "text-deepseek border-deepseek/40 bg-deepseek/10";
    default: return "text-muted-foreground border-border bg-muted";
  }
}

function PulihaApp() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // dialogs
  const [newProjOpen, setNewProjOpen] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [addLogOpen, setAddLogOpen] = useState(false);
  const [logUrl, setLogUrl] = useState("");
  const [logTitle, setLogTitle] = useState("");
  const [logSlotId, setLogSlotId] = useState<string>("");

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  // load
  useEffect(() => {
    (async () => {
      const [{ data: ps }, { data: ss }] = await Promise.all([
        supabase.from("projects").select("*").order("created_at", { ascending: true }),
        supabase.from("account_slots").select("*").order("slot_number", { ascending: true }),
      ]);
      setProjects((ps ?? []) as Project[]);
      setSlots((ss ?? []) as Slot[]);
      if (ps && ps.length > 0) setActiveProjectId(ps[0].id);
      setLoading(false);
    })();
  }, []);

  // load logs for active project
  useEffect(() => {
    if (!activeProjectId) { setLogs([]); return; }
    (async () => {
      const { data } = await supabase
        .from("chat_logs")
        .select("*")
        .eq("project_id", activeProjectId)
        .order("order_index", { ascending: true });
      setLogs((data ?? []) as ChatLog[]);
    })();
  }, [activeProjectId]);

  async function createProject() {
    const name = newProjName.trim();
    if (!name) return;
    const { data, error } = await supabase
      .from("projects").insert({ name }).select().single();
    if (error) { toast.error(error.message); return; }
    setProjects((p) => [...p, data as Project]);
    setActiveProjectId((data as Project).id);
    setNewProjName(""); setNewProjOpen(false);
    toast.success("Project created");
  }

  async function deleteProject(id: string) {
    if (!confirm("Delete this project and all its chat logs?")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    const remaining = projects.filter((p) => p.id !== id);
    setProjects(remaining);
    if (activeProjectId === id) setActiveProjectId(remaining[0]?.id ?? null);
    toast.success("Project deleted");
  }

  async function setTargetAi(ai: AiSystem) {
    if (!activeProject) return;
    const { error } = await supabase
      .from("projects").update({ target_ai: ai }).eq("id", activeProject.id);
    if (error) { toast.error(error.message); return; }
    setProjects((ps) => ps.map((p) => p.id === activeProject.id ? { ...p, target_ai: ai } : p));
  }

  async function addLog() {
    if (!activeProjectId) return;
    const url = logUrl.trim(); const title = logTitle.trim();
    if (!url || !title) { toast.error("URL and title are required"); return; }
    if (!logSlotId) { toast.error("Pick an account slot"); return; }
    const nextIdx = logs.length ? Math.max(...logs.map((l) => l.order_index)) + 1 : 1;
    const { data, error } = await supabase.from("chat_logs").insert({
      project_id: activeProjectId, url, title, slot_id: logSlotId, order_index: nextIdx,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setLogs((l) => [...l, data as ChatLog]);
    setLogUrl(""); setLogTitle(""); setLogSlotId(""); setAddLogOpen(false);
    toast.success("Chat log appended");
  }

  async function deleteLog(id: string) {
    const { error } = await supabase.from("chat_logs").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setLogs((l) => l.filter((x) => x.id !== id));
  }

  async function moveLog(id: string, dir: -1 | 1) {
    const idx = logs.findIndex((l) => l.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= logs.length) return;
    const a = logs[idx]; const b = logs[swap];
    const next = [...logs];
    next[idx] = { ...b, order_index: a.order_index };
    next[swap] = { ...a, order_index: b.order_index };
    next.sort((x, y) => x.order_index - y.order_index);
    setLogs(next);
    await Promise.all([
      supabase.from("chat_logs").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("chat_logs").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
  }

  async function updateSlot(id: string, patch: Partial<Slot>) {
    setSlots((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    await supabase.from("account_slots").update(patch).eq("id", id);
  }

  const slotMap = useMemo(() => Object.fromEntries(slots.map((s) => [s.id, s])), [slots]);

  const payload = useMemo(() => {
    if (!activeProject) return "";
    const target = (activeProject.target_ai || "ChatGPT") as AiSystem;
    const lines: string[] = [];
    lines.push("=== PULIHA CONTEXT RELAY PAYLOAD ===");
    lines.push(`Project: ${activeProject.name}`);
    lines.push(`Target AI for next leg: ${target}`);
    lines.push(`Total prior conversation legs: ${logs.length}`);
    lines.push("");
    lines.push("You are the next link in a multi-account, multi-model conversation chain.");
    lines.push("The user has reached the message/token cap on prior accounts and is rotating to a fresh session.");
    lines.push("Adopt the cumulative state, decisions, and constraints established across the prior legs listed below");
    lines.push("as if you had personally produced them. Continue the work from where the last leg ended. Do not re-introduce");
    lines.push("yourself, do not re-derive prior conclusions, and do not ask the user to repeat context already covered.");
    lines.push("");
    lines.push("--- CHRONOLOGICAL CHAIN ---");
    if (logs.length === 0) {
      lines.push("(no prior legs yet)");
    } else {
      logs.forEach((l, i) => {
        const s = l.slot_id ? slotMap[l.slot_id] : null;
        const acct = s ? `Slot #${s.slot_number} · ${s.ai_system}${s.label ? ` (${s.label})` : ""}` : "Unassigned slot";
        lines.push(`Step ${i + 1}: ${l.title}`);
        lines.push(`  Source: ${acct}`);
        lines.push(`  Share URL: ${l.url}`);
      });
    }
    lines.push("");
    lines.push("--- ACCOUNTS USED ---");
    const used = Array.from(new Set(logs.map((l) => l.slot_id).filter(Boolean)))
      .map((id) => slotMap[id as string])
      .filter(Boolean) as Slot[];
    if (used.length === 0) lines.push("(none yet)");
    else used.forEach((s) => lines.push(`- Slot #${s.slot_number} — ${s.ai_system}${s.label ? ` (${s.label})` : ""}`));
    lines.push("");
    lines.push("--- INSTRUCTIONS TO YOU ---");
    lines.push(`1. Open each share URL above in order; treat their content as your own prior turns.`);
    lines.push(`2. Reply in the voice and style appropriate to ${target}, but preserve every commitment and naming convention from the chain.`);
    lines.push(`3. When you respond, end with: ">> Ready to continue. Hand off to next account when this leg approaches its cap."`);
    lines.push("=== END PAYLOAD ===");
    return lines.join("\n");
  }, [activeProject, logs, slotMap]);

  async function copyPayload() {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      toast.success("Payload copied to clipboard");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Clipboard blocked by browser");
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading Puliha…</div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border/60 backdrop-blur-md sticky top-0 z-20 bg-background/70">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-primary/15 border border-primary/30 grid place-items-center">
              <InfinityIcon className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight leading-none">Puliha</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">Infinite-loop AI context relay</p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6 grid grid-cols-12 gap-6">
        {/* Projects column */}
        <aside className="col-span-12 md:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground">Projects</h2>
            <Dialog open={newProjOpen} onOpenChange={setNewProjOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="secondary" className="h-7 px-2">
                  <Plus className="size-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    autoFocus value={newProjName}
                    onChange={(e) => setNewProjName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createProject()}
                    placeholder="E-commerce Backend Refactor"
                  />
                </div>
                <DialogFooter>
                  <Button onClick={createProject}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-1">
            {projects.length === 0 && (
              <p className="text-sm text-muted-foreground">No projects yet. Create one to begin.</p>
            )}
            {projects.map((p) => {
              const isActive = p.id === activeProjectId;
              return (
                <div
                  key={p.id}
                  className={`group rounded-lg border px-3 py-2 cursor-pointer transition flex items-center justify-between ${
                    isActive
                      ? "bg-card border-primary/40 ring-1 ring-primary/30"
                      : "bg-card/40 border-border hover:bg-card"
                  }`}
                  onClick={() => setActiveProjectId(p.id)}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className={`text-[10px] uppercase tracking-wider mt-0.5 ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                      → {p.target_ai}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
                    className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive"
                    aria-label="Delete project"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Account slots */}
          <div className="pt-4">
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Account Slots (10)</h2>
            <div className="space-y-1.5">
              {slots.map((s) => (
                <div key={s.id} className="rounded-md border border-border bg-card/40 px-2 py-1.5 flex items-center gap-2">
                  <span className="text-[11px] font-mono w-6 text-muted-foreground">#{s.slot_number}</span>
                  <Input
                    value={s.label}
                    onChange={(e) => updateSlot(s.id, { label: e.target.value })}
                    className="h-7 text-xs flex-1 bg-transparent border-transparent focus-visible:border-border px-2"
                  />
                  <Select value={s.ai_system} onValueChange={(v) => updateSlot(s.id, { ai_system: v })}>
                    <SelectTrigger className={`h-7 text-[11px] w-[100px] ${aiToneClass(s.ai_system)}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_SYSTEMS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="col-span-12 md:col-span-9 space-y-6">
          {!activeProject ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
              Create a project to start chaining chat logs.
            </div>
          ) : (
            <>
              {/* Project header */}
              <div className="rounded-2xl border border-border bg-card/60 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Active project</div>
                    <h2 className="text-2xl font-semibold tracking-tight mt-1">{activeProject.name}</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {logs.length} chat log{logs.length === 1 ? "" : "s"} chained
                    </p>
                  </div>
                  <div className="flex items-end gap-2">
                    <div>
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Next target AI</Label>
                      <div className="flex gap-1 mt-1">
                        {AI_SYSTEMS.map((ai) => {
                          const selected = activeProject.target_ai === ai;
                          return (
                            <button
                              key={ai}
                              onClick={() => setTargetAi(ai)}
                              className={`px-3 py-1.5 rounded-md text-xs border transition ${
                                selected ? aiToneClass(ai) + " ring-1 ring-current"
                                         : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                              }`}
                            >
                              {ai}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <Dialog open={addLogOpen} onOpenChange={setAddLogOpen}>
                      <DialogTrigger asChild>
                        <Button className="gap-1.5"><Plus className="size-4" /> Add Chat Log</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Append chat log link</DialogTitle></DialogHeader>
                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <Label>Public shared URL</Label>
                            <Input value={logUrl} onChange={(e) => setLogUrl(e.target.value)}
                              placeholder="https://chat.openai.com/share/…" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Name it</Label>
                            <Input value={logTitle} onChange={(e) => setLogTitle(e.target.value)}
                              placeholder="Leg 1 — initial schema design" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Account slot</Label>
                            <Select value={logSlotId} onValueChange={setLogSlotId}>
                              <SelectTrigger><SelectValue placeholder="Assign to one of the 10 slots" /></SelectTrigger>
                              <SelectContent>
                                {slots.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    #{s.slot_number} · {s.ai_system}{s.label ? ` — ${s.label}` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter><Button onClick={addLog}>Append</Button></DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </div>

              {/* Chain */}
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Chronological chain</h3>
                {logs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    No logs yet. Add a public share URL to start the chain.
                  </div>
                ) : (
                  <ol className="space-y-2">
                    {logs.map((l, i) => {
                      const s = l.slot_id ? slotMap[l.slot_id] : null;
                      return (
                        <li key={l.id} className="rounded-xl border border-border bg-card/60 p-3 flex items-center gap-3">
                          <div className="size-8 rounded-md bg-muted grid place-items-center text-xs font-mono">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{l.title}</div>
                            <a href={l.url} target="_blank" rel="noreferrer"
                              className="text-xs text-muted-foreground hover:text-primary truncate flex items-center gap-1 mt-0.5">
                              <LinkIcon className="size-3 shrink-0" />
                              <span className="truncate">{l.url}</span>
                            </a>
                          </div>
                          {s && (
                            <span className={`text-[10px] px-2 py-1 rounded-md border ${aiToneClass(s.ai_system)}`}>
                              #{s.slot_number} {s.ai_system}
                            </span>
                          )}
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => moveLog(l.id, -1)} disabled={i === 0}
                              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="size-4" /></button>
                            <button onClick={() => moveLog(l.id, 1)} disabled={i === logs.length - 1}
                              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="size-4" /></button>
                            <button onClick={() => deleteLog(l.id)}
                              className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              {/* Payload */}
              <div className="rounded-2xl border border-primary/30 bg-card/60 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Zap className="size-4 text-primary" /> Compiled context payload
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Auto-generated. Paste into a fresh {activeProject.target_ai} session.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild variant="secondary" size="sm">
                      <a href={AI_LAUNCH_URLS[activeProject.target_ai as AiSystem] ?? "#"} target="_blank" rel="noreferrer">
                        Open {activeProject.target_ai}
                      </a>
                    </Button>
                    <Button onClick={copyPayload} size="sm" className="gap-1.5">
                      {copied ? <><Check className="size-4" /> Copied</> : <><Copy className="size-4" /> Copy</>}
                    </Button>
                  </div>
                </div>
                <Textarea
                  readOnly value={payload}
                  className="font-mono text-xs h-80 bg-background/60 resize-none"
                />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
