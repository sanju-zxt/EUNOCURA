import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  FlaskConical,
  AlertTriangle,
  RefreshCw,
  Loader,
  User,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../utils/api';

const PALETTE = ['#0ea5e9', '#8b5cf6', '#ef4444', '#f59e0b', '#10b981', '#ec4899', '#6366f1'];

const STATUS_STYLES = {
  normal: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  high: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  low: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
};

const isNum = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

const toTime = (iso) => {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : 0;
};

const formatDate = (iso, options) => {
  const time = toTime(iso);
  if (!time) return 'Unknown date';
  return new Date(time).toLocaleDateString('en-US', options || { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatValue = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? '');
  return Number.isInteger(num) ? String(num) : String(Number(num.toFixed(2)));
};

const StatusPill = ({ status }) => {
  const key = String(status || '').toLowerCase();
  const style = STATUS_STYLES[key] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${style}`}>
      {key ? key.toUpperCase() : 'UNKNOWN'}
    </span>
  );
};

/**
 * Chart points for one test. Prefers the API `series` map and falls back to the raw
 * `items` list when the map is absent. Values are only sorted and converted, never
 * interpolated or smoothed.
 */
export const pointsForTest = (series, items, testName) => {
  const fromSeries = Array.isArray(series?.[testName]) ? series[testName] : null;
  const raw = fromSeries
    ? fromSeries
    : (items || [])
        .filter((item) => item.test_name === testName)
        .map((item) => ({ t: item.taken_at, v: item.value, unit: item.unit, status: item.status }));

  return raw
    .map((point) => ({
      time: toTime(point.t),
      taken_at: point.t,
      v: Number(point.v),
      unit: point.unit || '',
      status: point.status || '',
    }))
    .filter((point) => Number.isFinite(point.v))
    .sort((a, b) => a.time - b.time);
};

/**
 * Reference bounds for one test, taken from the most recent item that carries them.
 * Returns null when the records have no reference data at all, so no band is drawn.
 */
export const referenceForTest = (items, testName) => {
  const ordered = (items || [])
    .filter((item) => item.test_name === testName)
    .sort((a, b) => toTime(b.taken_at) - toTime(a.taken_at));

  const complete = ordered.find((item) => isNum(item.reference_low) && isNum(item.reference_high));
  if (complete) {
    return { low: Number(complete.reference_low), high: Number(complete.reference_high) };
  }

  const withLow = ordered.find((item) => isNum(item.reference_low));
  const withHigh = ordered.find((item) => isNum(item.reference_high));
  const band = {};
  if (withLow) band.low = Number(withLow.reference_low);
  if (withHigh) band.high = Number(withHigh.reference_high);
  return band.low === undefined && band.high === undefined ? null : band;
};

const TestResults = ({ patientId: patientIdProp = '' }) => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const patientId = patientIdProp || searchParams.get('patientId') || '';
  const isDoctor = user?.role === 'doctor';

  const canFetch = !isDoctor || Boolean(patientId);

  const [data, setData] = useState({ items: [], series: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTest, setSelectedTest] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!canFetch) {
      setData({ items: [], series: {} });
      setError('');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      const query = isDoctor && patientId ? `?patient_id=${encodeURIComponent(patientId)}` : '';
      const response = await apiRequest(`/lab-results/me${query}`);
      if (cancelled) return;

      if (!response.success) {
        setData({ items: [], series: {} });
        setError(response.error || 'Could not load lab results');
        setLoading(false);
        return;
      }

      const payload = response.data || {};
      setData({
        items: Array.isArray(payload.items) ? payload.items : [],
        series: payload.series && typeof payload.series === 'object' ? payload.series : {},
      });
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [canFetch, patientId, reloadKey]);

  const { items, series } = data;

  const testNames = useMemo(() => {
    const keys = new Set(Object.keys(series));
    items.forEach((item) => {
      if (item && item.test_name) keys.add(item.test_name);
    });
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [series, items]);

  const activeTest = useMemo(() => {
    if (testNames.length === 0) return '';
    return selectedTest && testNames.includes(selectedTest) ? selectedTest : testNames[0];
  }, [testNames, selectedTest]);

  /** Points come from the API series, or are derived from the raw items when the series map is empty. */
  const getPoints = useCallback(
    (testName) => pointsForTest(series, items, testName),
    [series, items]
  );

  const points = useMemo(() => (activeTest ? getPoints(activeTest) : []), [activeTest, getPoints]);

  const reference = useMemo(
    () => (activeTest ? referenceForTest(items, activeTest) : null),
    [items, activeTest]
  );

  const rows = useMemo(() => {
    if (!activeTest) return [];
    const matching = items.filter((item) => item.test_name === activeTest);
    if (matching.length > 0) {
      return [...matching]
        .sort((a, b) => toTime(b.taken_at) - toTime(a.taken_at))
        .map((item) => ({
          id: item.id || `${item.taken_at}-${item.value}`,
          taken_at: item.taken_at,
          value: item.value,
          unit: item.unit,
          status: item.status,
          low: item.reference_low,
          high: item.reference_high,
          source: item.source,
        }));
    }
    return [...points]
      .reverse()
      .map((point) => ({
        id: `${point.taken_at}-${point.v}`,
        taken_at: point.taken_at,
        value: point.v,
        unit: point.unit,
        status: point.status,
        low: null,
        high: null,
        source: null,
      }));
  }, [items, points, activeTest]);

  /** A single reading has no time span, so widen the axis by a day instead of collapsing it. */
  const xDomain = useMemo(() => {
    if (points.length === 0) return [0, 1];
    if (points.length === 1) {
      const day = 24 * 60 * 60 * 1000;
      return [points[0].time - day, points[0].time + day];
    }
    return ['dataMin', 'dataMax'];
  }, [points]);

  const yDomain = useMemo(() => {
    const values = points.map((point) => point.v);
    if (reference?.low !== undefined) values.push(reference.low);
    if (reference?.high !== undefined) values.push(reference.high);
    if (values.length === 0) return [0, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.15 || Math.max(Math.abs(max) * 0.1, 1);
    return [Number((min - pad).toFixed(2)), Number((max + pad).toFixed(2))];
  }, [points, reference]);

  const trend = useMemo(() => {
    if (points.length < 2) return 'stable';
    const latest = points[points.length - 1].v;
    const previous = points[points.length - 2].v;
    if (!previous) return 'stable';
    const change = ((latest - previous) / Math.abs(previous)) * 100;
    if (Math.abs(change) < 2) return 'stable';
    return change > 0 ? 'up' : 'down';
  }, [points]);

  const trendIcon = (kind) => {
    if (kind === 'up') return <TrendingUp className="w-4 h-4 text-red-600 dark:text-red-400" />;
    if (kind === 'down') return <TrendingDown className="w-4 h-4 text-green-600 dark:text-green-400" />;
    return <Minus className="w-4 h-4 text-gray-600 dark:text-gray-400" />;
  };

  const latestFor = useCallback(
    (testName) => {
      const testPoints = getPoints(testName);
      return testPoints.length ? testPoints[testPoints.length - 1] : null;
    },
    [getPoints]
  );

  const selectedPoints = points;
  const latest = selectedPoints.length ? selectedPoints[selectedPoints.length - 1] : null;
  const selectedUnit = latest?.unit || '';
  const rangeText =
    reference?.low !== undefined && reference?.high !== undefined
      ? `${formatValue(reference.low)} – ${formatValue(reference.high)} ${selectedUnit}`.trim()
      : reference?.high !== undefined
      ? `below ${formatValue(reference.high)} ${selectedUnit}`.trim()
      : reference?.low !== undefined
      ? `above ${formatValue(reference.low)} ${selectedUnit}`.trim()
      : null;

  const header = (
    <div className="mb-8">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Test Results &amp; Trends</h2>
      <p className="text-gray-600 dark:text-gray-400">
        {isDoctor
          ? 'Laboratory values recorded for the selected patient, charted from the source records'
          : 'Your laboratory values over time, charted from your records'}
      </p>
    </div>
  );

  if (!canFetch) {
    return (
      <div className="max-w-7xl mx-auto">
        {header}
        <div className="card text-center py-20">
          <User className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Select a patient</h3>
          <p className="text-gray-600 dark:text-gray-400">
            Open a patient from the Patients screen to review their laboratory trends.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        {header}
        <div className="card flex flex-col items-center justify-center py-20">
          <Loader className="w-10 h-10 text-primary-600 dark:text-primary-400 animate-spin mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading lab results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        {header}
        <div className="card text-center py-16 border-2 border-dashed border-red-200 dark:border-red-900/50">
          <AlertTriangle className="w-12 h-12 text-red-500 dark:text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Could not load lab results</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-xl mx-auto">{error}</p>
          <button
            onClick={() => setReloadKey((key) => key + 1)}
            className="inline-flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (testNames.length === 0) {
    return (
      <div className="max-w-7xl mx-auto">
        {header}
        <div className="card text-center py-20">
          <FlaskConical className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No lab results recorded for this patient
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Nothing has been recorded yet. Trends will appear here once lab values are added.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {header}

      {/* Test selector, built from the returned series keys */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        {testNames.map((name, index) => {
          const testLatest = latestFor(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => setSelectedTest(name)}
              className={`card text-center transition-all ${
                activeTest === name
                  ? 'ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'hover:shadow-lg'
              }`}
            >
              <div className="flex items-center justify-center mb-2">
                {trendIcon(activeTest === name ? trend : 'stable')}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 break-words" title={name}>
                {name}
              </p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {testLatest ? formatValue(testLatest.v) : '—'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{testLatest?.unit || ''}</p>
              <span
                className="block h-1 w-8 mx-auto mt-2 rounded-full"
                style={{ backgroundColor: PALETTE[index % PALETTE.length] }}
              />
            </button>
          );
        })}
      </div>

      {/* Trend chart */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-start justify-between mb-6 gap-3">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{activeTest}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {latest
                ? `Latest: ${formatValue(latest.v)} ${selectedUnit} on ${formatDate(latest.taken_at)}`.trim()
                : 'No values for this test'}
            </p>
            {rangeText && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Reference range: {rangeText}</p>
            )}
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold">
            {selectedPoints.length} point{selectedPoints.length === 1 ? '' : 's'}
          </span>
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={selectedPoints} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" strokeOpacity={0.35} />
            <XAxis
              dataKey="time"
              type="number"
              domain={xDomain}
              scale="time"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickFormatter={(value) => formatDate(new Date(value).toISOString(), { month: 'short', day: 'numeric' })}
            />
            <YAxis domain={yDomain} tick={{ fontSize: 12, fill: '#6b7280' }} width={56} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(17, 24, 39, 0.95)',
                border: 'none',
                borderRadius: '8px',
                color: '#f9fafb',
              }}
              labelStyle={{ color: '#f9fafb' }}
              labelFormatter={(value) => formatDate(new Date(value).toISOString())}
              formatter={(value) => [`${formatValue(value)} ${selectedUnit}`.trim(), activeTest]}
            />
            <Legend />
            {reference?.low !== undefined && reference?.high !== undefined && (
              <ReferenceArea
                y1={reference.low}
                y2={reference.high}
                fill="#10b981"
                fillOpacity={0.12}
                stroke="#10b981"
                strokeOpacity={0.35}
                label={{
                  value: 'reference range',
                  position: 'insideTopRight',
                  fill: '#059669',
                  fontSize: 11,
                }}
              />
            )}
            {reference?.low !== undefined && reference?.high === undefined && (
              <ReferenceLine y={reference.low} stroke="#10b981" strokeDasharray="4 4" />
            )}
            {reference?.high !== undefined && reference?.low === undefined && (
              <ReferenceLine y={reference.high} stroke="#10b981" strokeDasharray="4 4" />
            )}
            <Line
              type="linear"
              dataKey="v"
              stroke={PALETTE[Math.max(0, testNames.indexOf(activeTest)) % PALETTE.length]}
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
              name={selectedUnit ? `${activeTest} (${selectedUnit})` : activeTest}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Values table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">{activeTest} readings</h3>
          <span className="text-sm text-gray-600 dark:text-gray-400">{rows.length} record{rows.length === 1 ? '' : 's'}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="py-3 pr-4 font-semibold">Taken</th>
                <th className="py-3 pr-4 font-semibold">Value</th>
                <th className="py-3 pr-4 font-semibold">Status</th>
                <th className="py-3 pr-4 font-semibold">Reference</th>
                <th className="py-3 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">{formatDate(row.taken_at)}</td>
                  <td className="py-3 pr-4 font-semibold text-gray-900 dark:text-white">
                    {formatValue(row.value)} {row.unit || ''}
                  </td>
                  <td className="py-3 pr-4">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">
                    {isNum(row.low) && isNum(row.high)
                      ? `${formatValue(row.low)} – ${formatValue(row.high)}`
                      : isNum(row.high)
                      ? `below ${formatValue(row.high)}`
                      : isNum(row.low)
                      ? `above ${formatValue(row.low)}`
                      : '—'}
                  </td>
                  <td className="py-3 text-gray-600 dark:text-gray-400 capitalize">{row.source || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TestResults;
