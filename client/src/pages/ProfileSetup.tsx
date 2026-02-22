import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Camera, Upload, User } from "lucide-react";
import { toast } from "sonner";

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
  profilePic?: string;
}

export default function ProfileSetup() {
  const [, setLocation] = useLocation();
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<ProfileData>({
    name: "",
    dob: "",
    gender: "",
    height: "",
    weight: "",
    fitnessLevel: "Casual",
    desiredFitnessLevel: "Athletic",
    coachName: "",
    profilePic: "",
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
        profilePic: parsed.profilePic || "",
      }));
    }
  }, []);

  const handleUploadClick = () => {
    setShowPhotoOptions(false);
    fileInputRef.current?.click();
  };

  const handleCameraClick = () => {
    setShowPhotoOptions(false);
    cameraInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfile(prev => ({ ...prev, profilePic: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.name || !profile.dob || !profile.gender || !profile.height || !profile.weight) {
      toast.error("Please fill in all fields");
      return;
    }
    const savedProfile = localStorage.getItem("userProfile");
    const existingData = savedProfile ? JSON.parse(savedProfile) : {};
    const mergedProfile = { ...existingData, ...profile };
    
    // Save to database if user has an ID
    if (existingData.id) {
      try {
        const res = await fetch(`/api/users/${existingData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: profile.name,
            dob: profile.dob,
            gender: profile.gender,
            height: profile.height,
            weight: profile.weight,
            fitnessLevel: profile.fitnessLevel,
            desiredFitnessLevel: profile.desiredFitnessLevel,
            coachName: profile.coachName,
            profilePic: profile.profilePic,
          }),
        });
        if (res.ok) {
          const updatedUser = await res.json();
          localStorage.setItem("userProfile", JSON.stringify(updatedUser));
        } else {
          console.error("Failed to save profile to database");
          localStorage.setItem("userProfile", JSON.stringify(mergedProfile));
        }
      } catch (error) {
        console.error("Error saving profile:", error);
        localStorage.setItem("userProfile", JSON.stringify(mergedProfile));
      }
    } else {
      localStorage.setItem("userProfile", JSON.stringify(mergedProfile));
    }
    
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

        {/* Profile Photo */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative group">
            <div 
              className="w-24 h-24 rounded-full border-2 border-primary/50 overflow-hidden bg-white/5 flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => setShowPhotoOptions(!showPhotoOptions)}
              data-testid="button-profile-photo"
            >
              {profile.profilePic ? (
                <img src={profile.profilePic} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-12 h-12 text-muted-foreground" />
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Camera className="w-6 h-6 text-white" />
              </div>
            </div>
            
            <AnimatePresence>
              {showPhotoOptions && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-48 bg-card border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={handleCameraClick}
                    className="w-full px-4 py-3 text-left text-xs font-display font-bold uppercase tracking-widest flex items-center gap-3 hover:bg-white/5 transition-colors border-b border-white/5"
                    data-testid="button-take-photo"
                  >
                    <Camera className="w-4 h-4 text-primary" /> Take Photo
                  </button>
                  <button
                    type="button"
                    onClick={handleUploadClick}
                    className="w-full px-4 py-3 text-left text-xs font-display font-bold uppercase tracking-widest flex items-center gap-3 hover:bg-white/5 transition-colors"
                    data-testid="button-upload-photo"
                  >
                    <Upload className="w-4 h-4 text-primary" /> From Gallery
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileChange}
            />
            <input 
              type="file" 
              ref={cameraInputRef} 
              className="hidden" 
              accept="image/*" 
              capture="user"
              onChange={handleFileChange}
            />
          </div>
          <button 
            type="button"
            onClick={() => setShowPhotoOptions(!showPhotoOptions)}
            className="mt-3 text-xs font-display font-bold text-primary uppercase tracking-widest flex items-center gap-2 hover:opacity-80"
          >
            Add Profile Photo
          </button>
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

          {/* Height and Weight */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Height (cm)
              </label>
              <input
                type="number"
                placeholder="Height"
                value={profile.height}
                onChange={(e) => handleChange("height", e.target.value)}
                className="w-full px-3 py-2 bg-card border border-white/10 rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
                data-testid="input-height"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Weight (kg)
              </label>
              <input
                type="number"
                placeholder="Weight"
                value={profile.weight}
                onChange={(e) => handleChange("weight", e.target.value)}
                className="w-full px-3 py-2 bg-card border border-white/10 rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
                data-testid="input-weight"
              />
            </div>
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
