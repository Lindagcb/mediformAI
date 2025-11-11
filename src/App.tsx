import { useState, useEffect } from "react";
import { ClipboardList, LogOut, User as UserIcon } from "lucide-react";
import Sidebar from "./components/Sidebar";
import DocumentViewer from "./components/DocumentViewer";
import DataPanel from "./components/DataPanel";
import { Auth } from "./components/Auth"; // 👈 import your new Auth component

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001/api";

const App: React.FC = () => {
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{ username?: string } | null>(null);

  // ✅ Check if token exists on page load
  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (token && storedUser) {
      setIsAuthenticated(true);
      setUser(JSON.parse(storedUser));
    }
  }, []);

  // ✅ Logout
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setIsAuthenticated(false);
    setSelectedFormId(null);
  };

  // ✅ After successful login
  const handleAuthSuccess = () => {
    const userData = JSON.parse(localStorage.getItem("user") || "{}");
    setUser(userData);
    setIsAuthenticated(true);
  };

  // ✅ Upload + refresh handling
  const handleUploadComplete = (formId: string) => {
    setSelectedFormId(formId);
    setRefreshTrigger((p) => p + 1);
  };
  const handleSelectForm = (formId: string) => setSelectedFormId(formId);
  const handleFormDeleted = () => {
    setSelectedFormId(null);
    setRefreshTrigger((p) => p + 1);
  };

  // =====================================
  // RENDER
  // =====================================

  if (!isAuthenticated) {
    // 🔒 Show login screen if not logged in
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-purple-600 p-2 rounded-lg">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">MediformAI</h1>
              <p className="text-xs text-gray-500">
                AI-powered medical form extraction
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 px-3 py-2 bg-gray-100 rounded-lg">
              <UserIcon className="w-4 h-4 text-gray-600" />
              <span className="text-sm text-gray-700">
                {user?.username || "Unknown User"}
              </span>
            </div>
            <button
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
              title="Sign Out"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          apiBase={API_BASE}
          onSelectForm={handleSelectForm}
          onUploadComplete={handleUploadComplete}
          selectedFormId={selectedFormId}
          refreshTrigger={refreshTrigger}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <DocumentViewer apiBase={API_BASE} formId={selectedFormId} />
        <DataPanel
          apiBase={API_BASE}
          formId={selectedFormId}
          onFormDeleted={handleFormDeleted}
          onFormUpdated={() => setRefreshTrigger((p) => p + 1)}
        />
      </div>
    </div>
  );
};

export default App;
