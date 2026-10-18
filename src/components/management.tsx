'use client';
import { useState } from 'react';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Images,
  Users,
  ShieldCheck,
  Check,
  Clock,
  Upload,
  Trash2,
  FolderInput,
  Settings,
  Sun,
  Moon,
  Globe,
  HardDrive,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { useData, DataError, Empty } from './workspace';
import {
  request,
  type Folder as FolderType,
  type VaultUser,
  type Viewer,
  type Activity,
} from '@/lib/client';
export function Folders({
  demo,
  go,
}: {
  demo: boolean;
  go: (v: string, f?: Record<string, string>) => void;
}) {
  const { data, error, loading, reload } = useData<FolderType[]>(
    'folders/tree',
    demo,
  );
  const [expanded, setExpanded] = useState<string[]>([
      'ImageVault',
      'ImageVault/Parcels',
    ]),
    [current, setCurrent] = useState('ImageVault');
  const [creating, setCreating] = useState(false),
    [folderDate, setFolderDate] = useState(''),
    [folderCategory, setFolderCategory] = useState('Parcels'),
    [busy, setBusy] = useState(false);
  const visible =
    data?.filter((f) =>
      f.path
        .split('/')
        .slice(0, -1)
        .every((_, i) =>
          expanded.includes(
            f.path
              .split('/')
              .slice(0, i + 1)
              .join('/'),
          ),
        ),
    ) || [];
  const count = (path: string) =>
    data
      ?.filter((f) => f.path === path || f.path.startsWith(path + '/'))
      .reduce((n, f) => n + f._count.images, 0) || 0;
  const folders =
    data?.filter(
      (f) =>
        f.path.startsWith(current + '/') &&
        f.path.split('/').length === current.split('/').length + 1,
    ) || [];
  const selected = data?.find((f) => f.path === current);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EVERYTHING IN ITS PLACE</div>
          <h1>
            Folder explorer<span className="heading-dot">.</span>
          </h1>
          <p>Your Google Drive structure, with a clearer view.</p>
        </div>
        <div className="heading-actions">
          <Button
            variant="outline"
            onClick={() => go('gallery', { sorting: 'misc' })}
          >
            Review Misc
          </Button>
          <Button onClick={() => setCreating(true)}>Create date folder</Button>
        </div>
        <span className="connection-pill">
          <Folder size={15} />
          {data?.length || 0} folders
        </span>
      </div>
      {error ? (
        <DataError error={error} retry={reload} />
      ) : loading ? (
        <div className="skeleton" style={{ height: 450 }} />
      ) : (
        <section className="card folder-explorer">
          <aside className="folder-tree">
            <span className="nav-label">GOOGLE DRIVE VAULT</span>
            {visible.map((f) => (
              <div
                className={`tree-row ${current === f.path ? 'selected' : ''}`}
                key={f.id}
                style={{
                  paddingLeft: 12 + (f.path.split('/').length - 1) * 16,
                }}
              >
                <button
                  aria-label={`Expand ${f.path}`}
                  onClick={() =>
                    setExpanded((e) =>
                      e.includes(f.path)
                        ? e.filter((p) => p !== f.path)
                        : [...e, f.path],
                    )
                  }
                >
                  {f.date ? (
                    <span style={{ width: 14 }} />
                  ) : expanded.includes(f.path) ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
                <button
                  onClick={() => {
                    setCurrent(f.path);
                    setExpanded((e) => [...new Set([...e, f.path])]);
                  }}
                >
                  <Folder size={16} />
                  <span>{f.path.split('/').at(-1)}</span>
                  <small>{count(f.path)}</small>
                </button>
              </div>
            ))}
          </aside>
          <div className="folder-main">
            <div className="folder-breadcrumb">
              {current.split('/').map((part, i) => (
                <span key={i}>
                  <button
                    onClick={() =>
                      setCurrent(
                        current
                          .split('/')
                          .slice(0, i + 1)
                          .join('/'),
                      )
                    }
                  >
                    {part}
                  </button>
                  <ChevronRight size={13} />
                </span>
              ))}
            </div>
            <div className="section-heading">
              <div>
                <h2>{current.split('/').at(-1)}</h2>
                <p>
                  {count(current)} images · {folders.length} subfolders
                </p>
              </div>
              {selected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    demo
                      ? toast.info(
                          'These sample folders do not exist in Google Drive.',
                        )
                      : window.open(
                          `https://drive.google.com/drive/folders/${selected.driveFolderId}`,
                          '_blank',
                          'noopener,noreferrer',
                        )
                  }
                >
                  <ExternalLink size={14} />
                  Open in Drive
                </Button>
              )}
            </div>
            {folders.length ? (
              <div className="folder-grid">
                {folders.map((f) => (
                  <button
                    className="folder-tile"
                    key={f.id}
                    onClick={() => {
                      setCurrent(f.path);
                      setExpanded((e) => [...e, f.path]);
                    }}
                  >
                    <FolderOpen size={38} />
                    <strong>{f.path.split('/').at(-1)}</strong>
                    <span>{count(f.path)} images</span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            ) : current === 'ImageVault/Misc' ? (
              <div className="folder-day">
                <FolderOpen size={45} />
                <h3>Misc · unsorted images</h3>
                <p>
                  {count(current)} images waiting for a date or order details.
                </p>
                <Button onClick={() => go('gallery', { sorting: 'misc' })}>
                  Select & sort images
                </Button>
              </div>
            ) : selected?.date ? (
              <div className="folder-day">
                <Images size={45} />
                <h3>{selected.date}</h3>
                <p>
                  {selected._count.images} images in{' '}
                  {selected.path.split('/')[1]}
                </p>
                <Button
                  onClick={() =>
                    go('gallery', {
                      category: selected.path.split('/')[1],
                      start: selected.date!,
                      end: selected.date!,
                      dateField: 'filed',
                    })
                  }
                >
                  Browse images <ChevronRight size={16} />
                </Button>
              </div>
            ) : (
              <Empty
                title="Folders appear automatically"
                description="Upload your first image to create the vault’s folder structure."
              />
            )}
          </div>
        </section>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogTitle>Create a date folder</DialogTitle>
          <DialogDescription>
            Choose a category and date. An existing folder is reused, so
            duplicates are never created.
          </DialogDescription>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await request('folders', demo, {
                  method: 'POST',
                  body: JSON.stringify({
                    category: folderCategory,
                    date: folderDate,
                  }),
                });
                toast.success('Date folder ready.');
                setCreating(false);
                reload();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field-label">
              Category
              <select
                value={folderCategory}
                onChange={(e) => setFolderCategory(e.target.value)}
              >
                {['Parcels', 'Pallets', 'Damaged', 'Other'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Date
              <input
                type="date"
                required
                min="1900-01-01"
                max="2199-12-31"
                value={folderDate}
                onChange={(e) => setFolderDate(e.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <Button type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create folder'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function UserManagement({
  demo,
  user,
}: {
  demo: boolean;
  user: Viewer;
}) {
  const { data, error, loading, reload } = useData<VaultUser[]>(
    'admin/users',
    demo,
  );
  const [busy, setBusy] = useState('');
  const update = async (id: string, patch: Record<string, string>) => {
    setBusy(id);
    try {
      await request('admin/users', demo, {
        method: 'PATCH',
        body: JSON.stringify({ id, ...patch }),
      });
      toast.success('Team access updated.');
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">GOOD OPERATIONS START WITH PEOPLE</div>
          <h1>
            Team members<span className="heading-dot">.</span>
          </h1>
          <p>Approve access, assign roles, and keep your workspace secure.</p>
        </div>
        <span className="connection-pill">
          <Users size={16} />
          {data?.length || 0} members
        </span>
      </div>
      <div className="info-box">
        <ShieldCheck size={20} />
        <span>
          New members sign in with Google and appear here for approval. Changes
          take effect on their next request.
        </span>
      </div>
      {error ? (
        <DataError error={error} retry={reload} />
      ) : (
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Workspace access</h2>
              <p>
                {data?.filter((u) => u.status === 'PENDING').length || 0}{' '}
                awaiting approval
              </p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Images</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="user-cell">
                        <span className="avatar">
                          {u.name
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')}
                        </span>
                        <span>
                          <strong>
                            {u.name}
                            {u.id === user.id ? ' (you)' : ''}
                          </strong>
                          <small>{u.email}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <select
                        aria-label={`Role for ${u.name}`}
                        disabled={u.id === user.id || busy === u.id}
                        value={u.role}
                        onChange={(e) =>
                          void update(u.id, { role: e.target.value })
                        }
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="USER">Member</option>
                      </select>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${u.status.toLowerCase()}`}
                      >
                        {u.status.toLowerCase()}
                      </span>
                    </td>
                    <td>{u._count.images}</td>
                    <td>
                      {u.id !== user.id &&
                        (u.status !== 'ACTIVE' ? (
                          <Button
                            size="sm"
                            onClick={() =>
                              void update(u.id, { status: 'ACTIVE' })
                            }
                            disabled={busy === u.id}
                          >
                            <Check size={14} />
                            {u.status === 'PENDING' ? 'Approve' : 'Enable'}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void update(u.id, { status: 'DISABLED' })
                            }
                            disabled={busy === u.id}
                          >
                            Disable
                          </Button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && (
              <div className="skeleton" style={{ height: 160, margin: 20 }} />
            )}
          </div>
        </section>
      )}
    </>
  );
}
export function ActivityPage({ demo }: { demo: boolean }) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useData<{
    items: Activity[];
    pages: number;
    total: number;
  }>(`activity?page=${page}`, demo);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A TRANSPARENT WORKSPACE</div>
          <h1>
            Activity log<span className="heading-dot">.</span>
          </h1>
          <p>Who did what, and when. A reliable record of your operations.</p>
        </div>
        <Button variant="outline" onClick={reload}>
          Refresh activity
        </Button>
      </div>
      {error ? (
        <DataError error={error} retry={reload} />
      ) : (
        <section className="card activity-list">
          {data?.items.map((item) => {
            const Icon =
              item.action === 'UPLOADED'
                ? Upload
                : item.action === 'DELETED'
                  ? Trash2
                  : item.action === 'MOVED'
                    ? FolderInput
                    : ShieldCheck;
            return (
              <article className="activity-row" key={item.id}>
                <span className="activity-icon">
                  <Icon size={18} />
                </span>
                <div>
                  <strong>
                    {item.user.name}{' '}
                    <span>
                      {item.action === 'UPLOADED'
                        ? 'uploaded an image'
                        : item.action === 'DELETED'
                          ? 'deleted an image'
                          : item.action === 'MOVED'
                            ? 'moved images'
                            : item.action === 'DETAILS_UPDATED'
                              ? 'corrected order details'
                              : item.action === 'FOLDER_CREATED'
                                ? 'created a date folder'
                                : 'updated workspace access'}
                    </span>
                  </strong>
                  <p>
                    {String(
                      item.meta?.referenceId ||
                        item.meta?.fileName ||
                        item.meta?.email ||
                        item.entityId,
                    )}
                  </p>
                  {item.action === 'ACCESS_CHANGED' && (
                    <small>
                      {JSON.stringify(item.meta?.before)} →{' '}
                      {JSON.stringify(item.meta?.after)}
                    </small>
                  )}
                </div>
                <time>
                  {new Date(item.createdAt).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </article>
            );
          })}
          {loading && <div className="skeleton" style={{ height: 300 }} />}
          {!loading && !data?.items.length && (
            <Empty
              title="A fresh start"
              description="Uploads and administrative changes will be recorded here."
            />
          )}
        </section>
      )}
      <div className="pagination">
        <Button
          variant="outline"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page} of {Math.max(1, data?.pages || 1)}
        </span>
        <Button
          variant="outline"
          disabled={page >= (data?.pages || 1)}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </>
  );
}
export function SettingsPage({
  demo,
  user,
  dark,
  toggleTheme,
}: {
  demo: boolean;
  user: Viewer;
  dark: boolean;
  toggleTheme: () => void;
}) {
  const { data } = useData<{ timezone: string }>('me', demo);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE YOURSELF AT HOME</div>
          <h1>
            Workspace settings<span className="heading-dot">.</span>
          </h1>
          <p>Your preferences and workspace configuration.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="card settings-card">
          <span className="kpi-icon indigo">
            <Users size={20} />
          </span>
          <h2>Your account</h2>
          <dl>
            <dt>Name</dt>
            <dd>{user.name}</dd>
            <dt>Email</dt>
            <dd>{user.email}</dd>
            <dt>Role</dt>
            <dd>{user.role === 'ADMIN' ? 'Administrator' : 'Team member'}</dd>
            <dt>Access</dt>
            <dd>
              <span className="status-badge active">Active</span>
            </dd>
          </dl>
        </section>
        <section className="card settings-card">
          <span className="kpi-icon violet">
            {dark ? <Moon size={20} /> : <Sun size={20} />}
          </span>
          <h2>Appearance</h2>
          <p>
            Choose the theme that works best for your environment. Your
            preference is saved on this device.
          </p>
          <Button variant="outline" onClick={toggleTheme}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}Switch to{' '}
            {dark ? 'light' : 'dark'} mode
          </Button>
        </section>
        <section className="card settings-card">
          <span className="kpi-icon green">
            <HardDrive size={20} />
          </span>
          <h2>Google Drive storage</h2>
          <p>
            {demo
              ? 'This is a demo workspace with illustrated samples.'
              : 'Images are stored in the designated vault owner’s Google Drive. Your application permissions are managed separately from Drive sharing.'}
          </p>
          <div className="setting-value">
            <Folder size={16} />
            <code>ImageVault / Category / Year / Date</code>
          </div>
          <small>
            Drive owner and credentials are configured by your deployment
            administrator.
          </small>
        </section>
        <section className="card settings-card">
          <span className="kpi-icon blue">
            <Globe size={20} />
          </span>
          <h2>Time & data</h2>
          <div className="setting-value">
            Folder timezone{' '}
            <strong>
              {data?.timezone ||
                (demo ? 'Europe/London' : 'Configured on server')}
            </strong>
          </div>
          <p>
            The deployment’s TIMEZONE setting controls date folders and daily
            reports. Image previews show your device’s local time.
          </p>
          <small>
            Originals are optimized to JPEG, up to 1920 pixels. Offline uploads
            remain on your device until synced or removed.
          </small>
        </section>
      </div>
    </>
  );
}
