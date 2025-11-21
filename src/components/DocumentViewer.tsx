import { useState, useEffect } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Loader2,
} from "lucide-react";

interface DocumentViewerProps {
  apiBase: string;
  formId: string | null;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ apiBase, formId }) => {
  const [form, setForm] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (formId) loadForm();
    else setForm(null);
  }, [formId]);

  const loadForm = async () => {
    if (!formId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${apiBase}/forms/${formId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm(data.form);
    } catch (err) {
      console.error("Error loading form:", err);
      setForm(null);
    } finally {
      setLoading(false);
    }
  };

  const getProxyUrl = (form: any): string | null => {
    if (!form) return null;

    const fullUrl = form.file_url;
    if (fullUrl && fullUrl.includes("/pdf-uploads/")) {
      const blob = decodeURIComponent(fullUrl.split("/pdf-uploads/")[1].split("?")[0]);
      return `${apiBase}/files/pdf-uploads/${blob}`;
    }

    return null;
  };

  const fileUrl = form ? getProxyUrl(form) : null;

  if (!formId) {
    return (
      <div className="flex-1 bg-gray-100 flex items-center justify-center">
        <Maximize2 className="w-16 h-16 text-gray-300 mb-4" />
        <p className="text-gray-500">Select a document to view</p>
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

  if (!fileUrl) {
    return (
      <div className="flex-1 bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500">Document not found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-100 flex flex-col">

      {/* Toolbar */}
      <div className="bg-white border-b px-4 py-3 flex justify-between items-center">
        <h3 className="text-sm font-semibold">Document Viewer</h3>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            className="p-2 hover:bg-gray-100 rounded"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="text-sm min-w-[50px] text-center">
            {Math.round(zoom * 100)}%
          </span>

          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            className="p-2 hover:bg-gray-100 rounded"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-gray-300 mx-2" />

          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-2 hover:bg-gray-100 rounded"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setZoom(1);
              setRotation(0);
            }}
            className="px-3 py-2 text-sm hover:bg-gray-100 rounded"
          >
            Reset
          </button>
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 overflow-auto p-6">
        <div
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: "top left",
          }}
        >
          <iframe
          src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=0`}
          className="w-full h-[1200px] border rounded shadow"
          title="PDF Viewer"
        />
        </div>
      </div>
    </div>
  );
};

export default DocumentViewer;
