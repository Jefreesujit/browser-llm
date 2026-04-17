# Global Sidebar Navigation Implementation Plan

We will implement a Workspace Sidebar layout ("Pattern 1") as discussed, converting the application into an AI toolkit with easy switching between "Chat" and "Voice Tools".

## User Review Required
None of the existing inner UI components or application logic will be fundamentally rewritten; instead, they will be embedded inside a top-level layout wrapper. To achieve the "Manage Data" feature, we will open the existing `ModelPickerDialog` or construct a new dedicated clear data dialog if you prefer. Please review the "Manage Data" mapping below.

## Proposed Changes

### Configuration / Layout
#### [NEW] `src/components/AppLayout.tsx`
- Build a new responsive wrapper component (`AppLayout`) that includes:
  - **Left Sidebar** (Desktop) / **Bottom Nav or Hamburger** (Mobile):
    - Top: Brand Logo and Title ("Browser LLM").
    - Primary Links: `Chat` and `Voice Tools` (highlights active state).
    - Bottom Actions: `Manage Data` (database icon), `Settings` (gear icon), and `GitHub` (repo link).
  - **Main Content Area**: Injects the children (the screens) cleanly into the existing `.shell > .panel` structure.

#### [MODIFY] `src/styles.css`
- Add CSS utilities for the layout structure:
  - `.app-layout`: A flex row container stretching 100vh.
  - `.app-sidebar`: Glassmorphic sidebar styling with fixed width.
  - `.app-sidebar-nav`, `.sidebar-link`, `.sidebar-bottom-actions`.
- Ensure `.shell` gracefully adapts to the remaining width alongside the sidebar.

### UI Screens & State Updates
#### [MODIFY] `src/App.tsx`
- **Routing Logic**: Map the main `screen` state strictly to `"chat"` and `"voice"`.
  - When `chat` and thread is active -> Render `<ChatScreen>`.
  - When `chat` and no thread is active -> Render `<LandingScreen>`.
  - When `voice` -> Render `<AudioScreen>`.
- Wrap the main return block with the new `<AppLayout>` component.
- **Manage Data mapping**: Map the new sidebar "Manage Data" button to clear user data logic, OR open a new dialog specifically meant for managing downloaded models. *Will ask for clarification on this in open questions.*

#### [MODIFY] `src/components/LandingScreen.tsx`
- Remove the "Try Audio" button from the landing page. It is no longer necessary as "Voice Tools" acts as a global entry point via the Sidebar.
- Clean up the header to match a pure "Start a Chat" empty state rather than pitching both chat and audio.

#### [MODIFY] `src/components/ChatScreen.tsx`
- Remove the "Try Audio" button/header action.
- Remove "Settings" from the `ChatScreen` header since it now lives globally in the Sidebar.

#### [MODIFY] `src/components/AudioScreen.tsx`
- Remove "Try Chat" from the `AudioScreen` header since switching to chat is managed via the global Sidebar.

## Open Questions
1. **Manage Data Behavior**: For the new "Manage Data" sidebar icon, should this open the existing `SettingsDialog` -> "Clear All Data" section, open a new dedicated screen/modal, or open the `ModelPickerDialog` to see downloaded models? How do you envision "Manage Data" working right now?
2. **Mobile View**: For small screens, should the Sidebar convert into a hamburger menu (slide out from left), or should it become a fixed Bottom Navigation bar?

## Verification Plan
### Manual Verification
- Resize the browser window to verify the sidebar collapses/responds nicely on smaller screens.
- Click between `Chat` and `Voice Tools` to ensure the application state is maintained (e.g., chat input doesn't clear if you switch to Voice Tools and back).
- Verify the GitHub link opens an external tab.
- Validate that the existing glassmorphic cards (`.panel`) maintain their visual integrity within the new flex container.
