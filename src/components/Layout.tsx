import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Calendar, CheckSquare, LogOut, User, Menu, GraduationCap, FileText, ClipboardList, X, BrainCircuit, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { motion } from "framer-motion";
import { SPRING } from "@/lib/motion";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");

  const navItems = [
    { path: "/", label: "Today", icon: Calendar, exact: true },
    { path: "/planner", label: "Planner", icon: CalendarRange },
    { path: "/assignments", label: "Assignments", icon: CheckSquare },
    { path: "/readings", label: "Readings", icon: FileText },
    { path: "/study", label: "Study", icon: BrainCircuit },
    { path: "/exams", label: "Exams", icon: ClipboardList },
    { path: "/courses", label: "Courses", icon: GraduationCap },
    { path: "/profile", label: "Profile", icon: User },
  ];

  const checkActive = (item: typeof navItems[0]) => {
    if (item.exact) return location.pathname === item.path;
    return isActive(item.path);
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-card/95 sticky top-0 z-50 border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link
              to="/"
              className="text-xl font-semibold tracking-tight text-foreground hover:text-primary transition-colors shrink-0"
            >
              Syllabase
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = checkActive(item);
                return (
                  <Link key={item.path} to={item.path}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "relative flex items-center gap-2 px-4 h-10 rounded-lg transition-colors duration-200 hover:bg-transparent",
                        active
                          ? "text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden lg:inline">{item.label}</span>

                      {/* Active indicator */}
                      {active && (
                        <motion.div
                          layoutId="nav-indicator"
                          className="absolute inset-x-3 -bottom-[1px] h-[2px] bg-primary -z-10"
                          transition={SPRING}
                        />
                      )}
                    </Button>
                  </Link>
                );
              })}
            </div>

            {/* Right side controls */}
            <div className="flex items-center gap-2">
              <ThemeToggle />
              
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={signOut} 
                className="hidden md:flex items-center gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200 rounded-xl"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden lg:inline">Sign Out</span>
              </Button>
              
              {/* Mobile menu trigger */}
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden h-10 w-10 rounded-xl">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="right"
                  className="w-[300px] bg-card border-l border-border p-0"
                >
                  <div className="p-6">
                    <SheetTitle className="text-xl font-semibold text-foreground mb-8">
                      Menu
                    </SheetTitle>
                    
                    <div className="flex flex-col gap-2">
                      {navItems.map((item) => {
                        const Icon = item.icon;
                        const active = checkActive(item);
                        return (
                          <Link 
                            key={item.path} 
                            to={item.path} 
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            <Button
                              variant="ghost"
                              className={cn(
                                "w-full justify-start gap-4 h-14 rounded-xl text-base transition-all duration-200",
                                active 
                                  ? "bg-primary/10 text-primary font-medium" 
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                              )}
                            >
                              <div className={cn(
                                "p-2 rounded-lg transition-colors",
                                active ? "bg-primary/20" : "bg-muted/50"
                              )}>
                                <Icon className="h-5 w-5" />
                              </div>
                              {item.label}
                            </Button>
                          </Link>
                        );
                      })}
                      
                      <div className="h-px bg-border/50 my-4" />
                      
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start gap-4 h-14 rounded-xl text-base text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                        onClick={() => {
                          signOut();
                          setMobileMenuOpen(false);
                        }}
                      >
                        <div className="p-2 rounded-lg bg-muted/50">
                          <LogOut className="h-5 w-5" />
                        </div>
                        Sign Out
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </nav>
      
      <main className="relative container mx-auto px-4 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
