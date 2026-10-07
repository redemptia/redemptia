---
"@workspace/web": patch
"@workspace/worker": patch
---

Prompt runs waiting on a slow provider are no longer marked failed after 15 minutes while their requests are still running.
