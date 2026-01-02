import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
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
          <h1 className="text-3xl font-display font-bold uppercase tracking-tight">Privacy Policy</h1>
        </header>

        <section className="space-y-6 text-muted-foreground leading-relaxed">
          <div className="p-6 bg-card/50 border border-white/10 rounded-2xl">
            <h2 className="text-foreground font-bold uppercase tracking-wider mb-2">Use of Information & third party account data</h2>
            <p className="text-sm italic">Last updated: 27 December 2025</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">1. Who we are</h3>
            <p>
              This Privacy Policy explains how airuncoach.live trading as Ai Run Coach (“we”, “us”) collects, uses, and discloses information when you use our Run Coach Ai application and when you connect third party fitness accounts, specifically and limited to Garmin Connect, Apple Fitness +, Samsung Health and Strava applications and programs.
            </p>
            <p>
              If you have questions, you can contact us at:<br />
              <span className="text-primary font-medium">Email: support@airuncoach.live</span>
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">2. What data we receive</h3>
            <p>When you connect your account to Ai Run Coach, the provider may share the following categories of data with us, depending on your permissions and device:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Activity data:</strong> workout type (e.g., run), start time, duration, distance, pace, cadence, lap and split information, GPS route points, elevation.</li>
              <li><strong>Physiological data:</strong> heart rate, heart-rate zones, calories.</li>
              <li><strong>Device identifiers:</strong> internal activity IDs, device type, and anonymized user identifiers.</li>
            </ul>
            <p className="text-sm italic">We do not receive your account password or payment information.</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">3. How we use your data</h3>
            <p>We use your activity data only to provide and improve the Ai Run Coach service, including:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Generating real-time and post-run coaching feedback (e.g., pace and heart-rate guidance).</li>
              <li>Creating summaries of your runs, progress reports, and personalized training suggestions.</li>
              <li>Maintaining basic analytics about app performance and training effectiveness using anonymized or aggregated data where possible.</li>
            </ul>
            <p>We do not use your data for unrelated purposes such as targeted advertising or selling user profiles.</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">4. Data Sharing</h3>
            <p>We may share your information only in these limited situations:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Service providers:</strong> Third-party processors that help us operate the app (cloud hosting, databases, AI models).</li>
              <li><strong>Legal obligations:</strong> When required by law, court order, or to protect rights and safety.</li>
              <li><strong>Business transfers:</strong> In the event of a merger or acquisition.</li>
            </ul>
            <p>We do not sell, rent, or license your fitness device activity data to advertisers or other third parties.</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">5. Retention</h3>
            <p>We keep your device activity data only for as long as necessary to provide the Ai Run Coach service and for legitimate business or legal purposes.</p>
            <p>If you disconnect your fitness devices or delete your account, we will stop receiving new data and will delete or irreversibly anonymize stored data within a reasonable period.</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">6. Your Rights</h3>
            <p>You have control over your fitness data in several ways:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Disconnect:</strong> Revoke access via connected party app settings or within our app's "Connected Services" page.</li>
              <li><strong>Access & Deletion:</strong> Contact us to request access, correction, or deletion of your data.</li>
              <li><strong>Withdraw Consent:</strong> Stop processing going forward by withdrawing consent.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">7. Security</h3>
            <p>We use appropriate technical measures to protect your personal data, including encrypted connections (HTTPS/TLS) and restricted database access. No method is completely secure, and we cannot guarantee absolute security.</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">8. Children</h3>
            <p>Ai Run Coach is not directed at children under 16. If you believe a child under 16 has provided us data, please contact us for deletion.</p>
          </div>

          <div className="space-y-4 pb-20">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">9. Changes</h3>
            <p>We may update this policy. Material changes will be noted by updating the "Last updated" date and notifying users in-app or via email.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
