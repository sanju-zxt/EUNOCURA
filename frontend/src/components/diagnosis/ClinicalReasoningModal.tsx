import React from 'react';
import { ClinicalReasoningFlow } from './ClinicalReasoningFlow';
import MobileSheet from '../mobile/MobileSheet';

interface ClinicalReasoningModalProps {
    isOpen: boolean;
    onClose: () => void;
    nodes: any[];
    connections: any[];
}

/**
 * The reasoning graph in a dialog. It is the frozen `MobileSheet`, so on a phone
 * it is a bottom sheet with a drag handle and a capped height (the dashboard
 * stays visible behind it), and from `md` up it is the wide centred dialog the
 * desktop had. The sheet owns the focus trap, Escape, backdrop dismiss and the
 * body scroll lock that this modal used to only partly have.
 *
 * `sm:max-w-6xl` keeps the desktop panel the width it was before the graph moved
 * into the sheet; the body scrolls on its own, so the 500px graph never pushes
 * the Close button off a short screen.
 */
export const ClinicalReasoningModal: React.FC<ClinicalReasoningModalProps> = ({
    isOpen,
    onClose,
    nodes,
    connections
}) => {
    const footer = (
        <div className="flex justify-end">
            <button
                type="button"
                onClick={onClose}
                className="tap inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 sm:w-auto"
            >
                Close
            </button>
        </div>
    );

    return (
        <MobileSheet
            open={isOpen}
            onClose={onClose}
            title="Clinical Reasoning Chain"
            description="Visualizing the AI's diagnostic thought process"
            size="xl"
            className="sm:max-w-6xl"
            closeLabel="Close clinical reasoning"
            footer={footer}
        >
            <div className="min-w-0 md:min-h-[500px]">
                <ClinicalReasoningFlow
                    nodes={nodes}
                    connections={connections}
                />
            </div>
        </MobileSheet>
    );
};
