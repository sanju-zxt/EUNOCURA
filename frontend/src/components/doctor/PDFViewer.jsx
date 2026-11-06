import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { resolveAssetUrl } from '../../utils/api';
import { hapticTap } from '../../services/native';

// Set worker source - using the worker from public directory
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

/**
 * PDF Viewer Component with Coordinate-based Highlighting
 * Uses pdfjs-dist to render PDF on canvas - no scrolling, full control
 *
 * Evidence mode: when the backend verified a citation (services/citations.py),
 * pass `verification={{status, reason}}` and `confidence`. The overlay then
 * draws the exact bounding box the claim rests on, coloured by verdict:
 *   supported → emerald · page_corrected → amber · dropped → grey
 * Toggling the overlay off falls back to the older relaxed text-region view.
 *
 * CitationPanel mode: pass `highlight={{ page, coords: {x0,y0,x1,y1} }}` to draw a
 * translucent yellow box on that page and scroll it into view.
 *
 * Phone shape (< md): the viewer takes the full screen and its own height, the
 * page is laid out at fit-to-width ("100%"), the scroll area owns vertical
 * scrolling (`overscroll-contain`, so the document behind never moves), and the
 * page/zoom controls live in a bar along the bottom edge with 44px targets and
 * safe-area padding. At md+ the panel is the same centred dialog it always was.
 */
// Zoom is a multiplier over fit-to-width, so 1 (100%) means "the page fits the
// screen" on a phone and the old fit-to-container scale on a desk.
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const MIN_ZOOM = ZOOM_LEVELS[0];
const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

const clampZoom = (value) => {
    if (!Number.isFinite(value)) return 1;
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
};

// A canvas sized in CSS pixels is blurry on a 2x/3x phone screen, so the backing
// store is multiplied by devicePixelRatio. The budget stops a deep zoom on a
// high-density phone from allocating a 40-megapixel bitmap.
const renderPixelRatio = (width, height) => {
    const raw = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const budget = 12000000;
    const byBudget = Math.sqrt(budget / Math.max(width * height, 1));
    return Math.max(1, Math.min(raw, 3, byBudget));
};

const touchSpan = (touches) => {
    const [a, b] = touches;
    if (!a || !b) return 0;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
};

