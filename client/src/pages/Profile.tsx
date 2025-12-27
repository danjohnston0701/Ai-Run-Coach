import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, Save, User, Camera, Upload, UserPlus, X, Users } from "lucide-react";

const FITNESS_LEVELS = ["Unfit", "Casual", "Athletic", "Very Fit", "Elite"];

export interface Friend {
  name: string;
  email?: string;
}

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
  friends?: Friend[];
}

export default function Profile() {
  const [, setLocation] = useLocation();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Mock users database for search
  const mockUsersDatabase = [
    { name: "Sarah Jenkins", email: "sarah.j@example.com" },
    { name: "Mike Ross", email: "m.ross@law.com" },
    { name: "Jessica Pearson", email: "jessica@pearsonhardman.com" },
    { name: "Harvey Specter", email: "harvey@win.com" },
    { name: "Donna Paulsen", email: "donna@knowsall.com" },
    { name: "Alex Williams", email: "alex.w@runner.com" },
    { name: "Rachel Zane", email: "rachel@fitness.com" },
  ];

  const searchResults = friendSearchQuery.length > 1 
    ? mockUsersDatabase.filter(user => 
        user.name.toLowerCase().includes(friendSearchQuery.toLowerCase()) || 
        user.email.toLowerCase().includes(friendSearchQuery.toLowerCase())
      ).filter(user => !profile?.friends?.some(f => f.email === user.email))
    : [];

  useEffect(() => {
    const savedProfile = localStorage.getItem("userProfile");
    if (savedProfile) {
      const parsed = JSON.parse(savedProfile);
      if (!parsed.friends) {
        parsed.friends = [];
      }
      setProfile(parsed);
    } else {
      setLocation("/");
    }
  }, [setLocation]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
    setShowPhotoOptions(false);
  };

  const handleCameraClick = () => {
    cameraInputRef.current?.click();
    setShowPhotoOptions(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleChange("profilePic", reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleChange = (field: keyof ProfileData, value: string) => {
    if (!profile) return;
    setProfile(prev => ({ ...prev!, [field]: value }));
  };

  const handleAddFriendFromSearch = (user: { name: string, email: string }) => {
    if (!profile) return;
    
    const newFriend: Friend = {
      name: user.name,
      email: user.email
    };
    
    const updatedFriends = [...(profile.friends || []), newFriend];
    const updatedProfile = { ...profile, friends: updatedFriends };
    setProfile(updatedProfile);
    
    toast.success(`${user.name} added to your friends!`);
    setFriendSearchQuery("");
    setShowAddFriend(false);
  };

  const handleRemoveFriend = (index: number) => {
    if (!profile) return;
    const updatedFriends = profile.friends?.filter((_, i) => i !== index) || [];
    setProfile({ ...profile, friends: updatedFriends });
    toast.success("Friend removed");
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

  const handleLogout = () => {
    localStorage.removeItem("userProfile");
    toast.success("Logged out successfully");
    window.location.href = "/";
  };

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
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
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-2 uppercase tracking-widest text-[10px] font-bold"
        >
          Logout
        </Button>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md mx-auto w-full"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="relative group">
            <div 
              className="w-24 h-24 rounded-full border-2 border-primary/50 overflow-hidden bg-white/5 flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => setShowPhotoOptions(!showPhotoOptions)}
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
                  className="absolute top-full mt-2 w-48 bg-card border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={handleCameraClick}
                    className="w-full px-4 py-3 text-left text-xs font-display font-bold uppercase tracking-widest flex items-center gap-3 hover:bg-white/5 transition-colors border-b border-white/5"
                  >
                    <Camera className="w-4 h-4 text-primary" /> Take Photo
                  </button>
                  <button
                    type="button"
                    onClick={handleUploadClick}
                    className="w-full px-4 py-3 text-left text-xs font-display font-bold uppercase tracking-widest flex items-center gap-3 hover:bg-white/5 transition-colors"
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
            Update Profile Photo
          </button>
        </div>

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

          <div className="space-y-4 bg-card/50 p-6 rounded-2xl border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-display font-bold uppercase tracking-wide">Friends</h2>
              </div>
              <Button
                type="button"
                onClick={() => setShowAddFriend(true)}
                className="h-8 px-3 bg-primary/20 hover:bg-primary/30 text-primary text-xs font-bold uppercase flex items-center gap-2"
              >
                <UserPlus className="w-3 h-3" /> Add
              </Button>
            </div>

            {profile.friends && profile.friends.length > 0 ? (
              <div className="space-y-2">
                {profile.friends.map((friend, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                    <div>
                      <p className="text-sm font-medium text-foreground">{friend.name}</p>
                      {friend.email && <p className="text-[10px] text-muted-foreground">{friend.email}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFriend(idx)}
                      className="p-1 hover:bg-white/10 rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-muted-foreground hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No friends yet. Add some to easily share runs!</p>
            )}

            <AnimatePresence>
              {showAddFriend && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-4 p-4 bg-white/5 rounded-xl border border-white/10 space-y-4"
                >
                  <div className="relative">
                    <input
                      type="text"
                      value={friendSearchQuery}
                      onChange={(e) => setFriendSearchQuery(e.target.value)}
                      placeholder="Search name or email..."
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {searchResults.length > 0 ? (
                      searchResults.map((user, idx) => (
                        <div 
                          key={idx}
                          onClick={() => handleAddFriendFromSearch(user)}
                          className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5 hover:border-primary/30 hover:bg-white/10 transition-all cursor-pointer group"
                        >
                          <div>
                            <p className="text-xs font-medium text-foreground">{user.name}</p>
                            <p className="text-[10px] text-muted-foreground">{user.email}</p>
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] opacity-0 group-hover:opacity-100">
                            Add
                          </Button>
                        </div>
                      ))
                    ) : friendSearchQuery.length > 1 ? (
                      <p className="text-[10px] text-center text-muted-foreground py-2 italic">No matching runners found</p>
                    ) : (
                      <p className="text-[10px] text-center text-muted-foreground py-2 italic">Start typing to search...</p>
                    )}
                  </div>

                  <Button
                    type="button"
                    onClick={() => {
                      setShowAddFriend(false);
                      setFriendSearchQuery("");
                    }}
                    variant="outline"
                    className="w-full border-white/10 text-[10px] h-8 font-bold uppercase tracking-widest"
                  >
                    Cancel
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
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
