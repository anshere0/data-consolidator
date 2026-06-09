"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { 
  Home, 
  UploadCloud, 
  Columns, 
  Copy, 
  LogOut, 
  Database,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info
} from "lucide-react";

// --- Toast Context ---
type ToastType = "success" | "warning" | "error" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

// --- Auth Context ---
interface User {
  id: number;
  username: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

// --- Providers Component ---
export default function Providers({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const showToast = (message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const login = (token: string, userData: User) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
    showToast(`Welcome back, ${userData.username}!`, "success");
    router.push("/");
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    showToast("Logged out successfully.", "info");
    router.push("/login");
  };

  // Auth Guard check
  useEffect(() => {
    const token = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!loading) {
      const token = localStorage.getItem("token");
      if (!token && pathname !== "/login") {
        router.push("/login");
      } else if (token && pathname === "/login") {
        router.push("/");
      }
    }
  }, [pathname, loading, router]);

  const isLoginPage = pathname === "/login";

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      <ToastContext.Provider value={{ showToast }}>
        <div className="min-h-screen relative flex overflow-hidden">
          {/* Animated Background Glowing Effects */}
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full radial-glow-violet pointer-events-none z-0" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full radial-glow-indigo pointer-events-none z-0" />

          {/* Sidebar Navigation */}
          {!isLoginPage && user && (
            <aside className="w-64 glass-panel border-r border-slate-800 z-10 flex flex-col justify-between shrink-0">
              <div>
                {/* Brand Header */}
                <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
                  <Database className="h-6 w-6 text-indigo-400" />
                  <span className="font-semibold text-lg bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                    Master Mergify
                  </span>
                </div>

                {/* Nav Links */}
                <nav className="p-4 space-y-2">
                  <SidebarLink href="/" icon={<Home className="h-5 w-5" />} label="Dashboard" active={pathname === "/"} />
                  <SidebarLink href="/upload" icon={<UploadCloud className="h-5 w-5" />} label="Upload Center" active={pathname === "/upload"} />
                </nav>
              </div>

              {/* User Bar / Footer */}
              <div className="p-4 border-t border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">{user.username}</p>
                  <p className="text-xs text-indigo-400 capitalize">{user.role}</p>
                </div>
                <button
                  onClick={logout}
                  className="p-2 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-lg transition"
                  title="Logout"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            </aside>
          )}

          {/* Main Workspace */}
          <main className="flex-1 overflow-y-auto relative z-10 p-8 h-screen">
            {loading ? (
              <div className="flex items-center justify-center h-full text-slate-400">
                Loading workspace...
              </div>
            ) : (
              children
            )}
          </main>

          {/* Toast Notification Stack */}
          <div className="fixed bottom-6 right-6 z-50 flex flex-col space-y-3 max-w-md">
            {toasts.map((t) => (
              <div
                key={t.id}
                className="flex items-center space-x-3 p-4 rounded-xl glass-panel shadow-2xl border-slate-700 animate-slide-in duration-300"
              >
                {t.type === "success" && <CheckCircle className="h-5 w-5 text-emerald-400" />}
                {t.type === "warning" && <AlertTriangle className="h-5 w-5 text-amber-400" />}
                {t.type === "error" && <XCircle className="h-5 w-5 text-red-400" />}
                {t.type === "info" && <Info className="h-5 w-5 text-indigo-400" />}
                <span className="text-sm font-medium text-slate-200">{t.message}</span>
              </div>
            ))}
          </div>
        </div>
      </ToastContext.Provider>
    </AuthContext.Provider>
  );
}

// Helper navigation link
function SidebarLink({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition ${
        active 
          ? "bg-indigo-600/15 border-l-4 border-indigo-500 text-indigo-200 font-medium" 
          : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
