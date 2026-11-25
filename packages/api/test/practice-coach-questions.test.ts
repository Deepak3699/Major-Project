import { templateNextQuestion } from '../src/utils/practice-coach';
import type { Difficulty } from '../src/utils/practice-ai';

const base = {
  profile: { skills: ['react', 'typescript'], experience_years: 3 },
  role: 'Frontend Developer',
  difficulty: 'standard' as Difficulty,
  targetCount: 6,
  job: null,
  recentTopics: [],
};

function asked(questions: Array<{ question: string; topic: string; category: string; answer: string }>) {
  return questions;
}

describe('Adaptive interview question progression', () => {
  test('the first question is an introduction', () => {
    const first = templateNextQuestion({ ...base, asked: [], language: 'english' });
    expect(first.idx).toBe(0);
    expect(first.category).toBe('intro');
  });

  test('a Hinglish interview digs once, then moves to a role-specific question', () => {
    const intro = templateNextQuestion({ ...base, asked: [], language: 'hinglish' });
    const history = asked([{
      question: intro.question, topic: intro.topic, category: 'intro',
      answer: 'Maine React dashboard banaya tha aur API design kiya.',
    }]);
    const dig = templateNextQuestion({ ...base, asked: history, language: 'hinglish' });
    expect(dig.category).toBe('follow_up');

    const next = templateNextQuestion({
      ...base,
      asked: [...history, {
        question: dig.question, topic: dig.topic, category: 'follow_up',
        answer: 'Ek decision tha: virtualization. Humne measured kiya.',
      }],
      language: 'hinglish',
    });
    expect(['technical', 'project', 'behavioral', 'case']).toContain(next.category);
    expect(next.question).not.toMatch(/^Aapne/);
  });

  test('Hinglish follow-up probes rotate instead of repeating the same line', () => {
    const history = asked([
      { question: 'Tell me about yourself.', topic: 'Background', category: 'intro', answer: 'I built a React app.' },
      { question: 'Aapne react ka zikr kiya...', topic: 'Aapke answer se', category: 'follow_up', answer: 'Virtualization use kiya.' },
    ]);
    const firstDig = templateNextQuestion({ ...base, asked: history.slice(0, 1), language: 'hinglish' });
    const secondDig = templateNextQuestion({
      ...base,
      asked: [...history.slice(0, 1), {
        question: firstDig.question, topic: firstDig.topic, category: 'follow_up', answer: 'Team ke saath kiya.',
      }, history[1]],
      language: 'hinglish',
    });
    expect(secondDig.category).toBe('follow_up');
    expect(secondDig.question).not.toBe(firstDig.question);
  });

  test('English interviews alternate digs with fresh role questions', () => {
    const intro = templateNextQuestion({ ...base, asked: [], language: 'english' });
    const history = asked([{
      question: intro.question, topic: intro.topic, category: 'intro',
      answer: 'I built a React interface with 10 users and an API.',
    }]);
    const dig = templateNextQuestion({ ...base, asked: history, language: 'english' });
    expect(dig.category).toBe('follow_up');
    const next = templateNextQuestion({
      ...base,
      asked: [...history, {
        question: dig.question, topic: dig.topic, category: 'follow_up', answer: 'We chose a heap and measured it.',
      }],
      language: 'english',
    });
    expect(['technical', 'project', 'behavioral', 'case']).toContain(next.category);
  });
});
