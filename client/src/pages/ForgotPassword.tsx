import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { ArrowLeft, Mail, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        const data = await res.json();
        toast.error(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
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
          onClick={() => setLocation("/login")}
          className="mb-8 text-muted-foreground hover:text-primary gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to login
        </Button>

        <Card className="border-white/10 bg-card/50 backdrop-blur-xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl font-display font-bold uppercase tracking-tight">Forgot Password</CardTitle>
            <CardDescription>
              {sent ? "Check your inbox" : "Enter your email and we'll send you a reset link"}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 pb-8 px-8">
            {sent ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4 py-6 text-center"
              >
                <CheckCircle className="w-16 h-16 text-primary" />
                <div>
                  <p className="font-semibold text-foreground">Email sent!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    We've sent a reset link to <span className="text-primary font-medium">{email}</span>.
                    Check your spam folder if you don't see it within a few minutes.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="mt-2 border-white/10 hover:bg-white/5"
                  onClick={() => setLocation("/login")}
                >
                  Back to login
                </Button>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5 mt-2">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="name@example.com"
                      className="pl-10 bg-background/50 border-white/10"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      data-testid="input-reset-email"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-12 bg-primary text-background hover:bg-primary/90 font-bold uppercase tracking-widest"
                  disabled={loading}
                  data-testid="button-send-reset"
                >
                  {loading ? "Sending..." : "Send Reset Link"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
