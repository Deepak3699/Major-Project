import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import Login from './Login';
import { auth } from '@/lib/api';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  );
};

jest.mock('@/lib/api', () => ({
  auth: {
    login: jest.fn(),
  },
}));

describe('Login', () => {
  it('renders login form', () => {
    renderWithProviders(<Login />);
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
  });

  it('submits with valid data', async () => {
    const mockLogin = auth.login as jest.MockedFunction<typeof auth.login>;
    mockLogin.mockResolvedValue({ access_token: 'token', token_type: 'Bearer', expires_in: 604800, user: { id: '1', email: 'test@test.com', role: 'admin' } });

    renderWithProviders(<Login />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('test@test.com', 'password123'));
  });

  it('shows error on login failure', async () => {
    const mockLogin = auth.login as jest.MockedFunction<typeof auth.login>;
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));

    renderWithProviders(<Login />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByText(/invalid credentials/i)).toBeTruthy());
  });
});
