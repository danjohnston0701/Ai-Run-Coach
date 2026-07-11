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
            <p className="text-sm italic">Last updated: 11 July 2026</p>
          </div>

          {/* 1. Who We Are */}
          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">1. Who We Are</h3>
            <p>
              This Privacy Policy explains how <strong>airuncoach.live</strong>, trading as <strong>AI Run Coach</strong> ("we", "us", "our"), collects, uses, stores, and protects your personal information when you use the AI Run Coach application, website, and associated services, including the Garmin companion app (the "App").
            </p>
            <p>We act as the <strong>data controller</strong> for the personal data processed through AI Run Coach.</p>
            <p>Third-party services (such as Garmin Connect, Apple Health, Strava, and similar providers) act as <strong>independent data controllers</strong> for the data they collect and share with us.</p>

            <h4 className="font-bold text-foreground mt-4">Contact Details</h4>
            <p>If you have questions or wish to exercise your rights, please contact us at:</p>
            <ul className="list-none pl-0 space-y-1">
              <li><strong>Email:</strong> <span className="text-primary font-medium">support@airuncoach.live</span></li>
              <li><strong>Privacy / Data Protection enquiries:</strong> <span className="text-primary font-medium">privacy@airuncoach.live</span></li>
              <li><strong>Website:</strong> <span className="text-primary font-medium">https://airuncoach.live</span></li>
            </ul>
            <p className="text-sm mt-2">
              We have designated a <strong>Data Protection Contact</strong> who is responsible for overseeing questions relating to this Privacy Policy. If you wish to raise a privacy concern or exercise your data subject rights, please contact us at the privacy email address above.
            </p>
            <p className="text-sm italic">
              Note: We are a small independent developer. Depending on the scale of our health data processing, we will keep our obligation to appoint a formal Data Protection Officer (DPO) under GDPR Article 37 under review and will update this section accordingly.
            </p>
          </div>

          {/* 2. What Data We Collect */}
          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">2. What Data We Collect</h3>
            <p>We collect only the data necessary to provide AI Run Coach functionality.</p>

            <h4 className="font-bold text-foreground mt-4">How Data Is Collected</h4>
            <p>We collect data in the following ways:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Directly from you when you create an account or enter profile information</li>
              <li>Automatically from your device during workout sessions (e.g., GPS, sensors, device metrics)</li>
              <li>From connected third-party services (such as Garmin Connect, Apple Health, Samsung Health, or Strava) when you choose to link your account</li>
            </ul>

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
            <p>When you connect third-party fitness services, we may receive:</p>
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

          {/* 3. Legal Basis */}
          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">3. Legal Basis for Processing (GDPR)</h3>

            <h4 className="font-bold text-foreground mt-4">General Personal Data (Article 6)</h4>
            <p>We process personal data based on:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Contract performance:</strong> To deliver the services you have requested</li>
              <li><strong>Consent:</strong> For optional features such as connected services, notifications, and AI coaching</li>
              <li><strong>Legitimate interests:</strong> To improve coaching accuracy, maintain system security, and prevent misuse — balanced against your fundamental rights and freedoms</li>
              <li><strong>Legal obligation:</strong> Where processing is required to comply with a legal obligation to which we are subject</li>
              <li><strong>Vital interests:</strong> Where processing is necessary to protect your vital interests or those of another person — for example, during a health emergency detected during active physical activity</li>
            </ul>

            <h4 className="font-bold text-foreground mt-4">Health and Fitness Data (Article 9)</h4>
            <p>Health and fitness data is classified as <strong>special category data</strong> under GDPR Article 9 and is processed only with <strong>explicit consent</strong>, obtained through a clear affirmative action (such as selecting a checkbox or enabling features within the app).</p>
            <p>You may withdraw your consent at any time. Withdrawal will not affect the lawfulness of any processing that took place prior to withdrawal.</p>
          </div>

          {/* 4. How We Use Your Data */}
          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">4. How We Use Your Data</h3>
            <p>We use your data only for specific, defined purposes:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Analysing real-time workout data (such as pace, heart rate, and distance) to generate AI-driven coaching during active sessions</li>
              <li>Analysing historical activity data and profile information to generate personalised training recommendations and exercise plans</li>
              <li>Providing performance insights, summaries, and progress tracking</li>
              <li>Generating routes and navigation guidance</li>
              <li>Enabling optional sharing features</li>
              <li>Sending notifications (with your consent)</li>
              <li>Maintaining system performance, reliability, and security</li>
            </ul>
            <p className="text-sm">Each use of your data is limited to what is necessary for the feature you choose to use.</p>

            <h4 className="font-bold text-foreground mt-4">Data Use Breakdown (Transparency)</h4>
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
                  <tr><td className="p-3">AI processing data</td><td className="p-3">Sent as structured, anonymised workout and training data</td><td className="p-3">AI-generated coaching insights, plans, and summaries</td></tr>
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

            <h4 className="font-bold text-foreground mt-4">AI Processing (OpenAI)</h4>
            <p>To provide AI-powered coaching features, we use OpenAI as a third-party data processor.</p>
            <p>When AI features are used, we send structured workout and training data, which may include:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Real-time workout metrics (such as pace, distance, duration, cadence, heart rate and elevation)</li>
              <li>Historical activity data (such as past runs, performance trends, and training history)</li>
              <li>Derived performance metrics (such as fitness level, training load, or activity intensity)</li>
              <li>Session data (such as timestamps, splits, and workout structure)</li>
              <li>Limited user profile context (such as first name, age range, fitness level, goals, height, and weight) where necessary to personalise coaching</li>
            </ul>
            <p className="mt-2">We do <strong>not</strong> send personal identifiers such as:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Name</li>
              <li>Email address</li>
              <li>Phone number</li>
              <li>Account credentials</li>
              <li>Device identifiers</li>
            </ul>
            <p className="mt-2">Location data (such as GPS coordinates) is only shared with AI systems where required to provide specific features during run session activities and is not linked to personally identifiable information.</p>
            <p>All data is transmitted securely and used solely to generate coaching insights, recommendations, audio feedback and AI generated training plans.</p>
            <p>We use OpenAI under a <strong>zero data retention policy</strong>, and data sent to OpenAI is not used to train or improve OpenAI's models.</p>
            <p>OpenAI processes this data under strict contractual obligations and provides a level of data protection consistent with applicable privacy laws.</p>

            <h4 className="font-bold text-foreground mt-4">User Consent for AI Processing</h4>
            <p>We will only send your data to OpenAI after obtaining your <strong>explicit consent</strong>.</p>
            <p>This consent is requested within the app before AI-powered features (such as real-time coaching, personalised training plans, or AI-generated insights) are activated.</p>
            <p>You may withdraw your consent at any time by disabling AI features within the app settings or by discontinuing use of the Service.</p>

            <h4 className="font-bold text-foreground mt-4">Automated Processing and Profiling</h4>
            <p>We use automated processing to analyse your fitness data and generate personalised coaching insights.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>This constitutes <strong>profiling</strong> under GDPR</li>
              <li>It does <strong>not produce legal or similarly significant effects</strong></li>
              <li>You may opt out by disabling AI features within the app at any time</li>
            </ul>

            <h4 className="font-bold text-foreground mt-4">Real-Time Processing</h4>
            <p>During active sessions, data is processed temporarily to deliver immediate coaching feedback and is not used beyond its intended purpose.</p>

            <h4 className="font-bold text-foreground mt-4">What We Do NOT Do</h4>
            <p>We do not:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Sell personal or health data</li>
              <li>Use data for advertising or marketing profiling</li>
              <li>Share data with advertisers</li>
              <li>Use Garmin or fitness data for unrelated purposes</li>
            </ul>
          </div>

          {/* 5. Data Sharing */}
          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">5. Data Sharing</h3>
            <p>We share your data only where necessary:</p>

            <h4 className="font-bold text-foreground mt-4">Service Providers</h4>
            <ul className="list-disc pl-5 space-y-2">
              <li>Neon (database hosting)</li>
              <li>OpenAI (AI processing)</li>
              <li>Google Maps Platform (mapping and routing)</li>
              <li>GraphHopper (route generation)</li>
              <li>Replit (application hosting and infrastructure)</li>
            </ul>
            <p>All providers are contractually required to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Protect your data</li>
              <li>Process data only for specified purposes</li>
              <li>Provide a level of protection consistent with applicable privacy laws</li>
            </ul>

            <h4 className="font-bold text-foreground mt-4">Garmin Data Restrictions</h4>
            <p>Data obtained from Garmin devices or Garmin Connect:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Is used solely to provide user-requested functionality</li>
              <li>Is not sold, rented, or shared for advertising or marketing</li>
              <li>Is not disclosed beyond what is necessary to deliver the service</li>
              <li>Is deleted when you disconnect your Garmin account</li>
            </ul>

            <h4 className="font-bold text-foreground mt-4">Mapping and Location Services</h4>
            <p>When generating routes or maps:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Only GPS coordinates are shared with mapping providers</li>
              <li>No personal identifiers are included</li>
            </ul>

            <h4 className="font-bold text-foreground mt-4">Legal Obligations</h4>
            <p>We may disclose data when required by law, court order, or regulatory requirement, or where necessary to protect the rights, safety, or property of AI Run Coach, its users, or the public.</p>

            <h4 className="font-bold text-foreground mt-4">Business Acquisitions and Corporate Transfers</h4>
            <p>In the event of a merger, acquisition, sale of assets, reorganisation, insolvency, or similar transaction, your personal data may be transferred to the relevant third party as part of that transaction. Where required by law, we will notify you before your data is transferred and becomes subject to a different privacy policy. In all such cases, we will take reasonable steps to ensure your data continues to receive adequate protection.</p>
          </div>

          {/* 6. International Transfers */}
          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">6. International Data Transfers</h3>
            <p>Your data may be processed outside the UK/EEA, including in the United States, by some of our service providers (such as OpenAI and Replit).</p>
            <p>We ensure appropriate safeguards including:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Standard Contractual Clauses (SCCs) approved by the European Commission and/or UK ICO</li>
              <li>Data Processing Agreements with all third-party processors</li>
              <li>Encryption and secure transmission</li>
            </ul>
          </div>

          {/* 7. Data Retention */}
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

          {/* 8. Your Rights */}
          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">8. Your Rights</h3>
            <p>Under the GDPR, UK GDPR, and applicable privacy laws, you have the following rights. We will respond to all requests within <strong>one month</strong> of receipt, as required by law (extendable by a further two months in complex cases, with notice).</p>

            <h4 className="font-bold text-foreground mt-4">Right of Access</h4>
            <p>You have the right to obtain a copy of the personal data we hold about you. To request access, email us at <span className="text-primary font-medium">privacy@airuncoach.live</span> with the subject line "Data Access Request". We will provide your data in a structured, commonly used format.</p>

            <h4 className="font-bold text-foreground mt-4">Right to Correction</h4>
            <p>You can correct inaccurate personal data at any time through your in-app profile settings. For corrections that cannot be made in-app, contact us at <span className="text-primary font-medium">privacy@airuncoach.live</span>.</p>

            <h4 className="font-bold text-foreground mt-4">Right to Deletion ("Right to be Forgotten")</h4>
            <p>You may request deletion of your account and personal data via the in-app account settings or by emailing <span className="text-primary font-medium">privacy@airuncoach.live</span>. We will delete your data within 30 days of your request. Note that some data may be retained for a limited period where required by law or to resolve disputes.</p>

            <h4 className="font-bold text-foreground mt-4">Right to Data Portability</h4>
            <p>You may request an export of your personal data in a machine-readable format (such as JSON or CSV). Contact us at <span className="text-primary font-medium">privacy@airuncoach.live</span> to request a data export.</p>

            <h4 className="font-bold text-foreground mt-4">Right to Object</h4>
            <p>You may object to processing based on legitimate interests at any time. You may also opt out of automated profiling by disabling AI features in the app settings.</p>

            <h4 className="font-bold text-foreground mt-4">Right to Restrict Processing</h4>
            <p>You have the right to request that we restrict processing of your data in certain circumstances, for example while we investigate an accuracy dispute. Contact us at <span className="text-primary font-medium">privacy@airuncoach.live</span> to make a restriction request.</p>

            <h4 className="font-bold text-foreground mt-4">Right to Withdraw Consent</h4>
            <p>Where processing is based on your consent (including for health data and AI features), you may withdraw that consent at any time through the app settings or by contacting us. Withdrawal does not affect the lawfulness of processing prior to withdrawal.</p>

            <h4 className="font-bold text-foreground mt-4">Right to Lodge a Complaint</h4>
            <p>You have the right to lodge a complaint with your local data protection supervisory authority at any time. We encourage you to contact us first so we can try to resolve your concern directly.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>UK residents:</strong> Information Commissioner's Office (ICO) — <span className="text-primary font-medium">ico.org.uk</span></li>
              <li><strong>EEA residents:</strong> Contact your national data protection authority (a full list is available at <span className="text-primary font-medium">edpb.europa.eu</span>)</li>
              <li><strong>All users:</strong> You may also contact us directly at <span className="text-primary font-medium">privacy@airuncoach.live</span></li>
            </ul>

            <h4 className="font-bold text-foreground mt-4">How to Exercise Your Rights</h4>
            <p>To exercise any of the above rights, please contact us at <span className="text-primary font-medium">privacy@airuncoach.live</span> with a clear description of your request. We may ask you to verify your identity before processing the request. We will not charge a fee for reasonable requests.</p>
          </div>

          {/* 9. US State Privacy */}
          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">9. US State Privacy Rights</h3>
            <p>If you are a resident of a US state with applicable privacy legislation, including but not limited to California, Virginia, Colorado, Connecticut, Utah, Delaware, Iowa, Maryland, Minnesota, Montana, Nebraska, New Hampshire, New Jersey, Oregon, Tennessee, and Texas, you may have additional rights under applicable state law.</p>

            <h4 className="font-bold text-foreground mt-4">Your Rights Under US State Laws</h4>
            <ul className="list-disc pl-5 space-y-2">
              <li>Know what personal data we collect and how it is used</li>
              <li>Access, correct, or delete your personal data</li>
              <li>Obtain a portable copy of your data</li>
              <li>Opt out of the sale of personal data (we do not sell personal data)</li>
              <li>Opt out of targeted advertising (we do not use data for targeted advertising)</li>
              <li>Non-discrimination for exercising your privacy rights (see below)</li>
            </ul>

            <h4 className="font-bold text-foreground mt-4">Health Data</h4>
            <p>Health and fitness data may be considered <strong>sensitive personal data</strong> under applicable state laws. We process it only with your consent and do not sell or share it for advertising purposes.</p>

            <h4 className="font-bold text-foreground mt-4">Non-Discrimination</h4>
            <p>We will <strong>not discriminate against you</strong> for exercising any of your privacy rights under applicable US state laws, including the California Consumer Privacy Act (CCPA) and similar state laws. This means we will not deny you access to our services, charge you different prices, provide a different level of service, or suggest that you will receive a different level of service as a result of exercising your privacy rights.</p>

            <h4 className="font-bold text-foreground mt-4">Authorised Agents</h4>
            <p>You may appoint an <strong>authorised agent</strong> to submit privacy requests on your behalf. To do so, please provide us with written proof of the agent's authorisation (such as a signed permission letter or power of attorney). We may verify your identity and the agent's authority before processing such a request. Contact us at <span className="text-primary font-medium">privacy@airuncoach.live</span> for authorised agent requests.</p>

            <h4 className="font-bold text-foreground mt-4">How to Submit a Request</h4>
            <p>To submit a US state privacy request or appeal a decision regarding a privacy request, contact us at <span className="text-primary font-medium">privacy@airuncoach.live</span>. We will respond within the timeframe required by applicable state law.</p>
          </div>

          {/* 10. Security */}
          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">10. Security</h3>
            <p>We implement technical and organisational measures to protect your data, including:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Encryption in transit (TLS) and at rest</li>
              <li>Secure password hashing</li>
              <li>Access controls and authentication</li>
              <li>System monitoring and updates</li>
            </ul>
            <p className="text-sm">No method of transmission or storage is 100% secure. If you have concerns about the security of your data, please contact us at <span className="text-primary font-medium">privacy@airuncoach.live</span>.</p>
          </div>

          {/* 11. Data Breach */}
          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">11. Data Breach Notification</h3>
            <p>In the event of a personal data breach that is likely to result in a risk to your rights and freedoms:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>We will notify the relevant supervisory authority (such as the ICO in the UK, or the competent EEA authority) <strong>within 72 hours</strong> of becoming aware of the breach, where required by law</li>
              <li>Where the breach is likely to result in a <strong>high risk</strong> to your rights and freedoms, we will notify affected users without undue delay</li>
              <li>Notification to users will include: a description of the nature of the breach, the likely consequences, and the measures we have taken or propose to take to address the breach</li>
            </ul>
          </div>

          {/* 12. Children */}
          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">12. Children's Privacy</h3>
            <p>AI Run Coach is not intended for users under 16 years of age. We do not knowingly collect personal data from anyone under the age of 16. If we become aware that we have collected data from a user under 16, we will delete it promptly. If you believe a child under 16 has provided us with personal data, please contact us at <span className="text-primary font-medium">privacy@airuncoach.live</span>.</p>
          </div>

          {/* 13. Cookies */}
          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">13. Cookies and Tracking</h3>
            <p>We use minimal tracking technologies. The cookies and similar technologies we use fall into the following categories:</p>

            <h4 className="font-bold text-foreground mt-4">Strictly Necessary</h4>
            <p>Session cookies required for authentication and to keep you logged in. These cannot be disabled without affecting core functionality.</p>

            <h4 className="font-bold text-foreground mt-4">Preferences</h4>
            <p>Cookies that remember your settings and preferences (such as language and display preferences). These are set only with your consent.</p>

            <h4 className="font-bold text-foreground mt-4">Analytics</h4>
            <p>Anonymised, aggregated performance data used to understand how users interact with the app and improve reliability. No personally identifiable information is collected for analytics purposes.</p>

            <h4 className="font-bold text-foreground mt-4">What We Do Not Use</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>Advertising or marketing cookies</li>
              <li>Cross-site tracking technologies</li>
              <li>Third-party analytics with personal identifiers (e.g. Google Analytics linked to user identity)</li>
            </ul>

            <h4 className="font-bold text-foreground mt-4">Managing Cookies</h4>
            <p>You can manage or delete cookies through your browser or device settings at any time. Disabling strictly necessary cookies may affect your ability to use parts of the service.</p>
          </div>

          {/* 14. Changes */}
          <div className="space-y-4">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">14. Changes to This Policy</h3>
            <p>We will notify users of material changes to this Privacy Policy at least <strong>30 days before</strong> they take effect, via in-app notification or email. The "Last updated" date at the top of this page will always reflect the most recent version. Continued use of the App after the effective date constitutes acceptance of the updated policy.</p>
          </div>

          {/* 15. Contact */}
          <div className="space-y-4 pb-0">
            <h3 className="text-xl font-display font-bold text-foreground uppercase tracking-wide">15. Contact Us</h3>
            <p>For any questions, concerns, or requests relating to this Privacy Policy or the processing of your personal data:</p>
            <ul className="list-none pl-0 space-y-2">
              <li><strong>General support:</strong> <span className="text-primary font-medium">support@airuncoach.live</span></li>
              <li><strong>Privacy and data protection:</strong> <span className="text-primary font-medium">privacy@airuncoach.live</span></li>
              <li><strong>Website:</strong> <span className="text-primary font-medium">https://airuncoach.live</span></li>
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
