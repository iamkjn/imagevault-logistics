'use client';
import { useState, useEffect } from 'react';
import {
  Search,
  Upload,
  SlidersHorizontal,
  Download,
  ExternalLink,
  Trash2,
  FolderInput,
  Grid2X2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
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
  type VaultImage,
  type Viewer,
  type VaultUser,
} from '@/lib/client';
export function Thumbnail({
  item,
  demo,
  full = false,
}: {
  item: VaultImage;
  demo: boolean;
  full?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className="thumbnail-placeholder">
        <ImageIcon />
        <span>Preview unavailable</span>
      </div>
    );
  return demo ? (
    <SampleImage variant={item.sample || 0} />
  ) : (
    <img
      className="thumbnail"
      src={`/api/images/${item.id}/${full ? 'download' : 'thumbnail'}`}
      alt={`${item.categoryId} ${item.referenceId}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
export function SampleImage({ variant }: { variant: number }) {
  const pallet = variant === 1 || variant === 4;
  return (
    <svg
      className="sample-image"
      role="img"
      aria-label="Illustrated warehouse sample image"
      viewBox="0 0 480 300"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={`bg${variant}`} x2="1" y2="1">
          <stop
            stopColor={
              [
                '#c3c8ca',
                '#d6cfc4',
                '#d7dad7',
                '#bbc8d2',
                '#c4cbc6',
                '#d9cec2',
              ][variant]
            }
          />
          <stop offset="1" stopColor="#8e999e" />
        </linearGradient>
        <linearGradient id={`box${variant}`} x2="1" y2="1">
          <stop stopColor="#cfb088" />
          <stop offset="1" stopColor="#aa8257" />
        </linearGradient>
      </defs>
      <rect width="480" height="300" fill={`url(#bg${variant})`} />
      <path d="M0 212H480V300H0Z" fill="#9ea5a3" />
      <g opacity=".17" fill="#344958">
        <rect x="25" y="0" width="12" height="215" />
        <rect x="438" y="0" width="14" height="215" />
        <rect y="60" width="480" height="9" />
        <rect y="148" width="480" height="9" />
        <path d="M0 300 270 212M400 300 355 212" stroke="#fff" />
      </g>
      <ellipse
        cx="255"
        cy="258"
        rx="140"
        ry="20"
        fill="#3f4547"
        opacity=".22"
      />
      {pallet ? (
        <g>
          <path d="M94 246 250 277 391 234 232 204Z" fill="#927658" />
          <path
            d="M94 246V261L250 292V277M250 277 391 234V249L250 292"
            fill="#715d45"
          />
          <g stroke="#84623c" strokeWidth="2">
            <path
              d="m130 219 112 25 112-31V116l-112-28-112 30Z"
              fill={`url(#box${variant})`}
            />
            <path
              d="m130 118 112 28 112-30M242 146v98M130 168l112 27 112-31"
              fill="none"
            />
            <path d="m182 106 113 27v98M182 132v100" fill="none" />
          </g>
          <rect
            x="153"
            y="177"
            width="42"
            height="30"
            fill="#eee9df"
            transform="rotate(13 153 177)"
          />
          <path d="m155 188 30 7m-29-3 25 6" stroke="#4c5050" strokeWidth="3" />
        </g>
      ) : (
        <g
          transform={`translate(${variant === 2 ? 35 : 0} ${variant === 3 ? -10 : 0})`}
        >
          <path d="m115 135 144 35 113-56-145-31Z" fill="#d7bb95" />
          <path d="m115 135 144 35v110l-144-40Z" fill={`url(#box${variant})`} />
          <path d="m259 170 113-56v111l-113 55Z" fill="#ad875b" />
          <path d="m175 98 145 34-20 10-145-35Z" fill="#e4cfac" />
          <path d="m300 142 20-10v111l-20 10Z" fill="#b99b71" />
          <path d="m143 164 72 19v52l-72-20Z" fill="#f4eee3" />
          <g stroke="#434647" strokeWidth="2">
            <path d="m151 179 52 14m-52-7 43 12m-44-5 51 14m-51-6 27 8" />
          </g>
          <path
            d="m229 194 12 4m-12 4 12 4m-12 4 12 4"
            stroke="#6c553f"
            strokeWidth="3"
          />
          {variant === 2 && (
            <path
              d="m115 135 18 14-5 16 17 10-20 13"
              stroke="#6b4c32"
              strokeWidth="5"
              fill="none"
            />
          )}
        </g>
      )}
      <rect
        x="16"
        y="16"
        rx="5"
        width="66"
        height="22"
        fill="#fff"
        fillOpacity=".7"
      />
      <text
        x="27"
        y="31"
        fontFamily="sans-serif"
        fontSize="10"
        fill="#46515b"
        letterSpacing="1"
      >
        SAMPLE
      </text>
    </svg>
  );
}
export function Gallery({
  demo,
  user,
  mine,
  initialFilters,
  go,
}: {
  demo: boolean;
  user: Viewer;
  mine: boolean;
  initialFilters: Record<string, string>;
  go: (v: string) => void;
}) {
  const [filters, setFilters] =
      useState<Record<string, string>>(initialFilters),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string[]>([]),
    [preview, setPreview] = useState<VaultImage | null>(null),
    [action, setAction] = useState<'delete' | 'move' | null>(null),
    [destination, setDestination] = useState('Parcels'),
    [targetDate, setTargetDate] = useState(''),
    [toMisc, setToMisc] = useState(false),
    [busy, setBusy] = useState(false);
  const params = new URLSearchParams({
    ...filters,
    page: String(page),
    ...(mine ? { user: user.id } : {}),
  });
  const { data, error, loading, reload } = useData<{
    items: VaultImage[];
    total: number;
    pages: number;
  }>(`images?${params}`, demo);
  const team = useData<VaultUser[]>(
    user.role === 'ADMIN' ? 'admin/users' : 'me',
    demo,
  );
  const change = (key: string, value: string) => {
    setPage(1);
    setSelected([]);
    setFilters((f) => ({ ...f, [key]: value }));
  };
  const query = [...params.entries()]
    .filter(([, v]) => v)
    .map(([k, v]) => [k, v]);
  const exportQuery = new URLSearchParams(query).toString();
  const bulk = async () => {
    setBusy(true);
    try {
      await request('images/bulk', demo, {
        method: 'POST',
        body: JSON.stringify({
          ids: selected,
          action,
          category: destination,
          targetDate: targetDate || undefined,
          toMisc,
        }),
      });
      toast.success(
        `${selected.length} image${selected.length === 1 ? '' : 's'} ${action === 'delete' ? 'moved to Drive trash' : 'moved'}.`,
      );
      setSelected([]);
      setAction(null);
      reload();
    } catch (e) {
      toast.error((e as Error).message);
      reload();
    } finally {
      setBusy(false);
    }
  };
  const zip = async () => {
    if (demo) {
      toast.info('Connect your workspace to download original images.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/export/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selected }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'imagevault-images.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A RECORD OF EVERY HANDOFF</div>
          <h1>
            {mine ? 'My uploads' : 'Image gallery'}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {mine
              ? 'Your captured images, from today and every day before.'
              : 'Find the right image. Follow the whole story.'}
          </p>
        </div>
        <Button onClick={() => go('upload')}>
          <Upload size={16} />
          Upload images
        </Button>
      </div>
      <section className="card gallery-filter">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Filter by reference ID"
            placeholder="Search order name or reference…"
            value={filters.reference || ''}
            onChange={(e) => change('reference', e.target.value)}
          />
        </div>
        <select
          aria-label="Filter category"
          value={filters.category || ''}
          onChange={(e) => change('category', e.target.value)}
        >
          <option value="">All categories</option>
          {['Parcels', 'Pallets', 'Damaged', 'Other'].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {!mine && user.role === 'ADMIN' && (
          <select
            aria-label="Filter uploader"
            value={filters.user || ''}
            onChange={(e) => change('user', e.target.value)}
          >
            <option value="">All team members</option>
            {Array.isArray(team.data) &&
              team.data.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        )}
        <select
          aria-label="Folder status"
          value={filters.sorting || ''}
          onChange={(e) => change('sorting', e.target.value)}
        >
          <option value="">All folders</option>
          <option value="misc">Misc · unsorted</option>
          <option value="sorted">Dated folders</option>
        </select>
        <select
          aria-label="Date filter basis"
          value={filters.dateField || 'uploaded'}
          onChange={(e) => change('dateField', e.target.value)}
        >
          <option value="uploaded">Upload date</option>
          <option value="filed">Folder date</option>
        </select>
        <label className="date-filter">
          From
          <input
            aria-label="From date"
            type="date"
            value={filters.start || ''}
            onChange={(e) => change('start', e.target.value)}
          />
        </label>
        <label className="date-filter">
          To
          <input
            aria-label="To date"
            type="date"
            value={filters.end || ''}
            onChange={(e) => change('end', e.target.value)}
          />
        </label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setFilters({});
            setPage(1);
            setSelected([]);
          }}
        >
          Reset
        </Button>
      </section>
      <div className="gallery-toolbar">
        <span>
          <strong>{data?.total ?? 0}</strong> images{' '}
          <span className="muted">
            in your {mine ? 'uploads' : 'workspace'}
          </span>
        </span>
        {user.role === 'ADMIN' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              demo
                ? toast.info('Connect your live workspace to export its log.')
                : location.assign('/api/export/csv?' + exportQuery)
            }
          >
            <Download size={14} />
            Export CSV
          </Button>
        )}
      </div>
      {selected.length > 0 && (
        <div className="selection-bar">
          <strong>{selected.length} selected</strong>
          <Button variant="ghost" size="sm" onClick={zip} disabled={busy}>
            <Download size={15} />
            Download ZIP
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAction('move')}>
            <FolderInput size={15} />
            Move
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAction('delete')}>
            <Trash2 size={15} />
            Delete
          </Button>
          <button aria-label="Clear selection" onClick={() => setSelected([])}>
            <X size={18} />
          </button>
        </div>
      )}
      {error ? (
        <DataError error={error} retry={reload} />
      ) : loading ? (
        <div className="image-grid">
          {Array.from({ length: 8 }, (_, i) => (
            <div className="skeleton image-skeleton" key={i} />
          ))}
        </div>
      ) : !data?.items.length ? (
        <Empty
          title="No images found"
          description="Try a different filter, or upload your first image."
        />
      ) : (
        <div className="image-grid">
          {data.items.map((item) => (
            <article
              key={item.id}
              className={`card image-card ${selected.includes(item.id) ? 'selected' : ''}`}
            >
              <div className="image-card-visual">
                <button
                  className="image-open"
                  onClick={() => setPreview(item)}
                  aria-label={`Preview ${item.referenceId}`}
                >
                  <Thumbnail item={item} demo={demo} />
                </button>
                {user.role === 'ADMIN' && (
                  <input
                    className="image-checkbox"
                    type="checkbox"
                    aria-label={`Select ${item.referenceId}`}
                    checked={selected.includes(item.id)}
                    onChange={(e) => {
                      if (e.target.checked && selected.length >= 30) {
                        toast.error('Select up to 30 images at once.');
                        return;
                      }
                      setSelected((s) =>
                        e.target.checked
                          ? [...s, item.id]
                          : s.filter((id) => id !== item.id),
                      );
                    }}
                  />
                )}
                <span
                  className={`category-badge ${item.categoryId.toLowerCase()}`}
                >
                  {item.categoryId}
                </span>
              </div>
              <button
                className="image-caption"
                onClick={() => setPreview(item)}
              >
                <strong>
                  {item.orderName || item.referenceId || 'Unsorted image'}
                </strong>
                {!item.filedDate && (
                  <small className="misc-label">Misc · needs sorting</small>
                )}
                <span>
                  {item.uploadedBy.name}
                  <small>
                    {new Date(item.uploadedAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </small>
                </span>
              </button>
            </article>
          ))}
        </div>
      )}
      <div className="pagination">
        <Button
          variant="outline"
          disabled={page === 1}
          onClick={() => {
            setPage((p) => p - 1);
            setSelected([]);
          }}
        >
          <ChevronLeft size={16} />
          Previous
        </Button>
        <span>
          Page {page} of {Math.max(1, data?.pages || 1)}
        </span>
        <Button
          variant="outline"
          disabled={page >= (data?.pages || 1)}
          onClick={() => {
            setPage((p) => p + 1);
            setSelected([]);
          }}
        >
          Next
          <ChevronRight size={16} />
        </Button>
      </div>
      <Dialog
        open={!!preview}
        onOpenChange={(open) => !open && setPreview(null)}
      >
        <DialogContent className="preview-dialog">
          {preview && (
            <>
              <div className="preview-visual">
                <Thumbnail item={preview} demo={demo} full />
              </div>
              <div className="preview-details">
                <span
                  className={`category-badge static ${preview.categoryId.toLowerCase()}`}
                >
                  {preview.categoryId}
                </span>
                <DialogTitle>
                  {preview.orderName || preview.referenceId || 'Unsorted image'}
                </DialogTitle>
                <DialogDescription>{preview.fileName}</DialogDescription>
                <dl>
                  <dt>Uploaded by</dt>
                  <dd>{preview.uploadedBy.name}</dd>
                  <dt>Order reference</dt>
                  <dd>{preview.referenceId || 'Not identified'}</dd>
                  <dt>Original capture</dt>
                  <dd>
                    {preview.capturedAtLocal?.replace('T', ' ') ||
                      preview.captureDate ||
                      'Unknown'}{' '}
                    {preview.captureOffset || ''}
                  </dd>
                  <dt>Date source</dt>
                  <dd>{preview.captureSource || 'Unknown'}</dd>
                  <dt>Folder date</dt>
                  <dd>{preview.filedDate || 'Misc · unsorted'}</dd>
                  <dt>OCR reference</dt>
                  <dd>
                    {preview.detectedReference || 'None'}{' '}
                    {preview.ocrConfidence != null
                      ? `(${preview.ocrConfidence}% confidence)`
                      : ''}
                  </dd>
                  <dt>Uploaded</dt>
                  <dd>
                    {new Date(preview.uploadedAt).toLocaleString('en-GB')}
                  </dd>
                  <dt>Size</dt>
                  <dd>{(preview.sizeBytes / 1024).toFixed(0)} KB</dd>
                  <dt>Notes</dt>
                  <dd>{preview.notes || 'No notes added.'}</dd>
                </dl>
                {user.role === 'ADMIN' && (
                  <ImageDetailsEditor
                    key={preview.id}
                    item={preview}
                    demo={demo}
                    onSaved={(updated) => {
                      setPreview({ ...preview, ...updated });
                      reload();
                    }}
                  />
                )}
                <Button
                  onClick={() =>
                    demo
                      ? toast.info(
                          'Sample illustrations have no Drive originals.',
                        )
                      : location.assign(`/api/images/${preview.id}/download`)
                  }
                >
                  <Download size={16} />
                  Download image
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    demo
                      ? toast.info(
                          'Connect Google Drive to open original files.',
                        )
                      : window.open(
                          `https://drive.google.com/file/d/${preview.driveFileId}/view`,
                          '_blank',
                          'noopener,noreferrer',
                        )
                  }
                >
                  <ExternalLink size={15} />
                  Open in Google Drive
                </Button>
                <p className="muted small">
                  Drive links require access in Google Drive. App downloads use
                  your approved workspace access.
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!action}
        onOpenChange={(open) => !open && !busy && setAction(null)}
      >
        <DialogContent>
          <DialogTitle>
            {action === 'delete'
              ? 'Move images to trash?'
              : 'Move to a date folder'}
          </DialogTitle>
          <DialogDescription>
            {action === 'delete'
              ? `${selected.length} selected images will be removed from this gallery and moved to Google Drive trash. The vault owner can restore them in Drive.`
              : 'Choose a category and date. Missing folders are created automatically. Original capture metadata stays unchanged.'}
          </DialogDescription>
          {action === 'move' && (
            <>
              <select
                aria-label="Destination category"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                {['Parcels', 'Pallets', 'Damaged', 'Other'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <label className="field-label">
                Destination date
                <input
                  aria-label="Destination date"
                  type="date"
                  min="1900-01-01"
                  max="2199-12-31"
                  value={targetDate}
                  disabled={toMisc}
                  onChange={(e) => setTargetDate(e.target.value)}
                />
                <small>
                  Leave blank to keep existing folder dates. Images in Misc
                  require a date.
                </small>
              </label>
              <label className="misc-option">
                <input
                  type="checkbox"
                  checked={toMisc}
                  onChange={(e) => setToMisc(e.target.checked)}
                />
                Move to Misc instead
              </label>
            </>
          )}
          <div className="dialog-actions">
            <Button
              variant="outline"
              onClick={() => setAction(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant={action === 'delete' ? 'destructive' : 'default'}
              onClick={bulk}
              disabled={busy}
            >
              {busy
                ? 'Working…'
                : action === 'delete'
                  ? 'Move to trash'
                  : 'Move images'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ImageDetailsEditor({
  item,
  demo,
  onSaved,
}: {
  item: VaultImage;
  demo: boolean;
  onSaved: (item: Partial<VaultImage>) => void;
}) {
  const [referenceId, setReference] = useState(item.referenceId),
    [orderName, setName] = useState(item.orderName || ''),
    [saving, setSaving] = useState(false);
  return (
    <form
      className="details-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          const updated = await request<Partial<VaultImage>>(
            `images/${item.id}`,
            demo,
            {
              method: 'PATCH',
              body: JSON.stringify({ referenceId, orderName }),
            },
          );
          onSaved(updated);
          toast.success('Order details updated.');
        } catch (error) {
          toast.error((error as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <h3>Correct order details</h3>
      <label className="field-label">
        Order name
        <input
          maxLength={120}
          value={orderName}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field-label">
        Reference ID
        <input
          maxLength={120}
          value={referenceId}
          onChange={(e) => setReference(e.target.value)}
        />
      </label>
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? 'Saving…' : 'Save details'}
      </Button>
    </form>
  );
}
