# Framer API Guide for Allel

This document outlines how to programmatically interact with, inspect, update, and publish the Framer project for **Allel** using the official `framer-api` SDK.

---

## 1. Prerequisites & Environment Setup

The Framer integration relies on `framer-api` installed in `web/`:
```bash
npm install framer-api --prefix web
```

Required environment variables in `/Users/kushagrasingh/dev/allel/web/.env.local`:
```env
FRAMER_API_KEY=fr_1rp93zqd7099dae8am79cv9ptn
FRAMER_PROJECT_URL=https://framer.com/projects/Modest-Lychee--rBzvTXtct6GAB9hT6Agx-1P9L6
```

---

## 2. Basic Connection Template

```javascript
import { connect } from "framer-api";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env.local") });

const projectUrl = process.env.FRAMER_PROJECT_URL;
const apiKey = process.env.FRAMER_API_KEY;

const client = await connect(projectUrl, apiKey);
try {
  // Perform Framer operations via client.agent
} finally {
  await client.disconnect();
}
```

---

## 3. Key `client.agent` Capabilities

The `client.agent` object provides all methods to inspect and modify the Framer canvas:

| Method | Usage |
|---|---|
| `client.agent.getContext()` | Returns project metadata, sitemap, fonts, available components, layout templates |
| `client.agent.getNodesOfTypes({ types: ["FrameNode", "WebPageNode"] })` | Lists top-level frames and pages |
| `client.agent.getNode({ id: "NODE_ID" })` | Reads a node and its full tree of children |
| `client.agent.getDescendantsOfTypes({ id: "PARENT_ID", types: ["TextNode", "RichTextNode"] })` | Queries specific child nodes |
| `client.agent.replaceText({ id, searchText, replaceText })` | Fast, in-place text replacement without altering styles |
| `client.agent.applyChanges(dsl, { pagePath })` | Modifies layout, adds/removes nodes, updates properties using Framer DSL |
| `client.agent.publish({ action: "preview" })` | Runs pre-publish checks and returns a `confirmationHash` |
| `client.agent.publish({ action: "confirm_publish", confirmationHash })` | Publishes site directly to production (`https://allel.co`) |

---

## 4. In-Place Copy Editing with `replaceText`

To update copy without breaking CSS styles, fonts, or component instances:

```javascript
await client.agent.replaceText({
  id: "NODE_ID",
  searchText: "Old Text",
  replaceText: "New Text"
});
```

---

## 5. Publishing Changes Live to Production

After making edits, publish them directly to `https://allel.co`:

```javascript
const preview = await client.agent.publish({ action: "preview" });

if (preview.confirmationHash) {
  const result = await client.agent.publish({
    action: "confirm_publish",
    confirmationHash: preview.confirmationHash
  });
  console.log("Published to production:", result.urls.production);
}
```

---

## 6. Key Framer Node IDs in Allel Project

- **Layout Template:** `m4_2zggMy` ("Allel Layout")
- **Footer Container:** `G9qLC9FCz` ("Footer")
- **Footer Top:** `AzOEllNxP` ("Footer Top")
- **Brand Description Node:** `ZHBh8qIFI`
- **Product Links Header:** `lpOHKB0j3`
- **Company Links Header:** `f484pr5Cr`
- **Access / Early Access Header:** `HLTAGwc_g`
- **Legal Row Container:** `v1QYl_n6y`
- **Copyright Text Node:** `lcOYgJRw1`
- **Legal Secondary Text Node:** `zTwETml9e`
