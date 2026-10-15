import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Folder,
  Images,
  ListTodo,
  Share2,
  Trash2,
  Settings2,
  UsersRound,
  Search,
  Upload,
  FolderPlus,
  LayoutGrid,
  List,
  ChevronRight,
  MoreHorizontal,
  X,
  LogOut,
  Menu,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Cloud,
  FilePlus2,
  ArrowUpDown,
  FolderInput,
  Copy,
  CornerLeftUp,
  Download,
} from "lucide-react";
import {
  api,
  post,
  put,
  del,
  bytes,
  date,
  relativeTime,
  streamURL,
  errorMessage,
} from "./api";
import {
  Logo,
  Spinner,
  FileIcon,
  Modal,
  Notice,
  Empty,
  CopyField,
  Auth,
} from "./components";
import { uploadBatch } from "./upload";
import Settings, { Users } from "./Settings";
import Preview from "./Preview";
import Tasks from "./Tasks";
import { useJobs } from "./useJobs";
import TransferTray from "./TransferTray";
import PublicShare from "./PublicShare";
import type {
  User,
  AuthStatus,
  Listing,
  ShareLink,
  CloudNode,
  Breadcrumb,
  Action,
  Notify,
  UploadState,
  UploadProgress,
  SortField,
  SortOrder,
  FileCategory,
} from "./types";
import type { LucideIcon } from "lucide-react";

type Page =
  "files" | "media" | "jobs" | "shares" | "trash" | "settings" | "users";
type ModalConfig =
  | { type: "folder"; node?: never; ids?: never }
  | {
      type: "rename" | "move" | "copy" | "share" | "info";
      node: CloudNode;
      ids?: never;
    }
  | { type: "batch-move" | "batch-copy"; node?: never; ids: string[] };

const navigation: [Page, LucideIcon, string][] = [
  ["files", Folder, "Tệp của tôi"],
  ["media", Images, "Thư viện media"],
  ["jobs", ListTodo, "Tác vụ tải lên"],
  ["shares", Share2, "Đã chia sẻ"],
  ["trash", Trash2, "Thùng rác"],
];

const pageNames: Record<Page, string> = {
  files: "Tệp của tôi",
  media: "Thư viện media",
  jobs: "Tác vụ tải lên",
  shares: "Đã chia sẻ",
  trash: "Thùng rác",
  settings: "Cài đặt",
  users: "Thành viên",
};

const categoryLabels: [FileCategory, string][] = [
  ["all", "Tất cả"],
  ["folder", "Thư mục"],
  ["video", "Video"],
  ["image", "Hình ảnh"],
  ["audio", "Âm thanh"],
  ["document", "Tài liệu"],
  ["archive", "File nén"],
];

function matchCategory(node: CloudNode, cat: FileCategory): boolean {
  if (cat === "all") return true;
  if (cat === "folder") return node.kind === "folder";
  if (node.kind === "folder") return false;
  const name = node.name.toLowerCase();
  const mime = node.mime || "";
  if (cat === "video")
    return (
      mime.startsWith("video/") || /\.(mp4|webm|mkv|mov|m4v|ogv)$/.test(name)
    );
  if (cat === "image")
    return (
      mime.startsWith("image/") ||
      /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/.test(name)
    );
  if (cat === "audio")
    return (
      mime.startsWith("audio/") ||
      /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/.test(name)
    );
  if (cat === "archive") return /\.(zip|cbz|rar|7z|tar|gz|bz2|xz)$/.test(name);
  if (cat === "document")
    return (
      mime.startsWith("text/") ||
      /\.(pdf|epub|docx?|xlsx?|pptx?|odt|odp|txt|md|markdown|json|csv|tsv|xml|html?|ya?ml|toml|sql|log|srt|vtt)$/.test(
        name,
      )
    );
  return false;
}

export default function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [error, setError] = useState("");
  const shareMatch = window.location.pathname.match(
    /^\/s\/([A-Za-z0-9_-]+)\/?$/,
  );

  useEffect(() => {
    if (!shareMatch) {
      api<AuthStatus>("/api/auth/status")
        .then(setAuth)
        .catch((e) => setError(errorMessage(e)));
    }
  }, []);

  if (shareMatch) return <PublicShare token={shareMatch[1]} />;
  if (error) {
    return (
      <div className="loading full-height">
        <Notice error>{error}</Notice>
        <button className="button primary" onClick={() => location.reload()}>
          Tải lại trang
        </button>
      </div>
    );
  }
  if (!auth) {
    return (
      <div className="loading full-height">
        <Logo />
        <Spinner />
      </div>
    );
  }
  if (!auth.user) {
    return (
      <Auth
        setup={auth.setup_required}
        version={auth.version}
        onLogin={(user) =>
          setAuth({ setup_required: false, user, version: auth.version })
        }
      />
    );
  }
  return (
    <Workspace
      user={auth.user}
      onLogout={() =>
        setAuth({ setup_required: false, user: null, version: auth.version })
      }
    />
  );
}

