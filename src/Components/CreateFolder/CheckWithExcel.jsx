import React, { useState } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const CheckWithExcel = () => {
  const [awbText, setAwbText] = useState("");
  const [loading, setLoading] = useState(false);

  const isImage = (fileName) => /\.(png|jpg|jpeg)$/i.test(fileName);

  const handleFiles = async (files) => {
    if (!awbText.trim()) {
      alert("Please enter AWB numbers");
      return;
    }

    setLoading(true);

    const awbList = awbText
      .split("\n")
      .map((a) => a.trim())
      .filter(Boolean);

    const zip = new JSZip();
    const folderData = {};

    try {
      for (const file of files) {
        let matchedAwb = null;

        // IMAGE
        if (isImage(file.name)) {
          for (const awb of awbList) {
            if (file.name.includes(awb)) {
              matchedAwb = awb;
              break;
            }
          }
        }

        // PDF
        else if (file.type === "application/pdf") {
          const buffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

          let text = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const tc = await page.getTextContent();
            text += tc.items.map((it) => it.str).join(" ");
          }

          const cleanText = text.replace(/\s+/g, "");

          for (const awb of awbList) {
            if (cleanText.includes(awb)) {
              matchedAwb = awb;
              break;
            }
          }
        }

        if (matchedAwb) {
          if (!folderData[matchedAwb]) {
            folderData[matchedAwb] = { count: 0, files: [] };
            zip.folder(matchedAwb);
          }

          folderData[matchedAwb].count++;
          folderData[matchedAwb].files.push(file.name);
          zip.folder(matchedAwb).file(file.name, file);
        }
      }

      const excelData = Object.keys(folderData).map((awb) => ({
        "AWB Number": awb,
        "Total Files": folderData[awb].count,
        "File Names": folderData[awb].files.join(", "),
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "AWB Report");

      const excelBuffer = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
      });

      zip.file("AWB_REPORT.xlsx", excelBuffer);

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, "AWB_MATCH_RESULT.zip");
    } catch (err) {
      console.error(err);
      alert("Error while processing files");
    }

    setLoading(false);
  };

  return (
    <div style={{ padding: 20 }}>
      <h3>AWB → PDF + Image Matcher with Excel</h3>

      <textarea
        rows="6"
        placeholder="Enter AWB numbers (one per line)"
        value={awbText}
        onChange={(e) => setAwbText(e.target.value)}
        style={{ width: "100%", marginBottom: 10 }}
      />

      <label style={{ background: "#007bff", color: "#fff", padding: "10px 16px", cursor: "pointer" }}>
        Upload PDFs + Images
        <input
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg"
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {loading && <p>Processing files, please wait…</p>}
    </div>
  );
};

export default CheckWithExcel;
