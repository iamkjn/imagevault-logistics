'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import imageCompression from 'browser-image-compression';
import {
  UploadCloud,
  Camera,
  Package,
  Layers,
  CircleAlert,
  Box,
  CheckCircle2,
  RefreshCw,
  Trash2,
  WifiOff,
  ShieldCheck,
  FolderTree,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import {
  listQueue,
  saveQueue,
  deleteQueue,
  type QueuedImage,
} from '@/lib/queue';
import { readCapture } from '@/lib/photo-analysis';
import type { Viewer } from '@/lib/client';
const cats = [
  { name: 'Parcels', icon: Package, description: 'Packages & deliveries' },
  { name: 'Pallets', icon: Layers, description: 'Bulk & palletized goods' },
  { name: 'Damaged', icon: CircleAlert, description: 'Damage & exceptions' },
  { name: 'Other', icon: Box, description: 'Everything else' },
];
function PhotoPreview({ file }: { file: Blob }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? (
    <img
      className="review-photo"
      src={url}
      alt="Photo awaiting upload review"
    />
  ) : null;
}
export function UploadPage({ user, demo }: { user: Viewer; demo: boolean }) {
  const [category, setCategory] = useState('Parcels'),
    [reference, setReference] = useState(''),
    [batchDate, setBatchDate] = useState(''),
    [notes, setNotes] = useState(''),
    [queue, setQueue] = useState<QueuedImage[]>([]),
    [online, setOnline] = useState(true),
    [preparing, setPreparing] = useState(false),
    [analysisStatus, setAnalysisStatus] = useState(''),
    [drag, setDrag] = useState(false),
    [progress, setProgress] = useState<Record<string, number>>({}),
    [completed, setCompleted] = useState(0);
  const picker = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null),
    running = useRef(false),
    mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (demo) return;
    const items = await listQueue(user.id);
    if (mounted.current) setQueue(items);
  }, [user.id, demo]);
  const save = async (item: QueuedImage) => {
    if (!demo) await saveQueue(item);
    setQueue((items) =>
      items.some((i) => i.id === item.id)
        ? items.map((i) => (i.id === item.id ? item : i))
        : [...items, item],
    );
  };
  const remove = async (id: string) => {
    if (!demo) await deleteQueue(id);
    setQueue((items) => items.filter((i) => i.id !== id));
  };
  useEffect(() => {
    mounted.current = true;
    setOnline(navigator.onLine);
    const up = () => setOnline(true),
      down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    if (!demo)
      listQueue(user.id)
        .then(async (items) => {
          for (const item of items)
            if (item.status === 'uploading')
              await saveQueue({ ...item, status: 'queued' });
          await refresh();
        })
        .catch(() =>
          toast.error(
            'Browser storage is unavailable. Enable local storage to queue uploads.',
          ),
        );
    return () => {
      mounted.current = false;
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, [user.id, refresh, demo]);
  useEffect(() => {
    if (!online || running.current || demo) return;
    const item = queue.find((i) => i.status === 'queued');
    if (!item) return;
    running.current = true;
    const send = async () => {
      try {
        await saveQueue({ ...item, status: 'uploading' });
        await refresh();
        const form = new FormData();
        form.set('file', item.file, item.name);
        for (const [key, value] of Object.entries({
          category: item.category,
          referenceId: item.referenceId,
          notes: item.notes,
          requestId: item.id,
          uploaderId: item.userId,
          orderName: item.orderName || '',
          detectedReference: item.detectedReference || '',
          ocrConfidence: String(item.ocrConfidence || 0),
          captureDate: item.captureDate || '',
          capturedAtLocal: item.capturedAtLocal || '',
          captureOffset: item.captureOffset || '',
          captureSource: item.captureSource || 'UNKNOWN',
          filedDate: item.filedDate || '',
        }))
          form.set(key, value);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/upload');
          xhr.timeout = 65000;
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && mounted.current)
              setProgress((p) => ({
                ...p,
                [item.id]: Math.round((e.loaded / e.total) * 95),
              }));
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else {
              let msg = 'Upload failed. Please retry.';
              try {
                msg = JSON.parse(xhr.responseText).error || msg;
              } catch {}
              reject(new Error(msg));
            }
          };
          xhr.onerror = () =>
            reject(new Error('Connection lost. Your image is safely queued.'));
          xhr.ontimeout = () =>
            reject(
              new Error(
                'Upload timed out. Retry safely without creating duplicates.',
              ),
            );
          xhr.send(form);
        });
        await deleteQueue(item.id);
        if (mounted.current) setCompleted((c) => c + 1);
        toast.success(
          `${item.orderName || item.referenceId || 'Unsorted image'} saved to the vault.`,
        );
      } catch (e) {
        await saveQueue({
          ...item,
          status: navigator.onLine ? 'failed' : 'queued',
          error: (e as Error).message,
        });
      } finally {
        running.current = false;
        await refresh();
      }
    };
    void send();
  }, [queue, online, demo, refresh]);
  const add = async (
    files: FileList | File[],
    source: 'gallery' | 'camera' = 'gallery',
  ) => {
    if (preparing) return;
    setPreparing(true);
    for (const original of Array.from(files)) {
      try {
        if (original.size > 15 * 1024 * 1024)
          throw new Error(`${original.name}: maximum original size is 15 MB.`);
        if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(original.name))
          throw new Error(`${original.name}: choose JPG, PNG, WebP or HEIC.`);
        setAnalysisStatus(`Reading original capture date · ${original.name}`);
        const capture = await readCapture(original, source); // Must happen before conversion/compression removes EXIF.
        let file = original;
        if (/\.hei[cf]$/i.test(original.name)) {
          const { default: heic2any } = await import('heic2any');
          const converted = await heic2any({
            blob: original,
            toType: 'image/jpeg',
            quality: 0.8,
          });
          file = new File(
            [Array.isArray(converted) ? converted[0] : converted],
            original.name.replace(/\.hei[cf]$/i, '.jpg'),
            { type: 'image/jpeg' },
          );
        }
        const compressed = await imageCompression(file, {
          maxSizeMB: 2.9,
          maxWidthOrHeight: 1920,
          initialQuality: 0.8,
          fileType: 'image/jpeg',
          useWebWorker: false,
          preserveExif: false,
        });
        if (compressed.size > 3 * 1024 * 1024)
          throw new Error(
            'The image could not be compressed enough. Choose a smaller file.',
          );
        const referenceId = reference.trim();
        const filedDate =
          source === 'camera'
            ? capture.captureDate
            : batchDate || capture.captureDate;
        await save({
          id: crypto.randomUUID(),
          userId: user.id,
          file: compressed,
          name: original.name.replace(/\.[^.]+$/, '.jpg'),
          category,
          referenceId,
          orderName: '',
          detectedReference: '',
          ocrConfidence: 0,
          ...capture,
          filedDate,
          notes,
          status: demo ? 'review' : 'queued',
          createdAt: Date.now(),
          analysisNote:
            'Order-label scanning is paused for faster uploads. Details are optional and can be added later.',
        });
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
    setPreparing(false);
    setAnalysisStatus('');
  };
  const reviews = queue.filter((i) => i.status === 'review');
  const approve = async () => {
    if (demo) {
      toast.info(
        'Analysis stays on this device in the demo. Sign in to upload to Drive.',
      );
      return;
    }
    for (const item of reviews)
      await saveQueue({
        ...item,
        status: 'queued',
      });
    await refresh();
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SMART CAPTURE, LESS FILING</div>
          <h1>
            A clear record starts here<span className="heading-dot">.</span>
          </h1>
          <p>
            Add photos quickly. We’ll handle the folder date without delaying
            the queue.
          </p>
        </div>
        <span className="connection-pill">
          <span className="status-dot" />
          {online ? 'Ready to upload' : 'Offline · Queuing enabled'}
        </span>
      </div>
      {demo && (
        <div className="info-box">
          <UploadCloud size={20} />
          Fast-upload mode is active. Order-label scanning is paused; demo
          photos are not uploaded or saved after leaving this page.
        </div>
      )}
      {!online && (
        <div className="info-box">
          <WifiOff size={18} />
          Uploads resume on reconnect. Order details are optional and can be
          entered manually at any time.
        </div>
      )}
      <div className="upload-layout">
        <div>
          <section className="card upload-step">
            <div className="step-heading">
              <span>1</span>
              <div>
                <h2>Choose a category</h2>
                <p>We’ll organize each photo by its original capture date.</p>
              </div>
            </div>
            <div className="category-options">
              {cats.map(({ name, icon: Icon, description }) => (
                <button
                  key={name}
                  className={
                    category === name
                      ? 'category-option selected'
                      : 'category-option'
                  }
                  onClick={() => setCategory(name)}
                >
                  <Icon size={24} />
                  <strong>{name}</strong>
                  <small>{description}</small>
                  {category === name && (
                    <CheckCircle2 size={16} className="category-check" />
                  )}
                </button>
              ))}
            </div>
          </section>
          <section className="card upload-step">
            <div className="step-heading">
              <span>2</span>
              <div>
                <h2>Add photos from gallery or camera</h2>
                <p>Photos are prepared without waiting for order-label OCR.</p>
              </div>
            </div>
            <label className="field-label">
              Batch folder date <small>Optional · gallery uploads only</small>
              <input
                type="date"
                min="1900-01-01"
                max="2199-12-31"
                value={batchDate}
                onChange={(e) => setBatchDate(e.target.value)}
              />
              <small>
                Pick once to file every selected gallery image under this date.
                Leave blank to detect each image automatically. Camera photos
                always use today.
              </small>
            </label>
            <label className="field-label">
              Reference override <small>Optional · applies to this batch</small>
              <input
                placeholder="Leave blank to add details later"
                maxLength={120}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <label className="field-label">
              Notes <small>Optional</small>
              <textarea
                rows={2}
                placeholder="Condition, receiving bay, delivery details…"
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <div
              className={`drop-zone ${drag ? 'dragging' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                void add(e.dataTransfer.files, 'gallery');
              }}
            >
              <span className="upload-cloud">
                <UploadCloud size={32} />
              </span>
              <h3>
                {preparing ? analysisStatus : 'Drop photos for fast upload'}
              </h3>
              <p>JPG, PNG, WebP or HEIC · Up to 15 MB each</p>
              <div>
                <Button
                  variant="outline"
                  disabled={preparing}
                  onClick={() => picker.current?.click()}
                >
                  Choose from gallery
                </Button>
                <Button
                  disabled={preparing}
                  onClick={() => camera.current?.click()}
                >
                  <Camera size={17} />
                  Take a photo
                </Button>
              </div>
              <small>
                Original capture dates are read before optimization. GPS and
                other metadata are removed.
              </small>
            </div>
            <input
              ref={picker}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,.heic,.heif"
              hidden
              onChange={(e) => {
                if (e.target.files) void add(e.target.files, 'gallery');
                e.target.value = '';
              }}
            />
            <input
              ref={camera}
              type="file"
              capture="environment"
              accept="image/*"
              hidden
              onChange={(e) => {
                if (e.target.files) void add(e.target.files, 'camera');
                e.target.value = '';
              }}
            />
          </section>
          {reviews.length > 0 && (
            <section className="card upload-step">
              <div className="step-heading">
                <span>3</span>
                <div>
                  <h2>Review optional details</h2>
                  <p>
                    Upload now, or correct only the details that need attention.
                  </p>
                </div>
              </div>
              {reviews.map((item) => (
                <article className="smart-review" key={item.id}>
                  <PhotoPreview file={item.file} />
                  <div className="smart-review-fields">
                    <strong>{item.name}</strong>
                    <small>
                      Fast upload · order OCR paused ·{' '}
                      {item.captureSource === 'EXIF'
                        ? 'Original photo metadata'
                        : item.captureSource === 'FILENAME'
                          ? 'Date detected from file name'
                          : item.captureSource === 'FILE_TIMESTAMP'
                            ? 'Estimated from gallery file date'
                            : item.captureSource === 'CAMERA'
                              ? 'Camera capture on this device'
                              : 'No original capture metadata'}
                    </small>
                    {item.analysisNote && (
                      <p className="analysis-note">{item.analysisNote}</p>
                    )}
                    <label className="field-label">
                      Order name <small>Optional</small>
                      <input
                        maxLength={120}
                        value={item.orderName || ''}
                        placeholder="Optional · add later if needed"
                        onChange={(e) =>
                          void save({ ...item, orderName: e.target.value })
                        }
                      />
                    </label>
                    <label className="field-label">
                      Order / reference ID <small>Optional</small>
                      <input
                        maxLength={120}
                        value={item.referenceId}
                        placeholder="Optional · add later if needed"
                        onChange={(e) =>
                          void save({ ...item, referenceId: e.target.value })
                        }
                      />
                    </label>
                    <label className="field-label">
                      Folder date{' '}
                      <small>
                        {item.filedDate &&
                        item.captureDate &&
                        item.filedDate !== item.captureDate
                          ? `Batch date: ${item.filedDate}`
                          : item.captureDate
                            ? item.captureSource === 'FILE_TIMESTAMP'
                              ? `Estimated: ${item.captureDate} · verify only if this file was copied or edited`
                              : item.captureSource === 'FILENAME'
                                ? `Detected from name: ${item.captureDate}`
                                : item.captureSource === 'CAMERA'
                                  ? `Taken today: ${item.captureDate}`
                                  : `Original: ${item.captureDate}`
                            : 'No date detected · choose a date or leave in Misc'}
                      </small>
                      <input
                        type="date"
                        value={item.filedDate || ''}
                        min="1900-01-01"
                        max="2199-12-31"
                        onChange={(e) =>
                          void save({
                            ...item,
                            filedDate: e.target.value || null,
                          })
                        }
                      />
                    </label>
                    <p className="filing-destination">
                      <FolderTree size={14} />
                      {item.filedDate
                        ? `${item.category} / ${item.filedDate.slice(0, 4)} / ${item.filedDate}`
                        : 'Misc · admin sorting required'}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void remove(item.id)}
                    >
                      <Trash2 size={14} />
                      Remove photo
                    </Button>
                  </div>
                </article>
              ))}
              <Button disabled={preparing} onClick={approve}>
                <UploadCloud size={16} />
                {demo
                  ? 'Connect workspace to upload'
                  : `Upload ${reviews.length} reviewed photo${reviews.length === 1 ? '' : 's'}`}
              </Button>
            </section>
          )}
        </div>
        <aside>
          <section className="card queue-card">
            <div className="card-heading">
              <div>
                <h2>Upload queue</h2>
                <p>
                  {queue.length} pending · {completed} uploaded this session
                </p>
              </div>
              <span className="total-pill">{queue.length}</span>
            </div>
            {!queue.length ? (
              <div className="empty">
                <UploadCloud size={35} />
                <h3>Ready for fast upload</h3>
                <p>
                  Add a photo. We’ll find its folder date and skip order-label
                  scanning.
                </p>
              </div>
            ) : (
              queue.map((item) => (
                <div className="queue-item" key={item.id}>
                  <div>
                    <strong>
                      {item.orderName || item.referenceId || item.name}
                    </strong>
                    <small>
                      {item.filedDate
                        ? `${item.category} · ${item.filedDate}`
                        : 'Misc · needs sorting'}
                    </small>
                  </div>
                  <span>
                    {item.status === 'uploading'
                      ? `${progress[item.id] || 0}%`
                      : item.status === 'failed'
                        ? 'Needs retry'
                        : item.status === 'review'
                          ? 'Review details'
                          : 'Queued'}
                  </span>
                  <div className="progress-track">
                    <i style={{ width: `${progress[item.id] || 0}%` }} />
                  </div>
                  {item.error && <p className="queue-error">{item.error}</p>}
                  <div className="queue-actions">
                    {item.status === 'failed' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          void save({
                            ...item,
                            status: 'queued',
                            error: undefined,
                          })
                        }
                      >
                        <RefreshCw size={14} />
                        Retry
                      </Button>
                    )}
                    {item.status !== 'uploading' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void remove(item.id)}
                      >
                        <Trash2 size={14} />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </section>
          <section className="upload-tip">
            <FolderTree size={22} />
            <h3>The day it was taken.</h3>
            <p>
              Choose one date for a gallery batch, or leave it blank for
              automatic date detection. Camera photos use today.
            </p>
            <code>
              ImageVault / Category / Year / Date
              <br />
              ImageVault / Misc
            </code>
            <p>
              <ShieldCheck size={14} />
              Order-label scanning is paused for speed.
            </p>
            <small>
              Order details are optional. Any image with a folder date is filed
              there; only images with no date go to Misc for an administrator to
              sort.
            </small>
          </section>
        </aside>
      </div>
    </>
  );
}
