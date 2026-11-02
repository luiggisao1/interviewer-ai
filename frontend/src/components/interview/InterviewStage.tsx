import React, { FormEvent, useState } from "react";
import type { InterviewConfig, Message, Plan } from "../../types";
import { QuestionHeroTile } from "./QuestionHeroTile";
import { InterviewerAudioTile } from "./InterviewerAudioTile";
import { ConceptChecklistTile } from "./ConceptChecklistTile";
import { StudyGroundingTile } from "./StudyGroundingTile";
import { SessionControlsTile } from "./SessionControlsTile";
import { TranscriptDrawer } from "./TranscriptDrawer";

interface InterviewStageProps {
  plan: Plan;
  config: InterviewConfig;
  provider: string;
  messages: Message[];
  answer: string;
  setAnswer: (val: string) => void;
  voiceStatus: "idle" | "connecting" | "listening" | "speaking" | "error";
  muted: boolean;
  textMode: boolean;
  setTextMode: (val: boolean) => void;
  loading: boolean;
  isEvaluating: boolean;
  complete: boolean;
  studyGuideLength: number;
  error: string;
  recruiterName?: string;
  micLevel?: number;
  onSpeak: (text: string) => void;
  onSkipSpeech: () => void;
  onToggleMute: () => void;
  onSubmitAnswer: (e?: FormEvent) => void;
  onEndInterview: () => void;
}

export const InterviewStage: React.FC<InterviewStageProps> = ({
  plan,
  config,
  provider,
  messages,
  answer,
  setAnswer,
  voiceStatus,
  muted,
  textMode,
  setTextMode,
  loading,
  isEvaluating,
  complete,
  studyGuideLength,
  error,
  recruiterName = "Iris",
  micLevel = 0,
  onSpeak,
  onSkipSpeech,
  onToggleMute,
  onSubmitAnswer,
  onEndInterview,
}) => {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const hasCandidateAnswers = messages.some((m) => m.role === "candidate");

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div className="bg-red-500/15 border border-red-500/35 text-red-200 px-4 py-3 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      {complete && (
        <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-5 py-3.5 rounded-2xl flex items-center justify-between gap-4 text-sm font-semibold">
          <span>✓ Session turns complete — ready for final evaluation debrief.</span>
          <button
            type="button"
            onClick={onEndInterview}
            disabled={loading || isEvaluating}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-full cursor-pointer shadow-lg shadow-emerald-500/30 transition-all disabled:opacity-60"
          >
            {isEvaluating ? "Synthesizing…" : "View Evaluation Scorecard →"}
          </button>
        </div>
      )}

      {/* 5-Tile Interview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
        {/* Tile 1: Hero Active Question & Speech Buffer (8 Cols) */}
        <QuestionHeroTile
          plan={plan}
          messages={messages}
          answer={answer}
          setAnswer={setAnswer}
          voiceStatus={voiceStatus}
          muted={muted}
          textMode={textMode}
          loading={loading}
          complete={complete}
          recruiterName={recruiterName}
          micLevel={micLevel}
          onSpeakText={onSpeak}
          onSubmitAnswer={onSubmitAnswer}
        />

        {/* Tile 2: Connie AI Persona & Dynamic Audio Equalizer (4 Cols) */}
        <InterviewerAudioTile
          voiceStatus={voiceStatus}
          muted={muted}
          recruiterName={recruiterName}
          onSkipSpeech={onSkipSpeech}
          onToggleMute={onToggleMute}
        />

        {/* Tile 3: Real-Time Concept Detection Checklist (4 Cols) */}
        <ConceptChecklistTile
          plan={plan}
          messages={messages}
          currentAnswer={answer}
        />

        {/* Tile 4: Study Guide Telemetry & Progress (4 Cols) */}
        <StudyGroundingTile
          plan={plan}
          config={config}
          provider={provider}
          messages={messages}
          studyGuideLength={studyGuideLength}
        />

        {/* Tile 5: Turn Actions & Session Controls (4 Cols) */}
        <SessionControlsTile
          textMode={textMode}
          setTextMode={setTextMode}
          voiceStatus={voiceStatus}
          muted={muted}
          onToggleMute={onToggleMute}
          onSubmitAnswer={() => onSubmitAnswer()}
          onEndInterview={onEndInterview}
          onToggleTranscript={() => setTranscriptOpen(true)}
          hasCandidateAnswers={hasCandidateAnswers}
          answerLength={answer.trim().length}
          loading={loading}
          isEvaluating={isEvaluating}
          complete={complete}
        />
      </div>

      {/* Chronological Transcript Drawer */}
      <TranscriptDrawer
        isOpen={transcriptOpen}
        onClose={() => setTranscriptOpen(false)}
        messages={messages}
        recruiterName={recruiterName}
        onSpeak={onSpeak}
      />
    </div>
  );
};
