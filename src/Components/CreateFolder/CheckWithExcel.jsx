import React, { useState } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";

/* ---------- PDF WORKER ---------- */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/* ---------- HELPERS ---------- */
const normalizeAWB = (value = "") => value.replace(/\D/g, "");
const isImage = (name = "") => /\.(png|jpg|jpeg)$/i.test(name);

/* ---------- COMPONENT ---------- */
const CheckWithExcel = () => {
  const [awbText, setAwbText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFiles = async (fileList) => {
    if (!awbText.trim()) {
      alert("Please enter AWB numbers");
      return;
    }

    if (!fileList || fileList.length === 0) {
      alert("Please upload files");
      return;
    }

    setLoading(true);

    const awbList = awbText
      .split(/\r?\n/)
      .map(a => normalizeAWB(a))
      .filter(Boolean);

    const zip = new JSZip();
    const folderData = {};

    try {
      for (const file of Array.from(fileList)) {
        let matchedAwb = null;

        /* ---------- IMAGE CHECK ---------- */
        if (isImage(file.name)) {
          const cleanName = normalizeAWB(file.name);

          for (const awb of awbList) {
            if (cleanName.includes(awb)) {
              matchedAwb = awb;
              break;
            }
          }
        }

        /* ---------- PDF CHECK ---------- */
        else if (file.type === "application/pdf") {
          const buffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

          let combinedText = "";

          for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();

            const sorted = content.items.sort((a, b) => {
              const yDiff = b.transform[5] - a.transform[5];
              if (Math.abs(yDiff) > 5) return yDiff;
              return a.transform[4] - b.transform[4];
            });

            combinedText += sorted.map(i => i.str).join("");
          }

          const cleanPdfText = normalizeAWB(combinedText);

          for (const awb of awbList) {
            if (cleanPdfText.includes(awb)) {
              matchedAwb = awb;
              break;
            }
          }
        }

        /* ---------- STORE FILE ---------- */
        if (matchedAwb) {
          if (!folderData[matchedAwb]) {
            folderData[matchedAwb] = { files: [] };
            zip.folder(matchedAwb);
          }

          folderData[matchedAwb].files.push(file.name);
          zip.folder(matchedAwb).file(file.name, file);
        }
      }

      /* ---------- EXCEL ---------- */
      const excelRows = Object.keys(folderData).map(awb => ({
        "AWB Number": awb,
        "Total Files": folderData[awb].files.length,
        "File Names": folderData[awb].files.join(", "),
      }));

      const ws = XLSX.utils.json_to_sheet(excelRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "AWB Report");

      const excelBuffer = XLSX.write(wb, {
        bookType: "xlsx",
        type: "array",
      });

      zip.file("AWB_REPORT.xlsx", excelBuffer);

      /* ---------- DOWNLOAD ZIP ---------- */
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, "AWB_MATCH_RESULT.zip");

      alert("✅ Processing completed successfully");
    } catch (err) {
      console.error(err);
      alert("❌ Error while processing files");
    }

    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 700, padding: 20 }}>
      <h2>Create Folder to save Document</h2>

      <textarea
        rows={4}
        value={awbText}
        onChange={(e) => setAwbText(e.target.value)}
        placeholder="Enter AWB numbers (one per line)"
        style={{ width: "100%", marginBottom: 15 }}
      />

      <label
        style={{
          background: "#0066cc",
          color: "#fff",
          padding: "10px 18px",
          cursor: "pointer",
          borderRadius: 4,
          display: "inline-block",
        }}
      >
       Upload Document
        <input
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg"
          style={{ display: "none" }}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {loading && (
        <p style={{ marginTop: 15, color: "red" }}>
          Processing… please wait
        </p>
      )}
    </div>
  );
};

export default CheckWithExcel;
