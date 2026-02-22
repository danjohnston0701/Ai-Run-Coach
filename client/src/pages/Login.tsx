import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { ArrowLeft, Mail, Lock, UserPlus, LogIn, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { loadCoachSettingsFromProfile } from "@/lib/coachSettings";
import { migrateLocalDataToDatabase } from "@/lib/dataMigration";

export default function Auth() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      if (res.ok) {
        const user = await res.json();
        localStorage.setItem("userProfile", JSON.stringify(user));
        const migrationResult = await migrateLocalDataToDatabase(user.id);
        if (migrationResult.runs > 0) {
          toast.success(`Synced ${migrationResult.runs} run${migrationResult.runs > 1 ? 's' : ''} to your account!`);
        }
        await loadCoachSettingsFromProfile();
        toast.success("Welcome back!");
        window.location.href = "/";
      } else {
        const data = await res.json();
        toast.error(data.error || "Invalid credentials. Please try again.");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Login failed: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (signupPassword !== signupConfirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    
    console.log("Signup form submitted", { signupName, signupEmail });
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: signupName, 
          email: signupEmail, 
          password: signupPassword 
        }),
      });
      console.log("Registration response status:", res.status);
      if (res.ok) {
        const user = await res.json();
        console.log("User created:", user);
        localStorage.setItem("userProfile", JSON.stringify(user));
        toast.success("Account created! Let's set up your profile.");
        window.location.href = "/setup";
      } else {
        const data = await res.json();
        console.error("Registration error:", data);
        toast.error(data.error || "Registration failed. Please try again.");
      }
    } catch (error) {
      console.error("Registration exception:", error);
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Registration failed: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-primary/20 blur-[120px] rounded-full" />
      <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-primary/10 blur-[120px] rounded-full" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/")}
          className="mb-8 text-muted-foreground hover:text-primary gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Button>

        <Card className="border-white/10 bg-card/50 backdrop-blur-xl">
          <Tabs defaultValue="login" className="w-full">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-display font-bold uppercase tracking-tight">AI Run Coach</CardTitle>
              <CardDescription>Join the future of personal training</CardDescription>
              <TabsList className="grid w-full grid-cols-2 mt-6 bg-background/50 border border-white/5">
                <TabsTrigger value="login" className="data-[state=active]:bg-primary data-[state=active]:text-background uppercase text-[10px] font-bold tracking-widest">Login</TabsTrigger>
                <TabsTrigger value="signup" className="data-[state=active]:bg-primary data-[state=active]:text-background uppercase text-[10px] font-bold tracking-widest">Sign Up</TabsTrigger>
              </TabsList>
            </CardHeader>

            <TabsContent value="login">
              <form onSubmit={handleLogin}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input 
                        id="email" 
                        type="email" 
                        placeholder="name@example.com" 
                        className="pl-10 bg-background/50 border-white/10" 
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input 
                        id="password" 
                        type={showLoginPassword ? "text" : "password"} 
                        className="pl-10 pr-10 bg-background/50 border-white/10" 
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required 
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        data-testid="toggle-login-password"
                      >
                        {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full h-12 bg-primary text-background hover:bg-primary/90 font-bold uppercase tracking-widest" disabled={loading}>
                    {loading ? "Logging in..." : "Login"}
                    {!loading && <LogIn className="ml-2 w-4 h-4" />}
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-name">Full Name</Label>
                    <div className="relative">
                      <Input 
                        id="new-name" 
                        placeholder="John Doe" 
                        className="bg-background/50 border-white/10" 
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        required 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input 
                        id="new-email" 
                        type="email" 
                        placeholder="name@example.com" 
                        className="pl-10 bg-background/50 border-white/10" 
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        required 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input 
                        id="new-password" 
                        type={showSignupPassword ? "text" : "password"} 
                        placeholder="Create a password"
                        className="pl-10 pr-10 bg-background/50 border-white/10" 
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        required 
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupPassword(!showSignupPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        data-testid="toggle-signup-password"
                      >
                        {showSignupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input 
                        id="confirm-password" 
                        type={showConfirmPassword ? "text" : "password"} 
                        placeholder="Confirm your password"
                        className="pl-10 pr-10 bg-background/50 border-white/10" 
                        value={signupConfirmPassword}
                        onChange={(e) => setSignupConfirmPassword(e.target.value)}
                        required 
                        minLength={6}
                        data-testid="input-confirm-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        data-testid="toggle-confirm-password"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-primary text-background hover:bg-primary/90 font-bold uppercase tracking-widest" 
                    disabled={loading}
                    data-testid="button-create-account"
                  >
                    {loading ? "Creating Account..." : "Create Account"}
                    {!loading && <UserPlus className="ml-2 w-4 h-4" />}
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </motion.div>
    </div>
  );
}
