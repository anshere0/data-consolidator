"use client";

import React, { useState } from "react";
import { useAuth, useToast } from "@/components/Providers";
import { request } from "@/utils/api";
import { Database, Key, User } from "lucide-react";

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      showToast("Please fill in all fields", "warning");
      return;
    }

    if (isRegister && password !== confirmPassword) {
      showToast("Passwords do not match", "warning");
      return;
    }

    setSubmitting(true);
    try {
      if (isRegister) {
        // Register API call
        await request("POST", "/auth/register", { username, password });
        showToast("Registration successful! Please login.", "success");
        setIsRegister(false);
        setPassword("");
        setConfirmPassword("");
      } else {
        // Login API call (OAuth2 requires form-urlencoded data, which is parsed by Request)
        const params = new URLSearchParams();
        params.append("username", username);
        params.append("password", password);

        const res = await request("POST", "/auth/login", params, true);
        login(res.access_token, res.user);
      }
    } catch (err: any) {
      showToast(err.message || "Authentication failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh] z-10 relative">
      <div className="w-full max-w-md p-8 rounded-2xl glass-panel shadow-2xl relative border border-slate-800">
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-indigo-600/20 rounded-xl mb-3 border border-indigo-500/20">
            <Database className="h-8 w-8 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">
            {isRegister ? "Create Admin Account" : "Access Console"}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isRegister
              ? "Set up database owner credentials"
              : "Sign in to consolidate files and generate spreadsheets"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Username
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                placeholder="Enter username"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                placeholder="Enter password"
                required
              />
            </div>
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                  placeholder="Confirm password"
                  required
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-slate-100 font-semibold rounded-xl transition cursor-pointer shadow-lg shadow-indigo-500/20 disabled:opacity-50"
          >
            {submitting ? "Processing..." : isRegister ? "Sign Up" : "Log In"}
          </button>
        </form>

        <div className="mt-8 text-center text-sm">
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setUsername("");
              setPassword("");
              setConfirmPassword("");
            }}
            className="text-indigo-400 hover:text-indigo-300 font-medium transition"
          >
            {isRegister ? "Already registered? Login" : "First time? Create account"}
          </button>
        </div>
      </div>
    </div>
  );
}
