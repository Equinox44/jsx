// components/ui/file-upload.js
import React, { useRef } from "react";
import { Button } from "./button";
import { Upload } from "lucide-react";

export const FileUpload = ({ onFileSelect, accept = ".xlsx,.xls", className = "", children, ...props }) => {
  const fileInputRef = useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && onFileSelect) {
      onFileSelect(file);
    }
    // Reset the input value to allow selecting the same file again
    event.target.value = '';
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        {...props}
      />
      <Button
        variant="outline"
        onClick={handleClick}
        className={className}
      >
        {children || (
          <>
            <Upload className="w-4 h-4 mr-2" />
            Upload Excel
          </>
        )}
      </Button>
    </>
  );
};
