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
    <header className="bg-white border-b border-[#B3E0DC] flex-shrink-0">
  <div className="grid grid-cols-[20rem_1fr_auto] items-center px-8 py-6">
    {/* Left: Ubomi Buhle logo */}
    <div className="flex justify-center">
      <img
        src="/Ubomi-Buhle.png"
        alt="Ubomi Buhle"
        className="h-24 w-auto object-contain"
      />
    </div>

    {/* Center: App title (now left-aligned within middle column) */}
    <div className="flex justify-start">
      <p className="text-4xl font-semibold text-[#008A80] tracking-wide">
        Maternity Case Record
      </p>
    </div>

    {/* Right: User info + logout */}
    <div className="flex items-center space-x-3 justify-end">
      <div className="flex items-center space-x-2 px-3 py-2 bg-[#E6F5F4] rounded-lg border border-[#B3E0DC]">
        <UserIcon className="w-4 h-4 text-[#008A80]" />
        <span className="text-sm text-[#008A80]">
          {user?.username || "Unknown User"}
        </span>
      </div>
      <button
        className="p-2 text-[#008A80] hover:bg-[#E6F5F4] rounded-lg transition-all"
        title="Sign Out"
        onClick={handleLogout}
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  </div>
</header>



   {/* BODY */}
<div className="flex-1 flex overflow-y-hidden overflow-x-auto">

  <Sidebar
    apiBase={API_BASE}
    onSelectForm={handleSelectForm}
    onUploadComplete={handleUploadComplete}
    selectedFormId={selectedFormId}
    refreshTrigger={refreshTrigger}
    collapsed={sidebarCollapsed}
    onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
  />

  <div className="flex-[0.75] min-w-[750px]">
    <DocumentViewer apiBase={API_BASE} formId={selectedFormId} />
  </div>

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
