# Candidate-to-job ranker

`model.json` is the trained bootstrap artifact for the `jobpilot-dnn-v1` dense neural ranker. It accepts nine normalized fit dimensions (skills, experience, education, location, preferred role, projects, salary, work preferences, and listing quality) and passes them through two hidden layers (14 and 8 units) before producing a 0–100 ranking score.

The bootstrap model is trained from generated weak labels because a new installation does not yet have reliable application outcomes. Its metadata records that source. It must not be presented as a production-validated predictor. The admin retraining endpoint adds real interview/offer/joined and withdrawn outcomes only after there are at least 20 examples from both classes; those features contain fit scores, not resume text or contact details.

Regenerate the bootstrap artifact with `npm run model:train` from `packages/api`. The runtime model artifact is persisted in this directory by Docker Compose.
