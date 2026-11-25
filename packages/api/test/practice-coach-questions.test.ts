import { templateNextQuestion } from '../src/utils/practice-coach';
import type { Difficulty } from '../src/utils/practice-ai';

const base = {
  profile: { skills: ['react', 'typescript'], experience_years: 3 },
  role: 'Frontend Developer',
  difficulty: 'standard' as Difficulty,
  targetCount: 6,
  job: null,
  recentTopics: [],
  language: 'english' as const,
};

function asked(questions: Array<{ question: string; topic: string; category: string; answer: string }>) {
  return questions;
}

describe('Adaptive interview question progression', () => {
  test('the first question is an English introduction', () => {
    const first = templateNextQuestion({ ...base, asked: [] });
    expect(first.idx).toBe(0);
    expect(first.category).toBe('intro');
    expect(first.question).not.toMatch(/aap|theek|bahut/i);
  });

  test('one follow-up is followed by a role-specific question', () => {
    const intro = templateNextQuestion({ ...base, asked: [] });
    const history = asked([{
      question: intro.question, topic: intro.topic, category: 'intro',
      answer: 'I built a React dashboard and we designed the API.',
    }]);
    const dig = templateNextQuestion({ ...base, asked: history });
    expect(dig.category).toBe('follow_up');
    expect(dig.question).not.toMatch(/aap|theek|bahut/i);

    const next = templateNextQuestion({
      ...base,
      asked: [...history, {
        question: dig.question, topic: dig.topic, category: 'follow_up',
        answer: 'We chose virtualization and measured the result.',
      }],
    });
    expect(['technical', 'project', 'behavioral', 'case']).toContain(next.category);
    expect(next.question).not.toMatch(/aap|theek|bahut/i);
  });

  test('the template fallback never asks a second introduction', () => {
    const intro = templateNextQuestion({ ...base, asked: [] });
    const afterIntro = templateNextQuestion({
      ...base,
      asked: asked([{
        question: intro.question, topic: intro.topic, category: 'intro',
        answer: 'I built a React dashboard with an API.',
      }]),
    });
    expect(afterIntro.category).not.toBe('intro');

    const later = templateNextQuestion({
      ...base,
      asked: [
        ...asked([{
          question: intro.question, topic: intro.topic, category: 'intro',
          answer: 'I built a React dashboard with an API.',
        }]),
        ...asked([{
          question: 'You mentioned React — what was the hardest decision?',
          topic: 'Tool deep-dive', category: 'follow_up', answer: 'We chose virtualization.',
        }]),
      ],
    });
    expect(later.category).not.toBe('intro');
  });

  test('follow-up probes vary with the candidate answer', () => {
    const tool = templateNextQuestion({
      ...base,
      asked: asked([{
        question: 'Tell me about yourself.', topic: 'Background', category: 'intro',
        answer: 'I built a React app with TypeScript.',
      }]),
    });
    const metric = templateNextQuestion({
      ...base,
      asked: asked([{
        question: 'Tell me about yourself.', topic: 'Background', category: 'intro',
        answer: 'I improved conversion by 20 percent for 5000 users.',
      }]),
    });
    expect(tool.topic).toBe('Tool deep-dive');
    expect(metric.topic).toBe('Metrics probe');
    expect(tool.question).not.toBe(metric.question);
  });

  test('English interviews alternate digs with fresh role questions', () => {
    const intro = templateNextQuestion({ ...base, asked: [] });
    const history = asked([{
      question: intro.question, topic: intro.topic, category: 'intro',
      answer: 'I built a React interface with 10 users and an API.',
    }]);
    const dig = templateNextQuestion({ ...base, asked: history });
    expect(dig.category).toBe('follow_up');
    const next = templateNextQuestion({
      ...base,
      asked: [...history, {
        question: dig.question, topic: dig.topic, category: 'follow_up', answer: 'We chose a heap and measured it.',
      }],
    });
    expect(['technical', 'project', 'behavioral', 'case']).toContain(next.category);
  });
});
