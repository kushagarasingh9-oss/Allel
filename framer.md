# Framer Integration & API Automation Guide

This guide documents how the Framer landing page is integrated, exported to our local codebase, manipulated remotely via the official **Framer Server API (`framer-api`)**, and published programmatically to production (`https://allel.co`).

---

## 1. Prerequisites & Environment Setup

### Required Packages
The project uses the official Framer Server API package:
```bash
npm install framer-api dotenv
```

### Environment Variables (`web/.env.local`)
Add your Framer API key and project URL:
```env
FRAMER_API_KEY=fr_your_framer_api_key_here
FRAMER_PROJECT_URL=https://framer.com/projects/your_project_name--your_project_id
```

> **Key Finding on Connection Signature:**  
> Pass the API key directly as a **string** as the 2nd argument to `connect()`:
> ```js
> // Correct:
> const project = await connect(projectUrl, apiKey);
>
> // Incorrect (causes UNAUTHORIZED / session errors):
> const project = await connect(projectUrl, { apiKey }); 
> ```

---

## 2. Programmatic Workflow: How to Connect & Push Changes

### Step 1: Connect to Framer Project
```javascript
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { connect } from "framer-api";

const projectUrl = process.env.FRAMER_PROJECT_URL;
const apiKey = process.env.FRAMER_API_KEY;

const project = await connect(projectUrl, apiKey);
const agent = project.agent; // Access the Agent SDK
```

### Step 2: Apply Changes using Framer DSL Commands
Framer's Agent API uses a domain-specific language (DSL) passed to `agent.applyChanges(dslString)`:

#### Common DSL Commands:
- **Set Attribute:** `SET <nodeId> <attribute>="<value>";`
- **Modify Padding:** `SET Ue_brxGlX padding="16px 28px 16px 28px";`
- **Modify Gap:** `SET qKwjyVzsM gap="36px";`
- **Modify Font & Sizing:** `SET xnEy0HjSn fontSize="18px" fontWeight="700";`
- **Hide / Collapse Element:** `SET ladCad1ku width="0px" height="0px" opacity="0";`

```javascript
const dslCmd = `
  SET efNDm3p2M text="";
  SET ladCad1ku width="0px" height="0px" opacity="0" border="0px none transparent";
  SET Ue_brxGlX padding="16px 28px 16px 28px";
  SET qKwjyVzsM gap="36px";
  SET xnEy0HjSn fontSize="18px" fontWeight="700";
`.trim();

const result = await agent.applyChanges(dslCmd);
console.log("Changes result:", result);
```

### Step 3: Two-Stage Publish Pipeline (Staging → Production)
Publishing requires a **Preview** step to obtain a `confirmationHash`, followed by **Confirm Publish**:

```javascript
// 1. Trigger Preview to generate confirmation hash
const previewRes = await agent.publish({ action: "preview" });

if (previewRes && previewRes.confirmationHash) {
  // 2. Confirm publish with the hash
  const pubRes = await agent.publish({
    action: "confirm_publish",
    confirmationHash: previewRes.confirmationHash
  });
  
  console.log("✅ Live Production Status:", pubRes.status);
  console.log("Published URL:", pubRes.urls.production); // https://allel.co
}
```

### Step 4: Disconnect
Always disconnect cleanly to avoid `TOKEN_SESSION_LIMIT` errors:
```javascript
await project.disconnect();
```

---

## 3. Easiest Methods to Inspect Canvas & Find Node IDs via API

### Method A: Extracting the Full Node Tree (`serialize`)
To find node IDs (such as navigation bars, logo frames, and text runs), call `agent.serialize({ id: "<layoutId>" })`:

```javascript
// Get layout template
const layoutNode = await agent.serialize({ id: "m4_2zggMy" });

// Get navigation subtree
const navNode = await agent.serialize({ id: "Ue_brxGlX" });
console.log(JSON.stringify(navNode, null, 2));
```

