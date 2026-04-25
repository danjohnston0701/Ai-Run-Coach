import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, ChevronDown, CheckCircle2, Loader2,
  Mail, MessageSquare, HelpCircle, ImagePlus, X, AlertCircle,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const FAQS = [
  {
    q: "How do I reset my password?",
    a: "Open the AI Run Coach app and tap 'Sign In'. Below the sign-in form, tap 'Forgot Password?', enter the email address linked to your account, and we'll send you a reset link. The link expires after 1 hour. You can also visit airuncoach.live/forgot-password on the web.",
  },
  {
    q: "Why isn't GPS tracking working during my run?",
    a: "Make sure Location Services are enabled for AI Run Coach. On iPhone go to Settings → Privacy & Security → Location Services → AI Run Coach → set to 'While Using' or 'Always'. On Android go to Settings → Apps → AI Run Coach → Permissions → Location. Also ensure you start your run outdoors with a clear view of the sky to get a GPS fix before beginning.",
  },
  {
    q: "How do I sync my Garmin watch?",
    a: "In the app, go to Profile → Connected Devices → Connect Garmin. You'll be taken through a secure Garmin OAuth login. Once connected, heart rate, Body Battery, sleep, and HRV data will sync automatically after each run. Make sure your Garmin device is synced with the Garmin Connect app first.",
  },
  {
    q: "The AI coach isn't speaking — how do I fix it?",
    a: "Check that your phone isn't on silent or Do Not Disturb and that the AI Run Coach app has permission to play audio. In the app go to Settings → Coach Settings and make sure 'Voice Coaching' is enabled. If you're using Bluetooth headphones, try reconnecting them before starting your run. If the issue persists, restart the app.",
  },
  {
    q: "How do I delete my account and data?",
    a: "You can request account deletion at any time by contacting us using the form below. Include the email address linked to your account. We will permanently delete all your personal data — including runs, goals, health metrics, and profile information — within 30 days, in line with our Privacy Policy.",
  },
  {
    q: "How do I cancel my subscription?",
    a: "Subscriptions are managed through the App Store (iOS) or Google Play (Android). To cancel: on iPhone, go to Settings → your name → Subscriptions → AI Run Coach → Cancel Subscription. On Android, open Google Play → tap your profile → Payments & subscriptions → Subscriptions → AI Run Coach → Cancel. Cancelling stops future renewals; you retain access until the end of your billing period.",
  },
];

const MAX_SCREENSHOTS = 3;
const MAX_FILE_MB = 5;

interface Screenshot {
  filename: string;
  base64: string;
  mimeType: string;
  preview: string;
}

