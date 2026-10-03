# Zwart04 Workspaces

Eleven real applications, one private backend, and one recovery archive. This repository is the product directory and shared backend infrastructure. Each application has its own canonical repository, responsive UI, real login/workspace records and native tools.

**Directory:** https://projects-app.zwart.qzz.io/

See [REBUILD-PLAN.md](REBUILD-PLAN.md), [docs/BACKEND.md](docs/BACKEND.md), and [VERIFICATION.json](VERIFICATION.json).

```sh
npm ci
npm test
npm run build
```

Private repositories and agenmini, zwartos, ZwartGuard, rakaat-counter are excluded. Only public repositories owned by Zwart04 are covered. daily-apps was included after explicit owner authorization.

Previous Git history is preserved in the single [unified-rebuild-backup release](https://github.com/Zwart04/zwart04-projects/releases/tag/unified-rebuild-backup). Workspace user data is never copied into that public archive.
