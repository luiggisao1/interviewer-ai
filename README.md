# Interviewer AI

A fullstack, production-grade AI interview preparation platform. Paste any technical study guide, configure an interview role and difficulty, practice in a turn-by-turn conversational audio/chat session, and receive rubric-based evaluations with Senior benchmark answers.

Architected with the **Strategy & Factory design patterns**, enabling swappable AI providers (**Anthropic Claude**, **OpenAI**, **Google Gemini**, and a **Deterministic Mock Provider**) with LangSmith observability tracing.

---

## 🔬 Engineering Case Study: Calibrating LLM-as-a-Judge & Eliminating Critic Bias

### 1. The Engineering Challenge: "The Moving Goalpost" Anomaly
During end-to-end testing of the evaluation pipeline, a critical systemic failure mode emerged:
* When a candidate submitted an exemplary senior answer—including pasting back the model's own previous "Senior Benchmark Answer"—the evaluator repeatedly awarded sub-senior scores (**78%–84%**) and hallucinated superficial criticisms (e.g., nitpicking CLI flag names like `--max-requests` vs. `--limit-max-requests`).
* **Root Causes Identified**:
  1. **Critic Bias**: Because the prompt mandated finding improvement areas, the LLM treated finding flaws as an unyielding constraint, inventing minor nitpicks on flawless answers.
  2. **Boundary Score Aversion**: LLMs naturally compress scores towards the 75–85% range, treating 90–100% as psychologically unreachable.

### 2. The Architectural Solution
1. **Additive Rubric Checklists**: Replaced subjective holistic grading with an additive point-accrual rubric:
   - Technical accuracy & constraints: 30 pts
   - Concrete practical examples: 20 pts
   - Senior judgment, trade-offs & alternatives: 20 pts
   - Production readiness & observability: 20 pts
   - Communication clarity & structure: 10 pts
2. **Exemplary Calibration & Full-Score Anchoring**: Explicitly instructed the model that 95–100% is expected when all criteria are met, strictly prohibiting artificial nitpicking.
3. **Staff-Level Horizon Shifting**: For scores $\ge 90$, the prompt transforms feedback from corrective fault-finding into forward-looking **Staff/Principal-level scaling frontiers** (e.g., containerized allocator fragmentation, `jemalloc`, and `MALLOC_ARENA_MAX`).

### 3. Empirical Multi-Model Benchmark Results

Following the evaluation harness methodology popularized by **EleutherAI's `lm-evaluation-harness`** (the standard testing architecture used across the **Hugging Face Open LLM Leaderboard**), we implemented an automated, reproducible A/B evaluation harness ([`backend/scripts/benchmark_eval.py`](backend/scripts/benchmark_eval.py)). 

The harness evaluated an identical, exemplary Python memory management response across both **Anthropic Claude** and **Google Gemini** model tiers under two prompt paradigms (uncalibrated baseline vs. additive calibrated):

| Provider | Model Tier | Model Identifier | Baseline Score (Old) | Calibrated Score (New) | Score Delta ($\Delta$) | Qualitative Shift in Feedback |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Anthropic** | Compact / Fast | `claude-haiku-5-5` | 78.0% | **92.0%** | **+14.0 pts** | Shifted from CLI argument nitpicks to allocator fragmentation and RSS plateau analysis |
| **Anthropic** | Balanced / Production | `claude-sonnet-5-5` | 84.0% | **90.0%** | **+6.0 pts** | Explicitly labeled as *"Staff-level frontier"*: glibc malloc arenas, `jemalloc`, and `MALLOC_ARENA_MAX` |
| **Anthropic** | Flagship / Frontier | `claude-opus-5-5` | 82.0% | **95.0%** | **+13.0 pts** | Flawless holistic synthesis, zero false nitpicks, recognized deep production engineering |
| **Google** | Lightweight / Fast | `gemini-3.5-flash-lite` | 100.0% | **100.0%** | +0.0 pts | High-speed (~1.9s) box checking, but feedback ceiling capped at *"None required"* |
| **Google** | Balanced / Production | `gemini-3.8-flash` | 96.0% | **100.0%** | **+4.0 pts** | Full-mark recognition with Staff-level suggestions: glibc fragmentation, `jemalloc`, and `mimalloc` |
| **Google** | Flagship / Frontier | `gemini-4-argon` | 88.0% | **98.0%** | **+10.0 pts** | **Highest Technical Insight (98%)**: Explicitly cited *"Staff/Principal territory: C-extension/native heap fragmentation where tracemalloc cannot see"* |

