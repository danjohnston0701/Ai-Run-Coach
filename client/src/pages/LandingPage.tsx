import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  Zap, 
  Shield, 
  Users, 
  Trophy, 
  Mic, 
  Map as MapIcon, 
  ArrowRight,
  BarChart3,
  Heart
} from "lucide-react";

import heroImage from "@assets/stock_images/cinematic_runner_nig_a3303f7d.jpg";
import logoImage from "@/assets/logo-transparent.png";

export default function LandingPage() {
  const [, setLocation] = useLocation();

  const features = [
    {
      icon: Mic,
      title: "AI Voice Coaching",
      description: "Real-time, context-aware audio coaching that adapts to your pace, heart rate, and terrain."
    },
    {
      icon: MapIcon,
      title: "Smart Route Mapping",
      description: "Discover tailored routes based on your skill level and current location with elevation data."
    },
    {
      icon: Users,
      title: "Live Share & Safety",
      description: "Let friends track your run in real-time. Stay safe with instant location sharing."
    },
    {
      icon: BarChart3,
      title: "Deep Run Insights",
      description: "Analyze your performance with professional-grade metrics and personalized AI feedback."
    }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Navigation */}
      <nav className="absolute top-0 left-0 right-0 z-50 p-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <img src={logoImage} alt="AI Run Coach Logo" className="w-24 h-24 object-contain" />
          <span className="font-display font-bold uppercase tracking-tighter text-2xl hidden sm:block">AI Run Coach</span>
        </div>
        <Button 
          variant="ghost" 
          onClick={() => setLocation("/login")}
          className="text-primary hover:text-primary/80 hover:bg-primary/10 uppercase text-xs font-bold tracking-widest"
        >
          Login
        </Button>
      </nav>

      {/* Hero Section */}
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
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-6xl md:text-8xl font-display font-black uppercase tracking-tighter leading-none mb-6">
              <br/> Ai Run <span className="text-primary text-glow-lg">Coach</span>
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
              variant="outline" 
              size="lg" 
              className="h-12 px-8 text-base font-display uppercase tracking-widest rounded-full border-primary/50 hover:bg-primary/10 hover:border-primary group"
              onClick={() => setLocation("/login")}
            >
              Login / Register
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button 
              variant="outline" 
              size="lg" 
              className="h-12 px-8 text-base font-display uppercase tracking-widest rounded-full border-white/10 hover:bg-white/5"
              onClick={() => setLocation("/features")}
              data-testid="button-view-features"
            >
              View All Features
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

      {/* Global Community Section */}
      <section className="py-24 bg-primary/5 border-y border-white/5 px-6">
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-3xl md:text-4xl font-display font-bold uppercase tracking-tight">A Global Community of Runners</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-sm md:text-base leading-relaxed">
              Join runners from around the world, including <span className="text-primary font-bold">New Zealand</span>, <span className="text-primary font-bold">Australia</span>, <span className="text-primary font-bold">North America</span>, <span className="text-primary font-bold">South America</span>, <span className="text-primary font-bold">Canada</span>, <span className="text-primary font-bold">UK</span>, <span className="text-primary font-bold">India</span>, <span className="text-primary font-bold">Philippines</span>, and <span className="text-primary font-bold">Japan</span>.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="py-32 px-6 text-center">
        <div className="max-w-3xl mx-auto space-y-8 bg-card/30 p-12 rounded-[3rem] border border-white/10 backdrop-blur-3xl">
          <h2 className="text-5xl font-display font-black uppercase tracking-tighter">Ready to evolve?</h2>
          <p className="text-muted-foreground text-lg">Join thousands of runners using AI to break their personal bests.</p>
          <Button 
            variant="outline"
            size="lg" 
            className="h-12 px-8 text-base font-display uppercase tracking-widest rounded-full border-primary/50 hover:bg-primary/10 hover:border-primary"
            onClick={() => setLocation("/login")}
          >
            Login / Register
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      <footer className="py-12 px-6 text-center border-t border-white/5 opacity-60">
        <p className="text-[10px] uppercase tracking-[0.2em] mb-4">© 2025 AI Run Coach • Designed for Peak Performance</p>
        <div className="flex items-center justify-center gap-6">
          <button 
            onClick={() => setLocation("/privacy")}
            className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
          >
            Privacy Policy
          </button>
          <button 
            onClick={() => setLocation("/terms")}
            className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
          >
            Terms of Use
          </button>
        </div>
      </footer>
    </div>
  );
}
