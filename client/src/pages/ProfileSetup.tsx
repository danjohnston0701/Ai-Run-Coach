import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

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

export default function ProfileSetup() {
  const [, setLocation] = useLocation();
  const [profile, setProfile] = useState<ProfileData>({
    name: "",
    dob: "",
    gender: "",
    height: "",
    weight: "",
    fitnessLevel: "Casual",
    desiredFitnessLevel: "Athletic",
    coachName: "",
  });

  useEffect(() => {
    const savedProfile = localStorage.getItem("userProfile");
    if (savedProfile) {
      const parsed = JSON.parse(savedProfile);
      setProfile(prev => ({
        ...prev,
        name: parsed.name || "",
        dob: parsed.dob || "",
        gender: parsed.gender || "",
        height: parsed.height || "",
        weight: parsed.weight || "",
        fitnessLevel: parsed.fitnessLevel || "Casual",
        desiredFitnessLevel: parsed.desiredFitnessLevel || "Athletic",
        coachName: parsed.coachName || "",
      }));
    }
  }, []);

  const handleChange = (field: keyof ProfileData, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const formatDateInput = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length <= 2) return cleaned;
    if (cleaned.length <= 4) return `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4, 8)}`;
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDateInput(e.target.value);
    handleChange("dob", formatted);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.name || !profile.dob || !profile.gender || !profile.height || !profile.weight) {
      alert("Please fill in all fields");
      return;
    }
    const savedProfile = localStorage.getItem("userProfile");
    const existingData = savedProfile ? JSON.parse(savedProfile) : {};
    const mergedProfile = { ...existingData, ...profile };
    localStorage.setItem("userProfile", JSON.stringify(mergedProfile));
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 flex flex-col justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md mx-auto w-full"
      >
        <div className="mb-8">
          <h1 className="text-4xl font-display font-bold text-primary uppercase tracking-wider mb-2">
            User Profile
          </h1>
          <p className="text-muted-foreground text-sm">Create your profile to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-profile">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Your Name
            </label>
            <input
              type="text"
              placeholder="Enter your name"
              value={profile.name}
              onChange={(e) => handleChange("name", e.target.value)}
              className="w-full px-3 py-2 bg-card border border-white/10 rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
              data-testid="input-name"
            />
          </div>

          {/* Date of Birth */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Date of Birth
            </label>
            <input
              type="text"
              placeholder="DD/MM/YYYY"
              value={profile.dob}
              onChange={handleDateChange}
              maxLength={10}
              className="w-full px-3 py-2 bg-card border border-white/10 rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
              data-testid="input-dob"
            />
          </div>

          {/* Gender */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Gender
            </label>
            <select
              value={profile.gender}
              onChange={(e) => handleChange("gender", e.target.value)}
              className="w-full px-3 py-2 bg-card border border-white/10 rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
              data-testid="select-gender"
            >
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Height */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Height (cm)
            </label>
            <input
              type="number"
              placeholder="Enter your height"
              value={profile.height}
              onChange={(e) => handleChange("height", e.target.value)}
              className="w-full px-3 py-2 bg-card border border-white/10 rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
              data-testid="input-height"
            />
          </div>

          {/* Weight */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Weight (kg)
            </label>
            <input
              type="number"
              placeholder="Enter your weight"
              value={profile.weight}
              onChange={(e) => handleChange("weight", e.target.value)}
              className="w-full px-3 py-2 bg-card border border-white/10 rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
              data-testid="input-weight"
            />
          </div>

          {/* Current Fitness Level */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Current Fitness Level
            </label>
            <select
              value={profile.fitnessLevel}
              onChange={(e) => handleChange("fitnessLevel", e.target.value)}
              className="w-full px-3 py-2 bg-card border border-white/10 rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
              data-testid="select-fitness"
            >
              {FITNESS_LEVELS.map(level => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>

          {/* Desired Fitness Level */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Desired Fitness Level
            </label>
            <select
              value={profile.desiredFitnessLevel}
              onChange={(e) => handleChange("desiredFitnessLevel", e.target.value)}
              className="w-full px-3 py-2 bg-card border border-white/10 rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
              data-testid="select-desired-fitness"
            >
              {FITNESS_LEVELS.map(level => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>

          {/* Coach Name */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              AI Coach's Name
            </label>
            <input
              type="text"
              placeholder="e.g., Coach AI, Alex, etc."
              value={profile.coachName}
              onChange={(e) => handleChange("coachName", e.target.value)}
              className="w-full px-3 py-2 bg-card border border-white/10 rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
              data-testid="input-coach-name"
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full h-12 mt-6 text-lg font-display uppercase tracking-widest bg-primary text-background hover:bg-primary/90 shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all flex items-center justify-center gap-2"
            data-testid="button-create-profile"
          >
            Get Started
            <ArrowRight className="w-5 h-5" />
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
