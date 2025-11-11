import { useEffect, useState } from "react";
import {
  FileText,
  Upload,
  Loader2,
  Clock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import UploadForm from "./UploadForm";

interface SidebarProps {
  onSelectForm: (formId: string) => void;
  onUploadComplete: (formId: string) => void;
  refreshTrigger?: number;
  selectedFormId: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface Form {
  id: string;
  file_name: string;
  upload_date: string;
  has_issue?: boolean;
  is_completed?: boolean;
}


const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001/api";

const Sidebar: React.FC<SidebarProps> = ({
  onSelectForm,
  onUploadComplete,
  refreshTrigger,
  selectedFormId,
  collapsed = false,
  onToggleCollapse,
}) => {
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);

const [filter, setFilter] = useState<"all" | "completed" | "issues" | "in-progress">("all");


  // =========================================
  // ✅ Load forms from backend (with token)
  // =========================================
  const loadForms = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        console.warn("⚠️ No token found — user not logged in");
        setForms([]);
        return;
      }

      const res = await fetch(`${API_BASE}/forms`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // ✅ include JWT
        },
      });

      if (res.status === 401) {
        console.warn("⚠️ Unauthorized — clearing token");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.reload();
        return;
      }

      if (!res.ok) throw new Error(`Failed to load forms (${res.status})`);

      const data = await res.json();
      setForms(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("❌ Error loading forms:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
  loadForms();

  // ✅ Listen for refresh events triggered from DataPanel
  const listener = () => loadForms();
  window.addEventListener("refreshForms", listener);
  return () => window.removeEventListener("refreshForms", listener);
}, [refreshTrigger]);

  // =========================================
  // Date formatting helper
  // =========================================
  const formatDateTime = (date: string) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleString("en-ZA", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // =========================================
// Filtered list based on backend flags
// =========================================
const filteredForms = forms.filter((f) => {
  if (filter === "completed") return f.is_completed && !f.has_issue;
  if (filter === "issues") return f.has_issue;
  if (filter === "in-progress") return !f.is_completed && !f.has_issue;
  return true;
});


  // =========================================
  // Render
  // =========================================
  return (
    <div
      className={`bg-white border-r border-gray-200 flex flex-col transition-all duration-300 relative ${
        collapsed ? "w-16" : "w-80"
      }`}
    >
      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="absolute -right-3 top-4 bg-white border border-gray-200 rounded-full p-1 hover:bg-gray-100 transition-all z-10 shadow-sm"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-gray-600" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        )}
      </button>

      {/* Expanded view */}
      {!collapsed && (
        <>
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-900 mb-3">
              Recent Files
            </h2>
            <UploadForm apiBase={API_BASE} onUploadComplete={onUploadComplete} />
          </div>

            {/* === Filter bar (clean vertical layout, reordered) === */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div className="flex flex-col">
                {[
                  ["all", "All"],
                  ["in-progress", "In Progress 🕓"],
                  ["issues", "Needs Review ⚠️"],
                  ["completed", "Completed ✅"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key as any)}
                    className={`w-full text-xs px-3 py-2 text-left font-medium transition-all border-0 border-b border-gray-200 last:border-b-0
                      ${
                        filter === key
                          ? "bg-[#E6F5F4] text-[#008A80] font-semibold"
                          : "bg-transparent text-gray-700 hover:bg-gray-100"
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>





          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : forms.length === 0 ? (
              <div className="text-center py-12 px-4">
                <Upload className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No files yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Upload your first document
                </p>
              </div>
            ) : (
              <div>
                {/* === Filtered and flagged list === */}
                {filteredForms.map((form) => (
                  <button
                    key={form.id}
                    onClick={() => onSelectForm(form.id)}
                    className={`w-full p-4 border-b border-gray-100 hover:bg-gray-50 transition-all text-left ${
                      selectedFormId === form.id
                        ? "bg-[#E6F5F4] border-l-4 border-l-[#008A80]"
                        : ""
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div
                        className={`p-2 rounded-lg ${
                          selectedFormId === form.id
                            ? "bg-[#D2F0EE]"
                            : "bg-gray-100"
                        }`}
                      >
                        <FileText
                          className={`w-4 h-4 ${
                            selectedFormId === form.id
                              ? "text-[#008A80]"
                              : "text-gray-600"
                          }`}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {form.file_name}
                        </p>
                        <div className="flex items-center space-x-2 mt-1">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span className="text-xs text-gray-500">
                            {formatDateTime(form.upload_date)}
                          </span>
                        </div>

                        {/* === Status badges === */}
                        {form.has_issue && (
                          <div className="text-[11px] text-amber-700 mt-1">
                            ⚠️ Needs review
                          </div>
                        )}
                        {form.is_completed && !form.has_issue && (
                          <div className="text-[11px] text-green-700 mt-1">
                            ✅ Completed
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

        </>
      )}

      {/* Collapsed view */}
      {collapsed && (
        <div className="flex flex-col items-center py-4 space-y-4">
          <UploadForm apiBase={API_BASE} onUploadComplete={onUploadComplete} />
          {!loading && forms.length > 0 && (
            <div className="flex flex-col space-y-2 w-full px-2">
              {forms.slice(0, 5).map((form) => (
                <button
                  key={form.id}
                  onClick={() => onSelectForm(form.id)}
                  className={`p-2 rounded-lg transition-all ${
                    selectedFormId === form.id
                      ? "bg-[#D2F0EE]"
                      : "bg-gray-100 hover:bg-gray-200"
                  }`}
                  title={form.file_name}
                >
                  <FileText
                    className={`w-5 h-5 ${
                      selectedFormId === form.id
                        ? "text-[#008A80]"
                        : "text-gray-600"
                    }`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Sidebar;
