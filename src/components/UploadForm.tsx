import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

// ✅ Correct worker setup for Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface UploadFormProps {
  apiBase: string;
  onUploadComplete: (formId: string) => void;
}

const UploadForm: React.FC<UploadFormProps> = ({ apiBase, onUploadComplete }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Convert first page of PDF → PNG
  const pdfFirstPageToPng = async (file: File): Promise<string> => {
    const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/png");
  };

  // Handle upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10 MB");
      return;
    }

    if (!file.type.toLowerCase().includes("pdf") && !file.type.startsWith("image/")) {
      setError("Please upload a PDF or image file");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      let dataUrl: string;
      let contentType: string;
      let uploadName: string;

      if (file.type.toLowerCase().includes("pdf")) {
        dataUrl = await pdfFirstPageToPng(file);
        contentType = "image/png";
        uploadName = file.name.replace(/\.pdf$/i, "") + "-page1.png";
      } else {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
        contentType = file.type || "image/png";
        uploadName = file.name;
      }

      // ✅ get JWT token from localStorage
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Missing token — please log in again");

      // ✅ include Authorization header with the Bearer token
      const res = await fetch(`${apiBase}/extract-form`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: uploadName,
          fileData: dataUrl,
          contentType,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to process file");

      onUploadComplete(result.form_id);
    } catch (err) {
      console.error("Upload error:", err);
      setError(err instanceof Error ? err.message : "Failed to process file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={handleFileUpload}
        disabled={uploading}
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full bg-[#008A80] text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-[#00776E] transition-all disabled:opacity-50 flex items-center justify-center text-sm"
      >
        {uploading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4 mr-2" />
            New Upload
          </>
        )}
      </button>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};

export default UploadForm;
