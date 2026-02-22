import { motion } from "framer-motion";
import { ArrowLeft, Cloud, Brain, Mountain, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface FeatureSection {
  id: string;
  title: string;
  description: string;
  details: string[];
  icon: React.ReactNode;
  image?: string;
  imageAlt?: string;
  comingSoon?: boolean;
}

const features: FeatureSection[] = [
  {
    id: "weather-impact",
    title: "Weather Impact Analysis",
    description: "Understand exactly how weather conditions affect your running performance with personalized insights based on your run history.",
    details: [
      "See which weather conditions help you run faster or slower",
      "Track performance across temperature, humidity, wind, and UV levels",
      "Identify your best and toughest conditions at a glance",
      "Time of day analysis shows when you perform your best"
    ],
    icon: <Cloud className="w-6 h-6" />,
    image: "/attached_assets/Screenshot_20260114_112704_Chrome_1768456527237.jpg",
    imageAlt: "Weather Impact Analysis showing temperature and humidity effects on pace"
  },
  {
    id: "ai-coach-summary",
    title: "AI Coach Summary",
    description: "After every run, receive a comprehensive AI-powered analysis that highlights your strengths and areas for improvement.",
    details: [
      "Overall assessment tailored to your fitness goals",
      "Specific highlights of what you did well",
      "Actionable areas to improve with practical tips",
      "Personalized advice based on your pace, cadence, and conditions"
    ],
    icon: <Brain className="w-6 h-6" />,
    image: "/attached_assets/Messenger_creation_CCCF744C-204A-417F-AC99-DA7ED4D37244_1768456527263.jpeg",
    imageAlt: "AI Coach Summary showing overall assessment and improvement areas"
  },
  {
    id: "elevation-coaching",
    title: "Elevation Awareness Coaching",
    description: "Get real-time coaching that adapts to the terrain ahead, warning you about hills before you reach them.",
    details: [
      "Proactive warnings 100-200m before steep hills",
      "Technique tips for uphill and downhill sections",
      "Pace conservation advice for challenging terrain",
      "Celebration when you conquer tough climbs"
    ],
    icon: <Mountain className="w-6 h-6" />,
    comingSoon: true
  },
  {
    id: "struggle-insights",
    title: "Struggle Awareness Insights",
    description: "Your AI coach learns from your past struggles and proactively helps you overcome them in future runs.",
    details: [
      "Identifies patterns in where you typically slow down",
      "Tags common causes like hills, heat, or fatigue",
      "Provides targeted encouragement at challenging points",
      "Turns past struggles into coaching opportunities"
    ],
    icon: <AlertTriangle className="w-6 h-6" />,
    comingSoon: true
  }
];

export default function Features() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="shrink-0" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-display uppercase tracking-wider">Features</h1>
            <p className="text-sm text-muted-foreground">Discover what AI Run Coach can do</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-16">
        {features.map((feature, index) => (
          <motion.section
            key={feature.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className="scroll-mt-24"
            id={feature.id}
            data-testid={`section-feature-${feature.id}`}
          >
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary shrink-0">
                {feature.icon}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-display font-bold uppercase tracking-tight">
                    {feature.title}
                  </h2>
                  {feature.comingSoon && (
                    <span className="px-2 py-0.5 text-xs font-bold uppercase bg-amber-500/20 text-amber-400 rounded-full">
                      Screenshot Coming
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground mt-1">{feature.description}</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                {feature.details.map((detail, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                    <p className="text-sm text-foreground/80">{detail}</p>
                  </div>
                ))}
              </div>

              {feature.image ? (
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-white/5">
                  <img
                    src={feature.image}
                    alt={feature.imageAlt}
                    className="w-full h-auto object-contain"
                    data-testid={`img-feature-${feature.id}`}
                  />
                </div>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center min-h-[300px]">
                  <div className="text-center p-6">
                    <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
                      {feature.icon}
                    </div>
                    <p className="text-sm text-muted-foreground">Screenshot coming soon</p>
                  </div>
                </div>
              )}
            </div>
          </motion.section>
        ))}

        <section className="text-center py-12 border-t border-white/10">
          <h3 className="text-xl font-display uppercase tracking-wider mb-4">Ready to start?</h3>
          <p className="text-muted-foreground mb-6">Experience AI-powered coaching on your next run</p>
          <Link href="/setup">
            <Button size="lg" className="font-display uppercase tracking-wider" data-testid="button-get-started">
              Start Free Trial
            </Button>
          </Link>
        </section>
      </main>
    </div>
  );
}
