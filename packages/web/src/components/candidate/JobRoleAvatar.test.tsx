import React from 'react';
import { render, screen } from '@testing-library/react';
import { JobRoleAvatar, getRoleTheme } from './JobRoleAvatar';

describe('JobRoleAvatar', () => {
  it('picks a role-specific theme from the job title', () => {
    expect(getRoleTheme('Machine Learning Engineer', null, []).label).toBe('AI and machine learning');
    expect(getRoleTheme('Product Designer', null, []).label).toBe('Design');
    expect(getRoleTheme('Data Analyst', null, []).label).toBe('Data and analytics');
  });

  it('renders an accessible role mark instead of an initial', () => {
    render(<JobRoleAvatar title="Machine Learning Engineer" size={36} />);
    expect(screen.getByRole('img', { name: 'AI and machine learning role icon' })).toBeTruthy();
  });
});
