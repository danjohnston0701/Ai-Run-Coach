import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowLeft, Save, User } from "lucide-react";

const FITNESS_LEVELS = ["Unfit", "Casual", "Athletic", "Very Fit", "Elite"];

interface ProfileData {
  name: string;
  dob: string;
  gender: string;
  height: string;
  weight: string;
  fitnessLevel: string;
  desiredFitnessLevel: string;
  coachName: string;
}

export default function Profile() {
  const [, setLocation] = useLocation();
  const [profile, setProfile] = useState<ProfileData | null>(null);

  useEffect(() => {
    const savedProfile = localStorage.getItem("userProfile");
    if (savedProfile) {
      setProfile(JSON.parse(savedProfile));
    } else {
      setLocation("/");
    }
  }, [setLocation]);

  const handleChange = (field: keyof ProfileData, value: string) => {
    if (!profile) return;
    setProfile(prev => ({ ...prev!, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    
    if (!profile.name || !profile.gender || !profile.height || !profile.weight) {
      alert("Please fill in all required fields");
      return;
    }
    
    localStorage.setItem("userProfile", JSON.stringify(profile));
    setLocation("/");
  };

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <header className="mb-8 flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setLocation("/")}
          className="rounded-full border-white/10 hover:bg-white/10"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-4xl font-display font-bold text-primary uppercase tracking-wider">Profile</h1>
          <p className="text-muted-foreground text-sm">Manage your personal details</p>
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md mx-auto w-full"
      >
        <form onSubmit={handleSubmit} className="space-y-6 pb-24">
          <div className="space-y-4 bg-card/50 p-6 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 mb-4">
              <User className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-display font-bold uppercase tracking-wide">Personal Info</h2>
            </div>

            {/* Name */}
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Your Name
              </label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => handleChange("name", e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            {/* Date of Birth (Read Only) */}
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Date of Birth
              </label>
              <input
                type="text"
                value={profile.dob}
                readOnly
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-muted-foreground cursor-not-allowed opacity-60"
              />
              <p className="text-[10px] text-muted-foreground/60 mt-1 ml-1">Date of birth cannot be changed.</p>
            </div>

            {/* Gender */}
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Gender
              </label>
              <select
                value={profile.gender}
                onChange={(e) => handleChange("gender", e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                  Height (cm)
                </label>
                <input
                  type="number"
                  value={profile.height}
                  onChange={(e) => handleChange("height", e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                  Weight (kg)
                </label>
                <input
                  type="number"
                  value={profile.weight}
                  onChange={(e) => handleChange("weight", e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 bg-card/50 p-6 rounded-2xl border border-white/5">
             <div className="flex items-center gap-3 mb-4">
              <div className="w-5 h-5 text-primary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
              </div>
              <h2 className="text-lg font-display font-bold uppercase tracking-wide">Fitness Goals</h2>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Current Level
              </label>
              <select
                value={profile.fitnessLevel}
                onChange={(e) => handleChange("fitnessLevel", e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
              >
                {FITNESS_LEVELS.map(level => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Target Level
              </label>
              <select
                value={profile.desiredFitnessLevel}
                onChange={(e) => handleChange("desiredFitnessLevel", e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
              >
                {FITNESS_LEVELS.map(level => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </div>
          </div>

           <div className="space-y-4 bg-card/50 p-6 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-5 h-5 text-primary">
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12L2.5 9.5"/><path d="M12 12l9.5 2.5"/></svg>
              </div>
              <h2 className="text-lg font-display font-bold uppercase tracking-wide">Coach Config</h2>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Coach's Name
              </label>
              <input
                type="text"
                value={profile.coachName}
                onChange={(e) => handleChange("coachName", e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent z-50">
            <Button
              type="submit"
              size="lg"
              className="w-full h-16 text-xl font-display uppercase tracking-widest bg-primary text-background hover:bg-primary/90 shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all flex items-center justify-center gap-2"
            >
              <Save className="w-6 h-6" />
              Save Changes
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
