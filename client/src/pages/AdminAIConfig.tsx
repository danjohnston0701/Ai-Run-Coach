import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Brain, BookOpen, Lightbulb, HelpCircle, Plus, Pencil, Trash2, Check, X, GripVertical, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { apiRequest } from "@/lib/queryClient";

interface AiCoachDescription {
  id: string;
  content: string;
}

interface AiCoachInstruction {
  id: string;
  title: string;
  content: string;
  isActive: boolean;
  displayOrder: number;
}

interface AiCoachKnowledge {
  id: string;
  title: string;
  content: string;
  category: string;
  isActive: boolean;
  displayOrder: number;
}

interface AiCoachFaq {
  id: string;
  question: string;
  answer: string;
  isActive: boolean;
  displayOrder: number;
}

export default function AdminAIConfig() {
  const [, setLocation] = useLocation();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [description, setDescription] = useState<AiCoachDescription | null>(null);
  const [descriptionContent, setDescriptionContent] = useState("");
  const [descriptionEditing, setDescriptionEditing] = useState(false);

  const [instructions, setInstructions] = useState<AiCoachInstruction[]>([]);
  const [knowledge, setKnowledge] = useState<AiCoachKnowledge[]>([]);
  const [faqs, setFaqs] = useState<AiCoachFaq[]>([]);

  const [instructionDialog, setInstructionDialog] = useState<{ open: boolean; item?: AiCoachInstruction }>({ open: false });
  const [knowledgeDialog, setKnowledgeDialog] = useState<{ open: boolean; item?: AiCoachKnowledge }>({ open: false });
  const [faqDialog, setFaqDialog] = useState<{ open: boolean; item?: AiCoachFaq }>({ open: false });

  const [deleteConfirm, setDeleteConfirm] = useState<{ type: string; id: string } | null>(null);

  useEffect(() => {
    const profile = localStorage.getItem("userProfile");
    if (profile) {
      try {
        const parsed = JSON.parse(profile);
        setUserId(parsed.id);
      } catch {
        setLocation("/");
      }
    } else {
      setLocation("/");
    }
  }, [setLocation]);

  useEffect(() => {
    if (!userId) return;

    const checkAdmin = async () => {
      try {
        const res = await fetch("/api/admin/check", {
          headers: { "X-User-Id": userId }
        });
        const data = await res.json();
        setIsAdmin(data.isAdmin);
        if (data.isAdmin) {
          loadAllData();
        }
      } catch {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, [userId]);

  const loadAllData = async () => {
    if (!userId) return;
    
    try {
      const headers = { "X-User-Id": userId };
      
      const [descRes, instRes, knowRes, faqRes] = await Promise.all([
        fetch("/api/admin/ai-config/description", { headers }),
        fetch("/api/admin/ai-config/instructions", { headers }),
        fetch("/api/admin/ai-config/knowledge", { headers }),
        fetch("/api/admin/ai-config/faqs", { headers })
      ]);

      if (descRes.ok) {
        const desc = await descRes.json();
        setDescription(desc);
        setDescriptionContent(desc?.content || "");
      }
      if (instRes.ok) setInstructions(await instRes.json());
      if (knowRes.ok) setKnowledge(await knowRes.json());
      if (faqRes.ok) setFaqs(await faqRes.json());
    } catch (err) {
      toast.error("Failed to load AI configuration");
    }
  };

  const saveDescription = async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/admin/ai-config/description", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-User-Id": userId },
        body: JSON.stringify({ content: descriptionContent })
      });
      if (res.ok) {
        const data = await res.json();
        setDescription(data);
        setDescriptionEditing(false);
        toast.success("Description saved");
      } else {
        toast.error("Failed to save description");
      }
    } catch {
      toast.error("Failed to save description");
    }
  };

  const saveInstruction = async (data: Partial<AiCoachInstruction>) => {
    if (!userId) return;
    try {
      const isNew = !data.id;
      const url = isNew ? "/api/admin/ai-config/instructions" : `/api/admin/ai-config/instructions/${data.id}`;
      const method = isNew ? "POST" : "PUT";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "X-User-Id": userId },
        body: JSON.stringify(data)
      });
      
      if (res.ok) {
        await loadAllData();
        setInstructionDialog({ open: false });
        toast.success(isNew ? "Instruction added" : "Instruction updated");
      } else {
        toast.error("Failed to save instruction");
      }
    } catch {
      toast.error("Failed to save instruction");
    }
  };

  const saveKnowledge = async (data: Partial<AiCoachKnowledge>) => {
    if (!userId) return;
    try {
      const isNew = !data.id;
      const url = isNew ? "/api/admin/ai-config/knowledge" : `/api/admin/ai-config/knowledge/${data.id}`;
      const method = isNew ? "POST" : "PUT";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "X-User-Id": userId },
        body: JSON.stringify(data)
      });
      
      if (res.ok) {
        await loadAllData();
        setKnowledgeDialog({ open: false });
        toast.success(isNew ? "Knowledge added" : "Knowledge updated");
      } else {
        toast.error("Failed to save knowledge");
      }
    } catch {
      toast.error("Failed to save knowledge");
    }
  };

  const saveFaq = async (data: Partial<AiCoachFaq>) => {
    if (!userId) return;
    try {
      const isNew = !data.id;
      const url = isNew ? "/api/admin/ai-config/faqs" : `/api/admin/ai-config/faqs/${data.id}`;
      const method = isNew ? "POST" : "PUT";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "X-User-Id": userId },
        body: JSON.stringify(data)
      });
      
      if (res.ok) {
        await loadAllData();
        setFaqDialog({ open: false });
        toast.success(isNew ? "FAQ added" : "FAQ updated");
      } else {
        toast.error("Failed to save FAQ");
      }
    } catch {
      toast.error("Failed to save FAQ");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm || !userId) return;
    
    try {
      const res = await fetch(`/api/admin/ai-config/${deleteConfirm.type}/${deleteConfirm.id}`, {
        method: "DELETE",
        headers: { "X-User-Id": userId }
      });
      
      if (res.ok) {
        await loadAllData();
        toast.success("Item deleted");
      } else {
        toast.error("Failed to delete item");
      }
    } catch {
      toast.error("Failed to delete item");
    } finally {
      setDeleteConfirm(null);
    }
  };

  const toggleActive = async (type: string, id: string, isActive: boolean) => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/admin/ai-config/${type}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-User-Id": userId },
        body: JSON.stringify({ isActive: !isActive })
      });
      if (res.ok) {
        await loadAllData();
      }
    } catch {
      toast.error("Failed to update status");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <AlertTriangle className="w-16 h-16 text-amber-500 mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
        <p className="text-muted-foreground text-center mb-6">
          You don't have permission to access this page.
        </p>
        <Button onClick={() => setLocation("/")}>Go Home</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-lg border-b border-border">
        <div className="flex items-center justify-between p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold">AI Control Centre</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="p-4 pb-24">
        <Tabs defaultValue="description" className="space-y-4">
          <TabsList className="grid grid-cols-4 h-auto p-1">
            <TabsTrigger value="description" className="flex flex-col gap-1 py-2 text-xs">
              <Brain className="w-4 h-4" />
              Identity
            </TabsTrigger>
            <TabsTrigger value="instructions" className="flex flex-col gap-1 py-2 text-xs">
              <BookOpen className="w-4 h-4" />
              Rules
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="flex flex-col gap-1 py-2 text-xs">
              <Lightbulb className="w-4 h-4" />
              Knowledge
            </TabsTrigger>
            <TabsTrigger value="faqs" className="flex flex-col gap-1 py-2 text-xs">
              <HelpCircle className="w-4 h-4" />
              FAQs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="description" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Coach Identity</CardTitle>
                <CardDescription>
                  Define who the AI coach is. This becomes the opening of every AI prompt.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {descriptionEditing ? (
                  <>
                    <Textarea
                      value={descriptionContent}
                      onChange={(e) => setDescriptionContent(e.target.value)}
                      placeholder="You are an expert running coach named Alex..."
                      className="min-h-[200px]"
                      data-testid="input-description"
                    />
                    <div className="flex gap-2">
                      <Button onClick={saveDescription} data-testid="button-save-description">
                        <Check className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => {
                        setDescriptionContent(description?.content || "");
                        setDescriptionEditing(false);
                      }}>
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-muted rounded-lg p-4 text-sm whitespace-pre-wrap min-h-[100px]">
                      {description?.content || "No identity defined yet. Click Edit to add one."}
                    </div>
                    <Button onClick={() => setDescriptionEditing(true)} data-testid="button-edit-description">
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="instructions" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-semibold">Coaching Instructions</h2>
                <p className="text-xs text-muted-foreground">Rules for how the coach should behave</p>
              </div>
              <Button size="sm" onClick={() => setInstructionDialog({ open: true })} data-testid="button-add-instruction">
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </div>

            <div className="space-y-3">
              {instructions.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No instructions yet. Add your first coaching rule.
                  </CardContent>
                </Card>
              ) : (
                instructions.map((inst) => (
                  <Card key={inst.id} className={!inst.isActive ? "opacity-60" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <GripVertical className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-sm truncate">{inst.title}</h3>
                            {!inst.isActive && (
                              <span className="text-xs bg-muted px-2 py-0.5 rounded">Hidden</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{inst.content}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => toggleActive("instructions", inst.id, inst.isActive)}
                          >
                            {inst.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setInstructionDialog({ open: true, item: inst })}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setDeleteConfirm({ type: "instructions", id: inst.id })}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="knowledge" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-semibold">Knowledge Base</h2>
                <p className="text-xs text-muted-foreground">Facts and information the coach should know</p>
              </div>
              <Button size="sm" onClick={() => setKnowledgeDialog({ open: true })} data-testid="button-add-knowledge">
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </div>

            <div className="space-y-3">
              {knowledge.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No knowledge items yet. Add running facts and tips.
                  </CardContent>
                </Card>
              ) : (
                knowledge.map((kb) => (
                  <Card key={kb.id} className={!kb.isActive ? "opacity-60" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <GripVertical className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-sm truncate">{kb.title}</h3>
                            {kb.category && (
                              <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">{kb.category}</span>
                            )}
                            {!kb.isActive && (
                              <span className="text-xs bg-muted px-2 py-0.5 rounded">Hidden</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{kb.content}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => toggleActive("knowledge", kb.id, kb.isActive)}
                          >
                            {kb.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setKnowledgeDialog({ open: true, item: kb })}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setDeleteConfirm({ type: "knowledge", id: kb.id })}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="faqs" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-semibold">Common Questions</h2>
                <p className="text-xs text-muted-foreground">Pre-defined Q&A for the coach</p>
              </div>
              <Button size="sm" onClick={() => setFaqDialog({ open: true })} data-testid="button-add-faq">
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </div>

            <div className="space-y-3">
              {faqs.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No FAQs yet. Add common questions and answers.
                  </CardContent>
                </Card>
              ) : (
                faqs.map((faq) => (
                  <Card key={faq.id} className={!faq.isActive ? "opacity-60" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <GripVertical className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-sm">{faq.question}</h3>
                            {!faq.isActive && (
                              <span className="text-xs bg-muted px-2 py-0.5 rounded">Hidden</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{faq.answer}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => toggleActive("faqs", faq.id, faq.isActive)}
                          >
                            {faq.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setFaqDialog({ open: true, item: faq })}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setDeleteConfirm({ type: "faqs", id: faq.id })}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <InstructionDialog
        open={instructionDialog.open}
        item={instructionDialog.item}
        onClose={() => setInstructionDialog({ open: false })}
        onSave={saveInstruction}
      />

      <KnowledgeDialog
        open={knowledgeDialog.open}
        item={knowledgeDialog.item}
        onClose={() => setKnowledgeDialog({ open: false })}
        onSave={saveKnowledge}
      />

      <FaqDialog
        open={faqDialog.open}
        item={faqDialog.item}
        onClose={() => setFaqDialog({ open: false })}
        onSave={saveFaq}
      />

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InstructionDialog({ 
  open, 
  item, 
  onClose, 
  onSave 
}: { 
  open: boolean; 
  item?: AiCoachInstruction; 
  onClose: () => void; 
  onSave: (data: Partial<AiCoachInstruction>) => void 
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setContent(item.content);
    } else {
      setTitle("");
      setContent("");
    }
  }, [item, open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit Instruction" : "Add Instruction"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Pacing Strategy"
              data-testid="input-instruction-title"
            />
          </div>
          <div>
            <Label>Content</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Describe the instruction..."
              className="min-h-[120px]"
              data-testid="input-instruction-content"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={() => onSave({ id: item?.id, title, content, isActive: item?.isActive ?? true })}
            disabled={!title.trim() || !content.trim()}
            data-testid="button-save-instruction"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KnowledgeDialog({ 
  open, 
  item, 
  onClose, 
  onSave 
}: { 
  open: boolean; 
  item?: AiCoachKnowledge; 
  onClose: () => void; 
  onSave: (data: Partial<AiCoachKnowledge>) => void 
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");

  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setContent(item.content);
      setCategory(item.category);
    } else {
      setTitle("");
      setContent("");
      setCategory("");
    }
  }, [item, open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit Knowledge" : "Add Knowledge"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Heart Rate Zones"
              data-testid="input-knowledge-title"
            />
          </div>
          <div>
            <Label>Category (optional)</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., Physiology"
              data-testid="input-knowledge-category"
            />
          </div>
          <div>
            <Label>Content</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter the knowledge..."
              className="min-h-[120px]"
              data-testid="input-knowledge-content"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={() => onSave({ id: item?.id, title, content, category, isActive: item?.isActive ?? true })}
            disabled={!title.trim() || !content.trim()}
            data-testid="button-save-knowledge"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FaqDialog({ 
  open, 
  item, 
  onClose, 
  onSave 
}: { 
  open: boolean; 
  item?: AiCoachFaq; 
  onClose: () => void; 
  onSave: (data: Partial<AiCoachFaq>) => void 
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    if (item) {
      setQuestion(item.question);
      setAnswer(item.answer);
    } else {
      setQuestion("");
      setAnswer("");
    }
  }, [item, open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit FAQ" : "Add FAQ"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Question</Label>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g., How fast should I run?"
              data-testid="input-faq-question"
            />
          </div>
          <div>
            <Label>Answer</Label>
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Enter the answer..."
              className="min-h-[120px]"
              data-testid="input-faq-answer"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={() => onSave({ id: item?.id, question, answer, isActive: item?.isActive ?? true })}
            disabled={!question.trim() || !answer.trim()}
            data-testid="button-save-faq"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