function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [page, setPage] = useState<Page>("files");
  const [parent, setParent] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<FileCategory>("all");
  const [sortField, setSortField] = useState<SortField>(
    (localStorage.getItem("tc:sortField") as SortField) || "name",
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    (localStorage.getItem("tc:sortOrder") as SortOrder) || "asc",
  );
  const [listing, setListing] = useState<Listing>({
    nodes: [],
    breadcrumbs: [],
    used_bytes: 0,
    limit: 2000,
  });
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [shareQuery, setShareQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [view, setView] = useState<"grid" | "list">(
    localStorage.getItem("tc:view") === "list" ? "list" : "grid",
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalConfig | null>(null);
  const [preview, setPreview] = useState<CloudNode | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState(false);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [dragging, setDragging] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<CloudNode | null>(null);

  const uploadControl = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const replaceInput = useRef<HTMLInputElement | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const notify = useCallback<Notify>((message, error = false) => {
    setToast({ message, error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), error ? 9000 : 4500);
  }, []);

  const filesPage = ["files", "media", "trash"].includes(page);
  const fileRequest = useRef<AbortController | null>(null);
  useEffect(() => () => fileRequest.current?.abort(), []);

  const loadFiles = useCallback(async () => {
    fileRequest.current?.abort();
    const control = new AbortController();
    fileRequest.current = control;
    const params = new URLSearchParams();
    if (page === "trash") params.set("trash", "true");
    else if (search) params.set("q", search);
    else if (parent) params.set("parent", parent);
    try {
      const next = await api<Listing>(`/api/nodes?${params}`, {
        signal: control.signal,
      });
      if (!control.signal.aborted) setListing(next);
    } catch (error) {
      if (!control.signal.aborted) throw error;
    }
  }, [page, search, parent]);

  const {
    jobs,
    refresh: loadJobs,
    connected,
  } = useJobs(
    () => {
      if (filesPage)
        void loadFiles().catch((e) => notify(errorMessage(e), true));
    },
    (message) => notify(message, true),
  );

  const [transfers, setTransfers] = useState<Record<string, UploadProgress>>(
    {},
  );
  const loadShares = useCallback(
    () => api<ShareLink[]>("/api/shares").then(setShares),
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 260);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setSelected(new Set());
    setLoading(true);
    const task = filesPage
      ? loadFiles()
      : page === "shares"
        ? loadShares()
        : Promise.resolve();
    let current = true;
    task
      .catch((e) => {
        if (e.status === 401) onLogout();
        else notify(errorMessage(e), true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [page, parent, search]);

  useEffect(() => {
    if (!upload?.active) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    addEventListener("beforeunload", prevent);
    return () => removeEventListener("beforeunload", prevent);
  }, [upload?.active]);

  const activeJobs = jobs.filter(
    (j) =>
      !["done", "error", "cancelled", "interrupted", "staging"].includes(
        j.status,
      ),
  );

  const mediaFiltered = useMemo(
    () =>
      listing.nodes.filter(
        (n) =>
          page !== "media" ||
          n.kind === "folder" ||
          /^(video|audio|image)\//.test(n.mime) ||
          /\.(epub|cbz|pdf|mp4|mkv|webm|mp3|flac|wav|png|jpe?g|webp|gif)$/i.test(
            n.name,
          ),
      ),
    [listing.nodes, page],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<FileCategory, number> = {
      all: mediaFiltered.length,
      folder: 0,
      video: 0,
      image: 0,
      audio: 0,
      document: 0,
      archive: 0,
    };
    for (const node of mediaFiltered) {
      for (const [cat] of categoryLabels) {
        if (cat !== "all" && matchCategory(node, cat)) counts[cat]++;
      }
    }
    return counts;
  }, [mediaFiltered]);

  const visible = useMemo(() => {
    const filtered = mediaFiltered.filter((n) => matchCategory(n, category));
    return [...filtered].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      let cmp = 0;
      if (sortField === "name") {
        cmp = a.name.localeCompare(b.name, "vi", {
          numeric: true,
          sensitivity: "base",
        });
      } else if (sortField === "size") {
        cmp = a.size - b.size;
      } else {
        cmp = a.updated_at - b.updated_at;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [mediaFiltered, category, sortField, sortOrder]);

  const previewableSiblings = useMemo(
    () => visible.filter((n) => n.kind === "file"),
    [visible],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.isContentEditable);

      if (
        (e.key === "/" ||
          ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) &&
        !inInput
      ) {
        e.preventDefault();
        searchInput.current?.focus();
        return;
      }
      if (e.key === "Escape" && !modal && !preview) {
        if (menu) setMenu(null);
        else if (selected.size > 0) setSelected(new Set());
        return;
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "a" &&
        !inInput &&
        filesPage &&
        !modal &&
        !preview
      ) {
        e.preventDefault();
        setSelected(new Set(visible.map((n) => n.id)));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filesPage, visible, modal, preview, menu, selected.size]);

  function go(next: Page) {
    setPage(next);
    setParent(null);
    setQuery("");
    setCategory("all");
    setSidebar(false);
    setMenu(null);
  }

  function open(node: CloudNode) {
    if (node.kind === "folder") {
      setParent(node.id);
      setQuery("");
      setCategory("all");
    } else {
      setPreview(node);
    }
  }

  const action: Action = async (fn, message) => {
    try {
      await fn();
      if (message) notify(message);
      if (filesPage) await loadFiles();
      if (page === "shares") await loadShares();
      await loadJobs();
      setSelected(new Set());
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };

  async function startUpload(
    fileList: FileList | null,
    replaceId?: string | null,
  ) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    if (uploadControl.current) {
      notify(
        "Một lượt upload đang chạy. Đợi hoặc tạm dừng trước khi thêm file.",
        true,
      );
      return;
    }
    const control = new AbortController();
    uploadControl.current = control;
    setUpload({
      active: true,
      percent: 0,
      name: files[0].name,
      count: files.length,
    });
    try {
      await uploadBatch(
        files,
        parent,
        user,
        control.signal,
        (progress) => {
          setUpload((current) =>
            current ? { ...current, ...progress } : current,
          );
          if (progress.id)
            setTransfers((current) => ({
              ...current,
              [progress.id!]: progress,
            }));
        },
        replaceId,
      );
      if (!control.signal.aborted) {
        notify(
          replaceId
            ? "Đã nhận phiên bản mới. Đang cập nhật lên Telegram."
            : "Đã gửi file lên máy chủ. Theo dõi lưu Telegram trong Tác vụ.",
        );
      }
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      uploadControl.current = null;
      setReplaceTarget(null);
      setUpload((current) =>
        current
          ? {
              ...current,
              active: false,
              message: control.signal.aborted
                ? "Đã tạm dừng. Chọn lại cùng file để tiếp tục."
                : "Đã hoàn tất gửi lên máy chủ.",
            }
          : current,
      );
      loadJobs().catch(() => {});
    }
  }

  function select(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  function batchDelete(permanent = false) {
    if (
      !confirm(
        permanent
          ? `Xóa vĩnh viễn ${selected.size} mục đã chọn? Dữ liệu trên Telegram sẽ bị thu hồi.`
          : `Chuyển ${selected.size} mục đã chọn vào thùng rác?`,
      )
    )
      return;
    action(async () => {
      for (const id of selected)
        await del(`/api/nodes/${id}${permanent ? "/permanent" : ""}`);
    }, "Đã xóa các mục đã chọn");
  }

  function triggerReplace(node: CloudNode) {
    setReplaceTarget(node);
    setModal(null);
    setMenu(null);
    setTimeout(() => replaceInput.current?.click(), 50);
  }

  function nodeActions(node: CloudNode) {
    return (
      <div className="context-menu" role="menu">
        {page === "trash" ? (
          <>
            <button
              onClick={() => {
                setMenu(null);
                action(
                  () => post(`/api/nodes/${node.id}/restore`),
                  "Đã khôi phục mục",
                );
              }}
            >
              Khôi phục
            </button>
            <button
              className="danger"
              onClick={() => {
                setMenu(null);
                if (confirm(`Xóa vĩnh viễn "${node.name}"?`))
                  action(
                    () => del(`/api/nodes/${node.id}/permanent`),
                    "Đã xóa vĩnh viễn",
                  );
              }}
            >
              Xóa vĩnh viễn
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                setMenu(null);
                open(node);
              }}
            >
              {node.kind === "folder" ? "Mở thư mục" : "Xem trước"}
            </button>
            <a
              href={
                node.kind === "folder"
                  ? `/api/nodes/${node.id}/zip`
                  : streamURL(node.id, true)
              }
              onClick={() => setMenu(null)}
            >
              Tải {node.kind === "folder" ? "nén (.ZIP)" : "xuống"}
            </a>
            <button
              onClick={() => {
                setMenu(null);
                setModal({ type: "share", node });
              }}
            >
              Chia sẻ liên kết
            </button>
            <button
              onClick={() => {
                setMenu(null);
                setModal({ type: "info", node });
              }}
            >
              Chi tiết & Phiên bản
            </button>
            {node.kind === "file" && (
              <button onClick={() => triggerReplace(node)}>
                Tải bản mới (Ghi đè)
              </button>
            )}
            <button
              onClick={() => {
                setMenu(null);
                setModal({ type: "rename", node });
              }}
            >
              Đổi tên
            </button>
            <button
              onClick={() => {
                setMenu(null);
                setModal({ type: "move", node });
              }}
            >
              Di chuyển đến…
            </button>
            <button
              onClick={() => {
                setMenu(null);
                setModal({ type: "copy", node });
              }}
            >
              Tạo bản sao…
            </button>
            <button
              className="danger"
              onClick={() => {
                setMenu(null);
                action(
                  () => del(`/api/nodes/${node.id}`),
                  "Đã chuyển vào thùng rác",
                );
              }}
            >
              Chuyển vào thùng rác
            </button>
          </>
        )}
      </div>
    );
  }

  const visibleShares = shares.filter(
    (s) =>
      !shareQuery.trim() ||
      s.name.toLowerCase().includes(shareQuery.toLowerCase()),
  );

  return (
    <div className="app-shell" onClick={() => menu && setMenu(null)}>
      {sidebar && (
        <div className="sidebar-scrim" onClick={() => setSidebar(false)} />
      )}
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <Logo />
        <div className="workspace-label">KHÔNG GIAN CỦA BẠN</div>
        <nav>
          {navigation.map(([id, Icon, title]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              {title}
              {id === "jobs" && activeJobs.length > 0 && (
                <span className="nav-count">{activeJobs.length}</span>
              )}
            </button>
          ))}
          <div className="nav-divider" />
          <button
            className={page === "settings" ? "active" : ""}
            onClick={() => go("settings")}
          >
            <Settings2 size={19} />
            Cài đặt
          </button>
          {user.role === "admin" && (
            <button
              className={page === "users" ? "active" : ""}
              onClick={() => go("users")}
            >
              <UsersRound size={19} />
              Thành viên
            </button>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="storage-summary">
            <Cloud size={19} />
            <strong>Lưu trữ Telegram</strong>
            <p>
              {bytes(listing.used_bytes)} <span>đang lưu</span>
            </p>
            {user.quota_bytes > 0 ? (
              <>
                <div className="progress">
                  <span
                    style={{
                      width: `${Math.min(100, (listing.used_bytes / user.quota_bytes) * 100)}%`,
                    }}
                  />
                </div>
                <small>Hạn mức: {bytes(user.quota_bytes)}</small>
              </>
            ) : (
              <small>Không giới hạn hạn mức</small>
            )}
          </div>
          <button className="profile" onClick={() => go("settings")}>
            <span className="avatar">
              {user.username.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <strong>{user.username}</strong>
              <small>
                {user.role === "admin" ? "Quản trị viên" : "Thành viên"}
              </small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setSidebar(true)}
            aria-label="Mở menu"
          >
            <Menu />
          </button>
          <div className="search-field">
            <Search size={18} />
            <input
              ref={searchInput}
              aria-label="Tìm file"
              placeholder="Tìm nhanh tệp hoặc thư mục (nhấn / hoặc Ctrl+K)…"
              value={query}
              onChange={(e) => {
                if (!filesPage || page === "trash") setPage("files");
                setQuery(e.target.value);
              }}
            />
            {query ? (
              <button
                className="icon-button"
                onClick={() => setQuery("")}
                aria-label="Xóa tìm kiếm"
              >
                <X size={15} />
              </button>
            ) : (
              <kbd className="shortcut-hint">/</kbd>
            )}
          </div>
          <span className="topbar-label">YOUR PERSONAL CLOUD</span>
          <button
            className="icon-button"
            title="Đăng xuất"
            onClick={() =>
              action(async () => {
                await post("/api/auth/logout");
                onLogout();
              })
            }
          >
            <LogOut size={18} />
          </button>
        </header>

        <main
          className="workspace-main"
          onDragOver={(e) => {
            if (
              ["files", "media"].includes(page) &&
              e.dataTransfer.types.includes("Files")
            ) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={(e) => {
            if (
              !(e.relatedTarget instanceof Node) ||
              !e.currentTarget.contains(e.relatedTarget)
            ) {
              setDragging(false);
            }
          }}
          onDrop={(e) => {
            if (!["files", "media"].includes(page)) return;
            e.preventDefault();
            setDragging(false);
            void startUpload(e.dataTransfer.files);
          }}
        >
          <div className="page-heading">
            <div>
              <span className="eyebrow">KHÔNG GIAN ĐÁM MÂY</span>
              <h1>
                {search && filesPage
                  ? `Tìm kiếm: "${search}"`
                  : pageNames[page]}
              </h1>
              <p>
                {page === "files"
                  ? "Tải tệp hoặc cả thư mục lên máy chủ và lưu trữ trực tiếp qua Telegram."
                  : page === "jobs"
                    ? "Theo dõi tiến trình tải lên 2 chặng: Thiết bị → Máy chủ → Telegram."
                    : page === "settings"
                      ? "Kết nối Telegram, khóa truy cập API/S3/WebDAV và bảo mật hệ thống."
                      : page === "media"
                        ? "Thư viện video, hình ảnh, âm nhạc, sách EPUB và truyện CBZ."
                        : page === "shares"
                          ? "Quản lý các liên kết chia sẻ công khai và thống kê lượt tải."
                          : page === "users"
                            ? "Quản trị tài khoản thành viên, hạn mức lưu trữ và thống kê lưu lượng."
                            : "Khôi phục dữ liệu đã xóa hoặc dọn dẹp vĩnh viễn."}
              </p>
            </div>
            {["files", "media"].includes(page) && (
              <div className="button-row">
                <button
                  className="button"
                  onClick={() => setModal({ type: "folder" })}
                >
                  <FolderPlus size={16} /> Thư mục mới
                </button>
                <button
                  className="button"
                  onClick={() => folderInput.current?.click()}
                >
                  <FilePlus2 size={16} /> Tải thư mục
                </button>
                <button
                  className="button primary"
                  onClick={() => input.current?.click()}
                >
                  <Upload size={16} /> Tải tệp lên
                </button>
              </div>
            )}
            {page === "trash" && listing.nodes.length > 0 && (
              <button
                className="button danger"
                onClick={() => {
                  if (confirm("Xóa vĩnh viễn toàn bộ dữ liệu trong thùng rác?"))
                    action(() => del("/api/trash"), "Đã dọn sạch thùng rác");
                }}
              >
                <Trash2 size={16} /> Dọn sạch thùng rác
              </button>
            )}
          </div>

          {filesPage && (
            <>
              <div className="file-toolbar">
                <div className="breadcrumbs">
                  {parent && page !== "trash" && (
                    <button
                      className="up-level-btn"
                      title="Lên thư mục cha"
                      onClick={() => {
                        const parentCrumb = listing.breadcrumbs.at(-2);
                        setParent(parentCrumb ? parentCrumb.id : null);
                        setQuery("");
                      }}
                    >
                      <CornerLeftUp size={15} /> Lên 1 cấp
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setParent(null);
                      setQuery("");
                    }}
                  >
                    <Folder size={16} />
                    {page === "trash" ? "Thùng rác" : "Thư mục gốc"}
                  </button>
                  {page !== "trash" &&
                    listing.breadcrumbs.map((n) => (
                      <React.Fragment key={n.id}>
                        <ChevronRight size={14} />
                        <button
                          onClick={() => {
                            setParent(n.id);
                            setQuery("");
                          }}
                        >
                          {n.name}
                        </button>
                      </React.Fragment>
                    ))}
                </div>

                <div className="button-row">
                  <div className="sort-controls">
                    <ArrowUpDown size={14} />
                    <select
                      aria-label="Sắp xếp theo"
                      value={`${sortField}:${sortOrder}`}
                      onChange={(e) => {
                        const [f, o] = e.target.value.split(":") as [
                          SortField,
                          SortOrder,
                        ];
                        setSortField(f);
                        setSortOrder(o);
                        localStorage.setItem("tc:sortField", f);
                        localStorage.setItem("tc:sortOrder", o);
                      }}
                    >
                      <option value="name:asc">Tên (A → Z)</option>
                      <option value="name:desc">Tên (Z → A)</option>
                      <option value="updated_at:desc">Mới cập nhật</option>
                      <option value="updated_at:asc">Cũ nhất</option>
                      <option value="size:desc">Kích thước (Lớn → Nhỏ)</option>
                      <option value="size:asc">Kích thước (Nhỏ → Lớn)</option>
                    </select>
                  </div>
                  <button
                    className="icon-button"
                    title="Làm mới danh sách"
                    onClick={() => action(loadFiles)}
                  >
                    <RefreshCw size={17} />
                  </button>
                  <div className="view-toggle">
                    {(
                      [
                        ["grid", LayoutGrid],
                        ["list", List],
                      ] as ["grid" | "list", LucideIcon][]
                    ).map(([id, Icon]) => (
                      <button
                        key={id}
                        className={view === id ? "active" : ""}
                        aria-label={id === "grid" ? "Dạng lưới" : "Danh sách"}
                        onClick={() => {
                          setView(id);
                          localStorage.setItem("tc:view", id);
                        }}
                      >
                        <Icon size={17} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {listing.nodes.length > 0 && (
                <div className="category-bar">
                  {categoryLabels.map(([cat, label]) => {
                    const count = categoryCounts[cat];
                    if (cat !== "all" && count === 0 && category !== cat)
                      return null;
                    return (
                      <button
                        key={cat}
                        type="button"
                        className={`category-pill ${category === cat ? "active" : ""}`}
                        onClick={() => setCategory(cat)}
                      >
                        <span>{label}</span>
                        <small>{count}</small>
                      </button>
                    );
                  })}
                </div>
              )}

              {selected.size > 0 && (
                <div className="selection-bar">
                  <strong>Đã chọn {selected.size} mục</strong>
                  <button
                    onClick={() =>
                      setSelected(
                        selected.size === visible.length
                          ? new Set()
                          : new Set(visible.map((n) => n.id)),
                      )
                    }
                  >
                    {selected.size === visible.length
                      ? "Bỏ chọn tất cả"
                      : "Chọn tất cả"}
                  </button>
                  {selected.size < visible.length && (
                    <button onClick={() => setSelected(new Set())}>
                      Bỏ chọn
                    </button>
                  )}
                  <div className="flex-1" />
                  {page === "trash" ? (
                    <button
                      onClick={() =>
                        action(async () => {
                          for (const id of selected)
                            await post(`/api/nodes/${id}/restore`);
                        }, `Đã khôi phục ${selected.size} mục`)
                      }
                    >
                      <RefreshCw size={15} /> Khôi phục
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() =>
                          setModal({
                            type: "batch-move",
                            ids: Array.from(selected),
                          })
                        }
                      >
                        <FolderInput size={15} /> Di chuyển ({selected.size})
                      </button>
                      <button
                        onClick={() =>
                          setModal({
                            type: "batch-copy",
                            ids: Array.from(selected),
                          })
                        }
                      >
                        <Copy size={15} /> Sao chép ({selected.size})
                      </button>
                    </>
                  )}
                  <button
                    className="danger"
                    onClick={() => batchDelete(page === "trash")}
                  >
                    <Trash2 size={15} /> Xóa
                    {page === "trash" ? " vĩnh viễn" : ""}
                  </button>
                </div>
              )}

              {loading ? (
                <div
                  className={`file-skeletons ${view}`}
                  aria-label="Đang tải thư viện"
                  aria-busy="true"
                >
                  {Array.from({ length: 8 }, (_, index) => (
                    <div className="file-skeleton" key={index}>
                      <span />
                      <i />
                      <i />
                    </div>
                  ))}
                </div>
              ) : visible.length === 0 ? (
                <Empty
                  title={
                    search
                      ? "Không tìm thấy kết quả phù hợp"
                      : category !== "all"
                        ? "Không có mục nào thuộc phân loại này"
                        : page === "trash"
                          ? "Thùng rác đang trống"
                          : "Thư mục này chưa có tệp nào"
                  }
                  action={
                    ["files", "media"].includes(page) &&
                    !search &&
                    category === "all" ? (
                      <div className="button-row justify-center">
                        <button
                          className="button primary"
                          onClick={() => input.current?.click()}
                        >
                          <Upload size={16} /> Tải tệp lên
                        </button>
                        <button
                          className="button"
                          onClick={() => folderInput.current?.click()}
                        >
                          <FilePlus2 size={16} /> Tải cả thư mục
                        </button>
                      </div>
                    ) : category !== "all" ? (
                      <button
                        className="button"
                        onClick={() => setCategory("all")}
                      >
                        Xem tất cả phân loại
                      </button>
                    ) : undefined
                  }
                >
                  {search
                    ? "Thử tìm kiếm với từ khóa khác hoặc kiểm tra trong Thùng rác."
                    : "Kéo thả tệp trực tiếp vào màn hình này hoặc chọn tải lên từ thiết bị."}
                </Empty>
              ) : (
                <>
                  {view === "list" && (
                    <div className="list-head">
                      <input
                        type="checkbox"
                        aria-label="Chọn tất cả"
                        checked={
                          visible.length > 0 &&
                          visible.every((n) => selected.has(n.id))
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? new Set(visible.map((n) => n.id))
                              : new Set(),
                          )
                        }
                      />
                      <span>Tên mục</span>
                      <span>Kích thước</span>
                      <span>Cập nhật</span>
                      <span />
                    </div>
                  )}
                  <div className={`file-container ${view}`}>
                    {visible.map((node) => (
                      <article
                        key={node.id}
                        className={`file-item ${selected.has(node.id) ? "selected" : ""} ${
                          node.kind === "folder" ? "folder" : ""
                        }`}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenu(node.id);
                        }}
                      >
                        <input
                          className="file-check"
                          type="checkbox"
                          checked={selected.has(node.id)}
                          onChange={(e) => select(node.id, e.target.checked)}
                          aria-label={`Chọn ${node.name}`}
                        />
                        <button
                          className="file-open"
                          title={node.name}
                          onClick={() =>
                            page === "trash"
                              ? setModal({ type: "info", node })
                              : open(node)
                          }
                        >
                          <span
                            className={`file-visual ${node.mime?.split("/")[0] || ""}`}
                          >
                            <FileIcon
                              node={node}
                              size={view === "grid" ? 36 : 24}
                            />
                            {view === "grid" &&
                              (node.mime?.startsWith("video/") ||
                                node.mime?.startsWith("image/")) && (
                                <img
                                  loading="lazy"
                                  src={`/api/nodes/${node.id}/thumbnail`}
                                  alt=""
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              )}
                          </span>
                          <span className="file-name">{node.name}</span>
                        </button>
                        <span className="file-size">
                          {node.kind === "folder"
                            ? "Thư mục"
                            : bytes(node.size)}
                        </span>
                        <span
                          className="file-date"
                          title={date(node.updated_at)}
                        >
                          {relativeTime(node.updated_at)}
                        </span>
                        <div
                          className="file-more"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="icon-button"
                            title={`Tùy chọn ${node.name}`}
                            onClick={() =>
                              setMenu(menu === node.id ? null : node.id)
                            }
                          >
                            <MoreHorizontal size={19} />
                          </button>
                          {menu === node.id && nodeActions(node)}
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="listing-foot">
                    Hiển thị {visible.length} mục (Tổng dung lượng thư mục hiện
                    tại:{" "}
                    {bytes(
                      visible.reduce(
                        (sum, n) => sum + (n.kind === "file" ? n.size : 0),
                        0,
                      ),
                    )}
                    )
                    {listing.nodes.length >= listing.limit &&
                      " · Đã chạm giới hạn hiển thị 2.000 mục; hãy dùng thanh tìm kiếm để lọc."}
                  </div>
                </>
              )}
            </>
          )}

          {page === "jobs" && (
            <Tasks
              jobs={jobs}
              action={action}
              connected={connected}
              onTriggerUpload={() => input.current?.click()}
            />
          )}

          {page === "shares" && (
            <div className="flex flex-col gap-4">
              {shares.length > 0 && (
                <div className="file-toolbar">
                  <div className="search-field audit-search">
                    <Search size={15} />
                    <input
                      placeholder="Tìm liên kết chia sẻ theo tên tệp…"
                      value={shareQuery}
                      onChange={(e) => setShareQuery(e.target.value)}
                    />
                  </div>
                  <span className="muted">
                    {visibleShares.length} liên kết đang hoạt động
                  </span>
                </div>
              )}
              {!visibleShares.length && (
                <Empty icon={Share2} title="Chưa có liên kết chia sẻ nào">
                  Nhấn chuột phải hoặc mở menu (⋯) trên bất kỳ tệp hoặc thư mục
                  nào và chọn Chia sẻ liên kết.
                </Empty>
              )}
              {visibleShares.map((s) => (
                <div className="share-card" key={s.token}>
                  <div className="share-icon">
                    <Share2 />
                  </div>
                  <div className="share-details">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{s.name}</strong>
                      <span className="tag">
                        {s.protected ? "🔒 Có mật khẩu" : "🌐 Công khai"}
                      </span>
                    </div>
                    <p>
                      {s.downloads} lượt tải xuống ·{" "}
                      {s.expires_at
                        ? `Hết hạn: ${date(s.expires_at)}`
                        : "Vĩnh viễn (Không hết hạn)"}
                    </p>
                    <CopyField value={s.url} />
                  </div>
                  <button
                    className="icon-button danger"
                    title="Thu hồi liên kết chia sẻ"
                    onClick={() => {
                      if (confirm(`Thu hồi liên kết chia sẻ của "${s.name}"?`))
                        action(
                          () => del(`/api/shares/${s.token}`),
                          "Đã thu hồi liên kết chia sẻ",
                        );
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {page === "settings" && (
            <Settings user={user} notify={notify} onLogout={onLogout} />
          )}
          {page === "users" && user.role === "admin" && (
            <Users notify={notify} />
          )}

          {dragging && (
            <div className="drop-overlay">
              <Upload size={46} />
              <h2>Thả tệp vào đây để tải lên</h2>
              <p>Tệp sẽ được lưu vào thư mục đang mở hiện tại</p>
            </div>
          )}
        </main>
      </div>

      <input
        hidden
        ref={input}
        type="file"
        multiple
        onChange={(e) => {
          void startUpload(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={folderInput}
        type="file"
        multiple
        webkitdirectory=""
        onChange={(e) => {
          void startUpload(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={replaceInput}
        type="file"
        onChange={(e) => {
          if (replaceTarget && e.target.files?.length) {
            void startUpload(e.target.files, replaceTarget.id);
          }
          e.target.value = "";
        }}
      />

      {toast && (
        <div className={`toast ${toast.error ? "error" : ""}`} role="status">
          {toast.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} aria-label="Đóng">
            <X size={16} />
          </button>
        </div>
      )}

      {(upload || Object.keys(transfers).length > 0) && (
        <TransferTray
          upload={upload}
          transfers={transfers}
          jobs={jobs}
          onPause={() => uploadControl.current?.abort()}
          onClose={() => {
            setUpload(null);
            setTransfers({});
          }}
          onJobs={() => go("jobs")}
        />
      )}

      {preview && (
        <Preview
          key={preview.id}
          node={preview}
          siblings={previewableSiblings}
          onSelectNode={setPreview}
          onClose={() => setPreview(null)}
        />
      )}

      {modal && (
        <ActionModal
          config={modal}
          parent={parent}
          onClose={() => setModal(null)}
          onReplace={triggerReplace}
          onShare={(node) => setModal({ type: "share", node })}
          onDone={async (msg) => {
            setModal(null);
            await action(async () => {}, msg || "Đã thực hiện");
          }}
        />
      )}
    </div>
  );
}

function ActionModal({
  config,
  parent,
  onClose,
  onReplace,
  onShare,
  onDone,
}: {
  config: ModalConfig;
  parent: string | null;
  onClose: () => void;
  onReplace: (node: CloudNode) => void;
  onShare: (node: CloudNode) => void;
  onDone: (message?: string) => Promise<void>;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState(config.node?.name || "");
  const [password, setPassword] = useState("");
  const [days, setDays] = useState("7");
  const [result, setResult] = useState<{
    url: string;
    direct_url?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [destination, setDestination] = useState<string | null>(null);
  const [folders, setFolders] = useState<CloudNode[]>([]);
  const [crumbs, setCrumbs] = useState<Breadcrumb[]>([]);

  const type = config.type;
  const node = config.node;
  const batchIds = config.ids || [];

  const titles: Record<ModalConfig["type"], string> = {
    folder: "Tạo thư mục mới",
    rename: "Đổi tên mục",
    move: "Di chuyển đến thư mục",
    copy: "Tạo bản sao vào thư mục",
    share: "Tạo liên kết chia sẻ",
    info: "Thông tin chi tiết",
    "batch-move": `Di chuyển ${batchIds.length} mục đã chọn`,
    "batch-copy": `Sao chép ${batchIds.length} mục đã chọn`,
  };

  useEffect(() => {
    if (["move", "copy", "batch-move", "batch-copy"].includes(type)) {
      api<Listing>(`/api/nodes${destination ? `?parent=${destination}` : ""}`)
        .then((r) => {
          const excluded = new Set(node ? [node.id] : batchIds);
          setFolders(
            r.nodes.filter((n) => n.kind === "folder" && !excluded.has(n.id)),
          );
          setCrumbs(r.breadcrumbs);
        })
        .catch((e) => setError(errorMessage(e)));
    }
  }, [destination, type]);

  if (type === "info" && node) {
    return (
      <Modal
        title="Chi tiết mục lưu trữ"
        subtitle={node.name}
        onClose={onClose}
      >
        <div className="info-grid">
          <div>
            <span>Tên mục</span>
            <strong>{node.name}</strong>
          </div>
          <div>
            <span>Phân loại</span>
            <strong>
              {node.kind === "folder" ? "Thư mục" : `Tệp (${node.mime})`}
            </strong>
          </div>
          {node.kind === "file" && (
            <div>
              <span>Kích thước</span>
              <strong>
                {bytes(node.size)} ({node.size.toLocaleString("vi-VN")} byte)
              </strong>
            </div>
          )}
          <div>
            <span>Ngày tạo</span>
            <strong>{date(node.created_at)}</strong>
          </div>
          <div>
            <span>Cập nhật lần cuối</span>
            <strong>{date(node.updated_at)}</strong>
          </div>
          {node.etag && (
            <div>
              <span>Mã băm toàn vẹn (SHA-256 / ETag)</span>
              <CopyField value={node.etag} />
            </div>
          )}
        </div>
        <div className="modal-actions mt-5">
          {node.deleted_at === null && (
            <>
              {node.kind === "file" && (
                <button
                  type="button"
                  className="button"
                  onClick={() => onReplace(node)}
                >
                  <Upload size={15} /> Tải bản mới (Ghi đè)
                </button>
              )}
              <button
                type="button"
                className="button"
                onClick={() => onShare(node)}
              >
                <Share2 size={15} /> Chia sẻ
              </button>
              <a
                className="button primary"
                href={
                  node.kind === "folder"
                    ? `/api/nodes/${node.id}/zip`
                    : streamURL(node.id, true)
                }
              >
                <Download size={15} /> Tải{" "}
                {node.kind === "folder" ? "ZIP" : "xuống"}
              </a>
            </>
          )}
        </div>
      </Modal>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (type === "folder") {
        await post("/api/folders", { name, parent_id: parent });
        await onDone(`Đã tạo thư mục "${name}"`);
        return;
      }
      if (type === "batch-move") {
        for (const id of batchIds) {
          await put(`/api/nodes/${id}`, {
            parent_id: destination,
            move_to_root: !destination,
          });
        }
        await onDone(`Đã di chuyển ${batchIds.length} mục`);
        return;
      }
      if (type === "batch-copy") {
        for (const id of batchIds) {
          await post(`/api/nodes/${id}/copy`, { parent_id: destination });
        }
        await onDone(`Đã sao chép ${batchIds.length} mục`);
        return;
      }
      if (!node) throw new Error("Không tìm thấy mục được chọn.");
      if (type === "rename") {
        await put(`/api/nodes/${node.id}`, { name });
        await onDone("Đã đổi tên thành công");
      } else if (type === "move") {
        await put(`/api/nodes/${node.id}`, {
          parent_id: destination,
          move_to_root: !destination,
        });
        await onDone("Đã di chuyển mục");
      } else if (type === "copy") {
        await post(`/api/nodes/${node.id}/copy`, {
          parent_id: destination,
          name,
        });
        await onDone("Đã tạo bản sao");
      } else if (type === "share") {
        setResult(
          await post<{ url: string; direct_url?: string }>(
            `/api/nodes/${node.id}/shares`,
            {
              password: password || null,
              expires_in_days: Number(days) || null,
            },
          ),
        );
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={titles[type]} subtitle={node?.name} onClose={onClose}>
      {result ? (
        <div className="form-stack">
          <Notice>Liên kết chia sẻ đã sẵn sàng để gửi cho người nhận.</Notice>
          <label>
            Trang chia sẻ (xem trực tuyến & tải về)
            <CopyField value={result.url} />
          </label>
          {result.direct_url && !password && node?.kind === "file" && (
            <label>
              Liên kết tải trực tiếp (Direct Stream / Download)
              <CopyField value={result.direct_url} />
            </label>
          )}
          <div className="modal-actions">
            <button
              className="button primary"
              onClick={() => onDone("Đã tạo liên kết chia sẻ")}
            >
              Hoàn tất
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="form-stack">
          {["folder", "rename", "copy"].includes(type) && (
            <label>
              Tên mục
              <input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nhập tên hợp lệ (tối đa 240 ký tự)"
              />
            </label>
          )}

          {["move", "copy", "batch-move", "batch-copy"].includes(type) && (
            <div className="folder-picker">
              <div className="breadcrumbs">
                <button type="button" onClick={() => setDestination(null)}>
                  Thư mục gốc
                </button>
                {crumbs.map((c) => (
                  <React.Fragment key={c.id}>
                    <ChevronRight size={13} />
                    <button type="button" onClick={() => setDestination(c.id)}>
                      {c.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
              {folders.map((f) => (
                <button
                  type="button"
                  className="folder-choice"
                  key={f.id}
                  onClick={() => setDestination(f.id)}
                >
                  <Folder size={18} />
                  {f.name}
                  <ChevronRight size={16} />
                </button>
              ))}
              {!folders.length && (
                <p className="muted">Không có thư mục con tại vị trí này.</p>
              )}
            </div>
          )}

          {type === "share" && (
            <>
              <label>
                Mật khẩu bảo vệ (không bắt buộc)
                <div className="password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    minLength={10}
                    autoComplete="new-password"
                    placeholder="Bỏ trống nếu công khai, hoặc nhập ít nhất 10 ký tự"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? "Ẩn" : "Hiện"}
                  </button>
                </div>
              </label>
              <label>
                Thời hạn hiệu lực
                <select value={days} onChange={(e) => setDays(e.target.value)}>
                  <option value="1">1 ngày</option>
                  <option value="7">7 ngày</option>
                  <option value="30">30 ngày</option>
                  <option value="90">90 ngày</option>
                  <option value="0">Vĩnh viễn (Không hết hạn)</option>
                </select>
              </label>
            </>
          )}

          {error && <Notice error>{error}</Notice>}

          <div className="modal-actions">
            <button type="button" className="button" onClick={onClose}>
              Hủy
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? (
                <Spinner />
              ) : ["move", "copy", "batch-move", "batch-copy"].includes(
                  type,
                ) ? (
                "Chọn thư mục đích này"
              ) : (
                "Xác nhận"
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
