import fs from 'node:fs';
import path from 'node:path';

export const RECOMMENDATION_FEATURES = [
  'skills', 'experience', 'education', 'location', 'role', 'projects', 'salary', 'preferences', 'job_quality',
] as const;

export type RecommendationSample = { features: number[]; label: 0 | 1 };
type DenseLayer = { weights: number[][]; biases: number[] };
type RecommendationMetrics = {
  threshold: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number;
  log_loss: number;
};
type DatasetSummary = {
  raw_rows?: number;
  cleaned_rows?: number;
  removed_rows?: number;
  duplicate_rows?: number;
  class_counts?: { negative: number; positive: number };
  license?: string;
  dataset_url?: string;
};
export type RecommendationModel = {
  format: 'jobpilot-dnn-v1' | 'hiregen-dnn-v2';
  created_at: string;
  training_source: string;
  training_task: string;
  training_examples: number;
  validation_examples: number;
  feature_names: string[];
  architecture: string;
  metrics?: RecommendationMetrics;
  dataset_summary?: DatasetSummary;
  layers: [DenseLayer, DenseLayer, DenseLayer];
};

const MODEL_RELATIVE_PATH = path.join('src', 'models', 'recommender', 'model.json');
const MODEL_PATHS = [
  process.env.RECOMMENDATION_MODEL_PATH,
  path.resolve(process.cwd(), MODEL_RELATIVE_PATH),
  path.resolve(__dirname, '../models/recommender/model.json'),
  path.resolve(__dirname, '../../src/models/recommender/model.json'),
  path.resolve(__dirname, '../../../src/models/recommender/model.json'),
  path.resolve(process.cwd(), 'packages/api/src/models/recommender/model.json'),
].filter((value): value is string => Boolean(value));
let cachedModel: RecommendationModel | null = null;
let modelEnabled = true;
let inferenceCount = 0;
let fallbackCount = 0;
let lastInferenceAt: string | null = null;
let lastError: string | null = null;
let startedAt: string | null = null;
let stoppedAt: string | null = null;

function sigmoid(value: number): number {
  const bounded = Math.max(-25, Math.min(25, value));
  return 1 / (1 + Math.exp(-bounded));
}

