'use client';
import { useState, useCallback, useRef } from 'react';
import { CloudUpload } from 'lucide-react';
type BrowserEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (success: (f: File) => void, error?: (e: Error) => void) => void;
  createReader?: () => {
    readEntries: (success: (entries: BrowserEntry[]) => void, error?: (e: Error) => void) => void;
  };
};
async function collectEntry(entry: BrowserEntry, prefix: string): Promise<File[]> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
    Object.defineProperty(file, 'webkitRelativePath', {
      value: prefix + file.name,
      configurable: true,
    });
    return [file];
  }
  if (!entry.isDirectory || !entry.createReader) return [];
  const reader = entry.createReader();
  const children: BrowserEntry[] = [];
  for (;;) {
    const batch = await new Promise<BrowserEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (!batch.length) break;
    children.push(...batch);
    if (children.length > 5000) throw new Error('Thư mục có quá nhiều tệp');
  }
  const folders = await Promise.all(
    children.map((c) => collectEntry(c, `${prefix}${entry.name}/`)),
  );
  return folders.flat();
}
async function droppedFiles(transfer: DataTransfer): Promise<File[]> {
  const items = Array.from(transfer.items || []);
  const entries = items
    .map((item) =>
      (
        item as DataTransferItem & { webkitGetAsEntry?: () => BrowserEntry | null }
      ).webkitGetAsEntry?.(),
    )
    .filter(Boolean) as BrowserEntry[];
  if (!entries.length) return Array.from(transfer.files);
  return (await Promise.all(entries.map((entry) => collectEntry(entry, '')))).flat().slice(0, 5000);
}
export function useFileDrop(onFiles: (files: File[]) => void, disabled = false) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (disabled || !e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current++;
      setDragging(true);
    },
    [disabled],
  );
  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (disabled || !e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    },
    [disabled],
  );
  const onDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setDragging(false);
    },
    [disabled],
  );
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current = 0;
      setDragging(false);
      const transfer = e.dataTransfer;
      void droppedFiles(transfer)
        .then((files) => {
          if (files.length) onFiles(files);
        })
        .catch((err) => alert(err instanceof Error ? err.message : 'Không đọc được thư mục'));
    },
    [disabled, onFiles],
  );
  return { dragging, handlers: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
export function DropHint({
  visible,
  text = 'Thả tệp vào đây để tải lên',
}: {
  visible: boolean;
  text?: string;
}) {
  return visible ? (
    <div className="drop-hint" aria-live="polite">
      <CloudUpload size={36} />
      <strong>{text}</strong>
      <small>Nhiều tệp sẽ được xử lý trong hàng đợi</small>
    </div>
  ) : null;
}
