# Contributing to RepoMind

Thanks for helping. RepoMind turns a repository into one live map of its code, infrastructure and integrations. Contributions of every size are welcome: a typo, a new detector, a bug fix, a feature.

## How it works

1. **Open an issue first** for anything bigger than a small fix, so we agree on the idea before you spend time on it. Read [`PRODUCT.md`](PRODUCT.md) to see what the product is and why it works the way it does.
2. **Fork** the repository and create a branch from `main` (`fix/…`, `feat/…`).
3. Make your change. Keep it focused: one pull request, one idea.
4. Check it:
   ```bash
   npm install
   npm test        # builds, then runs the checks against examples/sumitra-like
   ```
5. **Open a pull request** against `main`. Fill in the template: what changed, why, and how you tested it. Add screenshots for anything visual.
6. The maintainer reviews it. Expect questions; that's normal. Once approved, the maintainer merges it.

Nobody pushes to `main` directly, the maintainer included: every change goes through a pull request, and only the maintainer can approve and merge.

## Run it locally

You need Node 20+.

```bash
npm install && npm run build
node bin/repomind.js map examples/sumitra-like     # one-off map → .repomind/map.html
GITHUB_TOKEN=$(gh auth token) node bin/repomind.js serve   # web app → http://127.0.0.1:4242
```

## Ground rules

- **Evidence first**: every box on the map must point to the file and line that proves it. Detectors are rules, not guesses.
- **Add a detector** in `src/detectors/` or one line in `src/catalog.ts`; add a security rule in `src/rules/security.ts`. Add a check to `scripts/test.mjs` for anything you detect.
- **Match the code around you**: naming, comments, and the plain wording of the interface.
- **Log decisions**: if your change adds a feature or changes how the product works, add an entry to the decision log in `PRODUCT.md`.
- **No secrets** in code, tests, fixtures or screenshots. The example repo uses fake values on purpose.
