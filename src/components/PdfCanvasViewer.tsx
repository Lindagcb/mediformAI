import { useEffect, useRef } from "react";
import { GlobalWorkerOptions, getDocument, version } from "pdfjs-dist/legacy/build/pdf";

export default function PdfCanvasViewer({ url, zoom, rotation }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner || !url) return;

    // Clear once
    inner.innerHTML = "";

    GlobalWorkerOptions.workerSrc =
      `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;

    const loadPDF = async () => {
      const pdf = await getDocument(url).promise;
      const page = await pdf.getPage(1); // render first page only (your MCR PDFs are single-page)

      const viewport = page.getViewport({ scale: 1 });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      inner.appendChild(canvas);

      await page.render({
        canvasContext: ctx,
        viewport,
      }).promise;
    };

    loadPDF();
  }, [url]);

  // ⭐ Apply zoom + rotation smoothly without re-rendering
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    inner.style.transformOrigin = "top left";
    inner.style.transform = `scale(${zoom}) rotate(${rotation}deg)`;
  }, [zoom, rotation]);

  return (
    <div
      ref={outerRef}
      className="w-full h-full overflow-auto bg-white p-4 rounded border"
    >
      <div ref={innerRef}></div>
    </div>
  );
}
