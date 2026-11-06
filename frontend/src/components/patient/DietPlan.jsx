import React, { useCallback, useEffect, useId, useState } from 'react';
import {
  Apple,
  CheckCircle,
  XCircle,
  Lightbulb,
  Download,
  Droplets,
  RefreshCw,
  AlertCircle,
  Stethoscope,
  Activity,
  ChevronDown,
} from 'lucide-react';
import { previewDietPlan } from '../../data/previewDietPlan';
import { apiRequest } from '../../utils/api';
import useIsMobile from '../mobile/useIsMobile';
import { hapticTap } from '../../services/native';
import FixtureNotice from '../FixtureNotice';

const SLOT_TONES = [
  'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
  'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
];

/**
 * Reading measure for clinical prose: ~65–75 characters per line on a phone.
 * The `md:max-w-none` keeps the full-width text desktop has today.
 */
const MEASURE = 'max-w-[68ch] md:max-w-none';

/**
 * The five preview meal slots this screen has always rendered. They belong to
 * the labelled fixture branch only (the screen is wrapped in `FixtureNotice`)
 * and are never merged with a clinician-authored plan.
 */
const PREVIEW_MEAL_SLOTS = [
  {
    label: 'Breakfast (8:00 AM)',
    tone: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
    items: [
      '1 bowl of oatmeal with fresh berries',
      '1 glass of low-fat milk',
      '1 banana',
      'Green tea',
    ],
  },
  {
    label: 'Mid-Morning (11:00 AM)',
    tone: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300',
    items: ['Handful of almonds and walnuts', '1 apple'],
  },
  {
    label: 'Lunch (1:00 PM)',
    tone: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
    items: [
      '2 chapatis (whole wheat)',
      '1 cup dal (lentils)',
      'Mixed vegetable curry',
      'Green salad with lemon dressing',
      'Buttermilk (low-fat)',
    ],
  },
  {
    label: 'Evening (5:00 PM)',
    tone: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
    items: ['Green tea', '2-3 whole grain crackers'],
  },
  {
    label: 'Dinner (7:30 PM)',
    tone: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    items: [
      'Grilled fish or chicken breast (150g)',
      '1 cup brown rice',
      'Steamed vegetables (broccoli, carrots, beans)',
      'Clear vegetable soup',
    ],
  },
];

/** "breakfast" -> "Breakfast"; "post workout" -> "Post workout". */
const slotLabel = (slot) => {
  const text = (slot || 'Meal').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const formatWhen = (iso) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

/** Group the clinician's rows by slot, keeping the order the plan was written in. */
const groupBySlot = (items) => {
  const groups = [];
  const seen = new Map();
  items.forEach((item, index) => {
    if (!item) return;
    const slot = slotLabel(item.slot);
    const key = slot.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, groups.length);
      groups.push({ slot, rows: [] });
    }
    groups[seen.get(key)].rows.push({ ...item, key: `${key}-${index}` });
  });
  return groups;
};

const activityText = (entry) => {
  if (typeof entry === 'string') return { title: entry, detail: '' };
  return { title: entry?.title || entry?.name || '', detail: entry?.detail || entry?.description || '' };
};

/**
 * One day/slot of the plan.
 *
 * On a phone the header row is the disclosure control: a full-width 44px-tall
 * button that reports `aria-expanded` and turns its chevron. On desktop every
 * section starts open, so the screen reads exactly as it did before.
 */
