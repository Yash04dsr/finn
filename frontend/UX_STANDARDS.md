# UX.md — User-Centric Experience & Interaction Standards

## 1. Core UX Philosophy
- **Clarity Over Cleverness:** Every screen must answer three questions within 3 seconds: *Where am I? What can I do here? What happens next?*
- **Zero Dead Ends:** Every page, modal, empty state, and error screen must offer a clear next action or safe exit.
- **Respect User Attention:** Never interrupt active workflows with unprompted popups, newsletter modals, or premature permission requests.
- **Progressive Disclosure:** Show only what the user needs for the current step. Tuck advanced settings and edge-case controls behind secondary panels.

---

## 2. Information Architecture & Navigation
- **Predictable Placement:** Follow established conventions (Jakob's Law)—primary navigation at the top or left, primary CTA top-right or center-bottom, account/settings top-right.
- **Limit Choices (Hick's Law):** Keep top-level navigation to **5–7 items maximum**. Group related actions rather than cluttering toolbars.
- **Persistent Context:** Always show active filters, current location (breadcrumbs or active sidebar state), and unsaved changes indicators.

---

## 3. Forms & Data Input
- **Ask Only What Is Necessary:** Remove optional fields unless strictly required for the immediate task.
- **Inline, Timely Validation:**
  - Never show red errors while the user is still typing. Validate on `onBlur` (leaving the field) or on submit.
  - Clear error messages immediately once the user corrects the input.
- **Smart Defaults & Formatting:** Pre-fill known values, auto-format inputs (phone numbers, dates, cards), and preserve user input if submission fails.
- **Visible Labels:** Always use persistent labels above inputs—never rely solely on placeholder text, which disappears on focus.

---

## 4. System Feedback & Edge-Case States
Every asynchronous view or data container **must** explicitly handle all four states:
1. **Loading State:**
   - For delays **< 300ms**: Show nothing (avoid jarring flicker).
   - For delays **300ms – 3s**: Show layout-matched skeleton placeholders (never a generic full-page spinner).
   - For delays **> 3s**: Show progress feedback or explain what is happening (*"Analyzing your document..."*).
2. **Empty State:**
   - Never leave a blank white box. Explain *why* it's empty and provide a single, clear CTA to populate it (e.g., *"No projects yet. Create your first project"*).
3. **Error State:**
   - Use plain, human language—never raw error codes (`500`, `ERR_NETWORK`).
   - State **what happened** and **how to fix it** (e.g., *"Couldn't save your changes due to a connection drop. Retry now."*).
4. **Success Feedback:**
   - Use non-blocking toast notifications (auto-dismiss in 4–5 seconds) for routine actions, and clear confirmation screens for major milestones.

---

## 5. Safety, Destructive Actions & Trust
- **Undo Over Confirmation Modals:** Whenever possible, allow instant **Undo** (e.g., *"Item archived — Undo"*) rather than interrupting with *"Are you sure?"* dialogs.
- **High-Friction Safeguards for Permanent Loss:** For irreversible actions (deleting an account or workspace), require explicit intent (e.g., typing the resource name) and clearly state what will be lost.
- **No Dark Patterns:** Strictly forbid confirmshaming (*"No thanks, I hate saving money"*), pre-checked marketing boxes, hidden fees, or disguised ads.

---

## 6. Microcopy & Button Rules
- **Action-Oriented Buttons:** Label buttons with the exact outcome—use **"Save Changes"**, **"Send Invite"**, or **"Delete Project"** instead of generic **"Submit"**, **"OK"**, or **"Yes"**.
- **Consistent Vocabulary:** Use the exact same term for the same concept everywhere in the app (do not mix *Workspace*, *Team*, and *Organization* interchangeably).
- **Scannable Copy:** Keep helper text under 2 short sentences. Front-load the most important words.

---

## 7. Accessibility & Responsiveness (Non-Negotiable)
- **Touch & Click Targets:** Minimum **44×44px** tap area on mobile and **32×32px** on desktop, with at least **8px** spacing between adjacent clickable elements.
- **Keyboard Navigation:** All interactive elements must be reachable via `Tab`, activatable via `Enter`/`Space`, and dismissible via `Esc`, with visible focus rings.
- **Color Independence:** Never convey status by color alone—pair red/green indicators with icons or text labels.
- **Contrast:** Maintain at least **4.5:1** contrast ratio for normal body text and **3:1** for large text and UI controls.
