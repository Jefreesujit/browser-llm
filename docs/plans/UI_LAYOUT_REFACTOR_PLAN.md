# Outer Navigation + Unified Settings Plan

## Summary
Add a global app shell around the existing central card: a desktop left nav, a lightweight top app bar, and a mobile bottom nav. The current chat/audio card layouts remain the main product surface, including the in-card chat history split. The outer chrome handles workspace switching and app-level actions only.

Locked decisions:
- Chat history stays inside the card.
- Desktop left nav has `Chat`, `Voice`, `Settings`, and `GitHub`.
- Mobile bottom nav has `Chat`, `Voice`, and `Settings`.
- `Manage Data` is removed as a separate nav action and folded into `Settings`.
- `Settings` becomes a unified surface with three sections: generation/app settings, storage/data, and model cache.
- Desktop `Settings` stays dialog-based; mobile `Settings` becomes a dedicated full-screen page.
- Clicking `Voice` restores the last-used voice/audio section after first use.
- Model switchers remain inside the card, not in the outer nav or app bar.

## Key Changes
### App shell and navigation
- Introduce a new shell around the card:
  - desktop left rail outside the card
  - top app bar above the content region
  - centered card area that preserves the current card footprint
- Desktop left rail:
  - top brand block with logo + title
  - workspace actions: `Chat`, `Voice`
  - utility actions: `Settings`, `GitHub`
  - no profile/auth UI
- Top app bar:
  - workspace/context title only
  - no settings button
  - no model controls
- Mobile:
  - replace the left rail with a 3-item bottom nav: `Chat`, `Voice`, `Settings`
  - `Settings` opens a full-screen settings page
  - `GitHub` moves into the settings page as an external action/footer item

### Workspace behavior
- Keep chat behavior as-is:
  - no active thread => chat landing card
  - active thread => split chat card with history on the left and messages on the right
- Keep audio/voice as one workspace with three internal sections:
  - `overview`
  - `transcribe`
  - `speak`
- Voice entry behavior:
  - first visit opens `overview`
  - later visits restore the last-used voice section
- Preserve current guards:
  - do not allow workspace switches during chat generation
  - do not allow workspace switches during recording or running voice tasks

### Card refactor
- Keep the existing card content and split layouts visually intact.
- Remove only duplicated global chrome from inside the card:
  - workspace mode tabs
  - global settings button
  - app-level title/branding in card headers
- Keep in-card controls that are content-specific:
  - chat model switcher/status
  - audio task tabs
  - audio model switcher/status
  - chat history rail
- Landing screens remain, but become card content only rather than owning app-level navigation.

### Unified settings surface
- Replace the current concept of separate app-level `Settings` and `Manage Data` entry points with a single `Settings` surface.
- Keep the existing logic, but present it as one unified settings experience with three sections:
  - `Generation`
  - `Storage & Data`
  - `Model Cache`
- Desktop presentation:
  - one dialog containing all three sections in a single surface
- Mobile presentation:
  - one full-screen settings page with the same three sections
- Remove the separate `Manage Data` dialog/page from the plan.
- Keep destructive data/model actions in the unified settings surface.

## State and Interface Changes
- Replace the coarse screen/mode split with explicit workspace and voice-view state:
  - `Workspace = "chat" | "audio"` internally, even if the UI label says `Voice`
  - `AudioView = "overview" | "transcribe" | "speak"`
- Persist `lastAudioView` instead of only `lastAudioTab`.
- Keep chat view derived from thread state instead of adding a separate chat-view enum unless implementation needs one.
- Replace settings entry state with a single app-level settings surface:
  - desktop dialog open/close state
  - mobile settings route/view state
- Refactor settings UI composition so the existing generation/data/model controls can render in:
  - desktop unified dialog
  - mobile full-screen settings page

## Test Plan
- Navigation shell:
  - desktop renders left rail + top app bar + unchanged centered card
  - mobile renders bottom nav with `Chat`, `Voice`, `Settings`
- Chat workspace:
  - chat history remains inside the card
  - switching to voice and back preserves active thread, draft, and scroll state
  - chat model switcher still works from inside the card
- Voice workspace:
  - first entry opens `overview`
  - returning to voice restores the last-used section
  - `overview` still leads into `transcribe` and `speak`
  - in-card task tabs and model controls continue to work
- Settings:
  - desktop opens one unified settings dialog with all three sections visible
  - mobile opens one full-screen settings page with the same sections
  - storage cleanup and model-cache actions still work from the unified settings surface
- Guard behavior:
  - workspace switch is blocked during chat generation
  - workspace switch is blocked during recording or running voice tasks
- Regression checks:
  - model picker remains workspace-aware
  - chat model changes still trigger the current new-thread confirmation when required
  - card width, split layout, and glass styling remain visually stable after the shell is added

## Assumptions and Defaults
- UI label uses `Voice`; internal code can continue using `audio` naming to minimize churn.
- The top app bar is intentionally minimal and informational.
- `GitHub` stays visible on desktop nav and moves into the mobile settings page rather than getting its own mobile nav slot.
- The unified settings surface uses stacked sections rather than separate app-level tabs/actions, to avoid splitting “settings” and “data” into separate flows.
