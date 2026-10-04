// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SkillsForm from '../SkillsForm';

const saveSkillRecord = vi.fn();

vi.mock('@/features/dashboard/actions/profile-actions', () => ({
  saveSkillRecord: (...args: unknown[]) => saveSkillRecord(...args),
  deleteSkillRecord: vi.fn(),
}));

vi.mock('../SkillTaxonomyPicker', () => ({
  default: ({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) => (
    <input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Career Profile skill category editing', () => {
  it('persists an edited category and keeps it in the rendered profile row', async () => {
    saveSkillRecord.mockResolvedValue({ ok: true, id: 'skill-1' });
    render(<SkillsForm initial={[{
      id: 'group-1',
      category: 'Languages',
      skills: ['TypeScript'],
      skillItems: [{ id: 'skill-1', name: 'TypeScript' }],
    }]} profileId="profile-1" />);

    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    const category = screen.getByLabelText(/category/i);
    await userEvent.clear(category);
    await userEvent.type(category, 'Frontend');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(saveSkillRecord).toHaveBeenCalledWith(expect.objectContaining({
      id: 'skill-1',
      name: 'TypeScript',
      category: 'Frontend',
    }), 'profile-1');
    expect(await screen.findByText(/Frontend/)).toBeTruthy();
  });
});
