
import { useRef, useState } from "react";
import JSZip from "jszip";
import "./ZipMain.css";

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = name;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function ZipMain() {
  const inputRef = useRef(null);

  const [archives, setArchives] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  // Upload and extract multiple ZIP files
  async function addFiles(fileList) {
    const selected = Array.from(fileList || []).filter(
      (file) => file.name.toLowerCase().endsWith(".zip")
    );

    if (!selected.length) {
      setError("Please select a valid ZIP file.");
      return;
    }

    setError("");
    setBusy(true);

    const newArchives = [];

    for (let index = 0; index < selected.length; index++) {
      const file = selected[index];

      setProgress(
        `Extracting ${index + 1} of ${selected.length}: ${file.name}`
      );

      try {
        const zip = await JSZip.loadAsync(file);

        const entries = Object.values(zip.files).filter(
          (entry) => !entry.dir
        );

        const extracted = [];

        for (const entry of entries) {
          const blob = await entry.async("blob");

          extracted.push({
            path: entry.name,
            name: entry.name.split("/").pop() || entry.name,
            size: blob.size,
            blob,
          });
        }

        newArchives.push({
          id: `${file.name}-${file.lastModified}-${index}`,
          name: file.name,
          originalSize: file.size,
          files: extracted,
          status: "done",
        });
      } catch (e) {
        newArchives.push({
          id: `${file.name}-${Date.now()}-${index}`,
          name: file.name,
          originalSize: file.size,
          files: [],
          status: "error",
          message: e?.message || "Unable to extract ZIP file.",
        });
      }
    }

    setArchives((current) => [...current, ...newArchives]);

    setBusy(false);
    setProgress("");

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  // Download all extracted files together
  async function downloadAll() {
    const ready = archives.filter(
      (archive) => archive.files.length > 0
    );

    if (!ready.length) return;

    setBusy(true);
    setError("");
    setProgress("Preparing extracted files...");

    try {
      const output = new JSZip();

      ready.forEach((archive) => {
        archive.files.forEach((file) => {
          const folder = archive.name.replace(/\.zip$/i, "");

          output.file(
            `${folder}/${file.path}`,
            file.blob
          );
        });
      });

      const blob = await output.generateAsync({
        type: "blob",
      });

      saveBlob(blob, "extracted-files.zip");
    } catch (e) {
      setError("Could not prepare download. Please try again.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  // Download individual extracted file
  function downloadOne(file) {
    saveBlob(
      file.blob,
      file.name || file.path.split("/").pop()
    );
  }

  const totalFiles = archives.reduce(
    (sum, archive) => sum + archive.files.length,
    0
  );

  const totalSize = archives.reduce(
    (sum, archive) =>
      sum +
      archive.files.reduce(
        (s, file) => s + file.size,
        0
      ),
    0
  );

  return (
    <main className="app-shell">

      {/* Header */}
      <header className="topbar">
        <div className="brand" aria-label="ZipDrop home">
          <span className="brand-icon">▣</span>
          <span>ZipDrop</span>
        </div>

        <span className="privacy">
          <span className="lock">⌑</span>
          Files stay on your device
        </span>
      </header>

      <section className="hero">

        <div className="eyebrow">
          <span className="eyebrow-dot" />
          SIMPLE · FAST · PRIVATE
        </div>

        <h1>
          Unzip files.
          <br />
          <span>Without the hassle.</span>
        </h1>

        <p className="subtitle">
          Drop one ZIP or a whole batch.
          Extract everything right in your browser.
        </p>

        {/* Drag and Drop Area */}
        <section
          className={`dropzone ${isDragging ? "dragging" : ""}`}

          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}

          onDragOver={(event) => event.preventDefault()}

          onDragLeave={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget)
            ) {
              setIsDragging(false);
            }
          }}

          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            addFiles(event.dataTransfer.files);
          }}

          onClick={() => {
            if (!busy) inputRef.current?.click();
          }}

          role="button"
          tabIndex={0}
          aria-label="Choose or drop ZIP files"

          onKeyDown={(event) => {
            if (
              (event.key === "Enter" || event.key === " ") &&
              !busy
            ) {
              inputRef.current?.click();
            }
          }}
        >

          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            multiple
            hidden
            onChange={(event) => addFiles(event.target.files)}
          />

          <div className="upload-icon">
            <span>↑</span>
          </div>

          <h2>
            {isDragging
              ? "Drop your ZIP files here"
              : "Drag & drop your ZIP files"}
          </h2>

          <p>or click to browse from your computer</p>

          <button
            className="browse-btn"
            type="button"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              inputRef.current?.click();
            }}
          >
            <span>＋</span> Choose ZIP files
          </button>

          <div className="drop-hint">
            Multiple files supported
            <span>·</span>
            ZIP format
          </div>

        </section>

        {/* Error */}
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        {/* Progress */}
        {busy && (
          <div className="working">
            <span className="spinner" />
            {progress}
          </div>
        )}

        {/* Extraction Results */}
        {archives.length > 0 && (
          <section className="results">

            <div className="results-heading">
              <div>
                <div className="section-kicker">
                  YOUR EXTRACTION
                </div>

                <h2>
                  Ready to go
                  <span className="count">
                    {archives.length}
                  </span>
                </h2>
              </div>

              <button
                className="text-btn"
                onClick={() => {
                  setArchives([]);
                  setError("");
                }}
              >
                Clear all
              </button>
            </div>

            {/* Statistics */}
            <div className="stats">

              <div className="stat">
                <strong>{archives.length}</strong>
                <span>ZIP files</span>
              </div>

              <div className="stat">
                <strong>{totalFiles}</strong>
                <span>Files extracted</span>
              </div>

              <div className="stat">
                <strong>{formatSize(totalSize)}</strong>
                <span>Total size</span>
              </div>

            </div>

            {/* Archive List */}
            <div className="archive-list">

              {archives.map((archive) => (

                <article
                  className="archive-card"
                  key={archive.id}
                >

                  <div className="archive-head">

                    <div className="file-icon">
                      ZIP
                    </div>

                    <div className="archive-info">
                      <strong title={archive.name}>
                        {archive.name}
                      </strong>

                      <span>
                        {formatSize(archive.originalSize)}
                        {" · "}
                        {archive.files.length} files
                      </span>
                    </div>

                    <span className={`status ${archive.status}`}>
                      {archive.status === "done"
                        ? "✓ Extracted"
                        : "Failed"}
                    </span>

                    <button
                      className="remove-btn"
                      title="Remove archive"
                      onClick={() => {
                        setArchives((items) =>
                          items.filter(
                            (item) => item.id !== archive.id
                          )
                        );
                      }}
                    >
                      ×
                    </button>

                  </div>

                  {archive.status === "error" ? (

                    <p className="archive-error">
                      {archive.message}
                    </p>

                  ) : archive.files.length === 0 ? (

                    <p className="empty-files">
                      This ZIP archive contains no files.
                    </p>

                  ) : (

                    <div className="file-list">

                      {archive.files.map((file, index) => (

                        <div
                          className="file-row"
                          key={`${file.path}-${index}`}
                        >

                          <span className="file-type">
                            ▤
                          </span>

                          <span
                            className="file-name"
                            title={file.path}
                          >
                            {file.path}
                          </span>

                          <span className="file-size">
                            {formatSize(file.size)}
                          </span>

                          <button
                            className="download-one"
                            title={`Download ${file.name}`}
                            onClick={() => downloadOne(file)}
                          >
                            ↓
                          </button>

                        </div>

                      ))}

                    </div>

                  )}

                </article>

              ))}

            </div>

            {/* Download All */}
            <button
              className="download-all"
              disabled={busy || totalFiles === 0}
              onClick={downloadAll}
            >
              <span>↓</span>
              Download all extracted files
              <span className="download-note">
                as ZIP
              </span>
            </button>

            <p className="download-caption">
              Each source ZIP gets its own folder in the download.
            </p>

          </section>
        )}

      </section>

      {/* Footer */}
      <footer>
        <span>ZIP extraction, made easy.</span>
        <span>🔒 Processed locally in your browser</span>
      </footer>

    </main>
  );
}
