import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { connect } from "framer-api";

async function main() {
  const projectUrl = process.env.FRAMER_PROJECT_URL;
  const apiKey = process.env.FRAMER_API_KEY;

  console.log("Connecting to Framer project via API...");
  const project = await connect(projectUrl, apiKey);
  const agent = project.agent;

  try {
    console.log("✅ Connected!");
    
    // Inspect context
    if (typeof agent.getContext === "function") {
      const ctx = await agent.getContext();
      console.log("Context summary:", ctx);
    }

    // Try text replacement for logo text "A"
    if (typeof agent.replaceText === "function") {
      console.log("Replacing text 'A' in canvas...");
      const res = await agent.replaceText("A", "");
      console.log("replaceText result:", res);
    }

    // Trigger preview and publish to production
    console.log("Publishing changes to production...");
    const previewRes = await agent.publish({ action: "preview" });
    if (previewRes && previewRes.confirmationHash) {
      const pubRes = await agent.publish({ action: "confirm_publish", confirmationHash: previewRes.confirmationHash });
      console.log("✅ Published result:", pubRes);
    }

  } catch (err) {
    console.error("Error in Framer API script:", err);
  } finally {
    if (typeof project.disconnect === "function") {
      await project.disconnect();
    }
  }
}

main();
