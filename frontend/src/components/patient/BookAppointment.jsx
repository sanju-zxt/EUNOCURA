import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  Stethoscope,
  UserRound,
  X,
} from 'lucide-react';
import { apiRequest } from '../../utils/api';
import MobileSheet from '../mobile/MobileSheet';
import useIsMobile from '../mobile/useIsMobile';

const ALL_SPECIALTIES = '__all__';

const SORT_OPTIONS = [
  { value: 'experience', label: 'Experience (most first)' },
  { value: 'name', label: 'Name (A-Z)' },
];

// The slot grid is a UI choice, not data: the server stores whatever HH:MM it is sent.
const SLOT_START_MINUTES = 9 * 60;
const SLOT_END_MINUTES = 17 * 60;
const SLOT_STEP_MINUTES = 30;

const pad = (value) => String(value).padStart(2, '0');

const buildSlots = () => {
  const slots = [];
  for (let minutes = SLOT_START_MINUTES; minutes <= SLOT_END_MINUTES; minutes += SLOT_STEP_MINUTES) {
    slots.push(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
  }
  return slots;
};

const TIME_SLOTS = buildSlots();

// A YYYY-MM-DD string must never go through UTC parsing, which could shift the day.
const todayISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const parseDateParts = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
};

const slotIsPast = (dateISO, slot) => {
  const parts = parseDateParts(dateISO);
  if (!parts || !/^\d{2}:\d{2}$/.test(slot || '')) return false;
  const [hour, minute] = slot.split(':').map(Number);
  const when = new Date(parts.year, parts.month - 1, parts.day, hour, minute, 0, 0);
  return when.getTime() <= Date.now();
};

