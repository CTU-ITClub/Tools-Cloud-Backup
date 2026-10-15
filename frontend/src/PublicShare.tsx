import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  LockKeyhole,
  Share2,
  Search,
} from "lucide-react";
import { api, post, bytes, date, ApiError, errorMessage } from "./api";
import { Logo, Notice, Spinner, Empty, FileIcon } from "./components";
import Preview from "./Preview";
import type { CloudNode, PublicShareData } from "./types";

export default function PublicShare({ token }: { token: string }) {
  const [data, setData] = useState<PublicShareData | null>(null);
  const [node, setNode] = useState<string | null>(null);
  const [trail, setTrail] = useState<{ id: string | null; name: string }[]>([]);
  const [query, setQuery] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<CloudNode | null>(null);
  const sequence = useRef(0);
  const passwordInput = useRef<HTMLInputElement>(null);

  const base = `/api/public/shares/${encodeURIComponent(token)}`;
  const stream = (id: string, download = false) =>
    `${base}/stream?node=${encodeURIComponent(id)}${download ? "&download=true" : ""}`;

  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const result = await api<PublicShareData>(
        `${base}${node ? `?node=${encodeURIComponent(node)}` : ""}`,
      );
      if (request === sequence.current) {
        setData(result);
        setLocked(false);
      }
    } catch (err) {
      if (request !== sequence.current) return;
      setData(null);
      if (err instanceof ApiError && err.status === 401) setLocked(true);
      else setError(errorMessage(err));
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [base, node]);

  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await post(`${base}/unlock`, { password });
      setPassword("");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError && (err.status === 401 || err.status === 403)
          ? "Mật khẩu chia sẻ không đúng. Vui lòng thử lại."
          : errorMessage(err),
      );
      passwordInput.current?.focus();
      passwordInput.current?.select();
    } finally {
      setBusy(false);
    }
  }

  const visibleChildren =
    data?.children.filter(
      (item) =>
        !query.trim() || item.name.toLowerCase().includes(query.toLowerCase()),
    ) || [];
  const previewableSiblings = visibleChildren.filter(
    (item) => item.kind === "file",
  );

  return (
    <div className="public-page">
      <header>
        <Logo />
        <span className="tag">
          <Share2 size={13} /> Liên kết chia sẻ công khai
        </span>
      </header>
      <main>
        {locked ? (
          <section className="share-unlock">
            <div className="share-lock-icon">
              <LockKeyhole size={30} />
            </div>
            <h1>Nội dung được bảo vệ</h1>
            <p>
              Nhập mật khẩu do người chia sẻ cung cấp để mở nội dung. Bạn không
              cần tài khoản ITClub Cloud.
            </p>
            <form className="form-stack" onSubmit={unlock}>
              <label htmlFor="share-password">Mật khẩu chia sẻ</label>
              <div className="password-field">
                <input
                  id="share-password"
                  ref={passwordInput}
                  autoFocus
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="off"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  aria-invalid={!!error}
                  aria-describedby={error ? "share-error" : undefined}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {error && (
                <div id="share-error" role="alert">
                  <Notice error>{error}</Notice>
                </div>
              )}
              <button
                className="button primary full"
                disabled={busy || !password}
              >
                {busy ? (
                  <>
                    <Spinner /> Đang xác thực…
                  </>
                ) : (
                  <>
                    <LockKeyhole size={17} /> Mở liên kết
                  </>
                )}
              </button>
            </form>
          </section>
        ) : loading ? (
          <div className="loading">
            <Spinner /> Đang tải nội dung chia sẻ…
          </div>
        ) : (
          data && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">CHIA SẺ QUA ITCLUB CLOUD</span>
                  <h1>{data.node.name}</h1>
                  <p>
                    {data.node.kind === "folder"
                      ? `${data.children.length} mục trong thư mục`
                      : `${bytes(data.node.size)} · Cập nhật ${date(data.node.updated_at)}`}
                  </p>
                </div>
                {data.node.kind === "file" && (
                  <div className="button-row">
                    <button
                      className="button"
                      onClick={() => setPreview(data.node)}
                    >
                      <Eye size={17} /> Xem trực tuyến
                    </button>
                    <a
                      className="button primary"
                      href={stream(data.node.id, true)}
                    >
                      <Download size={17} /> Tải xuống
                    </a>
                  </div>
                )}
              </div>

              {data.node.kind === "folder" && (
                <div className="file-toolbar">
                  <div className="breadcrumbs">
                    {trail.length > 0 && (
                      <button
                        className="button small mr-2"
                        onClick={() => {
                          const prev = trail.at(-1);
                          setNode(prev ? prev.id : null);
                          setTrail((current) => current.slice(0, -1));
                          setQuery("");
                        }}
                      >
                        <ChevronLeft size={15} /> Quay lại
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setNode(null);
                        setTrail([]);
                        setQuery("");
                      }}
                    >
                      Thư mục gốc
                    </button>
                    {trail.slice(1).map((item, idx) => (
                      <span key={idx} className="flex items-center gap-2">
                        <ChevronRight size={14} />
                        <button
                          onClick={() => {
                            setNode(item.id);
                            setTrail((current) => current.slice(0, idx + 2));
                            setQuery("");
                          }}
                        >
                          {item.name}
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="search-field audit-search">
                    <Search size={15} />
                    <input
                      placeholder="Tìm trong thư mục chia sẻ…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {data.node.kind === "file" ? (
                <div className="shared-file">
                  <FileIcon node={data.node} size={64} />
                  <h2>{data.node.name}</h2>
                  <p className="muted mb-5">
                    {bytes(data.node.size)} · {data.node.mime}
                  </p>
                  <div className="button-row justify-center">
                    <button
                      className="button"
                      onClick={() => setPreview(data.node)}
                    >
                      <Eye size={17} /> Xem trước nội dung
                    </button>
                    <a
                      className="button primary"
                      href={stream(data.node.id, true)}
                    >
                      <Download size={17} /> Tải xuống thiết bị
                    </a>
                  </div>
                </div>
              ) : (
                <div className="shared-list">
                  {visibleChildren.map((n) => (
                    <div className="shared-row" key={n.id}>
                      <button
                        className="shared-row-main"
                        onClick={() => {
                          if (n.kind === "folder") {
                            setTrail((current) => [
                              ...current,
                              { id: node, name: data.node.name },
                            ]);
                            setNode(n.id);
                            setQuery("");
                          } else {
                            setPreview(n);
                          }
                        }}
                      >
                        <FileIcon node={n} />
                        <strong>{n.name}</strong>
                        <span>
                          {n.kind === "folder" ? "Thư mục" : bytes(n.size)}
                        </span>
                      </button>
                      {n.kind === "file" ? (
                        <a
                          className="icon-button"
                          href={stream(n.id, true)}
                          title={`Tải xuống ${n.name}`}
                        >
                          <Download size={17} />
                        </a>
                      ) : (
                        <ChevronRight size={18} />
                      )}
                    </div>
                  ))}
                  {!visibleChildren.length && (
                    <Empty>Không có mục nào trong thư mục này.</Empty>
                  )}
                </div>
              )}
            </>
          )
        )}
        {!locked && error && <Notice error>{error}</Notice>}
      </main>
      <footer>Lưu trữ và chia sẻ an toàn với ITClub Cloud.</footer>
      {preview && (
        <Preview
          key={preview.id}
          node={preview}
          url={stream(preview.id)}
          downloadURL={stream(preview.id, true)}
          shared
          siblings={previewableSiblings}
          onSelectNode={setPreview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
