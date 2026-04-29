"use client";

import { useRef, useState, type DragEvent, type ChangeEvent } from "react";

type UploadZoneProps = {
  onFile: (file: File) => void;
};

export function UploadZone({ onFile }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const openPicker = () => inputRef.current?.click();

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = "";
  };

  return (
    <div className="upload-section">
      <div
        className={`upload-zone${dragOver ? " dragover" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={openPicker}
      >
        <div className="upload-icon">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
        </div>
        <div className="upload-title">Drop your exhibitor file</div>
        <div className="upload-sub">CSV · XLSX · XLS · PDF</div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={(e) => {
            e.stopPropagation();
            openPicker();
          }}
        >
          Browse file
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.pdf"
        style={{ display: "none" }}
        onChange={handleChange}
      />
    </div>
  );
}
