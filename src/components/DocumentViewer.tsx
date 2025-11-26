import { useState, useEffect } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Loader2,
} from "lucide-react";
import PdfCanvasViewer from "./PdfCanvasViewer";
import { useRef } from "react";


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

  const viewerRef = useRef<HTMLDivElement>(null);
const [isDragging, setIsDragging] = useState(false);
const [startPos, setStartPos] = useState({ x: 0, y: 0 });
const [scrollStart, setScrollStart] = useState({ left: 0, top: 0 });

const handleMouseDown = (e: React.MouseEvent) => {
  const viewer = viewerRef.current;
  if (!viewer) return;

  setIsDragging(true);
  setStartPos({ x: e.clientX, y: e.clientY });
  setScrollStart({ left: viewer.scrollLeft, top: viewer.scrollTop });

  viewer.style.cursor = "grabbing";

  // Capture mouse movement globally
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging) return;

  const viewer = viewerRef.current;
  if (!viewer) return;

  const dx = e.clientX - startPos.x;
  const dy = e.clientY - startPos.y;

  viewer.scrollLeft = scrollStart.left - dx;
  viewer.scrollTop = scrollStart.top - dy;
};

const handleMouseUp = () => {
  setIsDragging(false);
  const viewer = viewerRef.current;
  if (viewer) viewer.style.cursor = "grab";

  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("mouseup", handleMouseUp);
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
        <h3 className="text-sm font-semibold">Original Form</h3>

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
      <div
        ref={viewerRef}
        className="flex-1 overflow-auto p-6 cursor-grab"
        onMouseDown={handleMouseDown}
      >
        <PdfCanvasViewer url={fileUrl} zoom={zoom} rotation={rotation} />
      </div>

    </div>
  );
};

export default DocumentViewer;
