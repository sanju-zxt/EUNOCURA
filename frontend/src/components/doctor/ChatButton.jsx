import React, { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import ChatModal from './ChatModal';

/**
 * Floating chat launcher.
 *
 * The phone shell owns the bottom of the screen: its nav is 64px tall plus the
 * safe-area inset, so a button parked 24px from the edge would sit on top of a
 * nav tab. Below `md` it clears that chrome; from `md` up it keeps the old
 * bottom-right corner.
 */
const ChatButton = ({ appointmentId, patientId, patientName }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    if (!appointmentId || !patientId) return null;

    return (
        <>
            <button
                type="button"
                onClick={() => setIsModalOpen(!isModalOpen)}
                className="tap fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:right-6 md:bottom-6 z-40 w-14 h-14 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 transition-all flex items-center justify-center md:hover:scale-110 active:scale-95"
                aria-label={isModalOpen ? "Close chat" : "Open chat"}
                aria-haspopup="dialog"
                aria-expanded={isModalOpen}
            >
                {isModalOpen ? (
                    <X className="w-6 h-6" aria-hidden="true" />
                ) : (
                    <MessageCircle className="w-6 h-6" aria-hidden="true" />
                )}
            </button>
            <ChatModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                appointmentId={appointmentId}
                patientId={patientId}
                patientName={patientName}
            />
        </>
    );
};

export default ChatButton;
