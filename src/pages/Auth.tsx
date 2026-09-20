import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import { EASE_OUT } from "@/lib/motion";

export default function Auth() {
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        // Bounded on purpose: this call gates whether the sign-in form
        // renders at all, so a slow or hung backend (seen in practice —
        // the request was accepted and the query ran, but no response
        // came back) must not leave the page on a permanent spinner.
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("instance-status check timed out")), 6000)
        );
        const { data, error } = await Promise.race([
          supabase.functions.invoke("instance-status"),
          timeout,
        ]);
        if (error) throw error;
        setIsFirstRun(!data?.hasAccounts);
      } catch (error) {
        // If the check itself fails or times out, default to the normal
        // sign-in / sign-up screen rather than blocking access entirely.
        console.error("Failed to check instance status:", error);
        setIsFirstRun(false);
      } finally {
        setCheckingSetup(false);
      }
    };
    checkSetup();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isFirstRun || !isLogin) {
        const { error } = await signUp(username, password);
        if (error) {
          if (error.message.includes("already registered") || error.message.includes("already been registered")) {
            toast.error("That username is taken. Try signing in instead.");
            setIsLogin(true);
          } else {
            toast.error(error.message);
          }
        } else if (isFirstRun) {
          toast.success("Account created! Welcome to Syllabase.");
        } else {
          toast.success("Account created!");
        }
      } else {
        const { error } = await signIn(username, password);
        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast.error("Invalid username or password.");
          } else {
            toast.error(error.message);
          }
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const showSignUpFields = isFirstRun || !isLogin;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="glass-strong rounded-3xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <motion.div
              className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary mb-4"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1, ease: EASE_OUT }}
            >
              <BookOpen className="h-8 w-8 text-primary-foreground" />
            </motion.div>
            <h1 className="text-2xl font-bold text-foreground">
              {isFirstRun ? "Welcome to Syllabase" : showSignUpFields ? "Create an account" : "Welcome back"}
            </h1>
            <p className="text-muted-foreground mt-1">
              {isFirstRun
                ? "Create the first account to set up this instance"
                : showSignUpFields
                ? "Start organizing your study schedule"
                : "Sign in to access your study planner"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="yourname"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 h-12 rounded-xl"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={showSignUpFields ? "new-password" : "current-password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 h-12 rounded-xl"
                required
                minLength={6}
              />
            </div>
            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-base font-medium"
              disabled={loading}
            >
              {loading
                ? showSignUpFields
                  ? "Creating account..."
                  : "Signing in..."
                : isFirstRun
                ? "Create account"
                : showSignUpFields
                ? "Sign Up"
                : "Sign In"}
            </Button>
          </form>

          {/* Toggle — hidden on first run, there's nothing to sign in to yet */}
          {!isFirstRun && (
            <div className="mt-6 text-center text-sm">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-primary hover:underline font-medium"
              >
                {isLogin ? "Sign up" : "Sign in"}
              </button>
            </div>
          )}
        </div>

        {/* App name */}
        <p className="text-center mt-6 text-sm text-muted-foreground">
          <span className="text-foreground font-semibold">Syllabase</span>
          {" "}• Your self-hosted study planner
        </p>
      </motion.div>
    </div>
  );
}
