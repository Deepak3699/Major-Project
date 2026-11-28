import React from 'react';
import { render, screen } from '@testing-library/react';
import { ProfileAvatar } from './ProfileAvatar';

describe('ProfileAvatar', () => {
  it('renders a labelled illustrated preset by default', () => {
    render(<ProfileAvatar avatarId="ocean" name="Aarav Mehta" size={48} />);
    expect(screen.getByRole('img', { name: 'Aarav Mehta avatar' })).toBeTruthy();
  });

  it('uses an uploaded photo when one is supplied', () => {
    render(<ProfileAvatar src="data:image/png;base64,AAAA" name="Aarav Mehta" size={48} />);
    expect(screen.getByRole('img', { name: 'Aarav Mehta profile photo' })).toBeTruthy();
  });
});
