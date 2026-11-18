'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowDownToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  LoaderCircle,
  RotateCw,
  Subtitles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useTransfers } from './TransferCenter';
import { DocumentPreview } from './PreviewDocuments';

export type PreviewNode = {
  id: string;
  name: string;
  kind: 'file' | 'folder';
  size: number;
  mime: string;
  updated_at: number;
};

type Props = {
  node: PreviewNode;
  siblings: PreviewNode[];
  onSelect: (node: PreviewNode) => void;
  onClose: () => void;
};

const extension = (name: string) => name.toLowerCase().split('.').pop() || '';
const images = new Set('jpg jpeg png gif webp avif bmp ico svg'.split(' '));
const videos = new Set('mp4 webm mov m4v ogv mkv'.split(' '));
const audios = new Set('mp3 m4a aac wav ogg opus flac'.split(' '));
const texts = new Set(
  'txt md markdown json jsonl csv tsv xml html htm css scss less js mjs cjs ts tsx jsx rs py go java kt c cpp cc h hpp cs php rb lua sh bash zsh ps1 sql toml yaml yml ini conf cfg env log srt vtt ass ssa nfo dockerfile gitignore'.split(
    ' ',
  ),
);
const documents = new Set('docx xlsx pptx odt odp zip cbz epub ttf otf woff woff2'.split(' '));

function fileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Không rõ dung lượng';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

