import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsOfUse() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-12 font-sans">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="flex items-center gap-4 mb-12">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setLocation("/")}
            className="rounded-full border-white/10 hover:bg-white/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-3xl font-display font-bold uppercase tracking-tight">Terms of Use</h1>
        </header>

        <section className="space-y-6 text-muted-foreground leading-relaxed">
          <div className="p-6 bg-card/50 border border-white/10 rounded-2xl">
            <h2 className="text-foreground font-bold uppercase tracking-wider mb-2">Terms and Conditions</h2>
            <p className="text-sm italic">Last updated: 27 December 2025</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">1. Acceptance of Terms</h3>
            <p>
              By accessing and using Run Coach Ai, you agree to be bound by these Terms of Use and our Privacy Policy. If you do not agree, please do not use the service.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">2. Service Description</h3>
            <p>
              Run Coach Ai provides AI-powered running coaching, route mapping, and session tracking. The service is provided "as is" and we reserve the right to modify or discontinue features at any time.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">3. User Conduct</h3>
            <p>
              Users are responsible for their own safety during physical activities. Run Coach Ai is a tool to assist, not a replacement for professional medical advice or common sense during training.
            </p>
          </div>

          <div className="space-y-4 pb-20">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">4. Limitation of Liability</h3>
            <p>
              We are not liable for any injuries, health issues, or damages resulting from the use of the application or following AI-generated coaching advice. Always consult a physician before starting a new fitness regimen.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
