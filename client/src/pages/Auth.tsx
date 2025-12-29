import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { ArrowLeft, Mail, Lock, UserPlus, LogIn } from "lucide-react";
import { toast } from "sonner";

export default function Auth() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Mock login logic
    setTimeout(() => {
      const userProfile = localStorage.getItem("userProfile");
      if (userProfile) {
        toast.success("Welcome back!");
        setLocation("/");
      } else {
        toast.error("Account not found. Please create one.");
        setLoading(false);
      }
    }, 1000);
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Mock account creation
    setTimeout(() => {
      toast.success("Account created! Let's set up your profile.");
      setLocation("/setup");
    }, 1000);
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
              <CardTitle className="text-3xl font-display font-bold uppercase tracking-tight">AI Runner Coach</CardTitle>
              <CardDescription>Experience the future of personal training</CardDescription>
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
                      <Input id="email" type="email" placeholder="name@example.com" className="pl-10 bg-background/50 border-white/10" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="password" type="password" className="pl-10 bg-background/50 border-white/10" required />
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
              <form onSubmit={handleCreateAccount}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="new-email" type="email" placeholder="name@example.com" className="pl-10 bg-background/50 border-white/10" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="new-password" type="password" className="pl-10 bg-background/50 border-white/10" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="confirm-password" type="password" className="pl-10 bg-background/50 border-white/10" required />
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full h-12 bg-primary text-background hover:bg-primary/90 font-bold uppercase tracking-widest" disabled={loading}>
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
