# Implementation Plan: AI Calendar Assistant (ScheduleAI)

This plan outlines the architecture, development phases, and technical details for **ScheduleAI**, a proactive routine and productivity assistant integrated with Google Calendar, Maps, Gmail, and Drive. ScheduleAI manages routines through three active layers (**Plan**, **Track**, and **Recover**) organized across **6 Core Engines**.

---

## 1. Architectural Overview and the 6 Engines

For maximum modularity, testability, and architectural cleanliness, ScheduleAI is split into six independent engines that interact through a Central Orchestrator:

```
+---------------------------------------------------------------------------------+
|                                 SCHEDULEAI CORE                                 |
+---------------------------------------------------------------------------------+
| CONVERSATION ENGINE  |   CALENDAR ENGINE   |  EXECUTION ENGINE   | SECURITY ENG.|
| (Parsing / Voice/CN) | (OAuth / Calendars) |  (Tasks / Focus)    | (Permissions)|
+----------------------+---------------------+---------------------+--------------+
|                         CONTEXT ENGINE     |   MEMORY ENGINE                    |
|                         (Maps / Geoloc/Mail)| (Preferences / Learning)          |
+---------------------------------------------------------------------------------+
```

### A. Conversation Engine
Processes and interprets conversational text and voice commands while maintaining continuity.
*   **Semantic Parsing**: Converts natural language into structured JSON intents.
*   **Dialogue Continuity**: Maintains recent conversational context. If the user says *"Move it to Thursday"*, the engine understands it refers to the task mentioned in the previous bubble.
*   **Voice Errors Protection**: For critical commands issued via audio, the system repeats key data for confirmation: *"Understood: cancel Tuesday 2 PM doctor visit. Confirm? [Yes] [Adjust]"*.
*   **Communication Personalities**: Customizable style options (Direct, Gentle, Motivator, Firm, Professional, Minimalist).

### B. Calendar Engine
Manages schedules, physical availability, and slot allocation rules.
*   **Multi-Calendar Synchronization**: Integrates work, personal, family, and project calendars, allowing custom read/write permissions and context privacy (masking).
*   **Default Duration Recommendations**: If creating an event with no duration (e.g. "appointment tomorrow at 3 PM"), suggests a time block based on history: *"Similar visits occupy 1h30 including travel. Reserve that slot?"*.

### C. Execution Engine
Controls tasks, habits tracker, guided focus sessions, and daily start/end rituals.
*   **Advanced Task Metadata**: Fields for priority, estimated duration, blockers (dependencies), physical contexts, and cognitive energy levels.
*   **"Start the Day" Mode**: Morning summary showing key priorities, first meeting, departure time, and a quick task to clear before leaving.
*   **"End the Day" Mode**: Evening ritual to check off completed tasks, clean expired items, plan tomorrow, and toggle silent hours.
*   **Habit Tracker**: Monitors habits focusing on consistency, not punishment (*"You missed walking yesterday. Fits today at 6 PM or Saturday at 10 AM?"*).
*   **Pause State Resume**: Logs where the user paused a long task to prevent attention drift: *"Atlas Contract Review paused at Section 4. Next: check termination terms."* (ideal for ADHD).

### D. Context Engine
Integrates geolocational coordinates, traffic conditions, weather feeds, and email/document attachments.
*   **Commute Departure Equation**:
    $$\text{Departure Time} = \text{Event Start} - \text{Commute Duration (Maps)} - \text{Safety Buffer} - \text{Parking} - \text{Walking}$$