function randomFactory(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function recommendationFeatures(breakdown: Record<string, { score?: number }> | null | undefined, trustScore: number): number[] {
  return [
    ...RECOMMENDATION_FEATURES.slice(0, 8).map((name) => Math.max(0, Math.min(1, Number(breakdown?.[name]?.score ?? 0) / 100))),
    Math.max(0, Math.min(1, Number(trustScore || 0) / 100)),
  ];
}

function forward(features: number[], layers: RecommendationModel['layers'], format: RecommendationModel['format']) {
  const preActivations: number[][] = [];
  const activations: number[][] = [features];
  for (let layerIndex = 0; layerIndex < 2; layerIndex += 1) {
    const layer = layers[layerIndex];
    const input = activations[layerIndex];
    const pre = layer.biases.map((bias, outputIndex) => bias + input.reduce((sum, value, inputIndex) => sum + value * layer.weights[inputIndex][outputIndex], 0));
    preActivations.push(pre);
    activations.push(pre.map((value) => format === 'hiregen-dnn-v2' ? Math.max(0, value) : sigmoid(value)));
  }
  const last = layers[2];
  const hidden = activations[2];
  const logit = last.biases[0] + hidden.reduce((sum, value, index) => sum + value * last.weights[index][0], 0);
  const output = sigmoid(logit);
  return { activations, preActivations, output };
}

function fallbackScore(features: number[]): number {
  const weights = [0.30, 0.20, 0.10, 0.10, 0.15, 0.05, 0.05, 0.05, 0];
  return Math.round(features.reduce((sum, value, index) => sum + Math.max(0, Math.min(1, Number(value || 0))) * weights[index], 0) * 100);
}

export function scoreRecommendation(features: number[]): number {
  if (!modelEnabled) {
    fallbackCount += 1;
    return fallbackScore(features);
  }
  try {
    const model = loadRecommendationModel();
    const normalized = RECOMMENDATION_FEATURES.map((_, index) => Math.max(0, Math.min(1, Number(features[index] || 0))));
    const score = Math.round(forward(normalized, model.layers, model.format).output * 100);
    inferenceCount += 1;
    lastInferenceAt = new Date().toISOString();
    lastError = null;
    return score;
  } catch (error) {
    // Keep job matching available when the trained artifact has not been installed.
    lastError = error instanceof Error ? error.message : 'Unable to load the recommendation model';
    fallbackCount += 1;
    return fallbackScore(features);
  }
}

export function setRecommendationModelEnabled(enabled: boolean): void {
  if (enabled) {
    // A start request only succeeds when the artifact can be loaded and validated.
    loadRecommendationModel();
    modelEnabled = true;
    lastError = null;
    startedAt = new Date().toISOString();
    stoppedAt = null;
    return;
  }
  modelEnabled = false;
  stoppedAt = new Date().toISOString();
}

export function recommendationModelStatus() {
  let model: RecommendationModel | null = null;
  let artifactError: string | null = null;
  try { model = loadRecommendationModel(); }
  catch (error) { artifactError = error instanceof Error ? error.message : 'Model artifact unavailable'; }
  const enabled = modelEnabled;
  const state = enabled ? (model ? 'running' : 'error') : 'stopped';
  return {
    enabled,
    state,
    artifact_loaded: Boolean(model),
    model_name: model?.format || null,
    architecture: model?.architecture || null,
    training_examples: model?.training_examples || 0,
    validation_examples: model?.validation_examples || 0,
    metrics: model?.metrics || null,
    inference_count: inferenceCount,
    fallback_count: fallbackCount,
    last_inference_at: lastInferenceAt,
    started_at: startedAt,
    stopped_at: stoppedAt,
    error: enabled ? (lastError || artifactError) : null,
    checked_at: new Date().toISOString(),
  };
}

export function loadRecommendationModel(): RecommendationModel {
  if (cachedModel) return cachedModel;
  const modelPath = MODEL_PATHS.find((candidate) => fs.existsSync(candidate));
  if (!modelPath) throw new Error('Recommendation model artifact not found');
  const parsed = JSON.parse(fs.readFileSync(modelPath, 'utf8')) as RecommendationModel;
  if (!['jobpilot-dnn-v1', 'hiregen-dnn-v2'].includes(parsed.format)
    || !Array.isArray(parsed.feature_names) || parsed.feature_names.length !== RECOMMENDATION_FEATURES.length
    || !Array.isArray(parsed.layers) || parsed.layers.length !== 3) {
    throw new Error('Recommendation model format is invalid');
  }
  cachedModel = parsed;
  return cachedModel;
}

function stratifiedSplit(samples: RecommendationSample[], seed: number) {
  const random = randomFactory(seed);
  const classes: Record<0 | 1, RecommendationSample[]> = { 0: [], 1: [] };
  for (const sample of samples) classes[sample.label].push(sample);
  const training: RecommendationSample[] = [];
  const validation: RecommendationSample[] = [];
  for (const label of [0, 1] as const) {
    const rows = classes[label];
    for (let index = rows.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [rows[index], rows[swapIndex]] = [rows[swapIndex], rows[index]];
    }
    const validationCount = rows.length > 1 ? Math.max(1, Math.floor(rows.length * 0.2)) : 0;
    validation.push(...rows.slice(0, validationCount));
    training.push(...rows.slice(validationCount));
  }
  return { training, validation };
}

function evaluate(samples: RecommendationSample[], layers: RecommendationModel['layers']): RecommendationMetrics {
  const predictions = samples.map((sample) => ({
    label: sample.label,
    probability: forward(sample.features, layers, 'hiregen-dnn-v2').output,
  }));
  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let logLoss = 0;
  for (const prediction of predictions) {
    const positive = prediction.probability >= 0.5;
    if (prediction.label === 1 && positive) truePositive += 1;
    else if (prediction.label === 0 && !positive) trueNegative += 1;
    else if (positive) falsePositive += 1;
    else falseNegative += 1;
    const probability = Math.max(1e-7, Math.min(1 - 1e-7, prediction.probability));
    logLoss -= prediction.label * Math.log(probability) + (1 - prediction.label) * Math.log(1 - probability);
  }
  const positives = truePositive + falseNegative;
  const negatives = trueNegative + falsePositive;
  const precision = truePositive / Math.max(1, truePositive + falsePositive);
  const recall = truePositive / Math.max(1, positives);
  const sorted = [...predictions].sort((left, right) => left.probability - right.probability);
  let positiveRankSum = 0;
  let index = 0;
  while (index < sorted.length) {
    let end = index + 1;
    while (end < sorted.length && sorted[end].probability === sorted[index].probability) end += 1;
    const averageRank = ((index + 1) + end) / 2;
    for (let rankIndex = index; rankIndex < end; rankIndex += 1) {
      if (sorted[rankIndex].label === 1) positiveRankSum += averageRank;
    }
    index = end;
  }
  const rocAuc = positives && negatives ? (positiveRankSum - positives * (positives + 1) / 2) / (positives * negatives) : 0;
  return {
    threshold: 0.5,
    accuracy: (truePositive + trueNegative) / Math.max(1, predictions.length),
    precision,
    recall,
    f1: 2 * precision * recall / Math.max(1e-9, precision + recall),
    roc_auc: rocAuc,
    log_loss: logLoss / Math.max(1, predictions.length),
  };
}

export function trainRecommendationModel(
  samples: RecommendationSample[],
  trainingSource: string,
  datasetSummary?: DatasetSummary,
  trainingTask = 'same-domain vs cross-domain resume/job pair classification',
): RecommendationModel {
  const validSamples = samples.filter((sample) => sample.features.length === RECOMMENDATION_FEATURES.length
    && sample.features.every(Number.isFinite) && (sample.label === 0 || sample.label === 1))
    .map((sample) => ({ features: sample.features.map((value) => Math.max(0, Math.min(1, value))), label: sample.label }));
  if (validSamples.length < 20 || new Set(validSamples.map((sample) => sample.label)).size < 2) {
    throw new Error('At least 20 valid resume/job examples with both labels are required to train the model');
  }

  const { training, validation } = stratifiedSplit(validSamples, 20261021);
  const widths = [RECOMMENDATION_FEATURES.length, 16, 8, 1];
  const random = randomFactory(91027);
  const layers = widths.slice(1).map((width, layerIndex) => ({
    weights: Array.from({ length: widths[layerIndex] }, () => Array.from({ length: width }, () => (random() - 0.5) * Math.sqrt(2 / widths[layerIndex]))),
    biases: Array.from({ length: width }, () => 0),
  })) as RecommendationModel['layers'];
  const epochs = training.length > 10_000 ? 32 : training.length > 1_000 ? 60 : 120;
  const learningRate = 0.018;
  let bestLayers = JSON.parse(JSON.stringify(layers)) as RecommendationModel['layers'];
  let bestLoss = Number.POSITIVE_INFINITY;
  let staleEpochs = 0;
  const order = training.map((_, index) => index);

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
    }
    const rate = learningRate * (1 - 0.65 * epoch / epochs);
    for (const sampleIndex of order) {
      const sample = training[sampleIndex];
      const { activations, preActivations, output } = forward(sample.features, layers, 'hiregen-dnn-v2');
      const delta3 = output - sample.label;
      const delta2 = layers[2].weights.map((weight) => delta3 * weight[0]);
      const hidden2 = activations[2];
      const hidden1 = activations[1];
      const delta2Activated = delta2.map((value, index) => preActivations[1][index] > 0 ? value : 0);
      const delta1 = layers[1].weights.map((row, inputIndex) => row.reduce((sum, weight, outputIndex) => sum + weight * delta2Activated[outputIndex], 0) * (preActivations[0][inputIndex] > 0 ? 1 : 0));

      for (let outputIndex = 0; outputIndex < layers[2].biases.length; outputIndex += 1) {
        layers[2].biases[outputIndex] -= rate * delta3;
        for (let inputIndex = 0; inputIndex < hidden2.length; inputIndex += 1) {
          layers[2].weights[inputIndex][outputIndex] -= rate * (delta3 * hidden2[inputIndex] + 0.0002 * layers[2].weights[inputIndex][outputIndex]);
        }
      }
      for (let outputIndex = 0; outputIndex < layers[1].biases.length; outputIndex += 1) {
        layers[1].biases[outputIndex] -= rate * delta2Activated[outputIndex];
        for (let inputIndex = 0; inputIndex < hidden1.length; inputIndex += 1) {
          layers[1].weights[inputIndex][outputIndex] -= rate * (delta2Activated[outputIndex] * hidden1[inputIndex] + 0.0002 * layers[1].weights[inputIndex][outputIndex]);
        }
      }
      for (let outputIndex = 0; outputIndex < layers[0].biases.length; outputIndex += 1) {
        layers[0].biases[outputIndex] -= rate * delta1[outputIndex];
        for (let inputIndex = 0; inputIndex < sample.features.length; inputIndex += 1) {
          layers[0].weights[inputIndex][outputIndex] -= rate * (delta1[outputIndex] * sample.features[inputIndex] + 0.0002 * layers[0].weights[inputIndex][outputIndex]);
        }
      }
    }

    const validationLoss = evaluate(validation, layers).log_loss;
    if (validationLoss + 0.0001 < bestLoss) {
      bestLoss = validationLoss;
      bestLayers = JSON.parse(JSON.stringify(layers)) as RecommendationModel['layers'];
      staleEpochs = 0;
    } else {
      staleEpochs += 1;
      if (staleEpochs >= 7) break;
    }
  }

  const classCounts = validSamples.reduce((counts, sample) => {
    counts[sample.label === 1 ? 'positive' : 'negative'] += 1;
    return counts;
  }, { negative: 0, positive: 0 });
  const model: RecommendationModel = {
    format: 'hiregen-dnn-v2',
    created_at: new Date().toISOString(),
    training_source: trainingSource,
    training_task: trainingTask,
    training_examples: training.length,
    validation_examples: validation.length,
    feature_names: [...RECOMMENDATION_FEATURES],
    architecture: '9-16-8-1 feed-forward neural ranker (ReLU, sigmoid)',
    metrics: evaluate(validation, bestLayers),
    dataset_summary: { ...datasetSummary, cleaned_rows: validSamples.length, class_counts: classCounts },
    layers: bestLayers,
  };
  const targetPath = process.env.RECOMMENDATION_MODEL_PATH
    || MODEL_PATHS.find((candidate) => fs.existsSync(candidate))
    || path.resolve(process.cwd(), MODEL_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
  cachedModel = model;
  return model;
}

export function invalidateRecommendationModelCache() {
  cachedModel = null;
}