interface SupportFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export default function Support() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<SupportFormData>({ name: "", email: "", subject: "", message: "" });
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const remaining = MAX_SCREENSHOTS - screenshots.length;
    if (remaining <= 0) {
      toast({ title: `Maximum ${MAX_SCREENSHOTS} screenshots allowed`, variant: "destructive" });
      return;
    }

    const toAdd = files.slice(0, remaining);
    toAdd.forEach(file => {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        toast({ title: `${file.name} is too large`, description: `Maximum file size is ${MAX_FILE_MB}MB`, variant: "destructive" });
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast({ title: "Only image files are supported", variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onload = ev => {
        const dataUrl = ev.target?.result as string;
        const base64 = dataUrl.split(",")[1];
        setScreenshots(prev => [
          ...prev,
          { filename: file.name, base64, mimeType: file.type, preview: dataUrl },
        ]);
      };
      reader.readAsDataURL(file);
    });

    // Reset input so same file can be re-added after removal
    e.target.value = "";
  };

  const removeScreenshot = (i: number) => {
    setScreenshots(prev => prev.filter((_, idx) => idx !== i));
  };

  const submitMutation = useMutation({
    mutationFn: (payload: SupportFormData & { screenshots: Screenshot[] }) =>
      apiRequest("POST", "/api/support/contact", {
        ...payload,
        screenshots: payload.screenshots.map(s => ({
          filename: s.filename,
          base64: s.base64,
          mimeType: s.mimeType,
        })),
      }),
    onSuccess: () => setSubmitted(true),
    onError: (err: any) => {
      toast({
        title: "Failed to send message",
        description: err?.message || "Please try again or email us directly at support@airuncoach.live",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    submitMutation.mutate({ ...form, screenshots });
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Header */}
      <div className="border-b border-white/10 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setLocation("/")}
            className="rounded-full border-white/10 hover:bg-white/10 shrink-0"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold uppercase tracking-tight">Support</h1>
            <p className="text-xs text-muted-foreground">AI Run Coach Help Center</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-14">

        {/* Hero blurb */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="p-6 bg-primary/10 border border-primary/30 rounded-2xl flex gap-4 items-start"
        >
          <HelpCircle className="w-6 h-6 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">We're here to help</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Browse the frequently asked questions below. If you can't find an answer, use the contact form and our team will get back to you within 24 hours.
            </p>
            <p className="text-sm text-muted-foreground">
              You can also email us directly at{" "}
              <a href="mailto:support@airuncoach.live" className="text-primary font-medium hover:underline" data-testid="link-support-email">
                support@airuncoach.live
              </a>
            </p>
          </div>
        </motion.div>

        {/* FAQ section */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-display font-bold uppercase tracking-wide">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="border border-white/10 rounded-xl overflow-hidden bg-card/40"
                data-testid={`faq-item-${i}`}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-white/5 transition-colors"
                  data-testid={`button-faq-${i}`}
                >
                  <span className="font-semibold text-foreground leading-snug">{faq.q}</span>
                  <motion.div
                    animate={{ rotate: openFaq === i ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="shrink-0"
                  >
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed" data-testid={`text-faq-answer-${i}`}>
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Contact form */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Mail className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-display font-bold uppercase tracking-wide">Contact Support</h2>
          </div>

          <div className="border border-white/10 rounded-2xl bg-card/40 p-6 md:p-8">
            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-10 space-y-4"
                data-testid="status-form-submitted"
              >
                <CheckCircle2 className="w-14 h-14 text-primary mx-auto" />
                <h3 className="text-xl font-bold">Message sent!</h3>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto leading-relaxed">
                  Thanks for reaching out. Our team will reply to <span className="text-foreground font-medium">{form.email}</span> within 24 hours.
                </p>
                <Button
                  variant="outline"
                  className="mt-4 border-white/10 hover:bg-white/10"
                  onClick={() => {
                    setSubmitted(false);
                    setForm({ name: "", email: "", subject: "", message: "" });
                    setScreenshots([]);
                  }}
                  data-testid="button-send-another"
                >
                  Send another message
                </Button>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide" htmlFor="support-name">
                      Name <span className="text-primary">*</span>
                    </label>
                    <Input
                      id="support-name"
                      placeholder="Your name"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="bg-background/60 border-white/10 focus:border-primary/50"
                      data-testid="input-support-name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide" htmlFor="support-email">
                      Email <span className="text-primary">*</span>
                    </label>
                    <Input
                      id="support-email"
                      type="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="bg-background/60 border-white/10 focus:border-primary/50"
                      data-testid="input-support-email"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide" htmlFor="support-subject">
                    Subject
                  </label>
                  <Input
                    id="support-subject"
                    placeholder="What's this about?"
                    value={form.subject}
                    onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    className="bg-background/60 border-white/10 focus:border-primary/50"
                    data-testid="input-support-subject"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide" htmlFor="support-message">
                    Message <span className="text-primary">*</span>
                  </label>
                  <Textarea
                    id="support-message"
                    placeholder="Describe your issue or question in as much detail as possible..."
                    value={form.message}
                    onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                    rows={6}
                    className="bg-background/60 border-white/10 focus:border-primary/50 resize-none"
                    data-testid="input-support-message"
                  />
                </div>

                {/* Screenshot upload */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Screenshots <span className="normal-case font-normal">(optional, max {MAX_SCREENSHOTS})</span>
                    </label>
                    {screenshots.length < MAX_SCREENSHOTS && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
                        data-testid="button-add-screenshot"
                      >
                        <ImagePlus className="w-4 h-4" />
                        Add image
                      </button>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                    data-testid="input-screenshot-file"
                  />

                  {screenshots.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full border border-dashed border-white/15 rounded-xl p-6 flex flex-col items-center gap-2 hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground"
                      data-testid="button-upload-drop-zone"
                    >
                      <ImagePlus className="w-7 h-7 opacity-40" />
                      <span className="text-sm">Click to attach screenshots</span>
                      <span className="text-xs opacity-60">PNG, JPG, WEBP up to {MAX_FILE_MB}MB each</span>
                    </button>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {screenshots.map((s, i) => (
                        <div key={i} className="relative group rounded-xl overflow-hidden border border-white/10 aspect-video bg-black/30" data-testid={`img-screenshot-${i}`}>
                          <img src={s.preview} alt={s.filename} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                              type="button"
                              onClick={() => removeScreenshot(i)}
                              className="bg-red-500/90 hover:bg-red-500 rounded-full p-1.5 transition-colors"
                              data-testid={`button-remove-screenshot-${i}`}
                            >
                              <X className="w-3.5 h-3.5 text-white" />
                            </button>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                            <p className="text-xs text-white/70 truncate">{s.filename}</p>
                          </div>
                        </div>
                      ))}
                      {screenshots.length < MAX_SCREENSHOTS && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="border border-dashed border-white/15 rounded-xl aspect-video flex flex-col items-center justify-center gap-1 hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground"
                          data-testid="button-add-more-screenshot"
                        >
                          <ImagePlus className="w-5 h-5 opacity-40" />
                          <span className="text-xs">Add more</span>
                        </button>
                      )}
                    </div>
                  )}

                  {screenshots.length > 0 && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {screenshots.length} of {MAX_SCREENSHOTS} screenshots attached — hover a thumbnail to remove it
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={submitMutation.isPending}
                  className="w-full bg-primary text-primary-foreground font-semibold uppercase tracking-wide hover:bg-primary/90"
                  data-testid="button-submit-support"
                >
                  {submitMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
                  ) : (
                    "Send Message"
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  We aim to respond within 24 hours on business days.
                </p>
              </form>
            )}
          </div>
        </section>

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground pb-8">
          AI Run Coach · <a href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</a> · <a href="/terms" className="hover:text-primary transition-colors">Terms of Use</a>
        </p>
      </div>
    </div>
  );
}
