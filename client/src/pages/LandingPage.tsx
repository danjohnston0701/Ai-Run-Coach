import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Zap,
  Users,
  Mic,
  Map as MapIcon,
  ArrowRight,
  BarChart3,
  X,
  Check,
  Loader2,
} from "lucide-react";

import heroImage from "@assets/stock_images/cinematic_runner_nig_a3303f7d.jpg";
import logoImage from "@/assets/logo-transparent.png";

const COUNTRIES = [
  "Australia","Canada","France","Germany","India","Ireland","Japan","New Zealand",
  "Philippines","South Africa","Spain","United Kingdom","United States",
  "Afghanistan","Albania","Algeria","Angola","Argentina","Armenia","Austria",
  "Azerbaijan","Bahrain","Bangladesh","Belarus","Belgium","Bolivia","Bosnia and Herzegovina",
  "Botswana","Brazil","Brunei","Bulgaria","Cambodia","Cameroon","Chile","China",
  "Colombia","Congo","Costa Rica","Croatia","Cuba","Cyprus","Czech Republic",
  "Denmark","Dominican Republic","Ecuador","Egypt","El Salvador","Estonia","Ethiopia",
  "Finland","Ghana","Greece","Guatemala","Honduras","Hong Kong","Hungary","Iceland",
  "Indonesia","Iran","Iraq","Israel","Italy","Jamaica","Jordan","Kazakhstan","Kenya",
  "Kuwait","Latvia","Lebanon","Libya","Lithuania","Luxembourg","Malaysia","Malta",
  "Mexico","Morocco","Mozambique","Myanmar","Nepal","Netherlands","Nicaragua","Nigeria",
  "North Korea","Norway","Oman","Pakistan","Panama","Paraguay","Peru","Poland",
  "Portugal","Qatar","Romania","Russia","Rwanda","Saudi Arabia","Senegal","Serbia",
  "Singapore","Slovakia","Slovenia","Somalia","South Korea","Sri Lanka","Sudan",
  "Sweden","Switzerland","Syria","Taiwan","Tanzania","Thailand","Tunisia","Turkey",
  "Uganda","Ukraine","United Arab Emirates","Uruguay","Uzbekistan","Venezuela",
  "Vietnam","Yemen","Zambia","Zimbabwe","Other",
].sort();

