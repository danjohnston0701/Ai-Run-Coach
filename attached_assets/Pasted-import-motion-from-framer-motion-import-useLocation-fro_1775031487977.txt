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
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-3xl font-display font-bold uppercase tracking-tight">Privacy Policy</h1>
        </header>

        <section className="space-y-6 text-muted-foreground leading-relaxed">
          <div className="p-6 bg-card/50 border border-white/10 rounded-2xl">
            <h2 className="text-foreground font-bold uppercase tracking-wider mb-2">Privacy Policy for AI Run Coach</h2>
            <p className="text-sm italic">Last updated: 19 March 2026</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">1. Who We Are</h3>
            <p>
              This Privacy Policy explains how <strong>airuncoach.live</strong>, trading as <strong>AI Run Coach</strong> ("we", "us", "our"), collects, uses, stores, and protects your personal information when you use the AI Run Coach application, website, and associated services, including the Garmin companion app (the "App").
            </p>
            <p>We act as the <strong>data controller</strong> for the personal data processed through AI Run Coach.</p>
            <p>Third-party services (such as Garmin Connect, Apple Health, Strava, and similar providers) act as <strong>independent data controllers</strong> for the data they collect and share with us.</p>
            <p>If you have questions or wish to exercise your rights, contact us at:</p>
            <ul className="list-none pl-0 space-y-1">
              <li><strong>Email:</strong> <span className="text-primary font-medium">support@airuncoach.live</span></li>
              <li><strong>Website:</strong> <span className="text-primary font-medium">https://airuncoach.live</span></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">2. What Data We Collect</h3>
            <p>We collect only the data necessary to provide AI Run Coach functionality.</p>

            <h4 className="font-bold text-foreground mt-4">Account Information</h4>
            <ul className="list-disc pl-5 space-y-2">
              <li>Email address and password (encrypted)</li>
              <li>Name, date of birth, gender</li>
              <li>Height and weight</li>
              <li>Fitness level and goals</li>
              <li>Coach voice preferences</li>
            </ul>

            <h4 className="font-bold text-foreground mt-4">Health and Fitness Data (Special Category Data)</h4>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Activity data:</strong> workout type, duration, distance, pace, cadence, laps</li>
              <li><strong>Location data:</strong> GPS route points, elevation</li>
              <li><strong>Physiological data:</strong> heart rate, heart-rate zones, calories burned</li>
              <li><strong>Environmental data:</strong> temperature, humidity, wind speed</li>
            </ul>

            <h4 className="font-bold text-foreground mt-4">Connected Services Data</h4>
            <p>When you connect third-party fitness services (such as Garmin Connect, Apple Health, Samsung Health, or Strava), we may receive:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Historical and real-time activity data</li>
              <li>Device-generated metrics and activity identifiers</li>
            </ul>
            <p className="text-sm italic">We do not receive your third-party account passwords or payment information.</p>

            <h4 className="font-bold text-foreground mt-4">Garmin Device and Companion App Data</h4>
            <p>When you use the AI Run Coach Garmin companion app or connect a Garmin device:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Data is transmitted from your Garmin device via Garmin APIs and/or device communication</li>
              <li>This includes real-time and historical workout metrics such as pace, heart rate, cadence, and distance</li>
              <li>The companion app acts as a secure bridge between your Garmin device and our services</li>
            </ul>
            <p>We process only the <strong>minimum data necessary</strong> to provide coaching functionality.</p>

            <h4 className="font-bold text-foreground mt-4">Technical Data</h4>
            <ul className="list-disc pl-5 space-y-2">
              <li>Device type, operating system, and app version</li>
              <li>Usage patterns and performance data</li>
              <li>Error logs (no personal data retained)</li>
              <li>IP address (anonymised where possible)</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">3. Legal Basis for Processing (GDPR)</h3>

            <h4 className="font-bold text-foreground mt-4">General Personal Data (Article 6)</h4>
            <p>We process personal data based on:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Contract performance:</strong> To deliver the services you have requested</li>
              <li><strong>Consent:</strong> For optional features such as connected services and notifications</li>
              <li><strong>Legitimate interests:</strong> To improve coaching accuracy, maintain system security, and prevent misuse</li>
            </ul>
            <p>We ensure these interests do not override your fundamental rights and freedoms.</p>

            <h4 className="font-bold text-foreground mt-4">Health and Fitness Data (Article 9)</h4>
            <p>Health and fitness data is processed only with <strong>explicit consent</strong>, obtained through a clear affirmative action (such as selecting a checkbox or confirming within the app during account setup or feature activation).</p>
            <p>You may withdraw your consent at any time.</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">4. How We Use Your Data</h3>
            <p>We use your data only for specific, defined purposes:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Analysing real-time workout data (such as pace, heart rate, and distance) to generate AI-driven coaching during active sessions</li>
              <li>Analysing historical activity data and profile information to generate personalised training recommendations</li>
              <li>Providing performance insights, summaries, and progress tracking</li>
              <li>Generating routes and navigation guidance</li>
              <li>Enabling optional sharing features</li>
              <li>Sending notifications (with your consent)</li>
              <li>Maintaining system performance, reliability, and security</li>
            </ul>

            <h4 className="font-bold text-foreground mt-4">Data Use Breakdown</h4>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-foreground">
                    <th className="text-left p-3 font-semibold">Data Type</th>
                    <th className="text-left p-3 font-semibold">How We Use It</th>
                    <th className="text-left p-3 font-semibold">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr><td className="p-3">Real-time workout data (pace, heart rate, cadence, distance)</td><td className="p-3">Analysed during active sessions and sent (in anonymised form) to AI systems</td><td className="p-3">Real-time coaching prompts and performance feedback</td></tr>
                  <tr><td className="p-3">Historical activity data</td><td className="p-3">Analysed to identify trends and performance patterns</td><td className="p-3">Personalised training plans and insights</td></tr>
                  <tr><td className="p-3">GPS location data</td><td className="p-3">Used for route generation and mapping; shared without personal identifiers</td><td className="p-3">Navigation, route planning, and post-run maps</td></tr>
                  <tr><td className="p-3">User profile data</td><td className="p-3">Combined with activity data to tailor recommendations</td><td className="p-3">Personalised coaching and training</td></tr>
                  <tr><td className="p-3">Device metrics (e.g. Garmin data)</td><td className="p-3">Integrated into performance analysis systems</td><td className="p-3">More accurate and adaptive coaching</td></tr>
                  <tr><td className="p-3">AI processing data</td><td className="p-3">Sent as structured, anonymised workout data (no personal identifiers)</td><td className="p-3">AI-generated coaching insights and summaries</td></tr>
                  <tr><td className="p-3">Audio output data</td><td className="p-3">AI-generated text converted to audio</td><td className="p-3">Real-time voice coaching during runs</td></tr>
                  <tr><td className="p-3">Technical logs</td><td className="p-3">Used for debugging and system monitoring</td><td className="p-3">Improved stability and performance</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm">We ensure:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Personal identifiers (name, email, account data) are <strong>never included in AI processing payloads</strong></li>
              <li>Data shared with third parties is limited to what is strictly necessary</li>
              <li>Processing is limited to the purpose for which the data was collected</li>
            </ul>

            <h4 className="font-bold text-foreground mt-4">Automated Processing and Profiling</h4>
            <p>We use automated processing to analyse your fitness data and generate personalised coaching insights.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>This constitutes <strong>profiling</strong> under GDPR</li>
              <li>It does <strong>not produce legal or similarly significant effects</strong></li>
              <li>You may opt out by discontinuing use of coaching features</li>
            </ul>

            <h4 className="font-bold text-foreground mt-4">Real-Time Processing</h4>
            <p>During active sessions, data is processed temporarily to deliver immediate coaching feedback and is not used beyond its intended purpose.</p>

            <h4 className="font-bold text-foreground mt-4">What We Do NOT Do</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>Sell personal or health data</li>
              <li>Use data for advertising or marketing profiling</li>
              <li>Share data with advertisers</li>
              <li>Use Garmin or fitness data for unrelated purposes</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">5. Data Sharing</h3>
            <p>We share your data only where necessary:</p>

            <h4 className="font-bold text-foreground mt-4">Service Providers</h4>
            <ul className="list-disc pl-5 space-y-2">
              <li>Neon (database hosting)</li>
              <li>OpenAI (AI processing – anonymised data only)</li>
              <li>Google Maps Platform (mapping and routing)</li>
              <li>GraphHopper (route generation)</li>
              <li>Replit (application hosting and infrastructure)</li>
            </ul>
            <p>All providers are contractually required to protect your data.</p>

            <h4 className="font-bold text-foreground mt-4">AI Processing</h4>
            <p>Only <strong>anonymised, structured workout data</strong> is shared with AI providers. No personal identifiers (such as name, email, or account details) are transmitted.</p>
            <p>AI providers operate under strict data processing agreements and zero-retention configurations where applicable.</p>

            <h4 className="font-bold text-foreground mt-4">Garmin Data Restrictions</h4>
            <p>Data obtained from Garmin devices or Garmin Connect:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Is used solely to provide user-requested functionality</li>
              <li>Is not sold, rented, or shared for advertising or marketing</li>
              <li>Is not disclosed beyond what is necessary to deliver the service</li>
              <li>Is deleted when you disconnect your Garmin account</li>
            </ul>

            <h4 className="font-bold text-foreground mt-4">Mapping and Location Services</h4>
            <p>When generating routes or maps, only GPS coordinates are shared with mapping providers. No personal identifiers are included.</p>

            <h4 className="font-bold text-foreground mt-4">Legal Obligations</h4>
            <p>We may disclose data when required by law or to protect rights, safety, or security.</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">6. International Data Transfers</h3>
            <p>Your data may be processed outside the UK/EEA, including in the United States.</p>
            <p>We ensure appropriate safeguards including:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Standard Contractual Clauses (SCCs)</li>
              <li>Data Processing Agreements</li>
              <li>Encryption and secure transmission</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">7. Data Retention</h3>
            <p>We retain data only as long as necessary:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Account and activity data:</strong> while your account is active</li>
              <li><strong>Deleted within 30 days</strong> of account deletion</li>
              <li><strong>Technical logs:</strong> up to 90 days</li>
              <li><strong>Aggregated data:</strong> retained indefinitely in anonymised form</li>
            </ul>
            <p>Retention periods are based on service delivery, legal obligations, and dispute resolution needs.</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">8. Your Rights</h3>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Access your personal data</li>
              <li>Correct inaccuracies</li>
              <li>Delete your data</li>
              <li>Export your data</li>
              <li>Object to processing</li>
              <li>Restrict processing</li>
              <li>Withdraw consent</li>
            </ul>
            <p className="mt-2">To exercise your rights:</p>
            <ul className="list-none pl-0 space-y-1">
              <li><strong>Email:</strong> <span className="text-primary font-medium">support@airuncoach.live</span></li>
              <li>Use in-app controls</li>
            </ul>
            <p className="mt-2">You may also lodge a complaint with your local supervisory authority.</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">9. US State Privacy Rights</h3>
            <p>If you are a resident of certain U.S. states (including California, Virginia, Colorado, Connecticut, and Utah), you may have rights to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Access, correct, or delete your data</li>
              <li>Obtain a copy of your data</li>
              <li>Opt out of certain processing</li>
            </ul>
            <p>Health and fitness data may be considered <strong>sensitive personal data</strong>, and we process it only with your consent.</p>
            <p className="font-bold mt-2">We do not:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Sell personal data</li>
              <li>Share data for targeted advertising</li>
            </ul>
            <p className="mt-2">You may appeal decisions regarding your privacy requests by contacting us.</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">10. Security</h3>
            <p>We implement:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Encryption (in transit and at rest)</li>
              <li>Secure password hashing</li>
              <li>Access controls</li>
              <li>System monitoring and updates</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">11. Data Breach Notification</h3>
            <p>We will notify authorities and affected users where required by law.</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">12. Children's Privacy</h3>
            <p>AI Run Coach is not intended for users under 16 years of age.</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">13. Cookies and Tracking</h3>
            <p>We use minimal tracking for:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Authentication</li>
              <li>Preferences</li>
              <li>Performance analytics (anonymised)</li>
            </ul>
            <p>We do not use advertising cookies or cross-site tracking.</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">14. Changes to This Policy</h3>
            <p>We will notify users of material changes at least 30 days before they take effect.</p>
          </div>

          <div className="space-y-4 pb-0">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">15. Contact Us</h3>
            <ul className="list-none pl-0 space-y-1">
              <li><span className="text-primary font-medium">support@airuncoach.live</span></li>
            </ul>
            <p className="mt-4 text-sm italic">
              This Privacy Policy is provided in English and prevails over any translated versions.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
