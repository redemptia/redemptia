---
"@workspace/lib": patch
"@workspace/worker": patch
"@workspace/web": patch
---

Self-hosted and whitelabel deployments now stop collecting new answers at a daily provider-call ceiling (`DAILY_PROVIDER_CALL_CEILING`, by default 1.5 times a normal day), and the fact readout says when collection has paused.