*   **Automatic Margins Locking**: Protects blank spaces between calls (food, restroom, mental rest) as unavailable without cluttering the main Google Calendar.
*   **Conditional Planning**: Events bound to conditions (walk if it doesn't rain, grocery shopping if nearby, calls during business hours).
*   **Opportunity Detection**: Leverages schedule openings: *"Meeting ended 30m early. You have time to pay the utility bill task before the next call."*
*   **Quick Context Registrations**: Short speech/text triggers (*"I arrived"*, *"Stuck in traffic"*, *"Meeting finished"*) to adjust daily math.
*   **Itineraries Support**: Multi-stage countdown templates (7 days before: verify documents; 1 day before: luggage check; 2 hours before: depart).

### E. Memory Engine
Learns user routines and preferences without making silent, unauthorized shifts.
*   **Smart Onboarding**: Gathers data (sleep hours, transport mode, safety margin) gradually during conversation prompts in the first week.
*   **Learning Mode (Observer Mode)**: Monitors actual preparation times, departures, and delays during the initial weeks to suggest adjustments: *"You depart 10m later than suggested. Increase default buffer by 10m? [Confirm] [Keep]"*.
*   **Adaptive Routines**: Dynamically reschedules lost goals (e.g. gym) during free windows if the weekly schedule changes.
*   **Routine Shifts Tracker**: Proposes rules updates when habits change: *"Over the last 3 weeks you started work later. Update work hours settings?"*.

### F. Security Engine
Enforces data privacy, masks text for external APIs, and manages transaction logs.
*   **Context Privacy**: Masks sensitive text before sending payload to external LLMs. Sends only generic indicators (e.g., *"private medical event at 2 PM"*), keeping details local.
*   **Action-Level Permissions**: Behaviors scoped by channel (e.g., Telegram can only create tasks, Webapp can alter client meetings).
*   **Daily Plan Versions**: Backs up daily schedule states, enabling users to compare or rollback versions.
*   **Audit History & Undo**: Audit logs for all changes made by the AI, with one-click undo rollbacks.

---

## 2. Development Roadmap and Validation

Development will progress across 6 sequential phases, verified at each step by `validate_phases.js`.

```
Phase 1 (MVP) -> Phase 2 (Plan) -> Phase 3 (Track) -> Phase 4 (Recover) -> Phase 5 (Telegram/Voice) -> Phase 6 (Security/Demo)
```

### Phase 1: MVP - Calendar Base [COMPLETED]
*   Express server, React frontend layout.
*   Travel commute service, scheduler alerts (1h/15m).
*   Google OAuth, mock events store.
*   Gemini tool calling, WebSockets integrations.

### Phase 2: Planning Layer (Plan) [Awaiting Start Authorization]
*   **Local Tasks Store**: Establish tasks schema (estimatedDuration, energy, blockers, contexts).
*   **Time Budgeting & Feasibility Gauges**: Daily occupied time sum, feasibility score, overload warning checks.
*   **Marginal Gaps & Hidden Time**: Automatic get-ready, transit, and rest buffers locking.
*   **Intent-Based & Reverse Planning**: Weekly goals generator and reverse deadline scheduler.
*   **Start & End Day Rituals**: Workflows to structure morning and evening schedules (version backups).
*   **UI Updates**: Render feasibility score gauge, warnings, task checklist, and detailed timeline.

### Phase 3: Tracking Layer (Track)
*   **Real vs. Planned State Machine**: State tracking (`planned`, `started`, `paused`, `completed`).
*   **Check-ins & State Resume**: Timers for active prompts and logging of task pause sections.
*   **Continuity & Dialogue Context**: Conversation context references and tone configurations.
*   **Wait & Delegation Tracker**: Database support for delegated tasks and external follow-ups.

### Phase 4: Recovery Layer (Recover)
*   **Low Energy & Interruption Routines**: Deterministic algorithms to reschedule flexible tasks and lock schedules.
*   **Conditional Planning & Opportunity Sweep**: Weather and nearby pharmacy geographic triggers.
*   **Memory Collector (Observer)**: Onboarding questionnaire collector and learning mode observer.

### Phase 5: Telegram Bot Channel & Voice
*   **Telegram Webhooks listener**: Inline button keyboards.
*   **Voice Transcription & Confirmations**: Audio commands transcription and voice error protections.
*   **Location Sharing**: Direct coordinates ingestion for live route updates.

### Phase 6: Security, Privacy & Demo Sandbox
*   **Context Privacy masking**: Anonymize details before LLM calls.
*   **Behavioral Permissions**: Fine-grained permissions per channel.
*   **Health Dashboard & Audit Logs**: Integrations statuses page and system undo rollbacks.
*   **Demo Mode Sandbox & Marketplace of routines**.

---

## 3. Product Success Metric (Primary Metric)
We measure product value not by the number of tasks checked off, but by:
1. **Punctuality**: Reduction in arrival delays.
2. **Overload Prevention**: Fewer days falling below a 50% feasibility score.
3. **Calibrated Estimation**: Closing the gap between estimated and actual prep/travel times.
4. **Resiliency**: Time taken to accept a recovery plan during disruptions.
