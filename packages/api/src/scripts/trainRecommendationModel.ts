import { createBootstrapSamples, trainRecommendationModel } from '../utils/recommendation-model';

const model = trainRecommendationModel(createBootstrapSamples(), 'synthetic_bootstrap_weak_labels');
console.info(`Trained ${model.format} with ${model.training_examples} transparent bootstrap examples; model saved to src/models/recommender/model.json.`);
