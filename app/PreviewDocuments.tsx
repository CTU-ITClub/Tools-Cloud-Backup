'use client';
import { useEffect, useState, useRef } from 'react';
import {
  FileArchive,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  LoaderCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Sheet = { name: string; rows: string[][] };
type Chapter = { name: string; text: string };
type PreviewData = {
  kind: 'text' | 'html' | 'sheets' | 'chapters' | 'archive' | 'font' | 'epub';
  text?: string;
  html?: string;
  sheets?: Sheet[];
  chapters?: Chapter[];
  entries?: { name: string; size: number; image: boolean }[];
  blob?: Blob;
  note?: string;
};
const MAX = 25 * 1024 * 1024;
function isImage(name: string) {
  return /\.(png|jpe?g|webp|gif|avif)$/i.test(name);
}
async function readBlob(url: string, limit: number, signal: AbortSignal) {
  const response = await fetch(url, { signal, credentials: 'same-origin' });
  if (!response.ok || !response.body) throw new Error(`Không đọc được file (${response.status})`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > limit) throw new Error('File quá lớn để xem trước; hãy tải xuống');
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error('Dung lượng file vượt giới hạn xem trước');
    }
    chunks.push(part.value);
  }
  return new Blob(chunks as BlobPart[]);
}
async function parseData(blob: Blob, extension: string): Promise<PreviewData> {
  const buffer = await blob.arrayBuffer();
  const text = () => new TextDecoder().decode(buffer);
  if (extension === 'ttf' || extension === 'otf' || extension === 'woff' || extension === 'woff2')
    return { kind: 'font', blob };
  if (['md', 'markdown'].includes(extension)) return { kind: 'text', text: text() };
  if (!['docx', 'xlsx', 'pptx', 'odt', 'odp', 'zip', 'cbz', 'epub'].includes(extension))
    return { kind: 'text', text: text() };
  if (extension === 'docx') {
    const [{ default: mammoth }, { default: DOMPurify }] = await Promise.all([
      import('mammoth'),
      import('dompurify'),
    ]);
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const clean = DOMPurify.sanitize(result.value, {
      ALLOWED_TAGS: [
        'p',
        'br',
        'strong',
        'em',
        'u',
        's',
        'sup',
        'sub',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'ul',
        'ol',
        'li',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
        'blockquote',
        'pre',
        'code',
        'img',
      ],
      ALLOWED_ATTR: ['src', 'alt', 'colspan', 'rowspan'],
    });
    const doc = new DOMParser().parseFromString(clean, 'text/html');
    doc.querySelectorAll('img').forEach((img) => {
      if (!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(img.getAttribute('src') || ''))
        img.remove();
    });
    return {
      kind: 'html',
      html: doc.body.innerHTML,
      note: 'Bản xem Word; một số chi tiết bố cục có thể khác file gốc.',
    };
  }
  if (extension === 'xlsx') {
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(new Uint8Array(buffer) as never);
    const sheets = book.worksheets
      .slice(0, 30)
      .map((sheet) => ({
        name: sheet.name,
        rows: Array.from({ length: Math.min(1000, sheet.rowCount) }, (_, i) =>
          Array.from(
            { length: Math.min(50, sheet.columnCount) },
            (_, j) => sheet.getRow(i + 1).getCell(j + 1).text,
          ),
        ),
      }));
    return {
      kind: 'sheets',
      sheets,
      note: 'Chỉ hiển thị dữ liệu, không thực thi macro hoặc tính lại công thức. Tối đa 30 sheet, 1000 hàng và 50 cột.',
    };
  }
  // Entries bigger than 16 MiB are not extracted; archive previews are bounded.
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(new Uint8Array(buffer), {
    filter: (entry) => entry.originalSize <= 16 * 1024 * 1024,
  });
  const names = Object.keys(files)
    .filter((n) => !n.endsWith('/'))
    .slice(0, 2500);
  if (extension === 'zip' || extension === 'cbz')
    return {
      kind: 'archive',
      blob,
      entries: names.map((n) => ({ name: n, size: files[n].length, image: isImage(n) })),
      note:
        extension === 'cbz'
          ? 'Dùng mũi tên để chuyển trang truyện.'
          : 'Chỉ liệt kê và xem nhanh nội dung hỗ trợ.',
    };
  if (extension === 'pptx' || extension === 'odt' || extension === 'odp') {
    const selected = names
      .filter((name) =>
        extension === 'pptx' ? /^ppt\/slides\/slide\d+\.xml$/.test(name) : name === 'content.xml',
      )
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return {
      kind: 'chapters',
      chapters: selected.map((name, i) => {
        const doc = new DOMParser().parseFromString(strFromU8(files[name]), 'application/xml');
        const paragraphs = Array.from(doc.getElementsByTagNameNS('*', 'p'));
        return {
          name: extension === 'pptx' ? `Slide ${i + 1}` : 'Nội dung',
          text: paragraphs.map((p) => p.textContent || '').join('\n\n'),
        };
      }),
      note: 'Bản xem văn bản, không tái hiện hình ảnh hoặc hiệu ứng của slide.',
    };
  }
  return { kind: 'epub', blob };
}
function FontPreview({ blob }: { blob: Blob }) {
  const [family, setFamily] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    const name = `font-${crypto.randomUUID()}`;
    const font = new FontFace(name, `url(${url})`);
    let alive = true;
    font
      .load()
      .then((loaded) => {
        if (alive) {
          document.fonts.add(loaded);
          setFamily(name);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      document.fonts.delete(font);
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return (
    <div className="font-preview" style={{ fontFamily: family || 'inherit' }}>
      <p>ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>
      <p>abcdefghijklmnopqrstuvwxyz</p>
      <p>0123456789</p>
      <p>Tiếng Việt có dấu: Chào mừng đến IT Club!</p>
    </div>
  );
}
function EpubPreview({ blob }: { blob: Blob }) {
  const root = useRef<HTMLDivElement>(null);
  const bookRef = useRef<{
    prev: () => Promise<unknown>;
    next: () => Promise<unknown>;
    destroy: () => void;
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    let book:
      | {
          destroy: () => void;
          renderTo: (
            e: HTMLElement,
            options: object,
          ) => {
            display: () => Promise<unknown>;
            prev: () => Promise<unknown>;
            next: () => Promise<unknown>;
          };
        }
      | undefined;
    void import('epubjs')
      .then(({ default: ePub }) => {
        if (disposed || !root.current) return;
        return blob.arrayBuffer().then((buffer) => {
          if (disposed) return;
          const instance = ePub(buffer, { openAs: 'epub' });
          book = instance;
          const rendition = instance.renderTo(root.current!, {
            width: '100%',
            height: 570,
            allowScriptedContent: false,
          });
          bookRef.current = {
            prev: () => rendition.prev(),
            next: () => rendition.next(),
            destroy: () => book?.destroy(),
          };
          return rendition.display();
        });
      })
      .catch((err) => {
        if (!disposed) setError(String(err));
      });
    return () => {
      disposed = true;
      bookRef.current?.destroy();
      bookRef.current = null;
    };
  }, [blob]);
  return (
    <>
      <div className="preview-chapter-nav">
        <button onClick={() => void bookRef.current?.prev()}>
          <ChevronLeft size={16} /> Trang trước
        </button>
        <BookOpen size={17} />
        <button onClick={() => void bookRef.current?.next()}>
          Trang sau <ChevronRight size={16} />
        </button>
      </div>
      {error && <p className="alert">{error}</p>}
      <div ref={root} className="epub-stage" />
    </>
  );
}
function ArchivePreview({
  blob,
  entries,
  comic,
}: {
  blob: Blob;
  entries: { name: string; size: number; image: boolean }[];
  comic: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');
  const visible = comic ? entries.filter((e) => e.image) : entries;
  const current = visible[Math.min(selected, visible.length - 1)];
  useEffect(() => {
    let revoked = '';
    let disposed = false;
    setUrl('');
    setContent('');
    const run = async () => {
      if (!current) return;
      const { unzipSync, strFromU8 } = await import('fflate');
      const files = unzipSync(new Uint8Array(await blob.arrayBuffer()), {
        filter: (e) => e.originalSize <= 16 * 1024 * 1024,
      });
      const raw = files[current.name];
      if (!raw) return;
      if (current.image) {
        revoked = URL.createObjectURL(new Blob([new Uint8Array(raw) as BlobPart]));
        if (!disposed) setUrl(revoked);
      } else if (/\.(txt|md|json|csv|xml|log)$/i.test(current.name)) {
        if (!disposed) setContent(strFromU8(raw).slice(0, 120000));
      }
    };
    void run().catch(() => {});
    return () => {
      disposed = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [blob, current?.name, current?.image]);
  return (
    <div className="archive-preview">
      <div className="archive-sidebar">
        <strong>
          <FileArchive size={17} /> {entries.length} tệp
        </strong>
        {entries.map((entry) => {
          const target = visible.findIndex((e) => e.name === entry.name);
          return (
            <button
              key={entry.name}
              disabled={target === -1}
              className={entry.name === current?.name ? 'current' : ''}
              onClick={() => setSelected(target)}
              title={entry.name}
            >
              {entry.name}
            </button>
          );
        })}
      </div>
      <div className="archive-main">
        <div className="preview-chapter-nav">
          <button disabled={selected === 0} onClick={() => setSelected((s) => Math.max(0, s - 1))}>
            <ChevronLeft size={16} /> Trước
          </button>
          {visible.length ? `${selected + 1}/${visible.length}` : 'Không có tệp'}
          <button
            disabled={selected >= visible.length - 1}
            onClick={() => setSelected((s) => Math.min(visible.length - 1, s + 1))}
          >
            Sau <ChevronRight size={16} />
          </button>
        </div>
        {url && <img className="archive-image" src={url} alt={current?.name || ''} />}
        {content && <pre className="preview-source">{content}</pre>}
        {!url && !content && (
          <div className="preview-empty">
            <FileArchive size={36} /> {current?.name || 'Không có tệp hỗ trợ xem trước'}{' '}
            <p>Các tệp nhị phân khác cần tải xuống.</p>
          </div>
        )}
      </div>
    </div>
  );
}
export function DocumentPreview({
  src,
  name,
  extension,
  size,
}: {
  src: string;
  name: string;
  extension: string;
  size: number;
}) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    const control = new AbortController();
    setData(null);
    setError('');
    setLoading(true);
    setSelected(0);
    if (size > MAX) {
      setLoading(false);
      setError('Tệp vượt giới hạn 25 MB cho xem trước tài liệu');
      return () => control.abort();
    }
    void readBlob(src, MAX, control.signal)
      .then((blob) => parseData(blob, extension))
      .then((result) => {
        if (!control.signal.aborted) setData(result);
      })
      .catch((err) => {
        if (!control.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!control.signal.aborted) setLoading(false);
      });
    return () => control.abort();
  }, [src, extension, size]);
  if (loading)
    return (
      <div className="preview-loader">
        <LoaderCircle className="spin" size={23} /> Đang đọc {name}...
      </div>
    );
  if (error)
    return (
      <div className="preview-empty">
        <FileText size={38} />
        <p>{error}</p>
      </div>
    );
  if (!data) return null;
  return (
    <div className="preview-document">
      {data.note && <p className="preview-caption">{data.note}</p>}
      {data.kind === 'text' &&
        (extension === 'md' || extension === 'markdown' ? (
          <article className="doc-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.text || ''}</ReactMarkdown>
          </article>
        ) : (
          <pre className="preview-source">{data.text?.slice(0, 250000)}</pre>
        ))}
      {data.kind === 'html' && (
        <article className="doc-markdown" dangerouslySetInnerHTML={{ __html: data.html || '' }} />
      )}
      {data.kind === 'sheets' && (
        <>
          <div className="preview-tabs">
            {data.sheets?.map((s, i) => (
              <button
                className={selected === i ? 'current' : ''}
                key={i}
                onClick={() => setSelected(i)}
              >
                {s.name}
              </button>
            ))}
          </div>
          <div className="preview-sheet">
            <table>
              <tbody>
                {data.sheets?.[selected]?.rows.map((row, i) => (
                  <tr key={i}>
                    <th>{i + 1}</th>
                    {row.map((val, j) => (
                      <td key={j}>{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {data.kind === 'chapters' &&
        data.chapters?.map((v, i) => (
          <section key={i} className="document-chapter">
            <h3>{v.name}</h3>
            <pre>{v.text || 'Không có văn bản'}</pre>
          </section>
        ))}
      {data.kind === 'archive' && data.blob && (
        <ArchivePreview blob={data.blob} entries={data.entries || []} comic={extension === 'cbz'} />
      )}
      {data.kind === 'epub' && data.blob && <EpubPreview blob={data.blob} />}
      {data.kind === 'font' && data.blob && <FontPreview blob={data.blob} />}
    </div>
  );
}