const formatDay = (dateISO) => {
  const parts = parseDateParts(dateISO);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const formatSlot = (slot) => {
  if (!/^\d{2}:\d{2}$/.test(slot || '')) return slot || null;
  const [hour, minute] = slot.split(':').map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Booking responses carry naive ISO datetimes ("2026-10-28T09:30:00"), which JS reads as local.
const formatMoment = (value, options) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleString(undefined, options);
};

const initialsOf = (name) =>
  String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

const DoctorSkeleton = () => (
  <div className="space-y-4 animate-pulse">
    {[0, 1, 2].map((row) => (
      <div key={row} className="card">
        <div className="flex items-start space-x-4">
          <div className="w-16 h-16 rounded-xl bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
          <div className="flex-1">
            <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="h-9 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

const StepMarker = ({ number, label, state }) => {
  const circle =
    state === 'current'
      ? 'bg-gradient-to-br from-teal-500 to-teal-600 text-white border-teal-500'
      : state === 'done'
        ? 'bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border-teal-400 dark:border-teal-600'
        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600';
  return (
    <div className="flex items-center space-x-2">
      <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold ${circle}`}>
        {state === 'done' ? <Check className="w-3.5 h-3.5" /> : number}
      </span>
      <span
        className={`text-xs font-semibold ${
          state === 'current' ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'
        }`}
      >
        {label}
      </span>
    </div>
  );
};

const BookAppointment = () => {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState(ALL_SPECIALTIES);
  const [sortBy, setSortBy] = useState('experience');

  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [complaint, setComplaint] = useState('');
  const [step, setStep] = useState('slot');
  const [slotError, setSlotError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  // The wizard has two shapes: the dialog below stays exactly as it was for
  // md+, and the phone gets a full-height stepped sheet.
  const isMobile = useIsMobile();

  const loadDoctors = useCallback(async () => {
    setLoading(true);
    const result = await apiRequest('/appointments/bookable-doctors');
    if (result.success) {
      const list = Array.isArray(result.data)
        ? result.data
        : Array.isArray(result.data?.items)
          ? result.data.items
          : [];
      // Only ever render doctors the API actually returned.
      setDoctors(list.filter((doctor) => doctor && doctor.id));
      setError(null);
    } else {
      setDoctors([]);
      setError(result.error || 'Could not load the doctor directory.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  // Specialities are derived from the response, never hardcoded. Display keeps the
  // first spelling seen; matching is case-insensitive because the data is not normalised.
  const specialtyOptions = useMemo(() => {
    const seen = new Map();
    doctors.forEach((doctor) => {
      const raw = String(doctor?.specialization || '').trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (!seen.has(key)) seen.set(key, raw);
    });
    const derived = Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
    return [{ value: ALL_SPECIALTIES, label: 'All specialities' }, ...derived];
  }, [doctors]);

  const visibleDoctors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = doctors.filter((doctor) => {
      const matchesSpecialty =
        selectedSpecialty === ALL_SPECIALTIES ||
        String(doctor.specialization || '').toLowerCase() === selectedSpecialty;
      const matchesSearch =
        !query ||
        String(doctor.name || '').toLowerCase().includes(query) ||
        String(doctor.specialization || '').toLowerCase().includes(query);
      return matchesSpecialty && matchesSearch;
    });

    const experienceOf = (doctor) =>
      Number.isFinite(Number(doctor.years_experience)) && doctor.years_experience !== null
        ? Number(doctor.years_experience)
        : -1;

    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
      const diff = experienceOf(b) - experienceOf(a);
      return diff !== 0 ? diff : String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [doctors, searchQuery, selectedSpecialty, sortBy]);

  const openBooking = (doctor) => {
    setSelectedDoctor(doctor);
    setSelectedDate('');
    setSelectedSlot(null);
    setComplaint('');
    setStep('slot');
    setSlotError(null);
    setSubmitError(null);
  };

  const closeBooking = () => {
    if (submitting) return;
    setSelectedDoctor(null);
    setStep('slot');
    setSlotError(null);
    setSubmitError(null);
  };

  const goToReview = () => {
    if (!selectedDate || !selectedSlot) {
      setSlotError('Choose a date and a time slot first.');
      return;
    }
    if (selectedDate < todayISO()) {
      setSlotError('Pick today or a later date.');
      return;
    }
    if (slotIsPast(selectedDate, selectedSlot)) {
      setSlotError('That time has already passed. Pick a later slot.');
      return;
    }
    setSlotError(null);
    setSubmitError(null);
    setStep('review');
  };

  const confirmBooking = async () => {
    if (!selectedDoctor || !selectedDate || !selectedSlot || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const result = await apiRequest('/appointments/self', {
      method: 'POST',
      body: JSON.stringify({
        doctor_id: selectedDoctor.id,
        appointment_date: selectedDate,
        start_time: selectedSlot,
        chief_complaint: complaint.trim(),
      }),
    });

    setSubmitting(false);

    if (!result.success) {
      // Backend detail is shown verbatim and the form stays filled for a retry.
      setSubmitError(result.error || 'The appointment could not be saved.');
      return;
    }

    const appointment = result.data?.appointment || null;
    setConfirmation({
      appointment,
      doctor: selectedDoctor,
      date: selectedDate,
      slot: selectedSlot,
      complaint: complaint.trim(),
    });
    setSelectedDoctor(null);
    setStep('slot');
    setSelectedDate('');
    setSelectedSlot(null);
    setComplaint('');
  };

  const DoctorCard = ({ doctor }) => (
    <div className="card hover:shadow-xl transition-all duration-200">
      <div className="flex items-start space-x-4">
        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 text-white flex items-center justify-center text-xl font-bold flex-shrink-0">
          {initialsOf(doctor.name) || 'DR'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white break-words">{doctor.name}</h3>
              <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold flex items-center">
                <Stethoscope className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
                {doctor.specialization || 'Speciality not recorded'}
              </p>
            </div>
            <span className="self-start text-xs px-3 py-1 rounded-full font-semibold whitespace-nowrap bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              {doctor.years_experience === null || doctor.years_experience === undefined
                ? 'Experience not recorded'
                : `${doctor.years_experience} yrs exp.`}
            </span>
          </div>

          <div className="flex flex-col gap-3 pt-3 border-t border-gray-200 dark:border-gray-700 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Slots are 30 minutes, {formatSlot(TIME_SLOTS[0])} to {formatSlot(TIME_SLOTS[TIME_SLOTS.length - 1])}
            </p>
            <button
              type="button"
              onClick={() => openBooking(doctor)}
              className="w-full md:w-auto justify-center py-2.5 md:py-2 bg-gradient-to-br from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white font-semibold px-4 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg flex items-center space-x-2 whitespace-nowrap"
            >
              <Calendar className="w-4 h-4" />
              <span>Choose slot</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const BookingModal = () => {
    if (!selectedDoctor) return null;

    const dateFieldInvalid = Boolean(selectedDate) && selectedDate < todayISO();
    const canReview = Boolean(selectedDate) && Boolean(selectedSlot) && !dateFieldInvalid;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center space-x-4 min-w-0">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 text-white flex items-center justify-center text-lg font-bold flex-shrink-0">
                  {initialsOf(selectedDoctor.name) || 'DR'}
                </div>
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white break-words">
                    {selectedDoctor.name}
                  </h2>
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    {selectedDoctor.specialization || 'Speciality not recorded'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeBooking}
                disabled={submitting}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <X className="w-6 h-6 text-gray-600 dark:text-gray-400" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4">
              <StepMarker number={1} label="Doctor" state="done" />
              <StepMarker number={2} label="Date and time" state={step === 'slot' ? 'current' : 'done'} />
              <StepMarker number={3} label="Review" state={step === 'review' ? 'current' : 'pending'} />
            </div>
          </div>

          <div className="p-6">
            {step === 'slot' && (
              <>
                <div className="mb-6">
                  <label
                    htmlFor="appointment-date"
                    className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center"
                  >
                    <Calendar className="w-5 h-5 mr-2 text-teal-600 dark:text-teal-400" />
                    Select date
                  </label>
                  <input
                    id="appointment-date"
                    type="date"
                    min={todayISO()}
                    value={selectedDate}
                    onChange={(event) => {
                      setSelectedDate(event.target.value);
                      setSelectedSlot(null);
                      setSlotError(null);
                    }}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-900 dark:text-white"
                  />
                  {dateFieldInvalid && (
                    <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                      Pick today or a later date.
                    </p>
                  )}
                </div>

                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center">
                    <Clock className="w-5 h-5 mr-2 text-teal-600 dark:text-teal-400" />
                    Select time slot
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {TIME_SLOTS.map((slot) => {
                      const disabled = !selectedDate || slotIsPast(selectedDate, slot);
                      const active = selectedSlot === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            setSelectedSlot(slot);
                            setSlotError(null);
                          }}
                          className={`p-3 rounded-lg border-2 transition-all text-sm font-semibold ${
                            active
                              ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 text-teal-900 dark:text-teal-200'
                              : disabled
                                ? 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 opacity-50 cursor-not-allowed'
                                : 'border-gray-200 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-700 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {formatSlot(slot)}
                        </button>
                      );
                    })}
                  </div>
                  {!selectedDate && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">Pick a date to enable the slots.</p>
                  )}
                </div>

                <div className="mb-6">
                  <label
                    htmlFor="chief-complaint"
                    className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Reason for visit (optional)
                  </label>
                  <textarea
                    id="chief-complaint"
                    rows={3}
                    maxLength={500}
                    value={complaint}
                    onChange={(event) => setComplaint(event.target.value)}
                    placeholder="What would you like the doctor to look at?"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  />
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{complaint.length}/500 characters</p>
                </div>

                {slotError && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg p-3 mb-4 flex items-start space-x-2">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800 dark:text-red-300">{slotError}</p>
                  </div>
                )}

                <div className="flex space-x-3">
                  <button type="button" onClick={closeBooking} className="flex-1 btn-secondary">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={goToReview}
                    disabled={!canReview}
                    className="flex-1 bg-gradient-to-br from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    <span>Review</span>
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </>
            )}

            {step === 'review' && (
              <>
                <div className="bg-gradient-to-r from-teal-50 to-blue-50 dark:from-teal-900/20 dark:to-blue-900/20 border-2 border-teal-200 dark:border-teal-700 rounded-lg p-4 mb-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Review your appointment</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600 dark:text-gray-400">Doctor:</span>
                      <span className="font-semibold text-gray-900 dark:text-white text-right">
                        {selectedDoctor.name}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600 dark:text-gray-400">Speciality:</span>
                      <span className="font-semibold text-gray-900 dark:text-white text-right">
                        {selectedDoctor.specialization || 'Not recorded'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600 dark:text-gray-400">Date:</span>
                      <span className="font-semibold text-gray-900 dark:text-white text-right">
                        {formatDay(selectedDate)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600 dark:text-gray-400">Time:</span>
                      <span className="font-semibold text-gray-900 dark:text-white text-right">
                        {formatSlot(selectedSlot)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 pt-2 border-t border-teal-300 dark:border-teal-700">
                      <span className="text-gray-600 dark:text-gray-400">Reason for visit:</span>
                      <span className="font-semibold text-gray-900 dark:text-white text-right break-words">
                        {complaint.trim() || 'None given'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-6">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Sent exactly as</p>
                  <dl className="text-xs font-mono text-gray-800 dark:text-gray-200 space-y-1 break-all">
                    <div>
                      <dt className="inline text-gray-500 dark:text-gray-400">appointment_date: </dt>
                      <dd className="inline">{selectedDate}</dd>
                    </div>
                    <div>
                      <dt className="inline text-gray-500 dark:text-gray-400">start_time: </dt>
                      <dd className="inline">{selectedSlot}</dd>
                    </div>
                    <div>
                      <dt className="inline text-gray-500 dark:text-gray-400">chief_complaint: </dt>
                      <dd className="inline">{complaint.trim() || '""'}</dd>
                    </div>
                  </dl>
                </div>

                {submitError && (
                  <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg p-3 mb-4 flex items-start space-x-2">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-900 dark:text-red-200 mb-1">
                        The appointment was not saved
                      </p>
                      <p className="text-sm text-red-800 dark:text-red-300">{submitError}</p>
                    </div>
                  </div>
                )}

                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setStep('slot')}
                    disabled={submitting}
                    className="flex-1 btn-secondary inline-flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={confirmBooking}
                    disabled={submitting}
                    className="flex-1 bg-gradient-to-br from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Booking</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-5 h-5" />
                        <span>Confirm booking</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Phone shape of the same wizard. The frozen MobileSheet owns dismissal,
  // focus, Escape and the page scroll lock; this component owns the two things
  // the phone needs: one step on screen at a time, and the action row in the
  // sheet footer where a thumb can reach it without scrolling.
  //
  // Handlers, validation and messages are the ones declared above — the sheet
  // calls goToReview / confirmBooking / closeBooking, so the payload and the
  // post-submit behaviour cannot drift from the desktop dialog.
  const MobileBookingSheet = () => {
    if (!selectedDoctor) return null;

    const onReview = step === 'review';
    const dateFieldInvalid = Boolean(selectedDate) && selectedDate < todayISO();
    const canReview = Boolean(selectedDate) && Boolean(selectedSlot) && !dateFieldInvalid;
    // Same messages, lifted next to the buttons so a failed check can never be
    // scrolled out of sight behind the footer.
    const footerMessage = onReview ? submitError : slotError;
    const barStates = onReview ? ['done', 'done', 'current'] : ['done', 'current', 'pending'];

    const footer = (
      <div className="space-y-3">
        {footerMessage && (
          <div
            role="alert"
            className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg p-3 flex items-start space-x-2"
          >
            <AlertCircle
              className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="min-w-0">
              {onReview && (
                <p className="text-sm font-semibold text-red-900 dark:text-red-200 mb-1">
                  The appointment was not saved
                </p>
              )}
              <p className="text-sm text-red-800 dark:text-red-300 break-words">{footerMessage}</p>
            </div>
          </div>
        )}

        {onReview ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setStep('slot')}
              disabled={submitting}
              className="tap w-full inline-flex items-center justify-center rounded-lg btn-secondary text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
              Back
            </button>
            <button
              type="button"
              onClick={confirmBooking}
              disabled={submitting}
              className="tap w-full inline-flex items-center justify-center space-x-2 px-4 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white font-semibold text-base transition-all duration-200 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="w-5 h-5" aria-hidden="true" />
              )}
              <span>{submitting ? 'Booking' : 'Confirm booking'}</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={closeBooking}
              className="tap inline-flex items-center justify-center rounded-lg btn-secondary text-base"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={goToReview}
              disabled={!canReview}
              className="tap inline-flex items-center justify-center space-x-1.5 px-3 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white font-semibold text-base transition-all duration-200 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Review</span>
              <ChevronRight className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    );

    return (
      <MobileSheet
        open
        onClose={closeBooking}
        title={selectedDoctor.name}
        description={selectedDoctor.specialization || 'Speciality not recorded'}
        closeLabel="Close booking"
        footer={footer}
      >
        {/* Compact step indicator: three bars and the step name on one line, so
            it costs height instead of a wrapped row of numbered labels. */}
        <div className="mb-5">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {barStates.map((state, index) => (
                <span
                  key={index}
                  className={`h-1.5 rounded-full ${
                    state === 'pending'
                      ? 'w-6 bg-gray-200 dark:bg-gray-600'
                      : `bg-teal-500 ${state === 'current' ? 'w-10' : 'w-6'}`
                  }`}
                />
              ))}
            </div>
            <span className="ml-auto flex-shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400">
              Step {onReview ? 3 : 2} of 3
            </span>
          </div>
          <p className="mt-1.5 text-sm font-semibold text-gray-900 dark:text-white">
            {onReview ? 'Review' : 'Date and time'}
          </p>
        </div>

        {!onReview && (
          <>
            <div className="mb-5">
              <label
                htmlFor="appointment-date"
                className="flex items-center text-sm font-semibold text-gray-900 dark:text-white mb-2"
              >
                <Calendar className="w-4 h-4 mr-2 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                Select date
              </label>
              <input
                id="appointment-date"
                type="date"
                min={todayISO()}
                value={selectedDate}
                onChange={(event) => {
                  setSelectedDate(event.target.value);
                  setSelectedSlot(null);
                  setSlotError(null);
                }}
                className="tap w-full px-4 py-3 text-base bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-900 dark:text-white"
              />
              {dateFieldInvalid && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-2 break-words">
                  Pick today or a later date.
                </p>
              )}
            </div>

            <div className="mb-5">
              <h3 className="flex items-center text-sm font-semibold text-gray-900 dark:text-white mb-2">
                <Clock className="w-4 h-4 mr-2 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                Select time slot
              </h3>
              {/* Three columns of 44px-high buttons: 17 slots wrap in rows and
                  never push the sheet wider than the phone. */}
              <div className="grid grid-cols-3 gap-2">
                {TIME_SLOTS.map((slot) => {
                  const disabled = !selectedDate || slotIsPast(selectedDate, slot);
                  const active = selectedSlot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={disabled}
                      aria-pressed={active}
                      onClick={() => {
                        setSelectedSlot(slot);
                        setSlotError(null);
                      }}
                      className={`tap px-1 py-2 rounded-lg border-2 transition-all text-sm font-semibold break-words ${
                        active
                          ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 text-teal-900 dark:text-teal-200'
                          : disabled
                            ? 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 opacity-50 cursor-not-allowed'
                            : 'border-gray-200 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {formatSlot(slot)}
                    </button>
                  );
                })}
              </div>
              {!selectedDate && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">Pick a date to enable the slots.</p>
              )}
            </div>

            <div>
              <label
                htmlFor="chief-complaint"
                className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
              >
                Reason for visit (optional)
              </label>
              <textarea
                id="chief-complaint"
                rows={3}
                maxLength={500}
                value={complaint}
                onChange={(event) => setComplaint(event.target.value)}
                placeholder="What would you like the doctor to look at?"
                className="w-full px-4 py-3 text-base bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              />
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{complaint.length}/500 characters</p>
            </div>
          </>
        )}

        {onReview && (
          <>
            <div className="bg-gradient-to-r from-teal-50 to-blue-50 dark:from-teal-900/20 dark:to-blue-900/20 border-2 border-teal-200 dark:border-teal-700 rounded-lg p-4 mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Review your appointment</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600 dark:text-gray-400">Doctor:</span>
                  <span className="font-semibold text-gray-900 dark:text-white text-right break-words">
                    {selectedDoctor.name}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600 dark:text-gray-400">Speciality:</span>
                  <span className="font-semibold text-gray-900 dark:text-white text-right break-words">
                    {selectedDoctor.specialization || 'Not recorded'}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600 dark:text-gray-400">Date:</span>
                  <span className="font-semibold text-gray-900 dark:text-white text-right break-words">
                    {formatDay(selectedDate)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600 dark:text-gray-400">Time:</span>
                  <span className="font-semibold text-gray-900 dark:text-white text-right">
                    {formatSlot(selectedSlot)}
                  </span>
                </div>
                <div className="flex justify-between gap-4 pt-2 border-t border-teal-300 dark:border-teal-700">
                  <span className="text-gray-600 dark:text-gray-400">Reason for visit:</span>
                  <span className="font-semibold text-gray-900 dark:text-white text-right break-words">
                    {complaint.trim() || 'None given'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Sent exactly as</p>
              <dl className="text-xs font-mono text-gray-800 dark:text-gray-200 space-y-1 break-all">
                <div>
                  <dt className="inline text-gray-500 dark:text-gray-400">appointment_date: </dt>
                  <dd className="inline">{selectedDate}</dd>
                </div>
                <div>
                  <dt className="inline text-gray-500 dark:text-gray-400">start_time: </dt>
                  <dd className="inline">{selectedSlot}</dd>
                </div>
                <div>
                  <dt className="inline text-gray-500 dark:text-gray-400">chief_complaint: </dt>
                  <dd className="inline">{complaint.trim() || '""'}</dd>
                </div>
              </dl>
            </div>
          </>
        )}
      </MobileSheet>
    );
  };

  if (confirmation) {
    const { appointment, doctor, date, slot, complaint: bookedComplaint } = confirmation;
    const bookedDate =
      formatMoment(appointment?.start_time, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }) || formatDay(date);
    const bookedStart =
      formatMoment(appointment?.start_time, { hour: '2-digit', minute: '2-digit' }) || formatSlot(slot);
    const bookedEnd = formatMoment(appointment?.end_time, { hour: '2-digit', minute: '2-digit' });
    const status = String(appointment?.status || '').toLowerCase();

    return (
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h2 className="text-xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">Book Appointment</h2>
          <p className="text-gray-600 dark:text-gray-400">Your appointment is on your record.</p>
        </div>

        <div className="card mb-6 border-2 border-green-300 dark:border-green-700">
          <div className="flex items-start space-x-4">
            <div className="bg-gradient-to-br from-green-500 to-green-600 p-3 rounded-xl shadow-md flex-shrink-0">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {appointment ? 'Appointment booked' : 'Request sent'}
                </h3>
                {status && (
                  <span className="text-xs px-3 py-1 rounded-full font-semibold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </span>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-3 mb-4">
                <div className="flex items-start space-x-2">
                  <Stethoscope className="w-4 h-4 mt-0.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-600 dark:text-gray-400">Doctor</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">{doctor.name}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      {doctor.specialization || 'Speciality not recorded'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <Calendar className="w-4 h-4 mt-0.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-600 dark:text-gray-400">Date</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{bookedDate}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <Clock className="w-4 h-4 mt-0.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-600 dark:text-gray-400">Time</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {bookedStart ? (bookedEnd ? `${bookedStart} - ${bookedEnd}` : bookedStart) : 'Not recorded'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <CalendarCheck className="w-4 h-4 mt-0.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-600 dark:text-gray-400">Reason for visit</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">
                      {bookedComplaint || 'None given'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  to="/patient/appointments"
                  className="btn-primary text-sm inline-flex items-center min-h-[44px] md:min-h-0"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  View my appointments
                </Link>
                <Link to="/patient" className="btn-secondary text-sm inline-flex items-center min-h-[44px] md:min-h-0">
                  Back to dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirmation(null)}
                  className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 text-sm font-semibold transition-colors px-2 inline-flex items-center min-h-[44px] md:min-h-0"
                >
                  Book another appointment
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h2 className="text-xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">Book Appointment</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Pick a doctor from your care team, then choose a date and time.
        </p>
      </div>

      <div className="card mb-6 hover:shadow-xl transition-all duration-200">
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by doctor name or speciality..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full pl-10 pr-4 py-3 text-base bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="specialty-filter"
                className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
              >
                Speciality
              </label>
              <select
                id="specialty-filter"
                value={selectedSpecialty}
                onChange={(event) => setSelectedSpecialty(event.target.value)}
                className="w-full min-h-[44px] md:min-h-0 px-4 py-2 pr-10 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-900 dark:text-white appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                }}
              >
                {specialtyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sort-by" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Sort by
              </label>
              <select
                id="sort-by"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className="w-full min-h-[44px] md:min-h-0 px-4 py-2 pr-10 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-900 dark:text-white appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                }}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="card mb-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <Stethoscope className="w-5 h-5 mr-2 text-teal-600 dark:text-teal-400" />
            Loading the doctor directory
          </h3>
          <DoctorSkeleton />
        </div>
      )}

      {!loading && error && (
        <div className="card mb-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 dark:text-red-200 mb-1">Could not load the doctor directory</h3>
              <p className="text-sm text-red-800 dark:text-red-300 mb-3">{error}</p>
              <button
                type="button"
                onClick={loadDoctors}
                className="btn-secondary text-sm inline-flex items-center min-h-[44px] md:min-h-0"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && doctors.length === 0 && (
        <div className="card text-center py-12 hover:shadow-xl transition-all duration-200">
          <UserRound className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No doctors available to book
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            No doctors are listed yet — the care team has not added any.
          </p>
          <button type="button" onClick={loadDoctors} className="btn-secondary text-sm inline-flex items-center min-h-[44px] md:min-h-0">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </button>
        </div>
      )}

      {!loading && !error && doctors.length > 0 && (
        <>
          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Showing <span className="font-semibold text-gray-900 dark:text-white">{visibleDoctors.length}</span> of{' '}
              <span className="font-semibold text-gray-900 dark:text-white">{doctors.length}</span>{' '}
              {doctors.length === 1 ? 'doctor' : 'doctors'}
              {selectedSpecialty !== ALL_SPECIALTIES && (
                <span>
                  {' '}
                  in{' '}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {specialtyOptions.find((option) => option.value === selectedSpecialty)?.label}
                  </span>
                </span>
              )}
            </p>
          </div>

          {visibleDoctors.length > 0 ? (
            <div className="space-y-4">
              {visibleDoctors.map((doctor) => (
                <DoctorCard key={doctor.id} doctor={doctor} />
              ))}
            </div>
          ) : (
            <div className="card text-center py-12">
              <Search className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No doctors match</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Clear the search or pick a different speciality.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedSpecialty(ALL_SPECIALTIES);
                }}
                className="btn-secondary text-sm min-h-[44px] md:min-h-0"
              >
                Clear filters
              </button>
            </div>
          )}
        </>
      )}

      {selectedDoctor && (isMobile ? <MobileBookingSheet /> : <BookingModal />)}
    </div>
  );
};

export default BookAppointment;