export function FilePreview({ node, siblings, onSelect, onClose }: Props) {
  const transfers = useTransfers();
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [subtitle, setSubtitle] = useState('');
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const type = extension(node.name);
  const image = node.mime.startsWith('image/') || images.has(type);
  const video = node.mime.startsWith('video/') || videos.has(type);
  const audio = node.mime.startsWith('audio/') || audios.has(type);
  const isDocument = documents.has(type) || node.mime.startsWith('text/') || texts.has(type);
  const pdf = type === 'pdf' || node.mime === 'application/pdf';
  const media = image || video || audio;
  const src = `/api/drive/${encodeURIComponent(node.id)}/file`;

  const files = siblings.filter((file) => file.kind === 'file');
  const index = files.findIndex((file) => file.id === node.id);
  const previous = index > 0 ? files[index - 1] : null;
  const next = index >= 0 && index < files.length - 1 ? files[index + 1] : null;
  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const focusedBefore = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setMounted(true);
    return () => {
      document.body.style.overflow = originalOverflow;
      focusedBefore?.focus();
    };
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
  }, [mounted]);

  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setDragging(false);
    dragRef.current = null;
    setImageLoaded(false);
    setImageError(false);
    setNotice('');
    setCopied(false);
    setSubtitle('');
  }, [node.id]);

  useEffect(
    () => () => {
      if (subtitle) URL.revokeObjectURL(subtitle);
    },
    [subtitle],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const elements = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((item) => item.getClientRects().length > 0);
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT', 'VIDEO', 'AUDIO'].includes(target?.tagName || '') ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      )
        return;

      if (event.key === 'ArrowLeft' && previous) {
        event.preventDefault();
        onSelect(previous);
      } else if (event.key === 'ArrowRight' && next) {
        event.preventDefault();
        onSelect(next);
      } else if (image && (event.key === '+' || event.key === '=')) {
        event.preventDefault();
        setZoom((value) => Math.min(4, +(value + 0.25).toFixed(2)));
      } else if (image && event.key === '-') {
        event.preventDefault();
        setZoom((value) => Math.max(0.25, +(value - 0.25).toFixed(2)));
      } else if (image && event.key === '0') {
        event.preventDefault();
        setZoom(1);
        setRotation(0);
        setPosition({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, image, next, onSelect, previous]);

  const selectFile = (file: PreviewNode | null) => {
    if (file) onSelect(file);
  };

  const resetZoom = () => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };

  const changeZoom = (delta: number) => {
    const nextZoom = Math.max(0.25, Math.min(4, +(zoom + delta).toFixed(2)));
    setZoom(nextZoom);
    if (nextZoom <= 1) setPosition({ x: 0, y: 0 });
  };

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (zoom <= 1 || event.button !== 0) return;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      startX: position.x,
      startY: position.y,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start) return;
    setPosition({
      x: start.startX + event.clientX - start.x,
      y: start.startY + event.clientY - start.y,
    });
  };

  const stopPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const attachSubtitle = async (file?: File) => {
    if (!file) return;
    try {
      const content = await file.text();
      const converted = content.startsWith('WEBVTT')
        ? content
        : `WEBVTT\n\n${content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`;
      setSubtitle(URL.createObjectURL(new Blob([converted], { type: 'text/vtt' })));
      setNotice('Đã thêm phụ đề.');
    } catch {
      setNotice('Không thể đọc tệp phụ đề.');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(new URL(src, window.location.origin).toString());
      setCopied(true);
      setNotice('Đã sao chép liên kết.');
    } catch {
      setNotice('Không thể sao chép liên kết.');
    }
  };

  if (!mounted) return null;

  const fileIcon = image ? (
    <FileImage size={20} />
  ) : video ? (
    <FileVideo size={20} />
  ) : audio ? (
    <FileAudio size={20} />
  ) : (
    <FileText size={20} />
  );

  return createPortal(
    <div
      className="file-viewer-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        ref={dialogRef}
        className={`file-viewer ${media ? 'file-viewer--media' : 'file-viewer--document'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-viewer-title"
        aria-describedby="file-viewer-meta"
      >
        <header className="file-viewer-header">
          <div className="file-viewer-title-wrap">
            <div className="file-viewer-file-icon" aria-hidden="true">
              {fileIcon}
            </div>
            <div className="file-viewer-title-group">
              <h2 id="file-viewer-title" title={node.name}>
                {node.name}
              </h2>
              <p id="file-viewer-meta">
                {fileSize(node.size)} <span aria-hidden="true">·</span> {node.mime || 'Tệp'}
              </p>
            </div>
          </div>
          <div className="file-viewer-header-actions">
            {files.length > 1 && (
              <div
                className="file-viewer-counter"
                aria-label={`Tệp ${index + 1} trên ${files.length}`}
              >
                {index + 1} <span>/</span> {files.length}
              </div>
            )}
            <button
              type="button"
              className="file-viewer-action file-viewer-copy"
              onClick={() => void copyLink()}
              title="Sao chép liên kết (cần đăng nhập)"
            >
              {copied ? <Check size={17} /> : <Copy size={17} />}{' '}
              <span>{copied ? 'Đã sao chép' : 'Sao chép liên kết'}</span>
            </button>
            <button
              type="button"
              className="file-viewer-action file-viewer-download"
              onClick={() => void transfers.download(node.id, node.name)}
            >
              <ArrowDownToLine size={17} /> <span>Tải xuống</span>
            </button>
            <span className="file-viewer-divider" aria-hidden="true" />
            <button
              ref={closeRef}
              type="button"
              className="file-viewer-icon-button file-viewer-close"
              onClick={close}
              title="Đóng (Esc)"
              aria-label="Đóng xem trước"
            >
              <X size={21} />
            </button>
          </div>
        </header>

        <main
          key={node.id}
          className={`file-viewer-content ${media ? 'file-viewer-content--media' : 'file-viewer-content--paper'}`}
        >
          {image ? (
            <div
              className={`file-viewer-image-stage ${zoom > 1 ? 'is-zoomed' : ''} ${dragging ? 'is-dragging' : ''}`}
              onPointerDown={startPan}
              onPointerMove={movePan}
              onPointerUp={stopPan}
              onPointerCancel={stopPan}
            >
              {!imageLoaded && !imageError && (
                <div className="file-viewer-image-loading" role="status">
                  <LoaderCircle className="spin" size={23} /> Đang mở ảnh...
                </div>
              )}
              {imageError && (
                <div className="file-viewer-image-error">
                  <FileImage size={36} />
                  <p>Không thể xem ảnh này.</p>
                  <button
                    type="button"
                    className="file-viewer-action file-viewer-download"
                    onClick={() => void transfers.download(node.id, node.name)}
                  >
                    Tải file gốc
                  </button>
                </div>
              )}
              <img
                src={src}
                alt={node.name}
                draggable={false}
                className={imageLoaded && !imageError ? 'is-visible' : ''}
                style={{
                  transform: `translate3d(${position.x}px, ${position.y}px, 0) rotate(${rotation}deg) scale(${zoom})`,
                }}
                onLoad={() => setImageLoaded(true)}
                onError={() => {
                  setImageLoaded(true);
                  setImageError(true);
                }}
              />
            </div>
          ) : video ? (
            <video
              controls
              playsInline
              preload="metadata"
              src={src}
              onError={() => setNotice('Trình duyệt không hỗ trợ định dạng video này.')}
            >
              {subtitle && (
                <track key={subtitle} kind="subtitles" src={subtitle} label="Phụ đề" default />
              )}
            </video>
          ) : audio ? (
            <div className="file-viewer-audio-card">
              <div className="file-viewer-audio-art" aria-hidden="true">
                <FileAudio size={62} strokeWidth={1.35} />
              </div>
              <strong title={node.name}>{node.name}</strong>
              <span>{fileSize(node.size)} · Tệp âm thanh</span>
              <audio
                controls
                preload="metadata"
                src={src}
                onError={() => setNotice('Trình duyệt không đọc được tệp âm thanh này.')}
              />
            </div>
          ) : pdf ? (
            <iframe title={node.name} src={src} className="file-viewer-pdf" />
          ) : isDocument ? (
            <DocumentPreview src={src} name={node.name} extension={type} size={node.size} />
          ) : (
            <div className="file-viewer-unsupported">
              <span aria-hidden="true">
                <FileText size={38} />
              </span>
              <h3>Chưa có bản xem trước</h3>
              <p>Định dạng này chưa được hỗ trợ. Bạn có thể tải file xuống để mở trên thiết bị.</p>
              <button
                type="button"
                className="file-viewer-action file-viewer-download"
                onClick={() => void transfers.download(node.id, node.name)}
              >
                <ArrowDownToLine size={17} /> Tải file
              </button>
            </div>
          )}

          {previous && (
            <button
              type="button"
              className="file-viewer-step file-viewer-step--previous"
              onClick={() => selectFile(previous)}
              aria-label={`Tệp trước: ${previous.name}`}
              title={`Trước: ${previous.name} (←)`}
            >
              <ChevronLeft size={23} />
            </button>
          )}
          {next && (
            <button
              type="button"
              className="file-viewer-step file-viewer-step--next"
              onClick={() => selectFile(next)}
              aria-label={`Tệp tiếp: ${next.name}`}
              title={`Tiếp: ${next.name} (→)`}
            >
              <ChevronRight size={23} />
            </button>
          )}
        </main>

        {(image || video) && (
          <footer className="file-viewer-footer">
            {image ? (
              <div className="file-viewer-image-toolbar" role="group" aria-label="Điều khiển ảnh">
                <button
                  type="button"
                  onClick={() => changeZoom(-0.25)}
                  title="Thu nhỏ (-)"
                  aria-label="Thu nhỏ"
                  disabled={zoom <= 0.25}
                >
                  <ZoomOut size={19} />
                </button>
                <button
                  type="button"
                  onClick={resetZoom}
                  className="file-viewer-zoom-value"
                  title="Đặt lại kích thước (0)"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => changeZoom(0.25)}
                  title="Phóng to (+)"
                  aria-label="Phóng to"
                  disabled={zoom >= 4}
                >
                  <ZoomIn size={19} />
                </button>
                <span className="file-viewer-tool-divider" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setRotation((value) => (value + 90) % 360)}
                  title="Xoay 90°"
                  aria-label="Xoay 90°"
                >
                  <RotateCw size={19} />
                </button>
              </div>
            ) : (
              <div className="file-viewer-image-toolbar file-viewer-subtitle-toolbar">
                <button type="button" onClick={() => subtitleInputRef.current?.click()}>
                  <Subtitles size={19} /> <span>Thêm phụ đề</span>
                </button>
                <input
                  ref={subtitleInputRef}
                  type="file"
                  accept=".srt,.vtt"
                  className="file-viewer-hidden-input"
                  onChange={(event) => void attachSubtitle(event.target.files?.[0])}
                />
              </div>
            )}
            <span className="file-viewer-keyboard-hint">
              {image ? 'Kéo để di chuyển khi phóng to' : 'Phím Esc để đóng'}
            </span>
          </footer>
        )}
        <div className="file-viewer-status" role="status" aria-live="polite">
          {notice && <span>{notice}</span>}
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function PreviewSkeleton() {
  return (
    <div className="preview-loader">
      <LoaderCircle size={22} className="spin" /> Đang chuẩn bị file...
    </div>
  );
}
