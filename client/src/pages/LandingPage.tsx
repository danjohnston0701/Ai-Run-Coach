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

import heroImage from "@assets/stock_images/runner_night_city_ne_03871464.jpg";

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
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 pb-32 px-6">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/60 to-background z-10" />
          <img 
            src={heroImage} 
            alt="Hero Runner" 
            className="w-full h-full object-cover opacity-60 grayscale hover:grayscale-0 transition-all duration-1000"
          />
        </div>

        <div className="relative z-20 max-w-4xl w-full text-center space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-6xl md:text-8xl font-display font-black uppercase tracking-tighter leading-none mb-6">
              Run with <span className="text-primary text-glow-lg">Intelligence</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed">
              Experience the world's most advanced AI-powered running companion. Real-time coaching, smart routing, and social sharing.
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
              className="h-16 px-10 text-xl font-display uppercase tracking-widest bg-primary text-background hover:bg-primary/90 shadow-[0_0_30px_rgba(6,182,212,0.4)] group"
              onClick={() => setLocation("/setup")}
            >
              Start Your Journey
              <ArrowRight className="ml-2 w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button 
              variant="outline" 
              size="lg" 
              className="h-16 px-10 text-xl font-display uppercase tracking-widest border-white/10 hover:bg-white/5"
            >
              Watch Video
            </Button>
          </motion.div>
        </div>

        {/* Floating Stats Mockup */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-5xl px-6 grid grid-cols-2 md:grid-cols-4 gap-4 z-20">
          {[
            { label: "Active Runners", value: "50k+" },
            { label: "Miles Coached", value: "2.4M" },
            { label: "Smart Routes", value: "15k+" },
            { label: "AI Messages", value: "1M+" }
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 + i * 0.1 }}
              className="bg-card/40 backdrop-blur-xl border border-white/10 p-4 rounded-2xl text-center"
            >
              <div className="text-2xl font-display font-bold text-primary">{stat.value}</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-32 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-20 space-y-4">
          <h2 className="text-4xl md:text-5xl font-display font-bold uppercase tracking-tight">Built for Elite Performance</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">Our features are designed to push you further, safer, and smarter.</p>
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

      {/* Social Proof Section */}
      <section className="py-32 bg-primary/5 border-y border-white/5 px-6">
        <div className="max-w-4xl mx-auto text-center space-y-12">
          <h2 className="text-3xl font-display font-bold uppercase italic">"The AI coach changed my marathon prep. It's like having a pro runner in my ear 24/7."</h2>
          <div className="flex items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full bg-muted overflow-hidden">
              <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" />
            </div>
            <div className="text-left">
              <div className="font-bold">David Chen</div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">Marathon Finisher</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="py-32 px-6 text-center">
        <div className="max-w-3xl mx-auto space-y-8 bg-card/30 p-12 rounded-[3rem] border border-white/10 backdrop-blur-3xl">
          <h2 className="text-5xl font-display font-black uppercase tracking-tighter">Ready to evolve?</h2>
          <p className="text-muted-foreground text-lg">Join thousands of runners using AI to break their personal bests.</p>
          <Button 
            size="lg" 
            className="h-16 px-12 text-xl font-display uppercase tracking-widest bg-primary text-background hover:bg-primary/90 shadow-[0_0_40px_rgba(6,182,212,0.5)]"
            onClick={() => setLocation("/setup")}
          >
            Get Started Now
          </Button>
        </div>
      </section>

      <footer className="py-12 px-6 text-center border-t border-white/5 opacity-40">
        <p className="text-[10px] uppercase tracking-[0.2em]">© 2025 AI Runner Coach • Designed for Peak Performance</p>
      </footer>
    </div>
  );
}
