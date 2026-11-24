import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

jest.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    user: { id: 'u1', email: 'cand@example.com', role: 'user' },
    init: jest.fn(),
  }),
}));

describe('public preview access', () => {
  it('shows the landing preview at /welcome even during an active session', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: /A job search/i })).toBeTruthy();
  });
});
