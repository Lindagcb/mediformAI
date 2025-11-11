import { useState } from "react";
import { Loader2, Mail, Lock } from "lucide-react";

interface AuthProps {
  onAuthSuccess: () => void;
}

export function Auth({ onAuthSuccess }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001/api";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isLogin) {
        const res = await fetch(`${API_BASE}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Login failed");
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        onAuthSuccess();
      } else {
        const res = await fetch(`${API_BASE}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Registration failed");
        setMessage("Account created successfully! You can now log in.");
        setIsLogin(true);
        setPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
  <div className="min-h-screen bg-[#E6F5F4] flex items-center justify-center p-4">
    <div className="w-full max-w-md">
      <div className="bg-white rounded-2xl border border-[#B3E0DC] shadow-lg overflow-hidden">
        {/* Header with logo + heading */}
        <div className="bg-[#E6F5F4] px-8 py-8 border-b border-[#B3E0DC]">
          <div className="flex flex-col items-center justify-center text-center">
  <img
    src="/Ubomi-Buhle.png"
    alt="Ubomi Buhle Logo"
    className="h-24 w-auto object-contain mb-3"
  />
  <p className="text-2xl font-semibold text-[#008A80] tracking-wide leading-tight">
    Clinical Records AI Platform
  </p>
</div>

        </div>

          <div className="p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  Username
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="w-full pl-11 pr-4 py-3 border border-[#B3E0DC] rounded-lg focus:ring-2 focus:ring-[#008A80] focus:border-[#008A80] transition-all"
                    placeholder="Enter your username"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full pl-11 pr-4 py-3 border border-[#B3E0DC] rounded-lg focus:ring-2 focus:ring-[#008A80] focus:border-[#008A80] transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
              )}

              {message && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-green-800">{message}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#008A80] text-white py-3 rounded-lg font-semibold hover:bg-[#00776E] transition-all disabled:opacity-50 shadow-md flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    {isLogin ? "Signing in..." : "Creating account..."}
                  </>
                ) : isLogin ? (
                  "Sign In"
                ) : (
                  "Sign Up"
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError(null);
                  setMessage(null);
                }}
                className="text-[#008A80] hover:text-[#00776E] font-medium text-sm"
              >
                {isLogin
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Sign in"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
