'use client';
import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Images,
  Upload,
  Users,
  Package,
  Layers,
  CircleAlert,
  Box,
  ChevronRight,
} from 'lucide-react';
import { Button } from './ui/button';
import { useData, DataError, Empty } from './workspace';
import type { Stats, Viewer, VaultImage } from '@/lib/client';
import { toast } from 'sonner';
import { Thumbnail } from './gallery';
export const colors = ['#5a50e5', '#a499f5', '#f3ad61', '#b7c3d7'];
export function dayString(d: Date, timezone = 'Europe/London') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
export function RangePicker({
  range,
  setRange,
  timezone,
}: {
  timezone: string;
  range: { start: string; end: string };
  setRange: (v: { start: string; end: string }) => void;
}) {
  const [preset, setPreset] = useState('30');
  return (
    <div className="range-picker">
      <CalendarDays size={16} />
      <select
        aria-label="Date range"
        value={preset}
        onChange={(e) => {
          setPreset(e.target.value);
          if (e.target.value !== 'custom') {
            const end = new Date(),
              start = new Date();
            start.setDate(start.getDate() - Number(e.target.value) + 1);
            setRange({
              start: dayString(start, timezone),
              end: dayString(end, timezone),
            });
          }
        }}
      >
        <option value="1">Today</option>
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="custom">Custom range</option>
      </select>
      {preset === 'custom' && (
        <>
          <input
            aria-label="Start date"
            type="date"
            value={range.start}
            onChange={(e) => setRange({ ...range, start: e.target.value })}
          />
          <span>–</span>
          <input
            aria-label="End date"
            type="date"
            value={range.end}
            onChange={(e) => setRange({ ...range, end: e.target.value })}
          />
        </>
      )}
    </div>
  );
}
export function Dashboard({
  demo,
  go,
  user,
  timezone,
}: {
  timezone: string;
  demo: boolean;
  go: (v: string, f?: Record<string, string>) => void;
  user: Viewer;
}) {
  const [range, setRange] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return {
      start: dayString(d, timezone),
      end: dayString(new Date(), timezone),
    };
  });
  const params = new URLSearchParams(range).toString();
  const { data, error, loading, reload } = useData<Stats>(
    'stats/summary?' + params,
    demo,
  );
  const recent = useData<{ items: VaultImage[] }>('images', demo);
  const exportCsv = () =>
    demo
      ? toast.info(
          'CSV export is available after connecting your live workspace.',
        )
      : location.assign('/api/export/csv?' + params);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR OPERATIONS, AT A GLANCE</div>
          <h1>
            Workspace overview<span className="heading-dot">.</span>
          </h1>
          <p>Every image accounted for. Every handoff a little clearer.</p>
        </div>
        <div className="heading-actions">
          <Button variant="outline" onClick={exportCsv}>
            <ArrowDownToLine size={16} />
            Export report
          </Button>
          <Button onClick={() => go('upload')}>
            <Upload size={16} />
            Upload images
          </Button>
        </div>
      </div>
      <div className="section-toolbar">
        <div className="live-label">
          <span className="status-dot" />
          {demo ? 'Sample workspace data' : 'Warehouse image records'}
        </div>
        <RangePicker timezone={timezone} range={range} setRange={setRange} />
      </div>
      {error ? (
        <DataError error={error} retry={reload} />
      ) : (
        <>
          <div className="kpi-grid">
            {[
              {
                label: 'Total images',
                value: data?.total,
                icon: Images,
                sub: 'All-time image records',
                tone: 'indigo',
              },
              {
                label: 'Uploaded today',
                value: data?.today,
                icon: Upload,
                sub: 'Captured since midnight',
                tone: 'blue',
              },
              {
                label: 'This week',
                value: data?.week,
                icon: CalendarDays,
                sub: 'Since Monday',
                tone: 'violet',
              },
              {
                label: 'This month',
                value: data?.month,
                icon: Layers,
                sub: 'Current calendar month',
                tone: 'amber',
              },
              {
                label: 'Active members',
                value: data?.activeUsers,
                icon: Users,
                sub: 'Approved team members',
                tone: 'green',
              },
            ].map(({ label, value, icon: Icon, sub, tone }) => (
              <article className="card kpi" key={label}>
                <div>
                  <span>{label}</span>
                  <span className={`kpi-icon ${tone}`}>
                    <Icon size={18} />
                  </span>
                </div>
                <strong className={loading ? 'skeleton' : ''}>
                  {value?.toLocaleString() ?? '—'}
                </strong>
                <small>{sub}</small>
              </article>
            ))}
          </div>
          <div className="charts-grid">
            <section className="card chart-card">
              <div className="card-heading">
                <div>
                  <h2>Upload activity</h2>
                  <p>Your team’s image uploads over time</p>
                </div>
                <span className="chart-legend">
                  <i />
                  Images uploaded
                </span>
              </div>
              <div className="chart-area">
                {data?.daily.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={data.daily}
                      margin={{ top: 14, right: 12, left: -27, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="chartFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#655be8"
                            stopOpacity={0.24}
                          />
                          <stop
                            offset="100%"
                            stopColor="#655be8"
                            stopOpacity={0.01}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        vertical={false}
                        stroke="var(--border)"
                        strokeDasharray="4 4"
                      />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v) =>
                          new Date(v + 'T12:00:00').toLocaleDateString(
                            'en-GB',
                            { day: 'numeric', month: 'short' },
                          )
                        }
                        axisLine={false}
                        tickLine={false}
                        minTickGap={30}
                        tick={{ fontSize: 11, fill: '#8992a5' }}
                        dy={9}
                      />
                      <YAxis
                        allowDecimals={false}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#8992a5' }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="total"
                        name="Images"
                        stroke="#655be8"
                        strokeWidth={2.5}
                        fill="url(#chartFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : loading ? (
                  <div className="skeleton chart-skeleton" />
                ) : (
                  <Empty
                    title="Ready for the first upload"
                    description="Upload activity will appear here."
                  />
                )}
              </div>
              <div className="chart-foot">
                <span>
                  <strong>{data?.filteredTotal ?? 0}</strong> images in selected
                  period
                </span>
                <button onClick={() => go('gallery', range)}>
                  View images <ArrowRight size={14} />
                </button>
              </div>
            </section>
            <section className="card category-chart">
              <div className="card-heading">
                <div>
                  <h2>By category</h2>
                  <p>A snapshot of what’s coming in</p>
                </div>
                <Package size={18} />
              </div>
              <div className="donut-container">
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie
                      data={data?.categories || []}
                      dataKey="value"
                      innerRadius={62}
                      outerRadius={80}
                      paddingAngle={4}
                      stroke="none"
                      startAngle={90}
                      endAngle={-270}
                    >
                      {colors.map((c) => (
                        <Cell key={c} fill={c} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--card)',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-label">
                  <strong>{data?.filteredTotal ?? '—'}</strong>
                  <span>Total images</span>
                </div>
              </div>
              <div className="category-legend">
                {(
                  data?.categories ||
                  ['Parcels', 'Pallets', 'Damaged', 'Other'].map((name) => ({
                    name,
                    value: 0,
                  }))
                ).map((c, i) => (
                  <button
                    key={c.name}
                    onClick={() =>
                      go('gallery', { ...range, category: c.name })
                    }
                  >
                    <i style={{ background: colors[i] }} />
                    <span>{c.name}</span>
                    <strong>{c.value}</strong>
                    <small>
                      {data?.filteredTotal
                        ? Math.round((c.value / data.filteredTotal) * 100)
                        : 0}
                      %
                    </small>
                  </button>
                ))}
              </div>
            </section>
          </div>
          <div className="lower-grid">
            <section className="card daily-card">
              <div className="card-heading">
                <div>
                  <h2>Daily breakdown</h2>
                  <p>Organized by date. Ready when you need it.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => go('gallery', range)}
                >
                  View all <ChevronRight size={15} />
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Parcels</th>
                      <th>Pallets</th>
                      <th>Damaged</th>
                      <th>Other</th>
                      <th>Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data?.daily
                      .slice()
                      .reverse()
                      .slice(0, 5)
                      .map((d) => (
                        <tr key={d.date}>
                          <td>
                            <button
                              className="date-link"
                              onClick={() =>
                                go('gallery', { start: d.date, end: d.date })
                              }
                            >
                              <CalendarDays size={14} />
                              {new Date(
                                d.date + 'T12:00:00',
                              ).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </button>
                          </td>
                          {['Parcels', 'Pallets', 'Damaged', 'Other'].map(
                            (c) => (
                              <td key={c}>
                                {d[c] || <span className="muted">—</span>}
                              </td>
                            ),
                          )}
                          <td>
                            <span className="total-pill">{d.total}</span>
                          </td>
                          <td>
                            <button
                              aria-label={`View ${d.date}`}
                              onClick={() =>
                                go('gallery', { start: d.date, end: d.date })
                              }
                            >
                              <ArrowUpRight size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!loading && !data?.daily.length && <Empty />}
              </div>
            </section>
            <section className="card team-chart">
              <div className="card-heading">
                <div>
                  <h2>Team contributions</h2>
                  <p>Uploads in the selected period</p>
                </div>
                <Users size={18} />
              </div>
              <div style={{ height: 215 }}>
                {data?.users.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={data.users.slice(0, 5)}
                      margin={{ left: 10, right: 25 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#7d8599' }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--card)',
                          borderRadius: 10,
                          border: '1px solid var(--border)',
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name="Uploads"
                        fill="#a499f5"
                        radius={[0, 5, 5, 0]}
                        barSize={16}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty
                    title="No contributions yet"
                    description="Team activity will appear here."
                  />
                )}
              </div>
            </section>
          </div>
          <section className="recent-section">
            <div className="section-heading">
              <div>
                <h2>Recently captured</h2>
                <p>The latest arrivals in your workspace</p>
              </div>
              <button className="text-button" onClick={() => go('gallery')}>
                Open gallery <ArrowRight size={16} />
              </button>
            </div>
            <div className="recent-grid">
              {recent.data?.items.slice(0, 4).map((item) => (
                <button
                  className="recent-image card"
                  key={item.id}
                  onClick={() => go('gallery', { reference: item.referenceId })}
                >
                  <Thumbnail item={item} demo={demo} />
                  <div>
                    <span>
                      <strong>{item.referenceId}</strong>
                      <small>
                        {item.categoryId} · {item.uploadedBy.name.split(' ')[0]}
                      </small>
                    </span>
                    <ArrowUpRight size={17} />
                  </div>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