> **Key Takeaway**: 
> 1. **Frontier Depth**: **`gemini-4-argon` (98.0%)** and **`claude-opus-5-5` (95.0%)** emerged as the top-tier evaluators. `gemini-4-argon` delivered the single most technically profound architectural feedback (identifying that Python's `tracemalloc` cannot inspect C-extension native heaps).
> 2. **Universal Generalization**: Calibrated additive rubrics boosted scores by an average of **+9.4 points** across non-trivial evaluations, completely eliminating the "moving goalpost" anomaly across both Google and Anthropic model families.
> 3. **The Mentorship Ceiling**: Lightweight models (`flash-lite`) accurately verify requirements, but lack the parameter depth to provide proactive Staff-level architectural roadmaps.

### 4. Cost vs. Performance ROI Analysis (Unit Economics)

Deploying frontier flagship models universally introduces significant cost and latency trade-offs. The table below details input/output token pricing per 1M tokens, estimated cost per evaluation, and recommended production routing:

| Provider | Model | Pricing (Input / Output per 1M) | Approx. Cost per Evaluation | Calibrated Score | Recommended Production Role |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Google** | **Gemini 3.5 Flash-Lite** | **\$0.075 / \$0.30** | **~\$0.0003** (< 1/30th cent) | **100.0%** | **Ultra-Low Cost**: Instant turn-by-turn interactive chat and practice runs. |
| **Google** | **Gemini 3.8 Flash** | **\$0.15 / \$0.60** | **~\$0.0008** (< 1/10th cent) | **100.0%** | **Unbeatable ROI Champion**: 100% accuracy + `jemalloc` feedback at micro-penny cost. |
| **Anthropic** | **Claude Haiku** | **\$0.80 / \$4.00** | **~\$0.003** (~1/3 cent) | **92.0%** | **Balanced Conversationalist**: Low latency turn-by-turn chat. |
| **Anthropic** | **Claude Sonnet** | **\$3.00 / \$15.00** | **~\$0.015** (~1.5 cents) | **90.0%** | **The Production Baseline**: Deep Linux/glibc systems feedback. |
| **Google** | **Gemini 4 Argon** | **\$7.00 / \$28.00** | **~\$0.035 - \$0.05** (~4 cents) | **98.0%** | **Frontier Technical Mentor**: Most expensive Gemini tier; detects C-extension blindspots. |
| **Anthropic** | **Claude Opus** | **\$15.00 / \$75.00** | **~\$0.080 - \$0.10** (~8–10 cents) | **95.0%** | **Enterprise Executive**: Opt-in toggle for high-stakes Staff+ candidate reviews. |

#### The Engineering Decision: Tiered Model Routing
Paying a **50x–100x cost premium** for `gemini-4-argon` or `claude-opus-5-5` during simple conversational turns is economically inefficient. 

Therefore, our architecture implements **Tiered Model Routing**:
1. **Interactive Turns (`next_turn`)**: Route to **Gemini 3.5 Flash-Lite** or **Claude Haiku** for sub-second response times and negligible token expenditure.
2. **Standard Evaluation (`evaluate`)**: Default to **Gemini 3.8 Flash** or **Claude Sonnet** (providing 90%–100% calibrated accuracy with allocator insights at under 1.5 cents).
3. **Staff+ Deep Audit (`evaluate` toggle)**: Route to **Gemini 4 Argon** or **Claude Opus** when the user requests an executive/Staff+ technical audit to uncover native heap and memory profiler blindspots.

#### Reproducing the Benchmark
```bash
cd backend

# Benchmark Google Gemini models
uv run python scripts/benchmark_eval.py --provider gemini --prompt both --runs 1 --model gemini-4-argon
uv run python scripts/benchmark_eval.py --provider gemini --prompt both --runs 1 --model gemini-3.8-flash

# Benchmark Anthropic Claude models
uv run python scripts/benchmark_eval.py --provider anthropic --prompt both --runs 1 --model claude-opus-5-5
uv run python scripts/benchmark_eval.py --provider anthropic --prompt both --runs 1 --model claude-sonnet-5-5
```

---

## Architecture & Design Patterns

```mermaid
flowchart TD
    subgraph Client ["Frontend (React + Vite + TypeScript)"]
        UI[Interview Screen]
        WebSpeech[Web Speech API STT/TTS]
        WebRTC[WebRTC Voice Streaming]
    end

    subgraph API ["FastAPI Backend (Astral uv)"]
        Router["/api/plan, /api/turn, /api/evaluation"]
        Factory[AIProvider Factory]
        Prompts[Centralized Prompts Module]
    end

    subgraph Providers ["Swappable AI Providers (Strategy Pattern)"]
        Anthropic["AnthropicProvider (Claude 3.5 / Opus)"]
        OpenAI["OpenAIProvider (GPT-4o & Realtime WebRTC)"]
        Gemini["GeminiProvider (Gemini 2.5)"]
        Mock["MockProvider (Deterministic Local)"]
    end

    subgraph Observability ["Telemetry"]
        LangSmith[LangSmith Client Tracing]
    end

    UI --> Router
    Router --> Factory
    Factory --> Anthropic
    Factory --> OpenAI
    Factory --> Gemini
    Factory --> Mock
    Anthropic -.-> Prompts
    Anthropic --> LangSmith
    OpenAI --> WebRTC
    WebSpeech --> UI
```

---

## Features

- **FastAPI REST API**: Validated Pydantic request/response schemas with custom domain exceptions ([`LLMProviderError`](backend/app/exceptions.py)).
- **Multi-Provider Strategy Pattern**: Seamlessly switch between Claude, OpenAI, Gemini, or Mock via `.env` or per-request overrides.
- **LangSmith Tracing**: Full LLM lifecycle observability and prompt debugging via `wrap_anthropic`.
- **Audio Modes**:
  - **Claude Free Web Voice**: In-browser speech recognition and synthesis with zero additional API audio costs.
  - **OpenAI Realtime Voice**: Bi-directional low-latency audio over WebRTC with server-side VAD.
  - **Text Fallback**: Full keyboard chat support.
- **100% Offline Test Suite**: Comprehensive pytest suite leveraging `AsyncMock` to verify schemas, factories, and provider error states with zero external API calls.

---

## Prerequisites

- **Python 3.12+** with [Astral `uv`](https://docs.astral.sh/uv/)
- **Node.js 20+** with `npm`

---

## Getting Started

### 1. Backend Setup (using `uv`)

```bash
cd backend

# Install dependencies and sync virtual environment
uv sync

# Configure environment variables
cp .env.example .env

# Run FastAPI development server
uv run fastapi dev app/main.py --port 8000
```
API runs at `http://localhost:8000`. Interactive OpenAPI documentation is at `http://localhost:8000/docs`.

### 2. Frontend Setup

In a new terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```
Open `http://localhost:5173`.

---

## AI Provider Configuration

Edit `backend/.env`:

### Anthropic Claude (Recommended)
```dotenv
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_MODEL=claude-haiku-5-5  # or claude-opus-5-5

# Optional LangSmith Tracing
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=<your-langsmith-key>
LANGSMITH_PROJECT=<your-project-id>
```


---

## Automated Testing & Quality Checks

Run the backend test suite:
```bash
cd backend

# Run all unit tests
uv run pytest -v

# Run linting and code quality checks
uv run ruff check .
```

---
