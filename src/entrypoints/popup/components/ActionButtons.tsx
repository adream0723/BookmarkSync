import React from 'react';
import { Button } from 'react-bootstrap';
import { AiOutlineCloudUpload, AiOutlineCloudDownload, AiOutlineCloudSync } from 'react-icons/ai';

interface ActionButtonsProps {
  onUpload: () => void;
  onDownload: () => void;
  onSync: () => void;
  uploadLabel?: string;
  uploadDisabled?: boolean;
  downloadLabel?: string;
  downloadDisabled?: boolean;
  syncLabel?: string;
  syncDisabled?: boolean;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({ onUpload, onDownload, onSync, uploadLabel = '覆盖上传', uploadDisabled = false, downloadLabel = '从云端下载', downloadDisabled = false, syncLabel = '立即同步', syncDisabled = false }) => {
  return (
    <div className="popup-section">
      <div className="d-flex gap-2 mb-2">
        <Button
          variant="outline-primary"
          size="sm"
          className="flex-fill d-flex align-items-center justify-content-center gap-1"
          onClick={onUpload}
          disabled={uploadDisabled}
        >
          <AiOutlineCloudUpload /> {uploadLabel}
        </Button>
        <Button
          variant="outline-primary"
          size="sm"
          className="flex-fill d-flex align-items-center justify-content-center gap-1"
          onClick={onDownload}
          disabled={downloadDisabled}
        >
          <AiOutlineCloudDownload /> {downloadLabel}
        </Button>
      </div>
      <Button
        variant="primary"
        size="sm"
        className="w-100 d-flex align-items-center justify-content-center gap-1"
        onClick={onSync}
        disabled={syncDisabled}
      >
        <AiOutlineCloudSync /> {syncLabel}
      </Button>
    </div>
  );
};

export default ActionButtons;
