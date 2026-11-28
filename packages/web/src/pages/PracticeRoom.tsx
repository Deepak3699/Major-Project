import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PracticeShell } from '@/components/practice/PracticeShell';
import { GroupDiscussion } from '@/components/practice/GroupDiscussion';
import { PresentationStudio } from '@/components/practice/PresentationStudio';
import { MockRound } from '@/components/practice/MockRound';
import { PrepareMaterials } from '@/components/practice/PrepareMaterials';
import Practice from './Practice';

interface RoomConfig {
  title: string;
  eyebrow: string;
  description: string;
  component: (props: { onOpen: (tab: string) => void }) => React.ReactNode;
}

const ROOMS: Record<string, RoomConfig> = {
  interview: {
    title: 'AI interview room',
    eyebrow: 'Live practice',
    description: 'Choose an interviewer, set the difficulty and answer adaptive questions in a focused, private session.',
    component: () => <Practice embedded />,
  },
  prepare: {
    title: 'Prepare materials',
    eyebrow: 'Grounded preparation',
    description: 'Generate job-specific interview preparation, group discussion prompts, presentation structure and company research.',
    component: () => <PrepareMaterials />,
  },
  group: {
    title: 'Group discussion',
    eyebrow: 'Conference hall',
    description: 'A mentor sets an India-focused topic, members speak in turn, and the room closes with a hand-raised conclusion.',
    component: () => <GroupDiscussion />,
  },
  presentation: {
    title: 'Presentation stage',
    eyebrow: 'Timed delivery',
    description: 'Reveal a queue card, prepare for 45 seconds, then deliver for two minutes with a live timer and mentor tips.',
    component: () => <PresentationStudio />,
  },
  mock: {
    title: 'Full mock round',
    eyebrow: 'The complete test',
    description: 'Aptitude, group discussion, presentation and interview in one sequence. Your first round is free.',
    component: () => <MockRound />,
  },
} as const;

export type PracticeRoomSlug = keyof typeof ROOMS;

const PracticeRoom: React.FC<{ room: PracticeRoomSlug }> = ({ room }) => {
  const navigate = useNavigate();
  // The group discussion is a full-bleed conference hall with its own header,
  // so it intentionally skips the generic room shell.
  if (room === 'group') return <GroupDiscussion />;
  const config = ROOMS[room];
  const onOpen = (tab: string) => navigate(`/practice/${tab === 'stage' ? 'presentation' : tab}`);
  return (
    <PracticeShell title={config.title} eyebrow={config.eyebrow} description={config.description}>
      {config.component({ onOpen })}
    </PracticeShell>
  );
};

export default PracticeRoom;