const PDFViewer = ({
    pdfFile,
    pageNumber,
    coordinates,
    chunkText,
    claim,
    confidence,
    verification,
    onClose,
    highlight,
}) => {
    const canvasRef = useRef(null);
    const textLayerRef = useRef(null);
    const containerRef = useRef(null);
    const highlightRef = useRef(null);
    const renderTaskRef = useRef(null);
    const pinchRef = useRef({ active: false, span: 0, zoom: 1, frame: 0, pending: null });
    const lastPageProp = useRef(Number(pageNumber) || 1);
    const [pdf, setPdf] = useState(null);
    const [page, setPage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [errorStage, setErrorStage] = useState('document');
    const [baseScale, setBaseScale] = useState(1.5);
    const [zoom, setZoom] = useState(1);
    const [viewport, setViewport] = useState(null);
    const [textItems, setTextItems] = useState([]);
    const [showOverlay, setShowOverlay] = useState(true);
    // The parent owns the citation page; the viewer owns which page is on screen
    // so the page controls can move without a callback that does not exist yet.
    const [viewPage, setViewPage] = useState(() => Number(pageNumber) || 1);
    const [reloadToken, setReloadToken] = useState(0);

    // What is actually rendered: fit-to-width scale times the user's zoom.
    const scale = baseScale * zoom;
    const totalPages = pdf && Number.isFinite(pdf.numPages) ? pdf.numPages : null;
    const pageLabel = totalPages ? `Page ${viewPage} of ${totalPages}` : `Page ${viewPage}`;
    // Coordinates belong to the page they were verified on; never draw them on
    // another page just because the user paged away from the citation.
    const isCitationPage = Number(viewPage) === (Number(pageNumber) || 1);

    // Evidence highlight handed in from CitationPanel ("Jump to line").
    // Only draw it when the requested page is the page currently rendered.
    const highlightOnThisPage = !!highlight && !!highlight.coords &&
        (!highlight.page || Number(highlight.page) === Number(viewPage));

    // Scroll the highlight into view once the page has been rendered.
    useEffect(() => {
        if (!highlightOnThisPage || !viewport) return;
        const el = highlightRef.current;
        if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }, [highlightOnThisPage, highlight, viewport, viewPage]);

    // Load PDF document from a File/Blob, or from a URL the backend handed us.
    useEffect(() => {
        if (!pdfFile) return undefined;

        let isMounted = true;

        const loadPDF = async () => {
            try {
                setLoading(true);
                setError(null);
                setPdf(null);
                setPage(null);
                setViewport(null);
                setTextItems([]);

                // A File from an <input type="file"> is the normal path. A string
                // is a backend URL: route it through resolveAssetUrl so a
                // localhost URL becomes the address this device can reach.
                const loadingTask = typeof pdfFile === 'string'
                    ? pdfjsLib.getDocument({ url: resolveAssetUrl(pdfFile) })
                    : pdfjsLib.getDocument({ data: await pdfFile.arrayBuffer() });

                const pdfDoc = await loadingTask.promise;

                if (isMounted) {
                    setPdf(pdfDoc);
                    // A freshly opened document starts at the citation page,
                    // fitted to the width.
                    setViewPage(Number(pageNumber) || 1);
                    lastPageProp.current = Number(pageNumber) || 1;
                    setZoom(1);
                }
            } catch (err) {
                console.error('Error loading PDF:', err);
                if (isMounted) {
                    setErrorStage('document');
                    setError(err && err.message ? err.message : 'Unknown error');
                    // The page effect never runs for a document that failed, so
                    // the spinner must stop here or it would cover the error.
                    setLoading(false);
                }
            }
        };

        loadPDF();

        return () => {
            isMounted = false;
        };
        // pageNumber is read only for the initial page, so it is not a dependency.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pdfFile, reloadToken]);

    // Calculate optimal scale function - fit to width but allow vertical scrolling
    const calculateOptimalScale = (pdfPage, container) => {
        if (!container || !pdfPage) return 1.5; // Default scale

        const containerWidth = Math.max(container.clientWidth - 32, 160); // Account for padding
        const pageViewport = pdfPage.getViewport({ scale: 1.0 });

        // Calculate scale to fit width, allowing vertical scrolling
        const scaleX = containerWidth / pageViewport.width;
        // Use a reasonable scale (fit to width, but allow it to be larger for scrolling)
        const optimalScale = Math.min(scaleX * 0.95, 2.0); // 95% of width fit, max 2x

        return optimalScale;
    };

    // The parent owns the citation page: a new "jump to line" wins over whatever
    // page the reader had paged to.
    useEffect(() => {
        const next = Number(pageNumber) || 1;
        if (next === lastPageProp.current) return;
        lastPageProp.current = next;
        setViewPage(next);
    }, [pageNumber]);

    // Load the page on screen and put it back to fit-to-width.
    useEffect(() => {
        if (!pdf || !viewPage) return undefined;

        let isMounted = true;

        const loadPage = async () => {
            try {
                setLoading(true);
                const pdfPage = await pdf.getPage(viewPage);

                if (isMounted) {
                    setPage(pdfPage);
                    setTextItems([]);
                    setZoom(1);
                }
            } catch (err) {
                console.error('Error loading page:', err);
                if (isMounted) {
                    setErrorStage('page');
                    setError(err && err.message ? err.message : `Page ${viewPage} could not be read`);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        loadPage();

        return () => {
            isMounted = false;
        };
    }, [pdf, viewPage, reloadToken]);

    // Fit-to-width baseline for the page on screen (the user's zoom rides on top
    // of this, so a resize must not throw the zoom level away).
    useEffect(() => {
        if (!page) return undefined;

        const measure = () => {
            const container = containerRef.current;
            const optimalScale = calculateOptimalScale(page, container);
            setBaseScale((previous) => (Math.abs(previous - optimalScale) > 0.01 ? optimalScale : previous));
        };

        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    // The viewport is derived from page + scale, so zoom and resize share one path.
    useEffect(() => {
        if (!page) return;
        setViewport(page.getViewport({ scale }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, scale]);

    // Render page to canvas and extract text
    useEffect(() => {
        if (!page || !viewport || !canvasRef.current) return undefined;

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return undefined;

        // Backing store in device pixels, layout size in CSS pixels. Without the
        // ratio the page text is visibly soft on a phone screen.
        const ratio = renderPixelRatio(viewport.width, viewport.height);
        const pixelWidth = Math.max(1, Math.round(viewport.width * ratio));
        const pixelHeight = Math.max(1, Math.round(viewport.height * ratio));

        // A pinch can start a new render before the previous one finished.
        if (renderTaskRef.current && typeof renderTaskRef.current.cancel === 'function') {
            try {
                renderTaskRef.current.cancel();
            } catch {
                /* the task had already settled */
            }
        }

        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const renderContext = {
            canvasContext: context,
            viewport: viewport,
        };
        if (ratio !== 1) {
            renderContext.transform = [ratio, 0, 0, ratio, 0, 0];
        }

        let cancelled = false;
        let renderTask;
        try {
            renderTask = page.render(renderContext);
        } catch (err) {
            // pdf.js refuses a second render on a canvas that is still busy; the
            // page stays on screen instead of taking the viewer down.
            console.error('Error rendering PDF:', err);
            return undefined;
        }
        renderTaskRef.current = renderTask;

        renderTask.promise.then(async () => {
            // Extract text items for highlighting
            try {
                const textContent = await page.getTextContent();
                if (cancelled) return;
                const items = textContent.items.map((item, index) => {
                    // Transform coordinates from PDF space to viewport space
                    // PDF coordinates use bottom-left origin (y increases upward)
                    // Viewport coordinates use top-left origin (y increases downward)
                    const transform = item.transform;

                    // PDF coordinates (bottom-left origin)
                    const pdfX = transform[4];
                    const pdfY = transform[5]; // Y position in PDF coordinates
                    const pdfWidth = item.width || 0;
                    const pdfHeight = item.height || 0;

                    // Convert to viewport coordinates (top-left origin)
                    // In viewport, y = 0 is at the top, and page height is at bottom
                    const viewportX = pdfX * viewport.scale;
                    const viewportY = (page.view[3] - pdfY) * viewport.scale; // Flip Y axis
                    const viewportWidth = pdfWidth * viewport.scale;
                    const viewportHeight = pdfHeight * viewport.scale;

                    return {
                        ...item,
                        str: item.str || '',
                        index: index,
                        // Viewport coordinates for rendering
                        x: viewportX,
                        y: viewportY - viewportHeight, // Adjust because PDF Y is bottom-left
                        width: Math.max(viewportWidth, 2),
                        height: Math.max(viewportHeight, 2),
                        fontSize: viewportHeight || 12,
                        // Original PDF coordinates for bbox matching
                        pdfX: pdfX,
                        pdfY: pdfY, // Original PDF Y (bottom-left origin)
                        pdfWidth: pdfWidth,
                        pdfHeight: pdfHeight,
                        pdfRight: pdfX + pdfWidth,
                        pdfBottom: pdfY - pdfHeight, // In PDF coords, smaller Y is lower
                    };
                });
                setTextItems(items);
            } catch (err) {
                console.error('Error extracting text:', err);
            }
        }).catch((err) => {
            // A cancelled render is the zoom path, not a failure.
            if (err && err.name === 'RenderingCancelledException') return;
            console.error('Error rendering PDF:', err);
        });

        return () => {
            cancelled = true;
            try {
                renderTask.cancel();
            } catch {
                /* already done */
            }
        };
    }, [page, viewport]);

    // Helper function to find which text items should be highlighted
    // strict = evidence-overlay mode: only the words inside the verified box,
    // with no tolerance padding and no trailing-sentence expansion.
    const getHighlightedTextItems = (bbox, viewport, pageHeight, allTextItems, chunkText = null, strict = false) => {
        const [x0, y0, x1, y1] = bbox;
        const highlightedIndices = new Set();

        // First, try to match by text content if chunk text is provided
        if (!strict && chunkText && chunkText.trim()) {
            const chunkTextLower = chunkText.trim().toLowerCase().replace(/\s+/g, ' ');
            // Get first 50-100 characters for matching (avoid truncation issues)
            const chunkPreview = chunkTextLower.substring(0, Math.min(150, chunkTextLower.length));
            const chunkWords = chunkPreview.split(/\s+/).filter(w => w.length > 1);
            
            if (chunkWords.length > 0) {
                // Build text from PDF items
                let pdfText = '';
                const textItemMap = []; // Map text position to item index
                
                allTextItems.forEach((item, index) => {
                    const itemText = (item.str || '').trim();
                    if (itemText) {
                        textItemMap.push({ index, startPos: pdfText.length, endPos: pdfText.length + itemText.length });
                        pdfText += (pdfText ? ' ' : '') + itemText.toLowerCase();
                    }
                });
                
                // Try to find the chunk text in the PDF text
                const searchStart = pdfText.indexOf(chunkWords[0]);
                if (searchStart !== -1) {
                    // Found the start, now find the end
                    let foundEnd = searchStart;
                    let matchedChars = 0;
                    
                    // Try to match as much of the chunk as possible
                    for (let i = 0; i < chunkWords.length && foundEnd < pdfText.length; i++) {
                        const wordPos = pdfText.indexOf(chunkWords[i], foundEnd);
                        if (wordPos !== -1 && wordPos - foundEnd < 50) { // Words should be close together
                            foundEnd = wordPos + chunkWords[i].length;
                            matchedChars += chunkWords[i].length;
                        } else {
                            break;
                        }
                    }
                    
                    // If we matched a reasonable amount, highlight those items
                    if (matchedChars > chunkPreview.length * 0.3) { // At least 30% match
                        // Find which items correspond to this text range
                        textItemMap.forEach(({ index, startPos, endPos }) => {
                            if ((startPos >= searchStart && startPos < foundEnd) ||
                                (endPos > searchStart && endPos <= foundEnd) ||
                                (startPos <= searchStart && endPos >= foundEnd)) {
                                highlightedIndices.add(index);
                            }
                        });
                        
                        // If we found matches, return them
                        if (highlightedIndices.size > 0) {
                            return highlightedIndices;
                        }
                    }
                }
            }
        }

        // Fallback to coordinate-based matching
        const itemsInBbox = [];

        allTextItems.forEach((item, index) => {
            // Use PDF coordinates for matching (item.pdfX, item.pdfY are in PDF space)
            // In PDF coordinates: Y increases upward (bottom-left origin)
            // bbox: [x0, y0, x1, y1] where y0 is bottom, y1 is top
            const itemRight = item.pdfRight;
            const itemLeft = item.pdfX;
            const itemTop = item.pdfY; // Top of text in PDF coords (larger Y is higher)
            const itemBottom = item.pdfBottom; // Bottom of text in PDF coords

            // Check if item overlaps with bbox (with some tolerance)
            // PDF coordinates: Y increases upward (bottom-left origin)
            // bbox: [x0, y0, x1, y1] where y0 is bottom, y1 is top
            const tolerance = strict ? 2 : 50; // exact in evidence mode
            const overlaps = (
                itemLeft <= x1 + tolerance && // Item starts before or at bbox end
                itemRight >= x0 - tolerance && // Item ends after or at bbox start
                itemTop >= y0 - tolerance && // Item top (larger Y) is above or at bbox bottom (y0)
                itemBottom <= y1 + tolerance // Item bottom (smaller Y) is below or at bbox top (y1)
            );

            if (overlaps) {
                itemsInBbox.push(index);
                highlightedIndices.add(index);
            }
        });

        if (itemsInBbox.length === 0) {
            // Fallback: find nearest items to bbox
            const bboxCenterX = (x0 + x1) / 2;
            const bboxCenterY = (y0 + y1) / 2;

            allTextItems.forEach((item, index) => {
                const itemCenterX = item.pdfX + item.pdfWidth / 2;
                const itemCenterY = item.pdfY - item.pdfHeight / 2;
                const distance = Math.sqrt(
                    Math.pow(itemCenterX - bboxCenterX, 2) +
                    Math.pow(itemCenterY - bboxCenterY, 2)
                );

                if (distance < 50) { // Within 50 PDF units
                    itemsInBbox.push(index);
                    highlightedIndices.add(index);
                }
            });
        }

        if (strict) {
            // Evidence mode stops here: the verified box is the whole answer.
            return highlightedIndices;
        }

        if (itemsInBbox.length === 0) {
            return highlightedIndices;
        }

        // Find the first item in bbox
        const firstIndex = Math.min(...itemsInBbox);
        const firstItem = allTextItems[firstIndex];
        const lastBboxIndex = Math.max(...itemsInBbox);

        // Continue highlighting for 3-4 sentences after the bbox
        let sentenceCount = 0;
        let lastWasEndOfSentence = false;

        // Start from the last item in bbox and continue forward
        for (let i = lastBboxIndex + 1; i < allTextItems.length; i++) {
            const item = allTextItems[i];
            const text = item.str || '';

            // Check distance from first item to avoid going too far
            const lineHeight = firstItem.pdfHeight || 12;
            const verticalDistance = Math.abs(item.pdfY - firstItem.pdfY);

            // Stop if we go too far down (more than 6-7 lines)
            if (verticalDistance > lineHeight * 7) {
                break;
            }

            // Add to highlight
            highlightedIndices.add(i);

            // Count sentences (look for sentence-ending punctuation)
            const trimmedText = text.trim();
            if (trimmedText) {
                // Check if text ends with sentence-ending punctuation
                const endsWithPunctuation = /[.!?]\s*$/.test(trimmedText);
                if (endsWithPunctuation && !lastWasEndOfSentence) {
                    sentenceCount++;
                }

                // Also check if text contains sentence-ending punctuation in the middle
                const hasSentenceEnd = /[.!?]\s+/.test(trimmedText);
                if (hasSentenceEnd && !endsWithPunctuation && !lastWasEndOfSentence) {
                    sentenceCount++;
                }

                lastWasEndOfSentence = endsWithPunctuation || hasSentenceEnd;
            }

            // Stop after 4 sentences
            if (sentenceCount >= 4) {
                // Continue a bit more to include the last sentence fully
                if (sentenceCount >= 5 || verticalDistance > lineHeight * 6) {
                    break;
                }
            }
        }

        return highlightedIndices;
    };

    // Convert coordinates object to bbox array for the helper function
    // Coordinates from backend are in PDF space (bottom-left origin)
    // bbox format: [x0, y0, x1, y1] where y0 is bottom, y1 is top
    const highlightCoords = (highlightOnThisPage ? highlight?.coords : null) || coordinates;
    const bbox = highlightCoords ? [highlightCoords.x0, highlightCoords.y0, highlightCoords.x1, highlightCoords.y1] : null;

    // Debug logging
    useEffect(() => {
        if (bbox && textItems.length > 0) {
            console.log('Citation coordinates:', {
                bbox,
                textItemsCount: textItems.length,
                firstTextItem: textItems[0] ? {
                    pdfX: textItems[0].pdfX,
                    pdfY: textItems[0].pdfY,
                    pdfBottom: textItems[0].pdfBottom
                } : null,
                pageView: page ? page.view : null
            });
        }
    }, [bbox, textItems, page]);

    // The viewer covers the screen, so the page behind it must not scroll under
    // the reader's thumb, and Escape has to work the way every other dialog
    // here does. Both are restored on close.
    useEffect(() => {
        if (typeof document === 'undefined') return undefined;

        const { body } = document;
        const previousOverflow = body.style.overflow;
        body.style.overflow = 'hidden';

        const onKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            // Capture at the window so Escape closes this viewer and not the
            // MobileSheet it was opened from (ChatModal renders it inside one).
            event.stopPropagation();
            if (onClose) onClose();
        };
        window.addEventListener('keydown', onKeyDown, true);

        return () => {
            body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKeyDown, true);
        };
    }, [onClose]);

    if (!pdfFile) {
        return null;
    }

    const pageHeight = page ? page.view[3] - page.view[1] : 0;

    const highlightedIndices = bbox && viewport && page && isCitationPage && textItems.length > 0
        ? getHighlightedTextItems(bbox, viewport, pageHeight, textItems, chunkText, showOverlay)
        : new Set();

    // Exact box in viewport space. Backend coordinates are bottom-left origin,
    // the viewport is top-left, so flip Y with the page height. Only drawn on the
    // page it was verified on.
    const overlayRect = showOverlay && bbox && viewport && pageHeight && highlightCoords && !highlightOnThisPage && isCitationPage
        ? {
            left: highlightCoords.x0 * scale,
            top: (pageHeight - highlightCoords.y1) * scale,
            width: Math.max((highlightCoords.x1 - highlightCoords.x0) * scale, 4),
            height: Math.max((highlightCoords.y1 - highlightCoords.y0) * scale, 4),
        }
        : null;

    // Highlight box requested by CitationPanel, in rendered-page pixels.
    // pdf.js flips PDF space (bottom-left origin) into viewport space
    // (top-left origin) for us; fall back to manual scaling if it refuses.
    const highlightRect = (() => {
        if (!highlightOnThisPage || !viewport || !page || !highlight?.coords) return null;
        const c = highlight.coords;

        let rect = null;
        try {
            if (typeof viewport.convertToViewportRectangle === 'function') {
                rect = viewport.convertToViewportRectangle([c.x0, c.y0, c.x1, c.y1]);
            }
        } catch (err) {
            rect = null;
        }

        if (Array.isArray(rect) && rect.length === 4 && rect.every((n) => Number.isFinite(n))) {
            return {
                left: Math.max(Math.min(rect[0], rect[2]), 0),
                top: Math.max(Math.min(rect[1], rect[3]), 0),
                width: Math.max(Math.abs(rect[2] - rect[0]), 6),
                height: Math.max(Math.abs(rect[3] - rect[1]), 6),
            };
        }

        return {
            left: Math.max(c.x0 * scale, 0),
            top: Math.max((pageHeight - c.y1) * scale, 0),
            width: Math.max((c.x1 - c.x0) * scale, 6),
            height: Math.max((c.y1 - c.y0) * scale, 6),
        };
    })();

    const verdict = verification?.status;
    const verdictColor = verdict === 'supported'
        ? { border: 'border-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-900/30' }
        : verdict === 'page_corrected'
            ? { border: 'border-amber-500', text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-900/30' }
            : { border: 'border-yellow-500', text: 'text-yellow-700 dark:text-yellow-300', bg: 'bg-yellow-50 dark:bg-yellow-900/30' };

    const confidencePct = typeof confidence === 'number'
        ? `${Math.round(confidence <= 1 ? confidence * 100 : confidence)}%`
        : null;

    // ---- Controls -----------------------------------------------------------
    const goToPage = (next) => {
        if (!totalPages) return;
        const target = Math.min(Math.max(next, 1), totalPages);
        if (target === viewPage) return;
        hapticTap();
        setViewPage(target);
        const container = containerRef.current;
        if (container && typeof container.scrollTo === 'function') {
            container.scrollTo({ top: 0 });
        }
    };

    const stepZoom = (direction) => {
        let next;
        if (direction > 0) {
            next = ZOOM_LEVELS.find((level) => level > zoom + 0.001);
            if (next === undefined) next = MAX_ZOOM;
        } else {
            next = [...ZOOM_LEVELS].reverse().find((level) => level < zoom - 0.001);
            if (next === undefined) next = MIN_ZOOM;
        }
        hapticTap();
        setZoom(clampZoom(next));
    };

    const resetZoom = () => {
        hapticTap();
        setZoom(1);
    };

    const retry = () => {
        setError(null);
        setErrorStage('document');
        setLoading(true);
        setReloadToken((token) => token + 1);
    };

    // Pinch-to-zoom on the page itself. The two-finger gesture is ours (the
    // scroll area declares `touch-action: pan-x pan-y`), and the commit is
    // throttled to one animation frame so a pinch does not queue 60 renders.
    const onTouchStart = (event) => {
        if (event.touches.length !== 2) return;
        pinchRef.current = {
            ...pinchRef.current,
            active: true,
            span: touchSpan(event.touches) || 1,
            zoom,
            pending: null,
        };
    };

    const onTouchMove = (event) => {
        const pinch = pinchRef.current;
        if (!pinch.active || event.touches.length !== 2) return;
        const span = touchSpan(event.touches);
        if (!span) return;
        pinch.pending = clampZoom(pinch.zoom * (span / pinch.span));
        if (pinch.frame) return;
        if (typeof window === 'undefined') return;
        pinch.frame = window.requestAnimationFrame(() => {
            pinch.frame = 0;
            if (pinch.pending != null) setZoom(pinch.pending);
        });
    };

    const onTouchEnd = (event) => {
        if (event.touches.length >= 2) return;
        const pinch = pinchRef.current;
        pinch.active = false;
        if (pinch.frame && typeof window !== 'undefined') {
            window.cancelAnimationFrame(pinch.frame);
            pinch.frame = 0;
        }
        if (pinch.pending != null) {
            setZoom(pinch.pending);
            pinch.pending = null;
        }
    };

    const controlButton = 'tap inline-flex items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-gray-300 dark:hover:bg-gray-700 md:h-9 md:w-9 md:min-h-0 md:min-w-0';
    const zoomValueButton = 'tap inline-flex items-center justify-center rounded-lg px-2 text-xs tabular-nums text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 md:h-9 md:min-h-0 md:min-w-[3.5rem]';

    const viewer = (
        <div
            className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black bg-opacity-75 p-0 md:items-center md:p-4"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="flex h-app w-full max-w-6xl flex-col overflow-hidden bg-white pb-safe pt-safe shadow-2xl transition-colors duration-200 dark:bg-gray-800 md:h-auto md:max-h-[95vh] md:rounded-lg"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={`Citation viewer, ${pageLabel}`}
            >
                {/* Header. On a phone the title and the close button own the first
                    row and the verdict chips wrap onto a second one, so nothing is
                    squeezed at 360px. At md+ it is the original single row. */}
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700 sm:flex-nowrap sm:p-4">
                    <h3 className="order-1 min-w-0 flex-1 break-words text-sm font-semibold text-gray-900 dark:text-white sm:order-none sm:flex-none sm:text-lg">
                        Citation View - {pageLabel}
                    </h3>
                    {coordinates && (
                        <div className="order-3 flex w-full flex-wrap items-center gap-1.5 sm:order-none sm:w-auto sm:gap-4">
                            <div className={`rounded border px-2 py-1 text-xs ${verdictColor.text} ${verdictColor.bg} ${verdictColor.border}`}>
                                {verdict === 'supported' ? 'Exact line found' : verdict === 'page_corrected' ? 'Page corrected' : 'Highlighted region'}
                                {confidencePct ? ` · ${confidencePct}` : ''}
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowOverlay((value) => !value)}
                                className={`tap rounded border px-3 py-1 text-xs transition-colors md:min-h-0 md:min-w-0 ${
                                    showOverlay
                                        ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900'
                                        : 'bg-white text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600'
                                }`}
                                title="Toggle between the exact verified box and the wider reading region"
                            >
                                Evidence overlay {showOverlay ? 'ON' : 'OFF'}
                            </button>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="tap order-2 -mr-1 shrink-0 rounded p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 sm:order-none md:ml-auto md:min-h-0 md:min-w-0"
                        title="Close"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Page area - the only scroller. `overscroll-contain` stops the
                    flick at the end of a page from moving the document behind the
                    viewer; `text-align: center` keeps the page centred while still
                    leaving the whole page reachable when zoomed past the width. */}
                <div
                    ref={containerRef}
                    className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-gray-200 px-2 py-2 dark:bg-gray-900 sm:p-4 md:min-h-[320px]"
                    style={{ textAlign: 'center', touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                    onTouchCancel={onTouchEnd}
                >
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 dark:bg-gray-800 dark:bg-opacity-75 z-10" role="status" aria-live="polite">
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-2" aria-hidden="true"></div>
                                <p className="text-gray-600 dark:text-gray-300">Loading PDF...</p>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="flex min-h-[220px] items-center justify-center p-4 sm:p-8" role="alert">
                            <div className="max-w-sm text-center">
                                <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-500" aria-hidden="true" />
                                <p className="text-red-600 dark:text-red-400 font-semibold mb-2">
                                    {errorStage === 'document' ? 'This PDF could not be loaded' : `Page ${viewPage} could not be displayed`}
                                </p>
                                <p className="text-gray-600 dark:text-gray-300 text-sm break-words">{error}</p>
                                <button
                                    type="button"
                                    onClick={retry}
                                    className="tap mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                                >
                                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                    Try again
                                </button>
                            </div>
                        </div>
                    )}

                    {!error && viewport && (
                        <div className="relative inline-block bg-white shadow-lg m-2 sm:m-4">
                            {/* CSS Animation for highlight blinking */}
                            <style>{`
                                @keyframes highlightBlink {
                                    0%, 100% {
                                        opacity: 0.75;
                                    }
                                    50% {
                                        opacity: 0.95;
                                    }
                                }
                            `}</style>
                            <canvas ref={canvasRef} className="block" />

                            {/* Exact verified bounding box (evidence overlay) */}
                            {overlayRect && (
                                <div
                                    className={`absolute pointer-events-none border-2 rounded-sm ${verdictColor.border}`}
                                    style={{
                                        left: `${overlayRect.left}px`,
                                        top: `${overlayRect.top}px`,
                                        width: `${overlayRect.width}px`,
                                        height: `${overlayRect.height}px`,
                                        boxShadow: '0 0 0 1px rgba(255,255,255,0.9)',
                                    }}
                                >
                                    <span className={`absolute -top-5 left-0 text-[10px] leading-4 px-1.5 rounded whitespace-nowrap ${verdictColor.bg} ${verdictColor.text} border ${verdictColor.border}`}>
                                        source box{confidencePct ? ` · ${confidencePct}` : ''}
                                    </span>
                                </div>
                            )}

                            {/* Citation highlight requested by CitationPanel */}
                            {highlightRect && (
                                <div
                                    ref={highlightRef}
                                    className="absolute pointer-events-none border border-yellow-500 bg-yellow-300 rounded-sm"
                                    style={{
                                        left: `${highlightRect.left}px`,
                                        top: `${highlightRect.top}px`,
                                        width: `${highlightRect.width}px`,
                                        height: `${highlightRect.height}px`,
                                        opacity: 0.4,
                                        mixBlendMode: 'multiply',
                                    }}
                                    title="Cited line"
                                />
                            )}

                            {/* Text layer for highlighting */}
                            {textItems.length > 0 && bbox && (
                                <div
                                    ref={textLayerRef}
                                    className="absolute inset-0 pointer-events-none"
                                    style={{
                                        width: `${viewport.width}px`,
                                        height: `${viewport.height}px`,
                                    }}
                                >
                                    {textItems.map((item, index) => {
                                        if (!highlightedIndices.has(index)) return null;

                                        // Calculate highlight dimensions
                                        const highlightWidth = Math.max(item.width, 3);
                                        const highlightHeight = Math.max(item.height, 3);

                                        return (
                                            <span
                                                key={`highlight-${index}`}
                                                className="absolute bg-yellow-300 rounded-sm"
                                                style={{
                                                    left: `${item.x}px`,
                                                    top: `${item.y}px`,
                                                    width: `${highlightWidth}px`,
                                                    height: `${highlightHeight}px`,
                                                    minWidth: '2px',
                                                    minHeight: '2px',
                                                    mixBlendMode: 'multiply',
                                                    animation: showOverlay ? 'none' : 'highlightBlink 2s ease-in-out infinite',
                                                    opacity: showOverlay ? 0.45 : 0.8,
                                                }}
                                                title={item.str ? `${item.str.substring(0, 50)}...` : ''}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Controls. Page first, zoom second, each group kept intact and
                    allowed to wrap - so at 360px the zoom buttons sit in the row
                    instead of being pushed off the viewer edge. */}
                <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-2 py-2 dark:border-gray-700 sm:px-3">
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => goToPage(viewPage - 1)}
                            disabled={viewPage <= 1}
                            className={controlButton}
                            title="Previous page"
                            aria-label="Previous page"
                        >
                            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                        </button>
                        <span className="whitespace-nowrap px-1 text-xs tabular-nums text-gray-700 dark:text-gray-200 sm:text-sm">
                            {pageLabel}
                        </span>
                        <button
                            type="button"
                            onClick={() => goToPage(viewPage + 1)}
                            disabled={!totalPages || viewPage >= totalPages}
                            className={controlButton}
                            title="Next page"
                            aria-label="Next page"
                        >
                            <ChevronRight className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => stepZoom(-1)}
                            disabled={zoom <= MIN_ZOOM}
                            className={controlButton}
                            title="Zoom out"
                            aria-label="Zoom out"
                        >
                            <ZoomOut className="h-5 w-5" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={resetZoom}
                            className={zoomValueButton}
                            title="Reset zoom to fit the width"
                            aria-label="Reset zoom to fit the width"
                        >
                            {Math.round(zoom * 100)}%
                        </button>
                        <button
                            type="button"
                            onClick={() => stepZoom(1)}
                            disabled={zoom >= MAX_ZOOM}
                            className={controlButton}
                            title="Zoom in"
                            aria-label="Zoom in"
                        >
                            <ZoomIn className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {/* Footer Info */}
                {coordinates && (
                    <div className={`max-h-[38vh] flex-shrink-0 overflow-y-auto overscroll-contain border-t p-3 text-sm sm:max-h-none ${verdictColor.bg} ${verdictColor.text} ${verdictColor.border}`}>
                        <p className="font-semibold">
                            {verdict === 'supported'
                                ? 'Exact line found on the cited page'
                                : verdict === 'page_corrected'
                                    ? 'Line found — page number corrected'
                                    : verdict === 'dropped'
                                        ? 'No line in the document supports this claim'
                                        : 'Highlighted citation region'}
                            {confidencePct ? ` · confidence ${confidencePct}` : ''}
                        </p>
                        {claim && (
                            <p className="text-xs mt-1 italic">&ldquo;{claim}&rdquo;</p>
                        )}
                        {verification?.reason && (
                            <p className="text-xs mt-1 opacity-80">{verification.reason}</p>
                        )}
                        <p className="text-xs mt-1 opacity-80">
                            Box on page {pageNumber} • ({coordinates.x0.toFixed(1)}, {coordinates.y0.toFixed(1)}) → ({coordinates.x1.toFixed(1)}, {coordinates.y1.toFixed(1)})
                        </p>
                    </div>
                )}
            </div>
        </div>
    );

    // Portalled to the body: ChatModal renders this viewer inside its own
    // MobileSheet, and a transformed/overflow-hidden ancestor would otherwise
    // size and clip the full-screen viewer to the sheet panel.
    if (typeof document === 'undefined') return viewer;
    return createPortal(viewer, document.body);
};

export default PDFViewer;
