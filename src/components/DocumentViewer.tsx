import { useState, useEffect } from "react";
import { ZoomIn, ZoomOut, RotateCw, Maximize2, Loader2 } from "lucide-react";

interface DocumentViewerProps {
  apiBase: string;
  formId: string | null;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ apiBase, formId }) => {
  const [form, setForm] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (formId) loadForm();
    else setForm(null);
  }, [formId]);

  // ✅ Load form details with token authentication
  const loadForm = async () => {
    if (!formId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        console.warn("⚠️ No token found — user may not be logged in");
        setForm(null);
        return;
      }

      const res = await fetch(`${apiBase}/forms/${formId}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // ✅ required
        },
      });

      if (res.status === 401) {
        console.warn("⚠️ Unauthorized — clearing token and reloading");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.reload();
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch form");
      setForm(data.form);
    } catch (err) {
      console.error("Error loading form:", err);
      setForm(null);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Build correct proxy URL using full blob name from file_url
  const getProxyUrl = (form: any): string | null => {
    if (!form) return null;

    const fullUrl = form.file_url;
    if (fullUrl && fullUrl.includes("/pdf-uploads/")) {
      try {
        const afterContainer = fullUrl.split("/pdf-uploads/")[1];
        const blobName = decodeURIComponent(afterContainer.split("?")[0]);
        return `${apiBase}/files/pdf-uploads/${blobName}`;
      } catch (err) {
        console.error("⚠️ Could not extract blob name:", err);
      }
    }

    if (form.file_name) {
      return `${apiBase}/files/pdf-uploads/${form.file_name}`;
    }

    return null;
  };

  // ---- Empty / loading states ----
  if (!formId) {
    return (
      <div className="flex-1 bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Maximize2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Select a document to view</p>
          <p className="text-sm text-gray-400 mt-1">
            Choose a file from the sidebar
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 bg-gray-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#008A80] animate-spin" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex-1 bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500">Document not found</p>
      </div>
    );
  }

  // ✅ Compute proxy URL (not Azure SAS URL)
  const fileUrl = getProxyUrl(form);

  // ---- Render viewer ----
  return (
    <div className="flex-1 bg-gray-100 flex flex-col">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Document Viewer</h3>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setZoom(Math.max(25, zoom - 25))}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[60px] text-center">
            {zoom}%
          </span>
          <button
            onClick={() => setZoom(Math.min(200, zoom + 25))}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-gray-300 mx-2" />
          <button
            onClick={() => setRotation((rotation + 90) % 360)}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
            title="Rotate"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setZoom(100);
              setRotation(0);
            }}
            className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-all font-medium"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Viewer area */}
      <div className="flex-1 overflow-auto p-6">
        <div
          className="inline-block min-w-full"
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: "top left",
          }}
        >
          {fileUrl ? (
            form.file_type === "application/pdf" ? (
              <div
                style={{
                  width: `${100 / (zoom / 100)}%`,
                  transform: `rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                }}
              >
                <iframe
                  src={fileUrl}
                  className="rounded-lg shadow-xl w-full min-h-[800px]"
                  title="PDF Viewer"
                />
              </div>
            ) : (
              <img
                src={fileUrl}
                alt={form.file_name || "Form image"}
                className="rounded-lg shadow-xl max-w-full"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                }}
              />
            )
          ) : (
            <div className="text-gray-400 text-center">
              <p>No preview available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentViewer;
