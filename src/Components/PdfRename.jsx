import React, { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.entry";
import JSZip from "jszip";
import './pdfRename.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function PdfRename() {
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files);
    let tempResults = [];
    const zip = new JSZip();
    setProcessing(true);

    for (let file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          let content = await page.getTextContent();
          let strings = content.items.map((item) => item.str);
          fullText += strings.join(" ") + "\n";
        }
        const match = fullText.match(/\b\d{2}_\d{5}\b/);
        if (match) {
          const renamedName = match[0] + ".pdf";
          zip.file(renamedName, arrayBuffer);
          tempResults.push({ file: file.name, renamed: renamedName, status: "success" });
        } else {
          tempResults.push({ file: file.name, renamed: "-", status: "error" });
        }
      } catch (e) {
        tempResults.push({ file: file.name, renamed: "-", status: "error" });
      }
    }
    setResults(tempResults);
    setProcessing(false);
    if (tempResults.some(r => r.status === "success")) {
      zip.generateAsync({ type: "blob" }).then((content) => {
        const url = window.URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = "shippingBill_pdfs.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      });
    } else {
      alert("No matching PDFs found!");
    }
  };

  return (
    <div className="section">
      <h2 className="section-header">
        <span role="img" aria-label="Bulk">📂</span>
        Bulk PDF Rename & Download
      </h2>
      <small>Upload multiple PDFs, extract CSB number, and download all in one ZIP.</small>
      <label className="file-label">
        Select PDFs
        <input type="file" accept="application/pdf" multiple onChange={handleFileChange} disabled={processing} />
      </label>
      {processing && <div className="loading">⏳ Processing... Please wait</div>}
      {results.length > 0 && (
        <ul className="file-list">
          {results.map((res, i) => (
            <li key={i} className={res.status}>
              {res.file} ➡️ {res.renamed}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PdfRename;
