# HireGen recommendation model

model.json is a trained dense neural ranker with the architecture 9 → 16 → 8 → 1. It consumes the same nine normalized dimensions produced by HireGen's profile-to-job matcher: skills, experience, education, location, role, projects, salary, preferences, and listing quality.

Training uses cleaned resume/job pairs from the Apache-2.0 0xnbk/resume-domain-classifier-v1-en dataset. The training script holds out a deterministic, stratified 20% split and records accuracy, precision, recall, F1, ROC-AUC, and log loss in the artifact. These metrics describe same-domain vs cross-domain pair classification. They are not hiring probability or user-match accuracy.

HireGen's user-facing match score combines the transparent fit score (75%) and model score (25%). The For You page shows jobs at 70% match or higher; Discover jobs retains other trusted Indian listings and displays their scores as well. The 70% value is a profile/job match threshold, not the model's held-out classification accuracy. When enough platform outcomes exist, an administrator can retrain from rejected and interview/offer/joined applications. A user withdrawing an application is not treated as evidence that the job was a poor fit.

From packages/api, run npm run model:train. The first run downloads the public CSV to the ignored data/raw/ directory, writes cleaned numeric features and a training report into the ignored data/processed/ directory, and updates this model artifact.

See packages/api/data/README.md for provenance, cleaning details, and limitations.
