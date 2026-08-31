---
name: Clerk package registry compatibility
description: Clerk package versions in this workspace must be checked against the Replit package registry before installation.
---

Use the latest versions exposed by the workspace package registry rather than assuming versions from generic Clerk documentation or another project.

**Why:** The registry can lag or differ from public package examples, and an unavailable version blocks the whole workspace install.

**How to apply:** When adding Clerk dependencies, verify the registry's published version first and keep the frontend and Express SDK versions independently compatible.