# Recommendation training data

## Public source

- Dataset: [Resume-Domain Classifier Dataset v1 (English)](https://huggingface.co/datasets/0xnbk/resume-domain-classifier-v1-en)
- Repository file used: validation.csv (37,740 rows, about 51 MB)
- License shown by the dataset publisher: Apache-2.0
- Columns: paired text, binary label, pair_type, resume_domain, and job_domain

The training pipeline deliberately uses only the paired text and binary label. It does not use pair_type, resume_domain, or job_domain as model inputs, which would directly reveal the target label.

## Cleaning and split

src/utils/recommendation-data.ts parses quoted multiline CSV records, normalizes Unicode and whitespace, removes replacement/control characters, strips emails and phone-like strings, rejects invalid labels and malformed/oversized pairs, removes exact normalized pair duplicates, and converts each pair into HireGen's nine profile/job fit dimensions. The generated feature table is written to data/processed/resume-job-features.csv.

The trainer makes a deterministic, stratified 80/20 train/validation split from the downloaded rows. The validation metrics are saved with the model and in data/processed/recommendation-training-report.json.

## Limitations

The dataset card says resume text is synthetic and describes its job text as derived from a public LinkedIn job-posting dataset. Its labels indicate same professional domain vs cross-domain; they do not say whether a person was hired or would apply. These data are a public starting signal for relevance, not a substitute for outcome-labelled HireGen activity. The displayed percentage is a profile-to-listing match score, not a probability of getting an interview or offer.

Do not commit the downloaded CSV or generated feature CSV. .gitignore excludes these data files; only the small model artifact and training code are kept in the repository.
