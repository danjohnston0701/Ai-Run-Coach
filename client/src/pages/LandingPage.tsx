import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { AppDownloadLinks } from "@/components/AppDownloadLinks";
import {
  Zap,
  Users,
  Mic,
  Map as MapIcon,
  ArrowRight,
  BarChart3,
} from "lucide-react";

import heroImage from "@assets/stock_images/cinematic_runner_nig_a3303f7d.jpg";
import logoImage from "@/assets/logo-transparent.png";
import garminWatchImage from "@assets/file_00000000aa847207abf4003ff79d9d95_1782188349595.png";
import weatherImage from "@assets/file_000000008cf8720b839e8147d4464eda_1782188349596.png";
import insightsImage from "@assets/Screenshot_20260623_162246_Ai_Run_Coach_1782188606082.jpg";
import routeVideoUrl from "@assets/map_my_run_1782188349596.mp4";

export default function LandingPage() {
  const features = [
    { icon: Mic,      title: "AI Voice Coaching",   description: "Real-time, context-aware audio coaching that adapts to your pace, heart rate, and terrain." },
    { icon: MapIcon,  title: "Smart Route Mapping",  description: "Discover tailored routes based on your skill level and current location with elevation data." },
    { icon: Users,    title: "Live Share & Safety",  description: "Let friends track your run in real-time. Stay safe with instant location sharing." },
    { icon: BarChart3,title: "Deep Run Insights",    description: "Analyze your performance with professional-grade metrics and personalized AI feedback." },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* Navigation */}
      <nav className="absolute top-0 left-0 right-0 z-50 p-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <img src={logoImage} alt="AI Run Coach Logo" className="w-24 h-24 object-contain mix-blend-screen" />
          <span className="font-display font-bold uppercase tracking-tighter text-2xl hidden sm:block">Ai Run Coach</span>
        </div>
        <Button asChild className="h-9 px-5 text-xs font-bold uppercase tracking-widest rounded-full bg-primary text-background hover:bg-primary/90" data-testid="button-nav-download"><a href="#download">Download App</a></Button>
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
            <p className="text-primary font-bold uppercase tracking-widest mb-4">Now available on iOS and Android</p>
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
            <AppDownloadLinks />
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

      {/* Garmin Companion Watch */}
      <section className="py-24 px-6 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest">
              Garmin Integration
            </div>
            <h2 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tighter leading-tight">
              Your Garmin.<br />Supercharged.
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed max-w-md">
              The Ai Run Coach Garmin Companion app streams real-time heart rate, pace, and distance straight to your AI coach — so every coaching cue is informed by what's actually happening on your wrist, right now.
            </p>
            <ul className="space-y-3">
              {[
                "Live HR, pace & distance fed to your AI coach",
                "Intelligent coaching that adapts as you run",
                "Compatible with Garmin Forerunner & Fenix series",
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-primary" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="flex justify-center"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-3xl scale-75 opacity-60" />
              <img
                src={garminWatchImage}
                alt="Garmin Watch with Ai Run Coach"
                className="relative w-72 md:w-96 rounded-3xl object-contain drop-shadow-2xl"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Weather Impact Analysis */}
      <section className="py-24 px-6 bg-primary/5 border-y border-white/5">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="order-2 md:order-1 flex justify-center"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-3xl bg-blue-500/10 blur-2xl" />
              <img
                src={weatherImage}
                alt="Weather Impact Analysis"
                className="relative w-full max-w-md rounded-3xl shadow-2xl border border-white/10"
              />
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="order-1 md:order-2 space-y-6"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest">
              Smart Insights
            </div>
            <h2 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tighter leading-tight">
              Weather Impact<br />Analysis
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed max-w-md">
              Understand exactly how temperature, humidity, wind, and time of day affect your pace and performance. Stop guessing — know your best conditions.
            </p>
            <ul className="space-y-3">
              {[
                "Identify your best and toughest running conditions",
                "Temperature, humidity & time-of-day breakdowns",
                "Data-driven insights from your own run history",
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-primary" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* Route My Run Demo */}
      <section className="py-24 px-6 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest">
              Route Generation
            </div>
            <h2 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tighter leading-tight">
              Route My Run
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed max-w-md">
              Set your distance, pick your preferences, and let Ai Run Coach generate three ready-to-run circular routes from your current location — complete with elevation data and map preview.
            </p>
            <ul className="space-y-3">
              {[
                "AI-generated routes tailored to your distance goal",
                "Three route options to choose from every time",
                "Elevation-aware with real map preview",
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-primary" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="flex justify-center"
          >
            <div className="relative w-full max-w-sm">
              <div className="absolute inset-0 rounded-[2rem] bg-primary/10 blur-2xl" />
              <div className="relative rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl bg-black">
                <video
                  src={routeVideoUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="w-full h-auto"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Enhanced Insights */}
      <section className="py-24 px-6 bg-primary/5 border-y border-white/5">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="order-2 md:order-1 flex justify-center"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-3xl bg-green-500/10 blur-2xl" />
              <img
                src={insightsImage}
                alt="Aerobic Decoupling and Running Economy insights"
                className="relative w-56 md:w-72 rounded-[2rem] shadow-2xl border border-white/10"
              />
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="order-1 md:order-2 space-y-6"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest">
              Pro-Grade Metrics
            </div>
            <h2 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tighter leading-tight">
              Insights Used by<br />Elite Runners
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed max-w-md">
              Go beyond pace and distance. Ai Run Coach surfaces professional metrics that show you how your body is really performing.
            </p>
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-card/50 border border-white/5 space-y-1">
                <p className="text-sm font-bold uppercase tracking-wide text-foreground">Aerobic Decoupling</p>
                <p className="text-xs text-muted-foreground leading-relaxed">Measures heart rate vs pace drift over a run. Low decoupling means your aerobic system handled the effort efficiently — a strong fitness indicator.</p>
              </div>
              <div className="p-4 rounded-2xl bg-card/50 border border-white/5 space-y-1">
                <p className="text-sm font-bold uppercase tracking-wide text-foreground">Running Economy</p>
                <p className="text-xs text-muted-foreground leading-relaxed">How efficiently you convert cardiac output to speed — measured in metres per heartbeat. Improving economy means getting faster at the same heart rate.</p>
              </div>
            </div>
          </motion.div>
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
      <section id="download" className="py-32 px-6 text-center scroll-mt-8">
        <div className="max-w-3xl mx-auto space-y-8 bg-card/30 p-12 rounded-[3rem] border border-white/10 backdrop-blur-3xl">
          <h2 className="text-5xl font-display font-black uppercase tracking-tighter">Ready to evolve?</h2>
          <p className="text-muted-foreground text-lg">Ai Run Coach is now live on iOS and Android. Download the app and start running with your AI coach today.</p>
          <AppDownloadLinks />
        </div>
      </section>

      <footer className="py-12 px-6 text-center border-t border-white/5 opacity-60">
        <p className="text-[10px] uppercase tracking-[0.2em] mb-4">© 2025 Ai Run Coach • Designed for Peak Performance</p>
        <div className="flex items-center justify-center gap-6">
          <a href="/privacy" className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">Privacy Policy</a>
          <a href="/terms" className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">Terms of Use</a>
        </div>
      </footer>

    </div>
  );
}
