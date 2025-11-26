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

  const tabs = [
    { key: "all", label: "All" },
    { key: "in-progress", label: "In Progress" },
    { key: "issues", label: "Needs Review" },
    { key: "completed", label: "Completed" },
  ];

  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "date">("date");

  // Load forms
  const loadForms = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setForms([]);
        return;
      }

      const res = await fetch(`${API_BASE}/forms`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.reload();
        return;
      }

      if (!res.ok) throw new Error("Failed to load");

      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setForms(list);

      // ✅ Auto-select first form if nothing is selected yet
      if (!selectedFormId && list.length > 0) {
        onSelectForm(list[0].id);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForms();
    const listener = () => loadForms();
    window.addEventListener("refreshForms", listener);
    return () => window.removeEventListener("refreshForms", listener);
  }, [refreshTrigger]);

  // Date formatting
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

  // ===============================================
  // ⭐ NEW: processedForms (filter + search + sort)
  // ===============================================
  let processedForms = forms.filter((f) => {
    if (activeTab === "completed") return f.is_completed && !f.has_issue;
    if (activeTab === "issues") return f.has_issue;
    if (activeTab === "in-progress")
      return !f.is_completed && !f.has_issue;
    return true;
  });

  // Search
  processedForms = processedForms.filter((f) => {
    const term = searchTerm.toLowerCase();
    return (
      f.file_name.toLowerCase().includes(term) ||
      f.id.toLowerCase().includes(term)
    );
  });

  // Sort
  if (sortBy === "name") {
    processedForms.sort((a, b) =>
      a.file_name.localeCompare(b.file_name)
    );
  } else {
    processedForms.sort(
      (a, b) =>
        new Date(b.upload_date).getTime() -
        new Date(a.upload_date).getTime()
    );
  }

  // ===============================================
  // RETURN
  // ===============================================
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
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-gray-600" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        )}
      </button>

      {/* Expanded mode */}
      {!collapsed && (
        <>
          {/* Upload only */}
          <div className="p-4 border-b border-gray-200">
            <UploadForm apiBase={API_BASE} onUploadComplete={onUploadComplete} />
          </div>


       {/* Tabs with separators (3 compact tabs) */}
        <div className="border-b border-gray-200 px-4 py-2 bg-white">
          <div className="flex items-center space-x-4">

            {[
              { key: "in-progress", label: "In Progress" },
              { key: "issues", label: "Needs Review" },
              { key: "completed", label: "Complete" },
            ].map((tab, idx, arr) => (
              <div key={tab.key} className="flex items-center">
                <button
                  onClick={() => setActiveTab(tab.key)}
                  className={`text-[11px] font-semibold pb-1 ${
                    activeTab === tab.key
                      ? "text-[#008A80] border-b-2 border-[#008A80]"
                      : "text-gray-700 hover:text-gray-900"
                  }`}
                >
                  {tab.label}
                </button>

                {/* Separator */}
                {idx < arr.length - 1 && (
                  <span className="text-gray-300 mx-2 select-none">|</span>
                )}
              </div>
            ))}

          </div>
        </div>




          {/* Search + sort */}
          <div className="px-4 py-3 border-b border-gray-200 bg-white">
            <input
              type="text"
              placeholder="Search files..."
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md mb-2"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* File list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : processedForms.length === 0 ? (
              <div className="text-center py-12 px-4">
                <Upload className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No files yet</p>
              </div>
            ) : (
              processedForms.map((form) => (
                <button
                  key={form.id}
                  onClick={() => onSelectForm(form.id)}
                  className={`w-full p-4 border-b border-gray-100 hover:bg-gray-50 text-left ${
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
              ))
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
                  className={`p-2 rounded-lg ${
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