const SlotSection = ({ panelId, title, tone, meta, open, onToggle, children }) => (
  <section className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    <h4>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="tap w-full min-h-[44px] flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <span className="min-w-0 flex-1">
          <span
            className={`inline-block max-w-full break-words px-3 py-1 rounded-full text-sm font-semibold ${tone}`}
          >
            {title}
          </span>
          <span className="ml-2 align-middle text-xs text-gray-500 dark:text-gray-400">{meta}</span>
        </span>
        <ChevronDown
          className={`w-5 h-5 flex-shrink-0 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>
    </h4>
    <div id={panelId} className={open ? 'px-4 pb-4' : 'hidden'}>
      {children}
    </div>
  </section>
);

const Skeleton = () => (
  <div className="card p-4 sm:p-6 mb-6 animate-pulse" aria-busy="true" aria-label="Loading your care plan">
    <div className="flex items-center space-x-3 mb-6">
      <div className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-gray-700" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-48 max-w-full rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-32 max-w-full rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
    <div className="space-y-4">
      {[0, 1, 2].map((row) => (
        <div key={row} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-2">
          <div className="h-3 w-24 max-w-full rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-700/60" />
          <div className="h-3 w-3/4 rounded bg-gray-100 dark:bg-gray-700/60" />
        </div>
      ))}
    </div>
  </div>
);

const DietPlan = () => {
  const [state, setState] = useState({ status: 'loading', plan: null, error: null });
  const isMobile = useIsMobile();
  const baseId = useId();

  // Phone defaults: first section open, the rest closed. Explicit user toggles
  // live here; anything not named falls back to that default.
  const [openOverrides, setOpenOverrides] = useState({});

  const loadPlan = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'loading', error: null }));
    const response = await apiRequest('/care-plan/me');
    if (!response.success) {
      setState({ status: 'error', plan: null, error: response.error });
      return;
    }
    const data = response.data || {};
    setState({ status: 'loaded', plan: data, error: null });
  }, []);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  // Rotating the device (or resizing past 768px) re-applies the shape's default.
  useEffect(() => {
    setOpenOverrides({});
  }, [isMobile]);

  const isOpen = (key, index) => {
    if (typeof openOverrides[key] === 'boolean') return openOverrides[key];
    return !isMobile || index === 0;
  };

  const toggle = (key, index) => {
    hapticTap();
    setOpenOverrides((prev) => ({ ...prev, [key]: !isOpen(key, index) }));
  };

  const items = Array.isArray(state.plan?.items) ? state.plan.items.filter(Boolean) : [];
  const hasClinicianPlan = state.status === 'loaded' && state.plan?.source && items.length > 0;
  const notes = typeof state.plan?.notes === 'string' ? state.plan.notes.trim() : '';
  const activity = Array.isArray(state.plan?.activity) ? state.plan.activity.map(activityText).filter((row) => row.title || row.detail) : [];
  const updatedAt = formatWhen(state.plan?.updated_at);
  const groups = hasClinicianPlan ? groupBySlot(items) : [];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-5 sm:mb-8">
        <h2 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2">My Diet Plan</h2>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Personalized nutrition recommendations for your heart health</p>
      </div>

      {state.status === 'loading' && <Skeleton />}

      {state.status === 'error' && (
        <div className="mb-6 rounded-xl border-2 border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-3">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm flex-1 min-w-0">
              <p className="font-semibold text-red-900 dark:text-red-200">Could not load your care plan</p>
              <p className="text-red-800 dark:text-red-300 break-words">
                {state.error || 'The care plan service did not answer.'}
              </p>
            </div>
            <button
              type="button"
              onClick={loadPlan}
              className="btn-secondary tap text-sm flex items-center justify-center flex-shrink-0 w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
              Retry
            </button>
          </div>
        </div>
      )}

      {state.status === 'loaded' && !hasClinicianPlan && (
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <span>
            No clinician care plan is on file for your account yet. Everything below is the preview plan, not a
            prescription. Your care team sets the real plan after a consultation.
          </span>
        </p>
      )}

      {hasClinicianPlan ? (
        <div className="space-y-4 sm:space-y-6">
          <div className="card p-4 sm:p-6 bg-gradient-to-r from-teal-50 to-blue-50 dark:from-teal-900/20 dark:to-blue-900/20 border-2 border-teal-200 dark:border-teal-700 hover:shadow-xl transition-all duration-200">
            <div className="flex items-start gap-3">
              <div className="bg-gradient-to-br from-teal-500 to-teal-600 p-2.5 sm:p-3 rounded-xl shadow-md flex-shrink-0">
                <Stethoscope className="w-5 h-5 sm:w-6 sm:h-6 text-white" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-1">Your care plan</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300 break-words">
                  Set by your clinician{updatedAt ? ` · updated ${updatedAt}` : ''}
                </p>
              </div>
              {/* The subtitle says the same thing; the pill is the desktop affordance. */}
              <span className="hidden sm:inline-flex text-xs px-3 py-1 rounded-full font-semibold bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 self-start">
                Set by your clinician
              </span>
            </div>
          </div>

          <div className="card p-4 sm:p-6 hover:shadow-xl transition-all duration-200">
            <div className="flex items-center gap-2 mb-4">
              <div className="bg-green-100 dark:bg-green-900/40 p-2 rounded-xl shadow-md flex-shrink-0">
                <Apple className="w-5 h-5 text-green-600 dark:text-green-400" aria-hidden="true" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white min-w-0">Meals by slot</h3>
            </div>

            <div className="space-y-3 sm:space-y-4">
              {groups.map((group, groupIndex) => {
                const key = `slot:${group.slot.toLowerCase()}`;
                return (
                  <SlotSection
                    key={group.slot}
                    panelId={`${baseId}-slot-${groupIndex}`}
                    title={group.slot}
                    tone={SLOT_TONES[groupIndex % SLOT_TONES.length]}
                    meta={`${group.rows.length} ${group.rows.length === 1 ? 'entry' : 'entries'}`}
                    open={isOpen(key, groupIndex)}
                    onToggle={() => toggle(key, groupIndex)}
                  >
                    <ul className="space-y-3">
                      {group.rows.map((row) => (
                        <li key={row.key} className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                          <div className="min-w-0">
                            {row.title && (
                              <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">{row.title}</p>
                            )}
                            {row.detail && <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed break-words">{row.detail}</p>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </SlotSection>
                );
              })}
            </div>
          </div>

          {activity.length > 0 && (
            <div className="card p-4 sm:p-6 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 hover:shadow-xl transition-all duration-200">
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-2 rounded-xl shadow-md flex-shrink-0">
                  <Activity className="w-5 h-5 text-white" aria-hidden="true" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white min-w-0">Activity</h3>
              </div>
              <ul className="space-y-3">
                {activity.map((row, index) => (
                  <li key={index} className="flex items-start gap-3 p-3 bg-white dark:bg-gray-700 rounded-lg border border-blue-200 dark:border-blue-600">
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md">
                      <span className="text-white text-xs font-bold">{index + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      {row.title && <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">{row.title}</p>}
                      {row.detail && <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed break-words">{row.detail}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {notes && (
            <div className="card p-4 sm:p-6 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 hover:shadow-xl transition-all duration-200">
              <div className="flex items-start gap-3">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-2 rounded-xl shadow-md flex-shrink-0">
                  <Lightbulb className="w-5 h-5 text-white" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2">Notes from your clinician</h3>
                  <p className={`text-base text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap break-words ${MEASURE}`}>
                    {notes}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        state.status !== 'loading' && (
          <>
            <FixtureNotice
              feature="diet plan"
              note={
                state.status === 'error'
                  ? 'The care plan service is unreachable right now, so this screen shows the preview plan from src/data/previewDietPlan.js until it answers. None of it is real patient data.'
                  : 'No clinician plan is on file, so this screen renders the preview plan from src/data/previewDietPlan.js. None of it is real patient data.'
              }
            />

            {/* Overview */}
            <div className="card p-4 sm:p-6 mb-6 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 border-2 border-green-200 dark:border-green-700 hover:shadow-xl transition-all duration-200">
              <div className="flex items-start gap-3">
                <div className="bg-gradient-to-br from-green-500 to-green-600 p-2.5 sm:p-3 rounded-xl shadow-md flex-shrink-0">
                  <Apple className="w-5 h-5 sm:w-6 sm:h-6 text-white" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2">Heart-Healthy Diet Plan</h3>
                  <p className={`text-base text-gray-700 dark:text-gray-300 leading-relaxed break-words ${MEASURE}`}>
                    {previewDietPlan.general}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 sm:gap-6 mb-6">
              {/* Recommended Foods */}
              <div className="card p-4 sm:p-6 border-2 border-green-200 dark:border-green-700 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-green-100 dark:bg-green-900/40 p-2 rounded-xl shadow-md flex-shrink-0">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" aria-hidden="true" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white min-w-0">Recommended Foods</h3>
                </div>
                <div className="space-y-2">
                  {previewDietPlan.recommended.map((food, index) => (
                    <div key={index} className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/30 rounded-lg">
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed break-words">{food}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Foods to Avoid */}
              <div className="card p-4 sm:p-6 border-2 border-red-200 dark:border-red-700 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-red-100 dark:bg-red-900/40 p-2 rounded-xl shadow-md flex-shrink-0">
                    <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" aria-hidden="true" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white min-w-0">Foods to Avoid</h3>
                </div>
                <div className="space-y-2">
                  {previewDietPlan.avoid.map((food, index) => (
                    <div key={index} className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg">
                      <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed break-words">{food}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Dietary Tips */}
            <div className="card p-4 sm:p-6 mb-6 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 hover:shadow-xl transition-all duration-200">
              <div className="flex items-start gap-3 mb-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-2 rounded-xl shadow-md flex-shrink-0">
                  <Lightbulb className="w-5 h-5 text-white" aria-hidden="true" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white min-w-0">Important Dietary Tips</h3>
              </div>
              <div className="space-y-3">
                {previewDietPlan.tips.map((tip, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-white dark:bg-gray-700 rounded-lg border border-blue-200 dark:border-blue-600">
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md">
                      <span className="text-white text-xs font-bold">{index + 1}</span>
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed flex-1 min-w-0 break-words">{tip}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Sample Meal Plan */}
            <div className="card p-4 sm:p-6 mb-6 hover:shadow-xl transition-all duration-200">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white min-w-0">Sample Daily Meal Plan</h3>
                <button type="button" className="btn-secondary tap text-sm flex items-center justify-center w-full sm:w-auto">
                  <Download className="w-4 h-4 mr-2" aria-hidden="true" />
                  Download Plan
                </button>
              </div>

              <div className="space-y-3 sm:space-y-4">
                {PREVIEW_MEAL_SLOTS.map((slot, index) => {
                  const key = `preview:${index}`;
                  return (
                    <SlotSection
                      key={slot.label}
                      panelId={`${baseId}-meal-${index}`}
                      title={slot.label}
                      tone={slot.tone}
                      meta={`${slot.items.length} ${slot.items.length === 1 ? 'item' : 'items'}`}
                      open={isOpen(key, index)}
                      onToggle={() => toggle(key, index)}
                    >
                      <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {slot.items.map((item, itemIndex) => (
                          <li key={itemIndex} className="break-words">
                            • {item}
                          </li>
                        ))}
                      </ul>
                    </SlotSection>
                  );
                })}
              </div>
            </div>

            {/* Hydration Reminder */}
            <div className="card p-4 sm:p-6 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border-2 border-blue-200 dark:border-blue-700 hover:shadow-xl transition-all duration-200">
              <div className="flex items-start gap-3">
                <Droplets className="w-7 h-7 sm:w-8 sm:h-8 text-blue-500 dark:text-blue-400 flex-shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Stay Hydrated</h3>
                  <p className={`text-base text-gray-700 dark:text-gray-300 mb-2 leading-relaxed break-words ${MEASURE}`}>
                    Aim to drink 8-10 glasses (2-2.5 liters) of water throughout the day.
                    Proper hydration is essential for heart health and medication effectiveness.
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-400 font-semibold leading-relaxed break-words">
                    Pro tip: Keep a water bottle with you at all times!
                  </p>
                </div>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
};

export default DietPlan;
