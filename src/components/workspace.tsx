'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  Images,
  FolderOpen,
  Users,
  Activity,
  Settings,
  Upload,
  ScanLine,
  ChevronDown,
  ArrowUpRight,
  Moon,
  Sun,
  Menu,
  X,
  LogOut,
  Search,
  ShieldCheck,
  CircleHelp,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { request, type Viewer } from '@/lib/client';
import { Dashboard } from './dashboard';
import { Gallery } from './gallery';
import { UploadPage } from './upload';
import {
  Folders,
  UserManagement,
  ActivityPage,
  SettingsPage,
} from './management';
const nav = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'gallery', label: 'Image gallery', icon: Images },
  { id: 'folders', label: 'Folder explorer', icon: FolderOpen },
  { id: 'users', label: 'Team members', icon: Users },
  { id: 'activity', label: 'Activity log', icon: Activity },
];
export function useData<T>(path: string, demo: boolean) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    request<T>(path, demo)
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, demo, revision]);
  return {
    data,
    error,
    loading,
    reload: useCallback(() => setRevision((r) => r + 1), []),
  };
}
export function DataError({
  error,
  retry,
}: {
  error: string;
  retry: () => void;
}) {
  return (
    <div className="error-box">
      {error}
      <Button variant="outline" size="sm" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
export function Empty({
  title = 'Nothing here yet',
  description = 'Your images will appear here once your team starts uploading.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty">
      <Images size={34} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function Workspace({
  initialView,
  user,
  demo = false,
  initialFilters = {},
  timezone = 'Europe/London',
}: {
  initialView: string;
  user: Viewer;
  demo?: boolean;
  initialFilters?: Record<string, string>;
  timezone?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState(initialView),
    [mobile, setMobile] = useState(false),
    [dark, setDark] = useState(false),
    [filter, setFilter] = useState<Record<string, string>>(initialFilters),
    [search, setSearch] = useState('');
  useEffect(
    () => setDark(document.documentElement.classList.contains('dark')),
    [],
  );
  useEffect(() => {
    if (!mobile) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobile(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobile]);
  const go = (id: string, filters: Record<string, string> = {}) => {
    setMobile(false);
    setFilter(filters);
    if (demo) setView(id);
    else {
      const q = new URLSearchParams(filters).toString();
      router.push(`/${id}${q ? '?' + q : ''}`);
    }
  };
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('iv-theme', next ? 'dark' : 'light');
  };
  const title = (
    {
      dashboard: 'Overview',
      gallery: 'Image gallery',
      folders: 'Folder explorer',
      users: 'Team members',
      activity: 'Activity log',
      settings: 'Settings',
      upload: 'Upload images',
      'my-uploads': 'My uploads',
    } as Record<string, string>
  )[view];
  return (
    <div className="app-shell">
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <aside
        className={`sidebar ${mobile ? 'is-open' : ''}`}
        aria-hidden={!mobile && undefined}
      >
        <button
          className="brand"
          onClick={() => go(user.role === 'ADMIN' ? 'dashboard' : 'upload')}
        >
          <span className="brand-icon">
            <ScanLine size={23} />
          </span>
          <span>
            ImageVault<small>LOGISTICS WORKSPACE</small>
          </span>
        </button>
        <button className="workspace-switch" onClick={() => go('settings')}>
          <span className="workspace-avatar">W</span>
          <span>
            <strong>Warehouse operations</strong>
            <small>Team workspace</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {(user.role === 'ADMIN'
            ? nav
            : [
                { id: 'upload', label: 'Upload images', icon: Upload },
                { id: 'my-uploads', label: 'My uploads', icon: Images },
              ]
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? 'nav-item active' : 'nav-item'}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              {label}
              {view === id && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="drive-card">
            <span className="drive-symbol">△</span>
            <strong>
              {demo ? 'Your Drive, connected' : 'Google Drive vault'}
            </strong>
            <p>
              {demo
                ? 'Explore an organized sample workspace.'
                : 'Images stay organized in your team’s vault.'}
            </p>
            <button onClick={() => go('settings')}>
              View storage details <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className={`nav-item ${view === 'settings' ? 'active' : ''}`}
            onClick={() => go('settings')}
          >
            <Settings size={19} />
            Settings
          </button>
          <button
            className="nav-item"
            onClick={() =>
              toast.info(
                'Choose a category, add a reference ID, and upload. Administrators can browse, organize, and manage team access.',
              )
            }
          >
            <CircleHelp size={19} />
            Quick help
          </button>
          <div className="profile">
            <span className="avatar">
              {user.name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>
                {user.role === 'ADMIN' ? 'Workspace admin' : 'Team member'}
              </small>
            </span>
            <button
              aria-label="Sign out"
              onClick={() =>
                demo
                  ? router.push('/login')
                  : signOut({ callbackUrl: '/login' })
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                go(user.role === 'ADMIN' ? 'gallery' : 'my-uploads', {
                  reference: search,
                });
              }}
            >
              <Search size={16} />
              <input
                aria-label="Search reference ID"
                placeholder="Search by reference ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>↵</kbd>
            </form>
            <button
              className="theme-button"
              aria-label={dark ? 'Use light mode' : 'Use dark mode'}
              onClick={toggleTheme}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <span className="avatar avatar-small">
              {user.name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')}
            </span>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span>
              <span className="status-dot" />
              Demo workspace · Sample data, changes reset on reload
            </span>
            <a href="/login">
              Connect your workspace <ArrowUpRight size={14} />
            </a>
          </div>
        )}
        <main className="content">
          {view === 'dashboard' && (
            <Dashboard demo={demo} go={go} user={user} timezone={timezone} />
          )}{' '}
          {['gallery', 'my-uploads'].includes(view) && (
            <Gallery
              key={JSON.stringify(filter)}
              demo={demo}
              user={user}
              mine={view === 'my-uploads'}
              initialFilters={filter}
              go={go}
            />
          )}{' '}
          {view === 'upload' && <UploadPage demo={demo} user={user} />}{' '}
          {view === 'folders' && <Folders demo={demo} go={go} />}{' '}
          {view === 'users' && <UserManagement demo={demo} user={user} />}{' '}
          {view === 'activity' && <ActivityPage demo={demo} />}{' '}
          {view === 'settings' && (
            <SettingsPage
              demo={demo}
              user={user}
              dark={dark}
              toggleTheme={toggleTheme}
            />
          )}
          <footer className="page-footer">
            <span>
              <ShieldCheck size={13} /> Secure by design. Organized by
              ImageVault.
            </span>
            <span>Logistics, in focus.</span>
          </footer>
        </main>
      </div>
      {user.role === 'USER' && (
        <nav className="bottom-tabs">
          <button onClick={() => go('upload')}>
            <Upload />
            Upload
          </button>
          <button onClick={() => go('my-uploads')}>
            <Images />
            My uploads
          </button>
        </nav>
      )}
    </div>
  );
}
