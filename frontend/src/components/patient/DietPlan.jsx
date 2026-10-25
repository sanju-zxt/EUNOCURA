import React, { useCallback, useEffect, useState } from 'react';
import { Apple, CheckCircle, XCircle, Lightbulb, Download, Droplets, RefreshCw, AlertCircle, Stethoscope, Activity } from 'lucide-react';
import { previewDietPlan } from '../../data/previewDietPlan';
import { apiRequest } from '../../utils/api';
import FixtureNotice from '../FixtureNotice';

const SLOT_TONES = [
  'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
  'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
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

const Skeleton = () => (
  <div className="card mb-6 animate-pulse" aria-busy="true" aria-label="Loading your care plan">
    <div className="flex items-center space-x-3 mb-6">
      <div className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-gray-700" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-32 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
    <div className="space-y-4">
      {[0, 1, 2].map((row) => (
        <div key={row} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-2">
          <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-700/60" />
          <div className="h-3 w-3/4 rounded bg-gray-100 dark:bg-gray-700/60" />
        </div>
      ))}
    </div>
  </div>
);

const DietPlan = () => {
  const [state, setState] = useState({ status: 'loading', plan: null, error: null });

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

  const items = Array.isArray(state.plan?.items) ? state.plan.items.filter(Boolean) : [];
  const hasClinicianPlan = state.status === 'loaded' && state.plan?.source && items.length > 0;
  const notes = typeof state.plan?.notes === 'string' ? state.plan.notes.trim() : '';
  const activity = Array.isArray(state.plan?.activity) ? state.plan.activity.map(activityText).filter((row) => row.title || row.detail) : [];
  const updatedAt = formatWhen(state.plan?.updated_at);
  const groups = hasClinicianPlan ? groupBySlot(items) : [];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">My Diet Plan</h2>
        <p className="text-gray-600 dark:text-gray-400">Personalized nutrition recommendations for your heart health</p>
      </div>

      {state.status === 'loading' && <Skeleton />}

      {state.status === 'error' && (
        <div className="mb-6 rounded-xl border-2 border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm flex-1">
              <p className="font-semibold text-red-900 dark:text-red-200">Could not load your care plan</p>
              <p className="text-red-800 dark:text-red-300">{state.error || 'The care plan service did not answer.'}</p>
            </div>
            <button type="button" onClick={loadPlan} className="btn-secondary text-sm flex items-center flex-shrink-0">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </button>
          </div>
        </div>
      )}

      {state.status === 'loaded' && !hasClinicianPlan && (
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <span>
            No clinician care plan is on file for your account yet. Everything below is the preview plan, not a
            prescription. Your care team sets the real plan after a consultation.
          </span>
        </p>
      )}

      {hasClinicianPlan ? (
        <div className="space-y-6">
          <div className="card bg-gradient-to-r from-teal-50 to-blue-50 dark:from-teal-900/20 dark:to-blue-900/20 border-2 border-teal-200 dark:border-teal-700 hover:shadow-xl transition-all duration-200">
            <div className="flex items-start space-x-3">
              <div className="bg-gradient-to-br from-teal-500 to-teal-600 p-3 rounded-xl shadow-md">
                <Stethoscope className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Your care plan</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Set by your clinician{updatedAt ? ` · updated ${updatedAt}` : ''}
                </p>
              </div>
              <span className="text-xs px-3 py-1 rounded-full font-semibold bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">
                Set by your clinician
              </span>
            </div>
          </div>

          <div className="card hover:shadow-xl transition-all duration-200">
            <div className="flex items-center space-x-2 mb-4">
              <div className="bg-green-100 dark:bg-green-900/40 p-2 rounded-xl shadow-md">
                <Apple className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Meals by slot</h3>
            </div>

            <div className="space-y-4">
              {groups.map((group, groupIndex) => (
                <div
                  key={group.slot}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all"
                >
                  <div className="flex items-center space-x-2 mb-3">
                    <div className={`px-3 py-1 rounded-full ${SLOT_TONES[groupIndex % SLOT_TONES.length]}`}>
                      <span className="text-sm font-semibold">{group.slot}</span>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {group.rows.length} {group.rows.length === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {group.rows.map((row) => (
                      <li key={row.key} className="flex items-start space-x-2">
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        <div>
                          {row.title && (
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{row.title}</p>
                          )}
                          {row.detail && <p className="text-sm text-gray-700 dark:text-gray-300">{row.detail}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {activity.length > 0 && (
            <div className="card bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 hover:shadow-xl transition-all duration-200">
              <div className="flex items-center space-x-2 mb-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-2 rounded-xl shadow-md">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Activity</h3>
              </div>
              <ul className="space-y-3">
                {activity.map((row, index) => (
                  <li key={index} className="flex items-start space-x-3 p-3 bg-white dark:bg-gray-700 rounded-lg border border-blue-200 dark:border-blue-600">
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md">
                      <span className="text-white text-xs font-bold">{index + 1}</span>
                    </div>
                    <div className="flex-1">
                      {row.title && <p className="text-sm font-semibold text-gray-900 dark:text-white">{row.title}</p>}
                      {row.detail && <p className="text-sm text-gray-800 dark:text-gray-200">{row.detail}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {notes && (
            <div className="card bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 hover:shadow-xl transition-all duration-200">
              <div className="flex items-start space-x-3">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-2 rounded-xl shadow-md">
                  <Lightbulb className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Notes from your clinician</h3>
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{notes}</p>
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
            <div className="card mb-6 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 border-2 border-green-200 dark:border-green-700 hover:shadow-xl transition-all duration-200">
              <div className="flex items-start space-x-3">
                <div className="bg-gradient-to-br from-green-500 to-green-600 p-3 rounded-xl shadow-md">
                  <Apple className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Heart-Healthy Diet Plan</h3>
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{previewDietPlan.general}</p>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-6">
              {/* Recommended Foods */}
              <div className="card border-2 border-green-200 dark:border-green-700 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
                <div className="flex items-center space-x-2 mb-4">
                  <div className="bg-green-100 dark:bg-green-900/40 p-2 rounded-xl shadow-md">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Recommended Foods</h3>
                </div>
                <div className="space-y-2">
                  {previewDietPlan.recommended.map((food, index) => (
                    <div key={index} className="flex items-start space-x-2 p-3 bg-green-50 dark:bg-green-900/30 rounded-lg">
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-800 dark:text-gray-200">{food}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Foods to Avoid */}
              <div className="card border-2 border-red-200 dark:border-red-700 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
                <div className="flex items-center space-x-2 mb-4">
                  <div className="bg-red-100 dark:bg-red-900/40 p-2 rounded-xl shadow-md">
                    <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Foods to Avoid</h3>
                </div>
                <div className="space-y-2">
                  {previewDietPlan.avoid.map((food, index) => (
                    <div key={index} className="flex items-start space-x-2 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg">
                      <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-800 dark:text-gray-200">{food}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Dietary Tips */}
            <div className="card mb-6 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 hover:shadow-xl transition-all duration-200">
              <div className="flex items-start space-x-3 mb-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-2 rounded-xl shadow-md">
                  <Lightbulb className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Important Dietary Tips</h3>
              </div>
              <div className="space-y-3">
                {previewDietPlan.tips.map((tip, index) => (
                  <div key={index} className="flex items-start space-x-3 p-3 bg-white dark:bg-gray-700 rounded-lg border border-blue-200 dark:border-blue-600">
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md">
                      <span className="text-white text-xs font-bold">{index + 1}</span>
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200 flex-1">{tip}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Sample Meal Plan */}
            <div className="card mb-6 hover:shadow-xl transition-all duration-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Sample Daily Meal Plan</h3>
                <button type="button" className="btn-secondary text-sm flex items-center">
                  <Download className="w-4 h-4 mr-2" />
                  Download Plan
                </button>
              </div>

              <div className="space-y-4">
                {/* Breakfast */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="bg-orange-100 dark:bg-orange-900/40 px-3 py-1 rounded-full">
                      <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">Breakfast (8:00 AM)</span>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    <li>• 1 bowl of oatmeal with fresh berries</li>
                    <li>• 1 glass of low-fat milk</li>
                    <li>• 1 banana</li>
                    <li>• Green tea</li>
                  </ul>
                </div>

                {/* Mid-Morning Snack */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="bg-yellow-100 dark:bg-yellow-900/40 px-3 py-1 rounded-full">
                      <span className="text-sm font-semibold text-yellow-700 dark:text-yellow-300">Mid-Morning (11:00 AM)</span>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    <li>• Handful of almonds and walnuts</li>
                    <li>• 1 apple</li>
                  </ul>
                </div>

                {/* Lunch */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="bg-green-100 dark:bg-green-900/40 px-3 py-1 rounded-full">
                      <span className="text-sm font-semibold text-green-700 dark:text-green-300">Lunch (1:00 PM)</span>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    <li>• 2 chapatis (whole wheat)</li>
                    <li>• 1 cup dal (lentils)</li>
                    <li>• Mixed vegetable curry</li>
                    <li>• Green salad with lemon dressing</li>
                    <li>• Buttermilk (low-fat)</li>
                  </ul>
                </div>

                {/* Evening Snack */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="bg-purple-100 dark:bg-purple-900/40 px-3 py-1 rounded-full">
                      <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">Evening (5:00 PM)</span>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    <li>• Green tea</li>
                    <li>• 2-3 whole grain crackers</li>
                  </ul>
                </div>

                {/* Dinner */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="bg-blue-100 dark:bg-blue-900/40 px-3 py-1 rounded-full">
                      <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Dinner (7:30 PM)</span>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    <li>• Grilled fish or chicken breast (150g)</li>
                    <li>• 1 cup brown rice</li>
                    <li>• Steamed vegetables (broccoli, carrots, beans)</li>
                    <li>• Clear vegetable soup</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Hydration Reminder */}
            <div className="card bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border-2 border-blue-200 dark:border-blue-700 hover:shadow-xl transition-all duration-200">
              <div className="flex items-start space-x-3">
                <Droplets className="w-8 h-8 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Stay Hydrated</h3>
                  <p className="text-gray-700 dark:text-gray-300 mb-2">
                    Aim to drink 8-10 glasses (2-2.5 liters) of water throughout the day.
                    Proper hydration is essential for heart health and medication effectiveness.
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-400 font-semibold">
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

