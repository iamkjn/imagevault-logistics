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
  ScanText,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import {
  listQueue,
  saveQueue,
  deleteQueue,
  type QueuedImage,
} from '@/lib/queue';
import { readCapture, recognizeOrder } from '@/lib/photo-analysis';
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
        setAnalysisStatus(`Detecting order label · ${original.name}`);
        let detected = {
          referenceId: '',
          orderName: '',
          confidence: 0,
          candidates: [] as string[],
          needsReview: true,
        };
        let analysisNote = '';
        try {
          detected = await recognizeOrder(compressed, setAnalysisStatus);
          if (detected.needsReview)
            analysisNote =
              detected.candidates.length > 1
                ? `Multiple references found: ${detected.candidates.join(', ')}. Choose the correct one.`
                : 'No single reliable order reference found. Enter it below, or keep this image in Misc.';
        } catch {
          analysisNote =
            'Automatic label reading is unavailable. Enter the order details manually, or keep this image in Misc.';
        }
        const referenceId = reference.trim() || detected.referenceId;
        const known = Boolean(referenceId || detected.orderName);
        await save({
          id: crypto.randomUUID(),
          userId: user.id,
          file: compressed,
          name: original.name.replace(/\.[^.]+$/, '.jpg'),
          category,
          referenceId,
          orderName: detected.orderName,
          detectedReference: detected.referenceId,
          ocrConfidence: detected.confidence,
          ...capture,
          filedDate: known ? capture.captureDate : null,
          notes,
          status: 'review',
          createdAt: Date.now(),
          analysisNote,
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
        filedDate:
          item.referenceId.trim() || item.orderName?.trim()
            ? item.filedDate
            : null,
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
            We’ll read the order label and original photo date. You’re in
            control.
          </p>
        </div>
        <span className="connection-pill">
          <span className="status-dot" />
          {online ? 'Ready to scan' : 'Offline · Queuing enabled'}
        </span>
      </div>
      {demo && (
        <div className="info-box">
          <ScanText size={20} />
          Try order detection with your own photos. Analysis runs on this
          device; demo photos are not uploaded or saved after leaving this page.
        </div>
      )}
      {!online && (
        <div className="info-box">
          <WifiOff size={18} />
          Uploads resume on reconnect. If the OCR model has not been cached, you
          can enter order details manually.
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
                <p>Order names and references are detected automatically.</p>
              </div>
            </div>
            <label className="field-label">
              Reference override <small>Optional · applies to this batch</small>
              <input
                placeholder="Leave blank to read each image’s label"
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
                <ScanText size={32} />
              </span>
              <h3>
                {preparing
                  ? analysisStatus
                  : 'Drop photos to scan their labels'}
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
                  <h2>Review detected details</h2>
                  <p>
                    Check every label before uploading. Unsorted images stay in
                    Misc.
                  </p>
                </div>
              </div>
              {reviews.map((item) => (
                <article className="smart-review" key={item.id}>
                  <PhotoPreview file={item.file} />
                  <div className="smart-review-fields">
                    <strong>{item.name}</strong>
                    <small>
                      Label recognition: {item.ocrConfidence || 0}% ·{' '}
                      {item.captureSource === 'EXIF'
                        ? 'Original photo metadata'
                        : item.captureSource === 'CAMERA'
                          ? 'Camera capture on this device'
                          : 'No original capture metadata'}
                    </small>
                    {item.analysisNote && (
                      <p className="analysis-note">{item.analysisNote}</p>
                    )}
                    <label className="field-label">
                      Order name
                      <input
                        maxLength={120}
                        value={item.orderName || ''}
                        placeholder="Automatically detected when labeled"
                        onChange={(e) =>
                          void save({ ...item, orderName: e.target.value })
                        }
                      />
                    </label>
                    <label className="field-label">
                      Order / reference ID
                      <input
                        maxLength={120}
                        value={item.referenceId}
                        placeholder="No reliable reference detected"
                        onChange={(e) =>
                          void save({ ...item, referenceId: e.target.value })
                        }
                      />
                    </label>
                    <label className="field-label">
                      Folder date{' '}
                      <small>
                        {item.captureDate
                          ? `Original: ${item.captureDate}`
                          : 'No EXIF date · choose a date or leave in Misc'}
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
                      {item.filedDate &&
                      (item.referenceId.trim() || item.orderName?.trim())
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
                <ScanText size={35} />
                <h3>Ready to read the details</h3>
                <p>
                  Add a photo. We’ll suggest the order and find the date it was
                  taken.
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
                      {item.filedDate && (item.referenceId || item.orderName)
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
              Gallery photos use their original EXIF capture date, not the date
              they were downloaded or uploaded.
            </p>
            <code>
              ImageVault / Category / Year / Date
              <br />
              ImageVault / Misc
            </code>
            <p>
              <ShieldCheck size={14} />
              Label reading happens on this device.
            </p>
            <small>
              Missing or ambiguous details? Keep the image in Misc. Admins can
              correct the order and move it into any date folder. Camera photos
              without EXIF use the current device capture date. Gallery photos
              never fall back to file modification time.
            </small>
          </section>
        </aside>
      </div>
    </>
  );
}
