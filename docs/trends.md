# Topic trends — what’s worth tracking

Lev Selector’s **weekly AI Updates** follow a consistent shape: a fast news roundup — model releases, tooling, benchmarks, industry moves — with YouTube chapters mirroring slide sections. Trends should reflect **that weekly news format**, not generic ML course topics.

## What makes a useful trend here

A good trend answers one of:

1. **What’s getting airtime?** — How often did “agents” or “Claude” appear as a chapter this month?
2. **Who’s winning the narrative?** — Anthropic vs OpenAI vs Google vs open-weight China labs week over week.
3. **What’s rising or fading?** — RAG quiet for months then spikes; coding assistants plateau; new meme (OpenClaw, MCP).
4. **What did Lev cover when?** — First mention of a model/tool, with a link to that exact week.

Trends should be measured at **chapter level** (YouTube section titles), not whole-deck tags. Slide 1 is always a dense agenda listing everything — tagging the full deck marks almost every topic every week (useless).

## Curated trend lenses (weekly AI Updates)

| Lens | Why it matters for Lev’s audience |
|------|-----------------------------------|
| **Agents & orchestration** | Dominant 2025–26 theme: tool use, MCP, OpenClaw, multi-agent |
| **Coding assistants** | Claude Code, Cursor, Copilot, vibe coding — builder workflow shift |
| **Claude / Anthropic** | Lev tracks Sonnet, Opus, Fable releases closely |
| **OpenAI / GPT** | ChatGPT, Codex, enterprise agent moves |
| **Google / Gemini** | Search AI mode, Flash models, Notebook |
| **Open models & China** | Qwen, DeepSeek, Kimi, Mistral — open-weight race |
| **Benchmarks & leaderboards** | LM Arena, “cost per intelligence” — how Lev frames model quality |
| **RAG & memory** | Retrieval, embeddings, context — enterprise adoption arc |
| **Multimodal & media** | Image/video/voice generation waves |
| **Infrastructure** | Nvidia, Ollama, inference, chips — cost & deployment |
| **Jobs & labor market** | Recurring “Jobs & Layoffs” segment — industry health |
| **Safety & security** | Hacks, alignment, guardrails — risk framing |

## What we compute

### Layer 1 — Raw (weak alone)
- Chapter keyword counts per topic
- Most topics appear every week → misleading

### Layer 2 — Relative insights (use these)
| Insight | What it reveals |
|---------|-----------------|
| **Share of voice** | % of a week's chapters tagged to each theme — Claude 16% vs 7% matters more than "mentioned yes/no" |
| **Lab race** | Which lab (Anthropic, OpenAI, Google, open-weight) led each week's narrative |
| **Share momentum** | Recent-half vs prior-half change in share (percentage points) |
| **Weekly novelty** | Chapter titles not seen in the prior 8 weeks — what's actually new |
| **Entity tracker** | Named products (Fable, OpenClaw, Qwen…) — first seen, weeks active |
| **Burst weeks** | Topic share ≥1.8× its 8-week rolling baseline |
| **Auto briefs** | Generated summary per week from share + novelty |

### Layer 3 — Future (vision)
- LLM-extracted claims with sentiment/framing shifts
- Transcript-based novelty

## Not included (yet)

- LLM-extracted “claims” (vision doc) — keyword chapters only for v1
- Transcript-based trends — descriptions/chapters only
- Sentiment or hype scoring
