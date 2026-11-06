import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Mic, MicOff, Keyboard, Volume2, Globe, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { getApiBaseUrl } from '../../utils/api';

const SUPPORTED_LANGUAGES = {
    'hi-IN': 'Hindi (हिंदी)',
    'ta-IN': 'Tamil (தமிழ்)',
    'te-IN': 'Telugu (తెలుగు)',
    'bn-IN': 'Bengali (বাংলা)',
    'gu-IN': 'Gujarati (ગુજરાતી)',
    'kn-IN': 'Kannada (ಕನ್ನಡ)',
    'ml-IN': 'Malayalam (മലയാളം)',
    'mr-IN': 'Marathi (मराठी)',
    'or-IN': 'Odia (ଓଡ଼ିଆ)',
    'pa-IN': 'Punjabi (ਪੰਜਾਬੀ)',
    'en-IN': 'English'
};

// Auto-grow cap for the composer, in px (~5 lines at 16px/1.6).
const COMPOSER_MAX_HEIGHT = 120;

const Chatbot = () => {
    const [messages, setMessages] = useState([
        {
            type: 'bot',
            text: "Hello! I'm your health assistant. I can help you with questions about your medications, diet, and appointments.",
            language: 'en-IN',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState('en-IN');
    const [inputMode, setInputMode] = useState('text'); // 'text' or 'mic'
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessingAudio, setIsProcessingAudio] = useState(false);
    const [speakingMessageIndex, setSpeakingMessageIndex] = useState(null); // Track which message is being spoken

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const messagesEndRef = useRef(null);
    const currentAudioRef = useRef(null);
    const messageListRef = useRef(null);
    const composerRef = useRef(null);

    /**
     * Scroll the transcript, never the page.
     *
     * `scrollIntoView` also drags the document, which on a phone leaves the whole
     * chat shifted under the header once the keyboard closes. Scrolling the list
     * container directly keeps the page still and still works for the
     * bottom-anchor fallback.
     */
    const scrollToBottom = (behavior = 'smooth') => {
        const list = messageListRef.current;
        if (!list) {
            messagesEndRef.current?.scrollIntoView({ behavior });
            return;
        }
        if (behavior === 'auto') list.scrollTop = list.scrollHeight;
        else list.scrollTo({ top: list.scrollHeight, behavior });
    };

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping, isProcessingAudio]);

    // The keyboard opening resizes the viewport (Capacitor runs the webview in
    // native resize mode), which can leave the newest message under the
    // composer. Re-pin after the resize settles, on either viewport.
    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const viewport = window.visualViewport;
        let frame = 0;
        const repin = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => scrollToBottom('auto'));
        };
        window.addEventListener('resize', repin);
        if (viewport) viewport.addEventListener('resize', repin);
        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener('resize', repin);
            if (viewport) viewport.removeEventListener('resize', repin);
        };
    }, []);

    // Composer auto-grow: one line at rest, capped so a pasted paragraph cannot
    // eat the transcript. The cap matches `max-h-[7.5rem]` in the class list.
    useEffect(() => {
        const field = composerRef.current;
        if (!field) return;
        field.style.height = 'auto';
        field.style.height = `${Math.min(field.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
    }, [input, inputMode]);

    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            if (currentAudioRef.current) {
                currentAudioRef.current.pause();
                currentAudioRef.current = null;
            }
        };
    }, []);

    // Debug: Log whenever selectedLanguage changes
    useEffect(() => {
        console.log('🔍 DEBUG: selectedLanguage state updated to:', selectedLanguage);
    }, [selectedLanguage]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMessage = {
            type: 'user',
            text: input,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages(prev => [...prev, userMessage]);
        const currentInput = input;
        setInput('');
        setIsTyping(true);

        try {
            // Call backend API for text chat
            const response = await fetch(`${getApiBaseUrl()}/chatbot/text`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: currentInput,
                    target_language: selectedLanguage,
                    conversation_history: messages.slice(-10).map(msg => ({
                        role: msg.type === 'user' ? 'user' : 'assistant',
                        content: msg.text
                    })),
                    generate_audio: false  // Don't auto-generate audio
                })
            });

            if (!response.ok) {
                throw new Error('Failed to get response from chatbot');
            }

            const data = await response.json();

            const botMessage = {
                type: 'bot',
                text: data.response_text,
                language: selectedLanguage,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };

            setMessages(prev => [...prev, botMessage]);

        } catch (error) {
            console.error('Error sending message:', error);
            const errorMessage = {
                type: 'bot',
                text: "I'm sorry, I encountered an error processing your request. Please try again.",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsTyping(false);
        }
    };

    const startRecording = async () => {
        try {
            console.log('🔍 DEBUG: Starting recording with selectedLanguage =', selectedLanguage);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                await processVoiceInput(audioBlob);

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (error) {
            console.error('Error starting recording:', error);
            alert('Failed to access microphone. Please check permissions.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const processVoiceInput = async (audioBlob) => {
        setIsProcessingAudio(true);

        try {
            console.log('🔍 DEBUG: selectedLanguage state =', selectedLanguage);
            console.log('🔍 DEBUG: SUPPORTED_LANGUAGES[selectedLanguage] =', SUPPORTED_LANGUAGES[selectedLanguage]);

            const formData = new FormData();
            formData.append('audio_file', audioBlob, 'recording.wav');
            formData.append('source_language', selectedLanguage);
            formData.append('target_language', selectedLanguage);
            formData.append('generate_audio', 'true');

            console.log('🔍 DEBUG: FormData contents:');
            console.log('  - source_language:', selectedLanguage);
            console.log('  - target_language:', selectedLanguage);

            const response = await fetch(`${getApiBaseUrl()}/chatbot/voice`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Failed to process voice input');
            }

            const data = await response.json();

            // Add user message (translated to English for display)
            if (data.translated_input) {
                const userMessage = {
                    type: 'user',
                    text: data.translated_input,
                    originalLanguage: selectedLanguage,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };
                setMessages(prev => [...prev, userMessage]);
            }

            // Add bot response
            const botMessage = {
                type: 'bot',
                text: data.response_text,
                language: selectedLanguage,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setMessages(prev => [...prev, botMessage]);

        } catch (error) {
            console.error('Error processing voice input:', error);
            const errorMessage = {
                type: 'bot',
                text: "I'm sorry, I couldn't process your voice message. Please try again.",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsProcessingAudio(false);
        }
    };

    const playAudio = (base64Audio) => {
        try {
            // Stop any currently playing audio
            if (currentAudioRef.current) {
                currentAudioRef.current.pause();
                currentAudioRef.current = null;
            }

            const audio = new Audio(`data:audio/wav;base64,${base64Audio}`);
            currentAudioRef.current = audio;
            audio.play().catch(err => {
                console.error('Error playing audio:', err);
            });

            // Add ended event listener to reset state
            audio.addEventListener('ended', () => {
                setSpeakingMessageIndex(null);
            });
        } catch (error) {
            console.error('Error creating audio:', error);
            setSpeakingMessageIndex(null);
        }
    };

    const speakText = async (text, language, messageIndex) => {
        try {
            if (speakingMessageIndex === messageIndex) {
                // If currently speaking this message, stop it
                if (currentAudioRef.current) {
                    currentAudioRef.current.pause();
                    currentAudioRef.current = null;
                }
                setSpeakingMessageIndex(null);
                return;
            }

            setSpeakingMessageIndex(messageIndex);

            // Stop any currently playing audio
            if (currentAudioRef.current) {
                currentAudioRef.current.pause();
                currentAudioRef.current = null;
            }

            // Use backend endpoint for TTS
            const response = await fetch(`${getApiBaseUrl()}/chatbot/speak`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    target_language: language
                })
            });

            if (!response.ok) {
                throw new Error('Failed to generate speech');
            }

            const data = await response.json();

            if (data.audio) {
                playAudio(data.audio);
            } else {
                setSpeakingMessageIndex(null);
            }

        } catch (error) {
            console.error('Error in speakText:', error);
            setSpeakingMessageIndex(null);
        }
    };


    const toggleInputMode = () => {
        if (isRecording) {
            stopRecording();
        }
        setInputMode(prev => prev === 'text' ? 'mic' : 'text');
        setInput('');
    };

    const handleVoiceButtonClick = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    return (
        // `h-chat` is dvh-based, so the keyboard shrinking the webview shrinks the
        // chat instead of hiding the composer. `min-h-0` overrides the utility's
        // 22rem floor: with a keyboard open on a short phone that floor is taller
        // than the viewport, which is exactly what pushes the composer off-screen.
        <div className="max-w-4xl mx-auto flex h-chat min-h-0 flex-col md:block md:p-6 lg:p-8">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-3 md:mb-8 text-center flex-shrink-0"
            >
                <h2 className="text-xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-1 md:mb-3 tracking-tight">
                    Health Assistant
                </h2>
                <p className="hidden sm:block text-gray-600 dark:text-gray-400 max-w-2xl mx-auto text-base md:text-lg leading-relaxed">
                    Your multilingual AI companion for medication queries, diet plans, and health advice.
                </p>
            </motion.div>

            {/* A chat has to own its scroller: the message list scrolls, the
                composer stays put. `min-h-0` is what lets flex-1 shrink below
                its content instead of pushing the composer off the screen, and
                `items-stretch` is what gives the card a definite height on a
                phone (the desktop sidebar still starts at the top). */}
            <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-stretch lg:items-start flex-1 min-h-0 lg:h-[calc(100dvh-250px)] lg:min-h-[600px] mb-0 md:mb-0">
                {/* Main Chat Interface */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col h-full min-h-0 bg-white dark:bg-gray-800 rounded-3xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700 relative"
                >
                    {/* Header */}
                    <div className="absolute top-0 left-0 right-0 z-10 px-3 sm:px-6 py-2.5 sm:py-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-700 flex justify-between items-center gap-2">
                        <div className="flex items-center space-x-3 min-w-0">
                            <div className="relative flex-shrink-0">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-teal-400 flex items-center justify-center shadow-lg">
                                    <Bot className="w-6 h-6 text-white" />
                                </div>
                                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full"></span>
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-bold text-gray-900 dark:text-white leading-tight truncate">Assistant</h3>
                                {/* One line, so the absolute header keeps the
                                    reserved offset the transcript is padded by. */}
                                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1 min-w-0">
                                    <Globe className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{SUPPORTED_LANGUAGES[selectedLanguage]}</span>
                                </p>
                            </div>
                        </div>

                        {/* Language Selector in Header */}
                        <div className="relative group flex-shrink-0">
                            <select
                                value={selectedLanguage}
                                onChange={(e) => {
                                    console.log('🔍 DEBUG: Language changed from', selectedLanguage, 'to', e.target.value);
                                    setSelectedLanguage(e.target.value);
                                }}
                                className="appearance-none bg-gray-50 dark:bg-gray-700 border-0 text-gray-700 dark:text-gray-200 text-base md:text-sm rounded-full py-2.5 pl-3 pr-8 sm:pl-4 focus:ring-2 focus:ring-blue-500 cursor-pointer font-medium hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors tap md:min-h-[40px] max-w-[7.5rem] sm:max-w-[8.5rem]"
                            >
                                {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
                                    <option key={code} value={code}>{name}</option>
                                ))}
                            </select>
                            <Globe className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* Chat Messages */}
                    <div
                        ref={messageListRef}
                        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-6 pt-[72px] sm:pt-24 pb-6 space-y-4 sm:space-y-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent"
                    >
                        <AnimatePresence initial={false}>
                            {messages.map((message, index) => (
                                <motion.div
                                    key={index}
                                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ duration: 0.3, ease: "easeOut" }}
                                    className={`flex items-end space-x-2 min-w-0 ${message.type === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}
                                >
                                    {message.type === 'bot' && (
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-1">
                                            <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                        </div>
                                    )}

                                    {/* 85% on a phone leaves the avatar and the
                                        opposite edge visible; `min-w-0` is what
                                        lets a long word actually wrap instead of
                                        pushing the bubble past the card. */}
                                    <div className={`relative max-w-[85%] min-w-0 sm:max-w-[75%] group`}>
                                        <div
                                            className={`px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm text-[15px] leading-relaxed break-words [overflow-wrap:anywhere] ${message.type === 'bot'
                                                ? 'bg-gray-100 dark:bg-gray-700/80 text-gray-800 dark:text-gray-100 rounded-2xl rounded-tl-none'
                                                : 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl rounded-tr-none'
                                                }`}
                                        >
                                            {message.type === 'bot' ? (
                                                <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_a]:break-words [&_code]:break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
                                                    <ReactMarkdown>{message.text}</ReactMarkdown>
                                                </div>
                                            ) : (
                                                <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.text}</p>
                                            )}
                                        </div>

                                        {/* Metadata & Actions */}
                                        <div className={`flex flex-wrap items-center gap-2 mt-1.5 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">
                                                {message.time}
                                            </span>

                                            {message.type === 'bot' && message.language && (
                                                <button
                                                    onClick={() => speakText(message.text, message.language, index)}
                                                    className={`tap flex items-center justify-center rounded-full transition-all duration-200 ${speakingMessageIndex === index
                                                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 animate-pulse'
                                                        : 'text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                        }`}
                                                    title="Read Aloud"
                                                >
                                                    {speakingMessageIndex === index ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Volume2 className="w-3.5 h-3.5" />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {isTyping && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center space-x-2"
                            >
                                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                    <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="bg-gray-100 dark:bg-gray-700/80 px-4 py-3 rounded-2xl rounded-tl-none">
                                    <div className="flex space-x-1.5">
                                        <div className="w-1.5 h-1.5 bg-gray-400/70 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                                        <div className="w-1.5 h-1.5 bg-gray-400/70 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                                        <div className="w-1.5 h-1.5 bg-gray-400/70 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                        {isProcessingAudio && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex justify-center my-4"
                            >
                                <div className="flex items-center space-x-2 bg-blue-50 dark:bg-blue-900/20 px-4 py-2 rounded-full border border-blue-100 dark:border-blue-800">
                                    <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
                                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Processing voice...</span>
                                </div>
                            </motion.div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area — pinned. The wrapper adds the safe-area inset
                        on top of the composer's own padding (a no-op on a
                        desktop, where `env()` is 0). */}
                    <div className="border-t border-gray-100 dark:border-gray-700 p-3 sm:p-4 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm flex-shrink-0">
                        <div
                            className="relative flex items-end md:items-center gap-2"
                            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
                        >
                            <button
                                onClick={toggleInputMode}
                                className={`tap flex items-center justify-center rounded-xl transition-all duration-200 flex-shrink-0 ${inputMode === 'mic'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-blue-500/20'
                                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300'
                                    }`}
                                title={inputMode === 'mic' ? 'Switch to Text' : 'Switch to Voice'}
                            >
                                {inputMode === 'mic' ? <Keyboard className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                            </button>

                            {inputMode === 'text' ? (
                                <div className="flex-1 min-w-0 relative">
                                    {/* A textarea, not an input: it grows with the
                                        question instead of hiding the start of it.
                                        16px keeps the OS from zooming on focus. */}
                                    <textarea
                                        ref={composerRef}
                                        rows={1}
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key !== 'Enter' || e.shiftKey) return;
                                            // Never send in the middle of an IME composition
                                            // (Hindi/Tamil keyboards compose with Enter).
                                            if (e.nativeEvent && e.nativeEvent.isComposing) return;
                                            e.preventDefault();
                                            handleSend();
                                        }}
                                        onFocus={() => {
                                            // The keyboard is still sliding in when focus
                                            // lands; re-pin once it has settled.
                                            window.setTimeout(() => scrollToBottom('auto'), 320);
                                        }}
                                        placeholder="Type your question..."
                                        enterKeyHint="send"
                                        autoComplete="off"
                                        className="block w-full bg-gray-100 dark:bg-gray-700/50 border-0 rounded-xl pl-4 pr-14 py-3 text-base leading-relaxed text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-700 transition-all shadow-inner resize-none overflow-y-auto max-h-[7.5rem]"
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={!input.trim() || isTyping}
                                        className="absolute right-1 bottom-1 flex items-center justify-center w-11 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-gray-600 dark:disabled:text-gray-400"
                                        aria-label="Send message"
                                        title={isTyping ? 'Waiting for the assistant' : 'Send message'}
                                    >
                                        {isTyping ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Send className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex-1 min-w-0 flex items-center justify-center py-1">
                                    <button
                                        onClick={handleVoiceButtonClick}
                                        disabled={isProcessingAudio}
                                        className={`relative group flex items-center justify-center w-14 h-14 rounded-full transition-all duration-300 ${isRecording
                                            ? 'bg-red-500 shadow-lg shadow-red-500/40 ring-4 ring-red-500/20 scale-105'
                                            : 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-105'
                                            }`}
                                    >
                                        {isRecording ? (
                                            <div className="absolute inset-0 rounded-full border-4 border-white/20 animate-ping"></div>
                                        ) : null}
                                        {isRecording ? <MicOff className="w-6 h-6 text-white relative z-10" /> : <Mic className="w-6 h-6 text-white relative z-10" />}
                                    </button>
                                    <div className="ml-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                                        {isRecording ? (
                                            <span className="text-red-500 dark:text-red-400 animate-pulse">Recording...</span>
                                        ) : (
                                            "Tap to speak"
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>

                {/* Sidebar / Info Panel (Desktop Only) */}
                <div className="hidden lg:flex flex-col gap-6">
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-lg border border-gray-100 dark:border-gray-700"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-bold text-gray-900 dark:text-white">Quick Tips</h4>
                            <Sparkles className="w-5 h-5 text-amber-500" />
                        </div>
                        <div className="space-y-4">
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/50">
                                <h5 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">Language Support</h5>
                                <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
                                    I clearly understand 11 Indian languages. Change the language anytime from the top menu.
                                </p>
                            </div>
                            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-2xl border border-purple-100 dark:border-purple-800/50">
                                <h5 className="text-sm font-semibold text-purple-800 dark:text-purple-300 mb-1">Voice First</h5>
                                <p className="text-xs text-purple-600 dark:text-purple-400 leading-relaxed">
                                    Tap the Mic button to speak. I'll listen and reply with audio in your chosen language.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

export default Chatbot;
