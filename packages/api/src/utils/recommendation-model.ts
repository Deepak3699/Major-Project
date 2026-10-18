import fs from 'node:fs';
import path from 'node:path';

export const RECOMMENDATION_FEATURES = [
  'skills', 'experience', 'education', 'location', 'role', 'projects', 'salary', 'preferences', 'job_quality',
] as const;

export type RecommendationSample = { features: number[]; label: 0 | 1 };
type DenseLayer = { weights: number[][]; biases: number[] };
export type RecommendationModel = {
  format: 'jobpilot-dnn-v1';
  created_at: string;
  training_source: string;
  training_examples: number;
  feature_names: string[];
  layers: [DenseLayer, DenseLayer, DenseLayer];
};

const MODEL_PATH = path.join(__dirname, '../models/recommender/model.json');
let cachedModel: RecommendationModel | null = null;

function sigmoid(value: number): number {
  const bounded = Math.max(-30, Math.min(30, value));
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

function forward(features: number[], layers: RecommendationModel['layers']) {
  const activations: number[][] = [features];
  for (const layer of layers.slice(0, 2)) {
    const input = activations[activations.length - 1];
    activations.push(layer.biases.map((bias, index) => sigmoid(bias + input.reduce((sum, value, inputIndex) => sum + value * layer.weights[inputIndex][index], 0))));
  }
  const last = layers[2];
  const hidden = activations[activations.length - 1];
  const output = sigmoid(last.biases[0] + hidden.reduce((sum, value, index) => sum + value * last.weights[index][0], 0));
  return { activations, output };
}

export function scoreRecommendation(features: number[]): number {
  try {
    const model = loadRecommendationModel();
    const normalized = RECOMMENDATION_FEATURES.map((_, index) => Math.max(0, Math.min(1, Number(features[index] || 0))));
    return Math.round(forward(normalized, model.layers).output * 100);
  } catch {
    // A readable weighted fallback keeps recommendations available if a model file is missing.
    const weights = [0.30, 0.18, 0.08, 0.10, 0.16, 0.06, 0.03, 0.04, 0.05];
    return Math.round(features.reduce((sum, value, index) => sum + Number(value || 0) * weights[index], 0) * 100);
  }
}

export function loadRecommendationModel(): RecommendationModel {
  if (cachedModel) return cachedModel;
  const parsed = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8')) as RecommendationModel;
  if (parsed.format !== 'jobpilot-dnn-v1' || parsed.feature_names.length !== RECOMMENDATION_FEATURES.length || parsed.layers.length !== 3) {
    throw new Error('Recommendation model format is invalid');
  }
  cachedModel = parsed;
  return cachedModel;
}

export function trainRecommendationModel(samples: RecommendationSample[], trainingSource: string): RecommendationModel {
  const inputCount = RECOMMENDATION_FEATURES.length;
  const widths = [inputCount, 14, 8, 1];
  const random = randomFactory(91027);
  const layers = widths.slice(1).map((width, layerIndex) => ({
    weights: Array.from({ length: widths[layerIndex] }, () => Array.from({ length: width }, () => (random() - 0.5) * 0.5)),
    biases: Array.from({ length: width }, () => 0),
  })) as RecommendationModel['layers'];
  const training = samples.filter((sample) => sample.features.length === inputCount && sample.features.every(Number.isFinite));
  const epochs = training.length > 2000 ? 500 : 1000;
  const learningRate = 0.18;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (let sampleIndex = 0; sampleIndex < training.length; sampleIndex += 1) {
      const sample = training[(sampleIndex * 7919 + epoch * 101) % training.length];
      const { activations, output } = forward(sample.features, layers);
      const delta3 = output - sample.label;
      const last = layers[2];
      const hidden2 = activations[2];
      const delta2 = hidden2.map((activation, index) => delta3 * last.weights[index][0] * activation * (1 - activation));
      const middle = layers[1];
      const hidden1 = activations[1];
      const delta1 = hidden1.map((activation, index) => delta2.reduce((sum, value, outIndex) => sum + value * middle.weights[index][outIndex], 0) * activation * (1 - activation));
      const gradients = [delta1, delta2, [delta3]];
      for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
        const layer = layers[layerIndex];
        const inputs = activations[layerIndex];
        for (let outputIndex = 0; outputIndex < layer.biases.length; outputIndex += 1) {
          layer.biases[outputIndex] -= learningRate * gradients[layerIndex][outputIndex];
          for (let inputIndex = 0; inputIndex < inputs.length; inputIndex += 1) {
            layer.weights[inputIndex][outputIndex] -= learningRate * gradients[layerIndex][outputIndex] * inputs[inputIndex];
          }
        }
      }
    }
  }

  const model: RecommendationModel = {
    format: 'jobpilot-dnn-v1',
    created_at: new Date().toISOString(),
    training_source: trainingSource,
    training_examples: training.length,
    feature_names: [...RECOMMENDATION_FEATURES],
    layers,
  };
  fs.mkdirSync(path.dirname(MODEL_PATH), { recursive: true });
  fs.writeFileSync(MODEL_PATH, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
  cachedModel = model;
  return model;
}

export function createBootstrapSamples(count = 2400): RecommendationSample[] {
  const random = randomFactory(81371);
  return Array.from({ length: count }, () => {
    const features = RECOMMENDATION_FEATURES.map(() => Math.max(0.02, Math.min(0.98, random())));
    const relevance = features[0] * 0.30 + features[1] * 0.16 + features[2] * 0.07 + features[3] * 0.10
      + features[4] * 0.19 + features[5] * 0.06 + features[6] * 0.03 + features[7] * 0.04 + features[8] * 0.05;
    const label = (relevance >= 0.67 && features[0] >= 0.34 && features[4] >= 0.30 ? 1 : 0) as 0 | 1;
    return { features, label };
  });
}

export function invalidateRecommendationModelCache() {
  cachedModel = null;
}
