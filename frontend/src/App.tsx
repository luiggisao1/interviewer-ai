import { FormEvent, useEffect, useRef, useState } from "react";
import { api, getRealtimeWsUrl } from "./api";
import type { AudioMode, Difficulty, Evaluation, InterviewConfig, Message, Mode, Plan, Role, StudyGuideSection } from "./types";
import { Topbar } from "./components/layout/Topbar";
import { EvaluatingOverlay } from "./components/layout/EvaluatingOverlay";
import { Setup } from "./components/setup/Setup";
import { InterviewStage } from "./components/interview/InterviewStage";
import { Debrief } from "./components/debrief/Debrief";

type Stage = "setup" | "interview" | "results";
type VoiceStatus = "idle" | "connecting" | "listening" | "speaking" | "error";
type RealtimeEvent = {
  type?: string;
  transcript?: string;
  item?: { role?: string };
  response?: { output?: unknown[] };
  error?: { type?: string; code?: string; message?: string };
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: { transcript: string };
    };
  };
};
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onstart?: () => void;
  onresult: (event: SpeechRecognitionEventLike) => void;
  onend: () => void;
  onerror: (event: { error: string; message?: string }) => void;
};
type RecognitionCtor = new () => Recognition;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  }
}

const defaultConfig: InterviewConfig = {
  role: "Software Engineer",
  custom_role: "",
  mode: "Mixed",
  difficulty: "Mid-level",
  duration_minutes: 15,
  custom_instructions: "",
};

function speak(text: string, onEnd?: () => void) {
  if (!("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice =
    voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.includes("Samantha") ||
          v.name.includes("Google") ||
          v.name.includes("Natural") ||
          v.name.includes("Karen") ||
          v.name.includes("Victoria") ||
          v.name.includes("Zira"))
    ) || voices.find((v) => v.lang.startsWith("en"));
  if (preferredVoice) utterance.voice = preferredVoice;

  let fired = false;
  let resumeTimer: number | null = null;
  let safetyTimer: number | null = null;

  const cleanup = () => {
    if (resumeTimer) window.clearInterval(resumeTimer);
    if (safetyTimer) window.clearTimeout(safetyTimer);
  };

  const finish = () => {
    if (!fired) {
      fired = true;
      cleanup();
      onEnd?.();
    }
  };

  utterance.onend = finish;
  utterance.onerror = (e) => {
    console.warn("[TTS Error]", e);
    finish();
  };

  // Chromium bug workaround: speech synthesis pauses after ~15s without resume()
  resumeTimer = window.setInterval(() => {
    if (!window.speechSynthesis.speaking) {
      cleanup();
    } else {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }
  }, 4000);

  const wordCount = text.trim().split(/\s+/).length;
  const maxWaitMs = Math.max(3500, (wordCount / 2.2) * 1000 + 2500);
  safetyTimer = window.setTimeout(finish, maxWaitMs);

  window.speechSynthesis.speak(utterance);
}

