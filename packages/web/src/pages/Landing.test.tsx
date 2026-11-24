import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from './Landing';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = 'light';
});

const renderPage = () => render(
  <MemoryRouter initialEntries={['/']}>
    <Landing />
  </MemoryRouter>,
);

describe('public landing preview', () => {
  it('presents the hero, preview disclaimer and primary calls to action', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: /A job search/i })).toBeTruthy();
    expect(screen.getAllByText(/Create free account/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sign in/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Illustrative interface · sample data/i)).toBeTruthy();
  });

  it('explains the product, workflow, preparation, plans and trust sections', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /One workspace, every meaningful step/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Four steps, fully in your control/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Built for the role in front of you/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Clear pricing\. Honest limits/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /A tool, not a decision maker/i })).toBeTruthy();
  });

  it('shows only the known plan prices and does not claim checkout is live', () => {
    renderPage();
    expect(screen.getByText('₹0')).toBeTruthy();
    expect(screen.getByText('₹199')).toBeTruthy();
    expect(screen.getByText('₹499')).toBeTruthy();
    expect(screen.getByText('₹799')).toBeTruthy();
    expect(screen.getByText(/Checkout stays disabled/i)).toBeTruthy();
    expect(screen.getAllByText(/Configured by administrator/i)).toHaveLength(3);
  });

  it('keeps sign-in and registration reachable before login', () => {
    renderPage();
    expect(screen.getAllByRole('link', { name: /Create free account/i })[0].getAttribute('href')).toBe('/register');
    expect(screen.getAllByRole('link', { name: /^Sign in$/i })[0].getAttribute('href')).toBe('/login');
  });

  it('toggles the shared light and dark theme', () => {
    renderPage();
    const toggle = screen.getByRole('button', { name: 'Switch to dark theme' });
    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
