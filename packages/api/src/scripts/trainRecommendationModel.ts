import fs from 'node:fs';
import path from 'node:path';
import { ensureRecommendationDatasetFile, readRecommendationDataset } from '../utils/recommendation-data';
import { trainRecommendationModel } from '../utils/recommendation-model';

async function main() {
  const datasetPath = await ensureRecommendationDatasetFile();
  const { samples, cleanedCsv, summary } = readRecommendationDataset(datasetPath);
  const processedPath = path.resolve(process.cwd(), 'data/processed/resume-job-features.csv');
  fs.mkdirSync(path.dirname(processedPath), { recursive: true });
  fs.writeFileSync(processedPath, cleanedCsv, 'utf8');

  const model = trainRecommendationModel(
    samples,
    '0xnbk/resume-domain-classifier-v1-en · cleaned text-pair relevance labels',
    summary,
    'same-domain vs cross-domain resume/job pair classification',
  );
  const reportPath = path.resolve(process.cwd(), 'data/processed/recommendation-training-report.json');
  const report = {
    created_at: model.created_at,
    source: model.training_source,
    license: model.dataset_summary?.license,
    dataset_url: model.dataset_summary?.dataset_url,
    task: model.training_task,
    limitations: [
      'The dataset author describes resume text as synthetic and job text as derived from a public job-posting dataset.',
      'Held-out metrics measure domain-pair classification, not interview probability, hiring success, or this platform users’ outcomes.',
      'The user-facing match percentage combines learned relevance with the transparent profile/job fit score.',
    ],
    cleaned_rows: model.dataset_summary?.cleaned_rows,
    removed_rows: model.dataset_summary?.removed_rows,
    duplicate_rows: model.dataset_summary?.duplicate_rows,
    class_counts: model.dataset_summary?.class_counts,
    training_examples: model.training_examples,
    validation_examples: model.validation_examples,
    architecture: model.architecture,
    validation_metrics: model.metrics,
    processed_features_file: 'resume-job-features.csv',
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.info(JSON.stringify({
    trained: true,
    model: model.format,
    architecture: model.architecture,
    cleaned_examples: model.dataset_summary?.cleaned_rows,
    training_examples: model.training_examples,
    validation_examples: model.validation_examples,
    validation_metrics: model.metrics,
    cleaned_features: processedPath,
    report: reportPath,
  }, null, 2));
}

main().catch((error) => {
  console.error('Recommendation model training failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