export default function LandingPage() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [notRobot, setNotRobot] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const features = [
    { icon: Mic,      title: "AI Voice Coaching",   description: "Real-time, context-aware audio coaching that adapts to your pace, heart rate, and terrain." },
    { icon: MapIcon,  title: "Smart Route Mapping",  description: "Discover tailored routes based on your skill level and current location with elevation data." },
    { icon: Users,    title: "Live Share & Safety",  description: "Let friends track your run in real-time. Stay safe with instant location sharing." },
    { icon: BarChart3,title: "Deep Run Insights",    description: "Analyze your performance with professional-grade metrics and personalized AI feedback." },
  ];

  const openForm = () => {
    setShowForm(true);
    setSuccess(false);
    setError("");
  };

  const closeForm = () => {
    setShowForm(false);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !country) {
      setError("Please fill in all fields.");
      return;
    }
    if (!notRobot) {
      setError("Please confirm you're not a robot.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/register-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), country, message: message.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* Navigation */}
      <nav className="absolute top-0 left-0 right-0 z-50 p-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <img src={logoImage} alt="AI Run Coach Logo" className="w-24 h-24 object-contain mix-blend-screen" />
          <span className="font-display font-bold uppercase tracking-tighter text-2xl hidden sm:block">AI Run Coach</span>
        </div>
        <Button
          onClick={openForm}
          className="h-9 px-5 text-xs font-bold uppercase tracking-widest rounded-full bg-primary text-background hover:bg-primary/90"
          data-testid="button-nav-register"
        >
          Register Interest
        </Button>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 pb-32 px-6 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/40 to-background z-10" />
          <img
            src={heroImage}
            alt="Hero Runner"
            className="w-full h-full object-cover object-[65%_center] sm:object-center opacity-80 grayscale hover:grayscale-0 transition-all duration-1000 scale-125 sm:scale-100"
          />
        </div>

        <div className="relative z-20 max-w-4xl w-full text-center space-y-8">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <h1 className="text-6xl md:text-8xl font-display font-black uppercase tracking-tighter leading-none mb-6">
              <br /> Ai Run <span className="text-primary text-glow-lg">Coach</span>
            </h1>
            <p className="text-xl md:text-2xl text-white font-medium max-w-2xl mx-auto leading-relaxed">
              Experience the world's most advanced AI-powered running companion. Real-time coaching, smart routing, social sharing and run analysis.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button
              size="lg"
              className="h-12 px-8 text-base font-display uppercase tracking-widest rounded-full bg-primary text-background hover:bg-primary/90 group"
              onClick={openForm}
              data-testid="button-hero-register"
            >
              Register Your Interest
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-32 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-20 space-y-4">
          <h2 className="text-4xl md:text-5xl font-display font-bold uppercase tracking-tight">Unleash your potential with your personalized Ai Coach</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">Connect your smart watch and your Ai Run Coach will help to push you further, safer, and smarter.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -10 }}
              className="p-8 rounded-3xl bg-card/50 border border-white/5 hover:border-primary/30 transition-all group"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-display font-bold mb-4 uppercase tracking-wide">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Global Community */}
      <section className="py-24 bg-primary/5 border-y border-white/5 px-6">
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-3xl md:text-4xl font-display font-bold uppercase tracking-tight">A Global Community of Runners</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-sm md:text-base leading-relaxed">
              Join runners from around the world, including{" "}
              {["New Zealand","Australia","North America","South America","Canada","UK","India","Philippines","Japan"].map((c, i, arr) => (
                <span key={c}><span className="text-primary font-bold">{c}</span>{i < arr.length - 1 ? ", " : "."}</span>
              ))}
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-6 text-center">
        <div className="max-w-3xl mx-auto space-y-8 bg-card/30 p-12 rounded-[3rem] border border-white/10 backdrop-blur-3xl">
          <h2 className="text-5xl font-display font-black uppercase tracking-tighter">Ready to evolve?</h2>
          <p className="text-muted-foreground text-lg">Be the first to know when AI Run Coach launches. Register your interest and we'll keep you updated.</p>
          <Button
            size="lg"
            className="h-12 px-8 text-base font-display uppercase tracking-widest rounded-full bg-primary text-background hover:bg-primary/90"
            onClick={openForm}
            data-testid="button-cta-register"
          >
            Register Your Interest
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      <footer className="py-12 px-6 text-center border-t border-white/5 opacity-60">
        <p className="text-[10px] uppercase tracking-[0.2em] mb-4">© 2025 AI Run Coach • Designed for Peak Performance</p>
        <div className="flex items-center justify-center gap-6">
          <a href="/privacy" className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">Privacy Policy</a>
          <a href="/terms" className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">Terms of Use</a>
        </div>
      </footer>

      {/* Register Interest Modal */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
              onClick={closeForm}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                ref={formRef}
                className="w-full max-w-md bg-card border border-white/10 rounded-3xl p-8 shadow-2xl relative"
              >
                <button
                  onClick={closeForm}
                  className="absolute top-5 right-5 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-close-form"
                >
                  <X className="w-5 h-5" />
                </button>

                {success ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center space-y-4 py-6"
                  >
                    <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mx-auto">
                      <Check className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-2xl font-display font-bold uppercase tracking-tight">You're on the list!</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      Thanks for registering your interest. We'll email you with development updates and let you know the moment AI Run Coach is ready to download.
                    </p>
                    <Button
                      onClick={closeForm}
                      className="rounded-full bg-primary text-background hover:bg-primary/90 uppercase tracking-widest text-xs font-bold"
                      data-testid="button-success-close"
                    >
                      Close
                    </Button>
                  </motion.div>
                ) : (
                  <>
                    <div className="mb-6">
                      <h3 className="text-2xl font-display font-bold uppercase tracking-tight mb-2">Register Your Interest</h3>
                      <p className="text-muted-foreground text-sm">Stay updated on development progress and be the first to know when the app launches.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-register-interest">
                      <div className="space-y-1.5">
                        <label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Name</label>
                        <Input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Your name"
                          className="bg-background/50 border-white/10 focus:border-primary/60 rounded-xl h-11"
                          data-testid="input-name"
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Email</label>
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="bg-background/50 border-white/10 focus:border-primary/60 rounded-xl h-11"
                          data-testid="input-email"
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Country</label>
                        <select
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          className="w-full h-11 rounded-xl bg-background/50 border border-white/10 focus:border-primary/60 text-sm px-3 text-foreground outline-none focus:ring-1 focus:ring-primary/40 transition-colors"
                          data-testid="select-country"
                          required
                        >
                          <option value="" disabled>Select your country</option>
                          {COUNTRIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Message <span className="normal-case tracking-normal opacity-50">(optional)</span></label>
                        <textarea
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          placeholder="Any questions, features you'd love to see, or just say hi..."
                          rows={3}
                          className="w-full rounded-xl bg-background/50 border border-white/10 focus:border-primary/60 text-sm px-3 py-2.5 text-foreground outline-none focus:ring-1 focus:ring-primary/40 transition-colors resize-none placeholder:text-muted-foreground/50"
                          data-testid="textarea-message"
                        />
                      </div>

                      <div
                        className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors cursor-pointer select-none ${notRobot ? "border-primary/60 bg-primary/5" : "border-white/10 bg-background/50"}`}
                        onClick={() => setNotRobot((v) => !v)}
                        data-testid="captcha-not-robot"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors flex-shrink-0 ${notRobot ? "border-primary bg-primary" : "border-white/30 bg-transparent"}`}>
                            {notRobot && (
                              <svg viewBox="0 0 12 10" fill="none" className="w-3 h-3">
                                <path d="M1 5l3.5 3.5L11 1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          <span className="text-sm font-medium text-foreground">I'm not a robot</span>
                        </div>
                        <div className="flex flex-col items-center opacity-40">
                          <svg viewBox="0 0 64 64" className="w-8 h-8" fill="currentColor">
                            <path d="M32 4C16.536 4 4 16.536 4 32s12.536 28 28 28 28-12.536 28-28S47.464 4 32 4zm0 4c13.255 0 24 10.745 24 24S45.255 56 32 56 8 45.255 8 32 18.745 8 32 8zm-8 14a4 4 0 100 8 4 4 0 000-8zm16 0a4 4 0 100 8 4 4 0 000-8zm-8 10c-5.523 0-10 3.134-10 7h20c0-3.866-4.477-7-10-7z"/>
                          </svg>
                          <span className="text-[8px] uppercase tracking-wider mt-0.5">reCAPTCHA</span>
                        </div>
                      </div>

                      {error && (
                        <p className="text-red-400 text-sm" data-testid="text-error">{error}</p>
                      )}

                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-11 rounded-full bg-primary text-background hover:bg-primary/90 font-display uppercase tracking-widest text-sm font-bold mt-2"
                        data-testid="button-submit-interest"
                      >
                        {loading ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
                        ) : (
                          <>Register Interest <ArrowRight className="ml-2 w-4 h-4" /></>
                        )}
                      </Button>
                    </form>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
