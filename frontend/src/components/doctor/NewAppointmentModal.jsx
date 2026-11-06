import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
    Activity,
    AlertCircle,
    Check,
    RefreshCw,
    Search,
    Stethoscope,
    UserPlus,
} from 'lucide-react';
import { apiRequest } from '../../utils/api';
import MobileSheet from '../mobile/MobileSheet';
import useIsMobile from '../mobile/useIsMobile';
import { hapticTap } from '../../services/native';

// Shared field styling: 16px text so the phone never zooms on focus, and a
// 44px minimum height so a tap lands on the control instead of the label.
const FIELD_CLASS =
    'w-full min-h-[44px] p-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg ' +
    'focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-primary-500 ' +
    'dark:focus:border-primary-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ' +
    '[color-scheme:light] dark:[color-scheme:dark]';

export default function NewAppointmentModal({ isOpen, onClose, patient, lastAppointment }) {
    const isMobile = useIsMobile();
    const rawId = useId();
    const formId = `new-appointment-${rawId.replace(/:/g, '')}`;
    const complaintRef = useRef(null);

    const [activeTab, setActiveTab] = useState('continue'); // 'continue' or 'new'
    const [formData, setFormData] = useState({
        doctorId: '',
        date: new Date().toISOString().split('T')[0],
        time: '09:00',
        chiefComplaint: '',
        notes: ''
    });

    const [doctors, setDoctors] = useState([]);
    const [loading, setLoading] = useState(false);
    const [doctorQuery, setDoctorQuery] = useState('');
    const [doctorsLoading, setDoctorsLoading] = useState(false);
    const [doctorsError, setDoctorsError] = useState('');
    const [formError, setFormError] = useState('');

    const fetchDoctors = useCallback(async () => {
        setDoctorsError('');
        setDoctorsLoading(true);
        try {
            const response = await apiRequest('/doctors/');
            if (response.success) {
                setDoctors(response.data.map(d => ({
                    id: d._id,
                    name: d.full_name,
                    specialization: d.specialization || 'General' // Fallback
                })));
            } else {
                setDoctorsError('Could not load the specialist list.');
            }
        } catch (error) {
            console.error("Failed to fetch doctors:", error);
            setDoctorsError('Could not load the specialist list.');
        } finally {
            setDoctorsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchDoctors();
        }
    }, [isOpen, fetchDoctors]);

    useEffect(() => {
        if (isOpen && !lastAppointment) {
            setActiveTab('new');
        } else if (isOpen) {
            setActiveTab('continue');
        }
    }, [isOpen, lastAppointment]);

    // A search box left over from the previous visit would hide half the list.
    useEffect(() => {
        if (isOpen) {
            setDoctorQuery('');
            setFormError('');
        }
    }, [isOpen]);

    // Auto-size the complaint box: a phone has room to show the whole reason.
    useEffect(() => {
        const el = complaintRef.current;
        if (!el || activeTab !== 'new') return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    }, [activeTab, formData.chiefComplaint, isOpen]);

    const filteredDoctors = useMemo(() => {
        const query = doctorQuery.trim().toLowerCase();
        if (!query) return doctors;
        return doctors.filter((doc) =>
            `${doc.name} ${doc.specialization}`.toLowerCase().includes(query)
        );
    }, [doctors, doctorQuery]);

    if (!isOpen) return null;

    const selectedDoctor = doctors.find((doc) => doc.id === formData.doctorId) || null;

    const handleSubmit = async (e) => {
        e.preventDefault();

        // The phone uses a custom picker instead of a native <select>, so the
        // required check that the browser does on desktop has to happen here.
        if (activeTab === 'new' && !formData.doctorId) {
            setFormError('Select a specialist to continue.');
            return;
        }

        setFormError('');
        setLoading(true);

        const type = activeTab === 'continue' ? 'old' : 'new';
        
        // Calculate end time (default 30 mins duration)
        const startTime = new Date(`${formData.date}T${formData.time}`);

        const payload = {
            patient_id: patient?.id,
            doctor_id: activeTab === 'continue' ? lastAppointment.doctor.id : formData.doctorId,
            appointment_date: new Date(formData.date).toISOString(),
            status: "scheduled",
            chief_complaint: activeTab === 'continue' ? lastAppointment.chiefComplaint : formData.chiefComplaint,
            start_time: startTime.toISOString(),
            // Required empty fields for validation
            discussion: "",
            discussion_summary: "",
            reports: [],
            tests: [],
            diagnosis: {}
        };

        let endpoint = `/appointments/?type=${type}`;
        if (type === 'old' && lastAppointment) {
            endpoint += `&prev_appointment_id=${lastAppointment.id}`;
        }

        try {
            const response = await apiRequest(endpoint, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (response.success) {
                console.log("Appointment created:", response.data);
                // Optionally refresh parent or show success
                onClose();
            } else {
                console.error("Failed to create appointment:", response.error);
                setFormError(response.error || 'Could not create the appointment. Please try again.');
            }
        } catch (error) {
            console.error("Error submitting appointment:", error);
            setFormError(error?.message || 'Could not create the appointment. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const selectDoctor = (doctorId) => {
        hapticTap();
        setFormData((prev) => ({ ...prev, doctorId }));
        setFormError('');
    };

    const tabBase =
        'flex-1 min-w-0 p-3 sm:p-4 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-2 text-center';

    const footer = (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <button
                type="button"
                onClick={onClose}
                className="tap w-full sm:w-auto px-6 rounded-lg text-base text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
                Cancel
            </button>
            <button
                type="submit"
                form={formId}
                disabled={loading}
                className={`tap w-full sm:w-auto px-6 rounded-lg bg-primary-600 dark:bg-primary-700 text-white text-base font-medium hover:bg-primary-700 dark:hover:bg-primary-600 shadow-lg shadow-primary-500/30 transition-all transform hover:-translate-y-0.5 ${loading ? 'opacity-50 cursor-wait' : ''}`}
            >
                {loading ? 'Scheduling...' : 'Schedule Appointment'}
            </button>
        </div>
    );

    return (
        <MobileSheet
            open={isOpen}
            onClose={onClose}
            title="Schedule Appointment"
            description={patient ? `For ${patient.name} (${patient.id})` : undefined}
            size="lg"
            footer={footer}
        >
            {/* Tab Selection */}
            <div className="flex gap-3 sm:gap-4 mb-6 sm:mb-8">
                <button
                    type="button"
                    disabled={!lastAppointment}
                    onClick={() => lastAppointment && setActiveTab('continue')}
                    aria-pressed={activeTab === 'continue'}
                    className={`${tabBase} ${!lastAppointment
                            ? 'opacity-50 cursor-not-allowed border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700'
                            : activeTab === 'continue'
                                ? 'border-primary-600 dark:border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-900 dark:text-primary-200'
                                : 'border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}
                >
                    <div className={`p-3 rounded-full ${activeTab === 'continue' ? 'bg-primary-100 dark:bg-primary-900/50' : 'bg-gray-100 dark:bg-gray-700'}`}>
                        <Activity className={`w-6 h-6 ${activeTab === 'continue' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}`} />
                    </div>
                    <span className="font-semibold text-base">Continue Care</span>
                    <span className="text-xs opacity-75 break-words">
                        {lastAppointment ? 'Follow up on previous visit' : 'No previous visit found'}
                    </span>
                </button>

                <button
                    type="button"
                    data-autofocus
                    onClick={() => setActiveTab('new')}
                    aria-pressed={activeTab === 'new'}
                    className={`${tabBase} ${activeTab === 'new'
                            ? 'border-primary-600 dark:border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-900 dark:text-primary-200'
                            : 'border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}
                >
                    <div className={`p-3 rounded-full ${activeTab === 'new' ? 'bg-primary-100 dark:bg-primary-900/50' : 'bg-gray-100 dark:bg-gray-700'}`}>
                        <UserPlus className={`w-6 h-6 ${activeTab === 'new' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}`} />
                    </div>
                    <span className="font-semibold text-base">New Assessment</span>
                    <span className="text-xs opacity-75 break-words">Start a new case</span>
                </button>
            </div>

            <form id={formId} onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
                {activeTab === 'continue' && (
                    <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                            <Stethoscope className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                            Previous Appointment Context
                        </h4>
                        {lastAppointment ? (
                            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300 break-words">
                                <p><span className="font-medium">Date:</span> {lastAppointment.scheduledDate}</p>
                                <p><span className="font-medium">Type:</span> {lastAppointment.id?.split("-")[1] === '0' ? 'Initial Consultation' : 'Follow-up'}</p>
                                <p><span className="font-medium">Chief Complaint:</span> {lastAppointment.chiefComplaint}</p>
                                {lastAppointment.session?.diagnosis?.diagnosis && (
                                    <p><span className="font-medium">Diagnosis:</span> {lastAppointment.session.diagnosis.diagnosis}</p>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 p-3 rounded border border-yellow-100 dark:border-yellow-800">
                                No previous appointment found. This will create a new follow-up chain.
                            </p>
                        )}
                    </div>
                )}

                {activeTab === 'new' && (
                    <>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2" htmlFor={isMobile ? `${formId}-doctor-search` : `${formId}-doctor`}>
                                Select Specialist
                            </label>

                            {isMobile ? (
                                <div className="space-y-2">
                                    {/* Type-to-search: the doctor list is already fetched, so no
                                        new dependency is needed to avoid a long native picker. */}
                                    <div className="relative">
                                        <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                                        <input
                                            id={`${formId}-doctor-search`}
                                            type="search"
                                            inputMode="search"
                                            enterKeyHint="search"
                                            autoComplete="off"
                                            placeholder="Search by name or specialty"
                                            aria-label="Search specialists"
                                            className={`${FIELD_CLASS} pl-11`}
                                            value={doctorQuery}
                                            onChange={(e) => setDoctorQuery(e.target.value)}
                                            // Enter here means "filter", not "submit the form".
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') e.preventDefault();
                                            }}
                                        />
                                    </div>

                                    {doctorsError && (
                                        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-700 dark:text-red-300">
                                            <p role="alert" className="flex items-start gap-2">
                                                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                                                <span className="min-w-0 break-words">{doctorsError}</span>
                                            </p>
                                            <button
                                                type="button"
                                                onClick={fetchDoctors}
                                                disabled={doctorsLoading}
                                                className="tap mt-2 inline-flex items-center gap-2 px-3 rounded-lg border border-red-300 dark:border-red-700 font-medium hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors disabled:opacity-60 disabled:cursor-wait"
                                            >
                                                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                                                Retry
                                            </button>
                                        </div>
                                    )}

                                    <div
                                        role="group"
                                        aria-label="Specialists"
                                        className="max-h-56 overflow-y-auto overscroll-contain rounded-lg border border-gray-300 dark:border-gray-600 divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-700"
                                    >
                                        {filteredDoctors.length === 0 ? (
                                            <p className="px-3 py-4 text-sm text-gray-600 dark:text-gray-400">
                                                {doctorsLoading
                                                    ? 'Loading specialists...'
                                                    : doctors.length === 0
                                                        ? 'No specialists available.'
                                                        : `No specialist matches "${doctorQuery.trim()}".`}
                                            </p>
                                        ) : (
                                            filteredDoctors.map(doc => {
                                                const selected = formData.doctorId === doc.id;
                                                return (
                                                    <button
                                                        key={doc.id}
                                                        type="button"
                                                        onClick={() => selectDoctor(doc.id)}
                                                        aria-pressed={selected}
                                                        className={`tap w-full px-3 py-3 flex items-center gap-3 text-left transition-colors ${selected
                                                                ? 'bg-primary-50 dark:bg-primary-900/30'
                                                                : 'hover:bg-gray-50 dark:hover:bg-gray-600/60'
                                                            }`}
                                                    >
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block text-base font-medium text-gray-900 dark:text-gray-100 break-words">{doc.name}</span>
                                                            <span className="block text-sm text-gray-600 dark:text-gray-400 break-words">{doc.specialization}</span>
                                                        </span>
                                                        {selected && (
                                                            <Check className="w-5 h-5 flex-shrink-0 text-primary-600 dark:text-primary-400" aria-hidden="true" />
                                                        )}
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>

                                    {selectedDoctor && (
                                        <p className="text-sm text-gray-600 dark:text-gray-400 break-words">
                                            Selected: <span className="font-medium text-gray-900 dark:text-gray-100">
                                                {selectedDoctor.name}
                                            </span>
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <select
                                    id={`${formId}-doctor`}
                                    className={FIELD_CLASS}
                                    value={formData.doctorId}
                                    onChange={(e) => setFormData({ ...formData, doctorId: e.target.value })}
                                    required
                                >
                                    <option value="">Choose a doctor...</option>
                                    {doctors.map(doc => (
                                        <option key={doc.id} value={doc.id}>{doc.name} - {doc.specialization}</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2" htmlFor={`${formId}-complaint`}>
                                Chief Complaint
                            </label>
                            <textarea
                                id={`${formId}-complaint`}
                                ref={complaintRef}
                                className={`${FIELD_CLASS} resize-none overflow-y-auto`}
                                rows="3"
                                placeholder="Describe the main reason for this visit..."
                                value={formData.chiefComplaint}
                                onChange={(e) => setFormData({ ...formData, chiefComplaint: e.target.value })}
                                required
                            />
                        </div>
                    </>
                )}

                {/* One column on a phone: a native date control and a time control
                    side by side at 360px would each be narrower than their value. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2" htmlFor={`${formId}-date`}>
                            Date
                        </label>
                        <input
                            id={`${formId}-date`}
                            type="date"
                            className={FIELD_CLASS}
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2" htmlFor={`${formId}-time`}>
                            Start Time
                        </label>
                        <input
                            id={`${formId}-time`}
                            type="time"
                            className={FIELD_CLASS}
                            value={formData.time}
                            onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                            required
                        />
                    </div>
                </div>

                {/* Validation and submit failures land here, directly above the
                    actions, so the message is next to the button that failed. */}
                {formError && (
                    <div role="alert" className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-700 dark:text-red-300">
                        <p className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                            <span className="min-w-0 break-words">{formError}</span>
                        </p>
                    </div>
                )}
            </form>
        </MobileSheet>
    );
}