#### Identified Canvas Node IDs:
- **Layout Template (`Allel Layout`):** `m4_2zggMy`
- **Desktop Breakpoint Frame:** `sk8l17TDY`
- **Navigation Container:** `Ue_brxGlX`
- **Logo, Links Container:** `qKwjyVzsM`
- **Logo Link Frame:** `Z0NwVYQog`
- **Mark Icon Box ("A" box):** `ladCad1ku`
- **"A" Text Node:** `efNDm3p2M`
- **"Allel" Text Node:** `xnEy0HjSn` / `v:xnEy0HjSn:0:0`

### Method B: Extracting Framer's Agent Prompt (`getSystemPrompt`)
Call `await agent.getSystemPrompt()` to view Framer's built-in DSL syntax, tool definitions, available icon sets, and layout IDs:
```javascript
const sysPrompt = await agent.getSystemPrompt();
console.log(sysPrompt);
```

---

## 4. Exporting Framer Landing Page to Local Codebase

### HTML Export (`RAW_LANDING_HTML`)
The Framer SSR HTML markup is exported directly into the local React app:
- **File:** [web/src/app/page.tsx](file:///Users/kushagrasingh/dev/allel/web/src/app/page.tsx)
- **File:** [frontend/LandingPage.tsx](file:///Users/kushagrasingh/dev/allel/frontend/LandingPage.tsx)

```tsx
const RAW_LANDING_HTML = `
  <div id="main" data-framer-hydrate-v2="...">
    <nav class="framer-18q8gw8" data-border="true" data-framer-name="Navigation">
      <div class="framer-8nv6z" data-framer-name="Logo, Links">
        <a class="framer-1copcxj" data-framer-name="Logo" href="./">
          <div class="framer-gdhgkz" data-framer-component-type="RichTextContainer">
            <p class="framer-text">Allel</p>
          </div>
        </a>
      </div>
    </nav>
  </div>
`;
```

### CSS Tokens & Forced Dark Theme System
Framer uses scoped CSS custom properties (`--token-...`). To force Dark Theme on all devices regardless of browser light/dark mode settings:

- **Files:** [web/src/app/globals.css](file:///Users/kushagrasingh/dev/allel/web/src/app/globals.css) & [frontend/landing.css](file:///Users/kushagrasingh/dev/allel/frontend/landing.css)

```css
/* Force Dark Theme tokens across all sections, cards, text, and buttons */
:root, html, body, #main, [data-framer-generated-page], div, section, main, nav, footer {
  color-scheme: dark !important;
  --token-42377e4c-6aff-45af-80cf-861971d3bff6: #0b0b0a !important; /* Main Background */
  --token-10e74244-94d1-431e-87d0-281bc16f26b9: #141413 !important; /* Card Background */
  --token-fc3e2144-81ca-48e6-9365-4417af9831c9: #282825 !important; /* Borders */
  --token-ead5ee04-8072-43a8-8b63-6c52f5667fd6: #2c2c28 !important; /* Dividers */
  --token-4b5c2631-4675-4701-82c8-51d44ba443f5: #edede8 !important; /* Text Color */
  --token-a858697d-e879-4ab9-8f8f-ff96d21fdb35: #8b8b83 !important; /* Subtext */
  --token-4e477fa6-3a4a-4dca-ae8d-06a59b9bf0d6: #7ba0ff !important; /* Accent Blue */
  --token-3ecbcdcb-d687-4568-8ed1-ce89eb81fae0: #edede8 !important; /* Primary Button Fill */
  --token-bcd71c5d-2d0e-4873-99a0-673d2c1b67b7: #121211 !important; /* Primary Button Text */
  --token-839f404f-2485-4df4-989d-84c9778f6e7d: #333330 !important; /* Muted Borders */
}

/* Navbar Logo Spacing */
.framer-1copcxj {
  height: 28px !important;
  min-height: 28px !important;
  display: flex !important;
  align-items: center !important;
  padding-left: 14px !important;
  border-left: none !important;
}

.framer-gdhgkz .framer-text {
  font-size: 18px !important;
  font-weight: 700 !important;
  line-height: 28px !important;
  letter-spacing: -0.02em !important;
}
```

---

## 5. Executable Script Reference

The automation script is located at:  
`web/scripts/framer-update-logo.mjs`

Run it using Node:
```bash
node web/scripts/framer-update-logo.mjs
```
