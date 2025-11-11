import { useEffect, useState, useRef } from "react";
import {
  FileText,
  Upload,
  Loader2,
  Plus,
  Clock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

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
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Load forms from MediformAI backend ----
  const loadForms = async () => {
    try {
      const res = await fetch(`${API_BASE}/forms`);
      const data = await res.json();
      setForms(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error loading forms:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForms();
  }, [refreshTrigger]);

  // ---- Convert first page of PDF to image for OCR ----
  const convertPdfToImage = async (pdfBuffer: ArrayBuffer): Promise<string> => {
    const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL("image/png");
  };


// ---- Helper: Convert dataURL to Blob ----
function dataURLtoBlob(dataURL: string): Blob {
  const [header, base64] = dataURL.split(",");
  const mimeMatch = /data:(.*?);base64/.exec(header);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const binary = atob(base64);
  const len = binary.length;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = binary.charCodeAt(i);
  return new Blob([u8], { type: mime });
}



  // ---- Upload handler ----
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("File size must be less than 10 MB");
      return;
    }

    if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
      alert("Please upload a PDF or image file");
      return;
    }

    setUploading(true);
    setUploadProgress(file.name);

    try {
      let imageData: string;
      let contentType: string;

      if (file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer();
        imageData = await convertPdfToImage(arrayBuffer);
        contentType = "image/png";
      } else {
        const reader = new FileReader();
        imageData = await new Promise<string>((resolve, reject) => {
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
        contentType = file.type;
      }

      // ✅ Build a proper multipart/form-data request
        const blob = dataURLtoBlob(imageData);
        const formData = new FormData();

        const outName =
          file.type === "application/pdf"
            ? file.name.replace(/\.[Pp][Dd][Ff]$/, ".png")
            : file.name;

        const fileField = new File([blob], outName, { type: blob.type || contentType });
        formData.append("file", fileField);
        formData.append("original_filename", file.name);
        formData.append("source_type", file.type);

        const response = await fetch(`${API_BASE}/extract-form`, {
          method: "POST",
          body: formData, // Browser sets headers automatically
        });


      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed");

      onUploadComplete(result.form_id);
      loadForms();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to process file");
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ---- Time formatting helper ----
  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const d = new Date(date);
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    return `${days}d ago`;
  };

  // ---- Render ----
  return (
    <div
      className={`bg-white border-r border-gray-200 flex flex-col transition-all duration-300 relative ${
        collapsed ? "w-16" : "w-80"
      }`}
    >
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

      {!collapsed && (
        <>
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Recent Files</h2>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,image/*"
              onChange={handleFileSelect}
              disabled={uploading}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full bg-purple-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-purple-700 transition-all disabled:opacity-50 flex items-center justify-center text-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Upload
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {uploading && (
              <div className="p-4 border-b border-gray-200 bg-purple-50">
                <div className="flex items-start space-x-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <FileText className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {uploadProgress}
                    </p>
                    <div className="flex items-center space-x-2 mt-1">
                      <Loader2 className="w-3 h-3 text-purple-600 animate-spin" />
                      <span className="text-xs text-purple-600">Processing...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
                {forms.map((form) => (
                  <button
                    key={form.id}
                    onClick={() => onSelectForm(form.id)}
                    className={`w-full p-4 border-b border-gray-100 hover:bg-gray-50 transition-all text-left ${
                      selectedFormId === form.id
                        ? "bg-purple-50 border-l-4 border-l-purple-600"
                        : ""
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div
                        className={`p-2 rounded-lg ${
                          selectedFormId === form.id
                            ? "bg-purple-100"
                            : "bg-gray-100"
                        }`}
                      >
                        <FileText
                          className={`w-4 h-4 ${
                            selectedFormId === form.id
                              ? "text-purple-600"
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
                            {formatTimeAgo(form.upload_date)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {collapsed && (
        <div className="flex flex-col items-center py-4 space-y-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all disabled:opacity-50"
            title="New Upload"
          >
            <Plus className="w-5 h-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,image/*"
            onChange={handleFileSelect}
            disabled={uploading}
          />
          {!loading && forms.length > 0 && (
            <div className="flex flex-col space-y-2 w-full px-2">
              {forms.slice(0, 5).map((form) => (
                <button
                  key={form.id}
                  onClick={() => onSelectForm(form.id)}
                  className={`p-2 rounded-lg transition-all ${
                    selectedFormId === form.id
                      ? "bg-purple-100"
                      : "bg-gray-100 hover:bg-gray-200"
                  }`}
                  title={form.file_name}
                >
                  <FileText
                    className={`w-5 h-5 ${
                      selectedFormId === form.id
                        ? "text-purple-600"
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