export default function App() {
  const [stage, setStage] = useState<Stage>("setup");
  const [studyGuide, setStudyGuide] = useState("");
  const [guideSections, setGuideSections] = useState<StudyGuideSection[]>([]);
  const [selectedSection, setSelectedSection] = useState("python");
  const [guideLoading, setGuideLoading] = useState(true);
  const [config, setConfig] = useState<InterviewConfig>(defaultConfig);
  const [availableEngines, setAvailableEngines] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [answer, setAnswer] = useState("");
  const [complete, setComplete] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [provider, setProvider] = useState("");
  const [recruiterName, setRecruiterName] = useState(import.meta.env.VITE_RECRUITER_NAME || "Iris");
  const [loading, setLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [audioMode, setAudioMode] = useState<AudioMode>("web");
  const [textMode, setTextMode] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const recognitionRef = useRef<Recognition | null>(null);
  const isRecognitionActiveRef = useRef(false);
  const recognitionStoppingRef = useRef(false);
  const transcriptFinalRef = useRef("");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const liveSocketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserCleanupRef = useRef<(() => void) | null>(null);
  const audioQueueRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlayTimeRef = useRef<number>(0);
  const manuallyMutedRef = useRef(false);
  const assistantSpeakingRef = useRef(false);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const autoStartVoiceRef = useRef(false);
  const autoStartLiveVoiceRef = useRef(false);
  const autoStartBrowserVoiceRef = useRef(false);
  const browserVoiceActiveRef = useRef(false);
  const liveVoiceActiveRef = useRef(false);
  const answerRef = useRef("");
  const submittingRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const speechSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    async function loadGuideSections() {
      try {
        const sections = await api.studyGuideSections();
        setGuideSections(sections);
        const initial = sections.find((section) => section.id === "python") ?? sections[0];
        if (initial) {
          setSelectedSection(initial.id);
          setStudyGuide(initial.content);
        }
      } catch (err) {
        setSelectedSection("custom");
        setError(err instanceof Error ? err.message : "Unable to load study_guide.md.");
      } finally {
        setGuideLoading(false);
      }
    }

    async function initProviders() {
      try {
        const res = await api.providers();
        if (res.recruiter_name) {
          setRecruiterName(res.recruiter_name);
        }
        if (res.available && res.available.length > 0) {
          setAvailableEngines(res.available);
          const chosen = res.active || (res.available.includes("gemini") ? "gemini" : res.available[0]);
          setProvider(chosen);
          setConfig((c) => ({ ...c, provider: chosen }));
        }
      } catch {
        try {
          const h = await api.health();
          if (h.recruiter_name) {
            setRecruiterName(h.recruiter_name);
          }
          if (h.provider) {
            setProvider(h.provider);
            setConfig((c) => ({ ...c, provider: h.provider }));
          }
        } catch {}
      }
    }

    void loadGuideSections();
    void initProviders();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (stage !== "interview" || isEvaluating) return;
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      // Spacebar toggles mute when not typing inside an input/textarea
      if (e.code === "Space" && !isInput && !textMode) {
        e.preventDefault();
        toggleMute();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stage, isEvaluating, textMode, muted]);

  const updateConfig = <K extends keyof InterviewConfig>(key: K, value: InterviewConfig[K]) =>
    setConfig((current) => ({ ...current, [key]: value }));

  async function ensureMicrophoneStream(): Promise<MediaStream | null> {
    if (microphoneRef.current && microphoneRef.current.active) {
      return microphoneRef.current;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      microphoneRef.current = stream;
      startMicLevelMonitor(stream);
      return stream;
    } catch (err) {
      console.warn("[Mic Error] getUserMedia failed:", err);
      setError("Microphone permission denied or device unavailable. Please allow microphone access in your browser address bar.");
      return null;
    }
  }

  function startMicLevelMonitor(stream: MediaStream) {
    if (micAnalyserCleanupRef.current) {
      micAnalyserCleanupRef.current();
      micAnalyserCleanupRef.current = null;
    }
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const interval = window.setInterval(() => {
        if (!microphoneRef.current || manuallyMutedRef.current || assistantSpeakingRef.current) {
          setMicLevel(0);
          return;
        }
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
      }, 100);

      micAnalyserCleanupRef.current = () => {
        window.clearInterval(interval);
        try { ctx.close(); } catch {}
        setMicLevel(0);
      };
    } catch {}
  }

  function getOrCreateRecognition(): Recognition | null {
    if (recognitionRef.current) return recognitionRef.current;
    const RecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionClass) return null;

    const recognition = new RecognitionClass();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      console.log("[STT] speech recognition started");
      isRecognitionActiveRef.current = true;
      recognitionStoppingRef.current = false;
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let newlyFinalized = "";
      let currentInterim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        const text = item[0].transcript;
        if (item.isFinal) {
          newlyFinalized += text + " ";
        } else {
          currentInterim += text;
        }
      }

      if (newlyFinalized) {
        transcriptFinalRef.current = (transcriptFinalRef.current + " " + newlyFinalized).trim();
      }

      const combined = (transcriptFinalRef.current + " " + currentInterim).trim();
      if (combined) {
        setAnswer(combined);
        answerRef.current = combined;
      }

      if (browserVoiceActiveRef.current && !submittingRef.current) {
        if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
        if (combined.split(/\s+/).length >= 4) {
          silenceTimerRef.current = window.setTimeout(() => {
            void submitBrowserAnswer();
          }, 3500);
        }
      }
    };

    recognition.onerror = (event: { error: string; message?: string }) => {
      console.warn("[STT Error]", event.error, event);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone or speech recognition access blocked. Please check your browser address bar permissions.");
      } else if (event.error === "audio-capture") {
        setError("No microphone audio detected or microphone device is busy.");
      } else if (event.error === "network") {
        console.warn("[STT] Speech recognition network glitch; will resume automatically.");
      }
    };

    recognition.onend = () => {
      console.log("[STT] speech recognition ended");
      isRecognitionActiveRef.current = false;

      const shouldRestart =
        (liveVoiceActiveRef.current || browserVoiceActiveRef.current) &&
        !assistantSpeakingRef.current &&
        !manuallyMutedRef.current &&
        !submittingRef.current &&
        !recognitionStoppingRef.current;

      if (shouldRestart) {
        window.setTimeout(() => {
          if (
            (liveVoiceActiveRef.current || browserVoiceActiveRef.current) &&
            !assistantSpeakingRef.current &&
            !manuallyMutedRef.current &&
            !isRecognitionActiveRef.current
          ) {
            safeStartRecognition();
          }
        }, 80);
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }

  function safeStartRecognition() {
    if (!speechSupported || manuallyMutedRef.current || assistantSpeakingRef.current) return;
    const rec = getOrCreateRecognition();
    if (!rec || isRecognitionActiveRef.current) return;

    recognitionStoppingRef.current = false;
    try {
      rec.start();
      isRecognitionActiveRef.current = true;
    } catch (err: unknown) {
      const e = err as { name?: string };
      if (e?.name !== "InvalidStateError") {
        console.warn("[STT] safeStartRecognition exception:", err);
      }
    }
  }

  function safeStopRecognition() {
    recognitionStoppingRef.current = true;
    if (!recognitionRef.current || !isRecognitionActiveRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch (err) {
      console.warn("[STT] safeStopRecognition exception:", err);
    }
  }

  function cleanupVoice() {
    browserVoiceActiveRef.current = false;
    liveVoiceActiveRef.current = false;
    submittingRef.current = false;
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    safeStopRecognition();
    window.speechSynthesis?.cancel();

    if (micAnalyserCleanupRef.current) {
      micAnalyserCleanupRef.current();
      micAnalyserCleanupRef.current = null;
    }

    microphoneRef.current?.getTracks().forEach((track) => track.stop());
    microphoneRef.current = null;
    if (liveSocketRef.current) {
      try {
        liveSocketRef.current.send(JSON.stringify({ type: "end_session" }));
        liveSocketRef.current.close();
      } catch {}
      liveSocketRef.current = null;
    }
    audioQueueRef.current.forEach((src) => {
      try { src.stop(); } catch {}
    });
    audioQueueRef.current = [];
    try {
      audioContextRef.current?.close();
    } catch {}
    audioContextRef.current = null;
    try {
      inputAudioContextRef.current?.close();
    } catch {}
    inputAudioContextRef.current = null;

    channelRef.current?.close();
    channelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    manuallyMutedRef.current = false;
    assistantSpeakingRef.current = false;
    autoStartVoiceRef.current = false;
    autoStartLiveVoiceRef.current = false;
    autoStartBrowserVoiceRef.current = false;
    transcriptFinalRef.current = "";
    setVoiceStatus("idle");
    setMuted(false);
    setMicLevel(0);
  }

  useEffect(() => {
    if (stage === "interview" && plan) {
      if (autoStartLiveVoiceRef.current) {
        autoStartLiveVoiceRef.current = false;
        void startGeminiLiveInterview();
      } else if (autoStartVoiceRef.current) {
        autoStartVoiceRef.current = false;
        void startVoiceInterview();
      } else if (autoStartBrowserVoiceRef.current) {
        autoStartBrowserVoiceRef.current = false;
        const opening = messages[0]?.content;
        if (opening) {
          startBrowserVoiceInterview(opening);
        }
      }
    }
  }, [stage, plan]);

  async function startBrowserVoiceInterview(textToSpeak: string) {
    cleanupVoice();
    await ensureMicrophoneStream();
    browserVoiceActiveRef.current = true;
    assistantSpeakingRef.current = true;
    setVoiceStatus("speaking");
    speak(textToSpeak, () => {
      assistantSpeakingRef.current = false;
      if (browserVoiceActiveRef.current && !submittingRef.current && !manuallyMutedRef.current) {
        setVoiceStatus("listening");
        safeStartRecognition();
      }
    });
  }

  function startBrowserListening() {
    if (!speechSupported) {
      setTextMode(true);
      setError(`Speech recognition is not supported in this browser. You can type your answers while ${recruiterName} reads questions aloud.`);
      return;
    }
    if (manuallyMutedRef.current || !browserVoiceActiveRef.current) {
      setVoiceStatus("idle");
      return;
    }
    setVoiceStatus("listening");
    safeStartRecognition();
  }

  async function submitBrowserAnswer() {
    if (submittingRef.current) return;
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    const content = (answerRef.current || answer).trim();
    if (!content || !plan || loading) return;

    submittingRef.current = true;
    safeStopRecognition();

    setError("");
    setVoiceStatus("connecting");
    setAnswer("");
    answerRef.current = "";
    transcriptFinalRef.current = "";
    setLoading(true);

    const prior = messages;
    const lastPrior = prior[prior.length - 1];
    const nextTranscript: Message[] =
      lastPrior?.role === "candidate" && lastPrior.content.trim() === content
        ? prior
        : [...prior, { role: "candidate" as const, content }];
    setMessages(nextTranscript);

    try {
      const result = await api.nextTurn(plan, config, nextTranscript, content);
      setMessages((current) => [...current, { role: "interviewer", content: result.interviewer_message }]);
      setComplete(result.is_complete);

      if (result.is_complete) {
        setVoiceStatus("idle");
        browserVoiceActiveRef.current = false;
        speak(result.interviewer_message);
      } else {
        assistantSpeakingRef.current = true;
        setVoiceStatus("speaking");
        speak(result.interviewer_message, () => {
          assistantSpeakingRef.current = false;
          if (browserVoiceActiveRef.current && !submittingRef.current && !manuallyMutedRef.current) {
            setVoiceStatus("listening");
            safeStartRecognition();
          }
        });
      }
    } catch (err) {
      setAnswer(content);
      answerRef.current = content;
      setMessages(prior);
      setError(err instanceof Error ? err.message : "Unable to continue the interview.");
      setVoiceStatus("listening");
      safeStartRecognition();
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  async function startVoiceInterview() {
    if (!plan || voiceStatus === "connecting") return;
    setError("");
    setVoiceStatus("connecting");
    setMessages([]);
    try {
      const microphone =
        microphoneRef.current ??
        (await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        }));
      microphoneRef.current = microphone;
      assistantSpeakingRef.current = true;
      microphone.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      microphone.getAudioTracks().forEach((track) => peer.addTrack(track, microphone));

      const audio = new Audio();
      audio.autoplay = true;
      remoteAudioRef.current = audio;
      peer.ontrack = (event) => {
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void audio.play().catch(() => setError("Your browser blocked audio playback. Click the page and try again."));
      };

      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onopen = () => {
        setVoiceStatus("listening");
        channel.send(
          JSON.stringify({
            type: "response.create",
            response: {
              instructions:
                `Introduce yourself as ${recruiterName}, greet the candidate briefly, and ask the first planned interview question now.`,
            },
          }),
        );
      };
      channel.onmessage = (message) => {
        const event = JSON.parse(message.data) as RealtimeEvent;
        if (event.type === "input_audio_buffer.speech_started") {
          setError("");
          setVoiceStatus("listening");
        }
        if (event.type === "response.created" || event.type === "output_audio_buffer.started") {
          assistantSpeakingRef.current = true;
          microphoneRef.current?.getAudioTracks().forEach((track) => {
            track.enabled = false;
          });
          setVoiceStatus("speaking");
        }
        if (event.type === "output_audio_buffer.stopped") {
          assistantSpeakingRef.current = false;
          microphoneRef.current?.getAudioTracks().forEach((track) => {
            track.enabled = !manuallyMutedRef.current;
          });
          setVoiceStatus("listening");
        }

        if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript?.trim()) {
          setMessages((current) => [...current, { role: "candidate", content: event.transcript!.trim() }]);
        }
        if (
          (event.type === "response.output_audio_transcript.done" ||
            event.type === "response.audio_transcript.done" ||
            event.type === "response.output_text.done") &&
          event.transcript?.trim()
        ) {
          setMessages((current) => [...current, { role: "interviewer", content: event.transcript!.trim() }]);
        }
        if (event.type === "error") {
          console.error("OpenAI Realtime error", event.error ?? event);
          assistantSpeakingRef.current = false;
          microphoneRef.current?.getAudioTracks().forEach((track) => {
            track.enabled = !manuallyMutedRef.current;
          });
          const detail = event.error?.message ?? event.error?.code ?? event.error?.type ?? "Unknown realtime error";
          setError(`${recruiterName} reported a voice-session error: ${detail}`);
        }
      };
      channel.onclose = () => setVoiceStatus((current) => (current === "error" ? current : "idle"));

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new Error("The browser could not create a voice connection offer.");
      const answerSdp = await api.createRealtimeCall(sdp, studyGuide, config, plan);
      await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (err) {
      cleanupVoice();
      setVoiceStatus("error");
      setError(err instanceof Error ? err.message : "Unable to start the voice interview.");
    }
  }


  async function startGeminiLiveInterview() {
    if (!plan || voiceStatus === "connecting") return;
    setError("");
    setVoiceStatus("connecting");
    setMessages([]);
    liveVoiceActiveRef.current = true;

    try {
      const wsUrl = getRealtimeWsUrl();
      const ws = new WebSocket(wsUrl);
      liveSocketRef.current = ws;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx({ sampleRate: 24000 });
      audioContextRef.current = audioCtx;
      nextPlayTimeRef.current = audioCtx.currentTime;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "setup",
            provider: "gemini",
            study_guide: studyGuide,
            config,
            plan,
          }),
        );
      };

      ws.onmessage = async (event: MessageEvent) => {
        if (event.data instanceof Blob) {
          const arrayBuffer = await event.data.arrayBuffer();
          const int16Array = new Int16Array(arrayBuffer);
          const float32Array = new Float32Array(int16Array.length);
          for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
          }
          const audioBuffer = audioCtx.createBuffer(1, float32Array.length, 24000);
          audioBuffer.getChannelData(0).set(float32Array);

          const source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioCtx.destination);

          const startTime = Math.max(audioCtx.currentTime, nextPlayTimeRef.current);
          source.start(startTime);
          nextPlayTimeRef.current = startTime + audioBuffer.duration;
          audioQueueRef.current.push(source);
          assistantSpeakingRef.current = true;
          setVoiceStatus("speaking");
          safeStopRecognition();

          source.onended = () => {
            audioQueueRef.current = audioQueueRef.current.filter((s) => s !== source);
            if (audioQueueRef.current.length === 0 || audioCtx.currentTime >= nextPlayTimeRef.current - 0.05) {
              assistantSpeakingRef.current = false;
              setVoiceStatus("listening");
              if (liveVoiceActiveRef.current && !manuallyMutedRef.current) {
                safeStartRecognition();
              }
            }
          };
        } else if (typeof event.data === "string") {
          const data = JSON.parse(event.data);
          if (data.type === "session_started") {
            setVoiceStatus("listening");
            await startGeminiMicStreaming(ws);
            if (speechSupported && !manuallyMutedRef.current) {
              safeStartRecognition();
            }
          } else if (
            data.type === "transcript_chunk" ||
            data.type === "transcript_final" ||
            data.type === "transcript"
          ) {
            if (data.role === "candidate") {
              setAnswer(data.content);
              answerRef.current = data.content;
            } else if (data.role === "interviewer") {
              if (answerRef.current.trim()) {
                const candText = answerRef.current.trim();
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "candidate" && last.content.trim() === candText) {
                    return prev;
                  }
                  return [...prev, { role: "candidate", content: candText }];
                });
                answerRef.current = "";
                transcriptFinalRef.current = "";
                setAnswer("");
              }

              setMessages((prev) => {
                if (prev.length > 0 && prev[prev.length - 1].role === "interviewer") {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "interviewer", content: data.content };
                  return updated;
                }
                return [...prev, { role: "interviewer", content: data.content }];
              });
            }

            if (data.type === "transcript_final" && data.role === "interviewer") {
              const remainingMs = Math.max(0, (nextPlayTimeRef.current - audioCtx.currentTime) * 1000) + 150;
              window.setTimeout(() => {
                if (liveVoiceActiveRef.current && assistantSpeakingRef.current) {
                  assistantSpeakingRef.current = false;
                  setVoiceStatus("listening");
                  if (!manuallyMutedRef.current) {
                    safeStartRecognition();
                  }
                }
              }, remainingMs);
            }
          } else if (data.type === "session_completed") {
            setComplete(true);
            if (data.transcript && Array.isArray(data.transcript)) {
              setMessages(data.transcript);
            }
          } else if (data.type === "interrupted") {
            audioQueueRef.current.forEach((src) => {
              try {
                src.stop();
              } catch {}
            });
            audioQueueRef.current = [];
            nextPlayTimeRef.current = audioCtx.currentTime;
            assistantSpeakingRef.current = false;
            setVoiceStatus("listening");
            if (liveVoiceActiveRef.current && !manuallyMutedRef.current) {
              safeStartRecognition();
            }
          } else if (data.type === "error") {
            setError(data.message);
            setVoiceStatus("error");
          }
        }
      };

      ws.onerror = () => {
        setError("Gemini Live audio connection error.");
        setVoiceStatus("error");
      };

      ws.onclose = () => {
        setVoiceStatus("idle");
      };
    } catch (err) {
      cleanupVoice();
      setError(err instanceof Error ? err.message : "Failed to connect to Gemini Live Audio.");
      setVoiceStatus("idle");
    }
  }

  async function startGeminiMicStreaming(ws: WebSocket) {
    try {
      const stream = await ensureMicrophoneStream();
      if (!stream) return;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      if (inputCtx.state === "suspended") {
        await inputCtx.resume();
      }
      inputAudioContextRef.current = inputCtx;

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        if (
          ws.readyState !== WebSocket.OPEN ||
          manuallyMutedRef.current ||
          assistantSpeakingRef.current
        ) {
          return;
        }
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        ws.send(pcmData.buffer);
      };

      const silentGain = inputCtx.createGain();
      silentGain.gain.value = 0;
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(inputCtx.destination);
    } catch (err) {
      console.warn("[MicStreaming error]", err);
      setError("Microphone access denied for Gemini Live Audio.");
    }
  }

  function toggleMute() {
    const nextMuted = !muted;
    manuallyMutedRef.current = nextMuted;
    setMuted(nextMuted);

    microphoneRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted && !assistantSpeakingRef.current;
    });

    if (liveVoiceActiveRef.current) {
      if (nextMuted) {
        safeStopRecognition();
      } else if (!assistantSpeakingRef.current) {
        safeStartRecognition();
      }
    }

    if (browserVoiceActiveRef.current) {
      if (nextMuted) {
        if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
        safeStopRecognition();
      } else {
        if (!assistantSpeakingRef.current && !submittingRef.current) {
          safeStartRecognition();
        }
      }
    }
  }

  async function startInterview(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (studyGuide.trim().length < 20) return setError("Select a study guide section or enter at least 20 characters.");
    if (config.role === "Custom Role" && !config.custom_role.trim()) return setError("Enter your custom role.");
    setLoading(true);
    try {
      if (!textMode) {
        await ensureMicrophoneStream();
      }
      const activeProvider = config.provider || provider || "anthropic";
      const result = await api.createPlan(studyGuide, { ...config, provider: activeProvider });
      setPlan(result.plan);
      setProvider(result.provider);
      setMessages([{ role: "interviewer", content: result.opening_message }]);
      setStage("interview");

      if (audioMode === "gemini_live" && result.provider === "gemini") {
        autoStartLiveVoiceRef.current = true;
      } else {
        autoStartBrowserVoiceRef.current = true;
      }
    } catch (err) {
      cleanupVoice();
      setError(
        err instanceof Error
          ? err.message
          : "Unable to start the interview. Check connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitAnswer(event?: FormEvent) {
    event?.preventDefault();
    if (!textMode && browserVoiceActiveRef.current) {
      await submitBrowserAnswer();
      return;
    }

    if (!textMode && liveVoiceActiveRef.current) {
      if (answerRef.current.trim()) {
        const candText = answerRef.current.trim();
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "candidate" && last.content.trim() === candText) {
            return prev;
          }
          return [...prev, { role: "candidate", content: candText }];
        });
        answerRef.current = "";
        transcriptFinalRef.current = "";
        setAnswer("");
      }
      return;
    }

    const content = answer.trim();
    if (!content || !plan || loading) return;
    setError("");
    setAnswer("");
    transcriptFinalRef.current = "";
    setLoading(true);
    const prior = messages;
    const lastPrior = prior[prior.length - 1];
    const nextTranscript: Message[] =
      lastPrior?.role === "candidate" && lastPrior.content.trim() === content
        ? prior
        : [...prior, { role: "candidate" as const, content }];
    setMessages(nextTranscript);
    try {
      const result = await api.nextTurn(plan, config, nextTranscript, content);
      setMessages((current) => [...current, { role: "interviewer", content: result.interviewer_message }]);
      setComplete(result.is_complete);
      if (autoSpeak) speak(result.interviewer_message);
    } catch (err) {
      setAnswer(content);
      setMessages(prior);
      setError(err instanceof Error ? err.message : "Unable to continue.");
    } finally {
      setLoading(false);
    }
  }

  async function endInterview() {
    let currentMessages = messages;
    const pending = (answerRef.current || answer).trim();
    if (pending) {
      const lastMsg = currentMessages[currentMessages.length - 1];
      if (!lastMsg || lastMsg.role !== "candidate" || lastMsg.content.trim() !== pending) {
        currentMessages = [...currentMessages, { role: "candidate", content: pending }];
        setMessages(currentMessages);
      }
      answerRef.current = "";
      transcriptFinalRef.current = "";
      setAnswer("");
    }

    if (!plan || currentMessages.every((m) => m.role !== "candidate"))
      return setError("Answer at least one question before ending the interview.");
    setError("");
    setLoading(true);
    setIsEvaluating(true);
    window.speechSynthesis?.cancel();
    cleanupVoice();
    try {
      const result = await api.evaluate(studyGuide, config, plan, currentMessages);
      setEvaluation(result.evaluation);
      setProvider(result.provider);
      setStage("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create feedback.");
    } finally {
      setLoading(false);
      setIsEvaluating(false);
    }
  }

  function reset() {
    window.speechSynthesis?.cancel();
    setStage("setup");
    setPlan(null);
    setMessages([]);
    setEvaluation(null);
    setComplete(false);
    setError("");
    setAnswer("");
    setTextMode(false);
    setIsEvaluating(false);
    cleanupVoice();
  }

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col bg-[#060A14] text-slate-200 font-sans">
      <Topbar provider={provider} stage={stage} onReset={reset} />

      <main className="w-full max-w-[1440px] mx-auto px-4 md:px-8 py-3 flex-1 min-h-0 flex flex-col overflow-hidden">
        {isEvaluating && <EvaluatingOverlay />}

        {stage === "setup" && (
          <Setup
            config={config}
            updateConfig={updateConfig}
            guideSections={guideSections}
            selectedSection={selectedSection}
            setSelectedSection={setSelectedSection}
            studyGuide={studyGuide}
            setStudyGuide={setStudyGuide}
            guideLoading={guideLoading}
            provider={provider}
            setProvider={setProvider}
            availableEngines={availableEngines}
            audioMode={audioMode}
            setAudioMode={setAudioMode}
            autoSpeak={autoSpeak}
            setAutoSpeak={setAutoSpeak}
            loading={loading}
            error={error}
            recruiterName={recruiterName}
            startInterview={startInterview}
          />
        )}

        {stage === "interview" && plan && (
          <InterviewStage
            plan={plan}
            config={config}
            provider={provider}
            messages={messages}
            answer={answer}
            setAnswer={setAnswer}
            voiceStatus={voiceStatus}
            muted={muted}
            textMode={textMode}
            setTextMode={setTextMode}
            loading={loading}
            isEvaluating={isEvaluating}
            complete={complete}
            studyGuideLength={studyGuide.length}
            error={error}
            recruiterName={recruiterName}
            micLevel={micLevel}
            onSpeak={speak}
            onSkipSpeech={() => {
              window.speechSynthesis?.cancel();
              assistantSpeakingRef.current = false;
              setVoiceStatus("listening");
              safeStartRecognition();
            }}
            onToggleMute={toggleMute}
            onSubmitAnswer={submitAnswer}
            onEndInterview={endInterview}
          />
        )}

        {stage === "results" && evaluation && (
          <Debrief
            evaluation={evaluation}
            provider={provider}
            onReset={reset}
          />
        )}
      </main>

      <footer className="text-center text-[11px] text-slate-500 py-2 border-t border-blue-500/10 shrink-0">
        Interviewer AI · Grounded in study_guide.md
      </footer>
    </div>
  );
}
