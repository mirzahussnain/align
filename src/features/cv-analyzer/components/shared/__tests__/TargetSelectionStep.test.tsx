// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TargetSelectionStep from '../TargetSelectionStep';
import type {
  DetectResponse,
  ProfileTargetOption,
} from '@/shared/types/target-detection';

afterEach(cleanup);

function profileOption(over: Partial<ProfileTargetOption> = {}): ProfileTargetOption {
  return {
    profileId: 'p1',
    label: 'Software track',
    isDefault: true,
    occupation: 'software_engineer',
    occupationLabel: 'Software Engineer',
    roleTitle: 'Backend Engineer',
    regulated: false,
    ...over,
  };
}

function detectResponse(over: Partial<DetectResponse> = {}): DetectResponse {
  return {
    detected: {
      occupation: 'software_engineer',
      label: 'Software Engineer',
      confidence: 'high',
      regulated: false,
    },
    activeProfile: profileOption(),
    savedProfiles: [profileOption()],
    mismatch: null,
    ...over,
  };
}

const heading = /what is this cv intended for/i;

describe('TargetSelectionStep — confident detection', () => {
  it('preselects the detected target on high-confidence, non-conflicting detection', () => {
    render(<TargetSelectionStep detection={detectResponse()} onSubmit={vi.fn()} />);
    const detectedRadio = screen.getByRole('radio', { name: /use detected target/i });
    expect(detectedRadio).toBeChecked();
    expect(screen.getByRole('button', { name: /analyze cv/i })).toBeEnabled();
  });

  it('submits the detected selection with no extra fields', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TargetSelectionStep detection={detectResponse()} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: /analyze cv/i }));
    expect(onSubmit).toHaveBeenCalledWith({ targetSelection: 'detected' });
  });
});

describe('TargetSelectionStep — uncertain detection', () => {
  it('does not preselect and blocks submit until the user chooses (medium confidence)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const detection = detectResponse({
      detected: { occupation: 'software_engineer', label: 'Software Engineer', confidence: 'medium', regulated: false },
    });
    render(<TargetSelectionStep detection={detection} onSubmit={onSubmit} />);

    expect(screen.getByRole('radio', { name: /use detected target/i })).not.toBeChecked();
    const submit = screen.getByRole('button', { name: /analyze cv/i });
    expect(submit).toBeDisabled();

    // Clicking a disabled submit does nothing.
    await user.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();

    // Choosing enables it.
    await user.click(screen.getByRole('radio', { name: /use detected target/i }));
    expect(submit).toBeEnabled();
  });
});

describe('TargetSelectionStep — Profile/CV agreement vs mismatch', () => {
  it('shows no mismatch notice when the CV and active Profile agree', () => {
    render(<TargetSelectionStep detection={detectResponse()} onSubmit={vi.fn()} />);
    expect(screen.queryByText(/please choose which to analyse against/i)).not.toBeInTheDocument();
  });

  it('shows a mismatch notice and forces an explicit choice on conflict', () => {
    const detection = detectResponse({
      detected: { occupation: 'warehouse_operative', label: 'Warehouse Operative', confidence: 'high', regulated: false },
      mismatch: {
        detectedOccupation: 'warehouse_operative',
        detectedLabel: 'Warehouse Operative',
        profileOccupation: 'software_engineer',
        profileLabel: 'Software Engineer',
      },
    });
    render(<TargetSelectionStep detection={detection} onSubmit={vi.fn()} />);

    const notice = screen.getByRole('status');
    expect(within(notice).getByText(/warehouse operative/i)).toBeInTheDocument();
    // Even at high confidence, a conflict means nothing is preselected.
    expect(screen.getByRole('radio', { name: /use detected target/i })).not.toBeChecked();
    expect(screen.getByRole('button', { name: /analyze cv/i })).toBeDisabled();
  });
});

describe('TargetSelectionStep — saved Profile selection', () => {
  it('submits the chosen saved Profile id', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const detection = detectResponse({
      activeProfile: profileOption({ profileId: 'p1' }),
      savedProfiles: [
        profileOption({ profileId: 'p1' }),
        profileOption({
          profileId: 'p2',
          label: 'Warehouse track',
          occupation: 'warehouse_operative',
          occupationLabel: 'Warehouse Operative',
        }),
      ],
    });
    render(<TargetSelectionStep detection={detection} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('radio', { name: /choose another saved profile target/i }));
    // The select defaults to the only "other" saved profile (p2).
    expect(screen.getByRole('combobox')).toHaveValue('p2');
    await user.click(screen.getByRole('button', { name: /analyze cv/i }));

    expect(onSubmit).toHaveBeenCalledWith({ targetSelection: 'saved_profile', savedProfileId: 'p2' });
  });

  it('disables the saved-profile option when there is no other saved track', () => {
    const detection = detectResponse({
      activeProfile: profileOption({ profileId: 'p1' }),
      savedProfiles: [profileOption({ profileId: 'p1' })],
    });
    render(<TargetSelectionStep detection={detection} onSubmit={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /choose another saved profile target/i })).toBeDisabled();
  });
});

describe('TargetSelectionStep — custom role', () => {
  it('validates the custom role client-side and blocks an invalid one', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TargetSelectionStep detection={detectResponse()} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('radio', { name: /enter another target role/i }));
    const input = screen.getByRole('textbox', { name: /target role/i });
    await user.type(input, '123'); // no letters
    await user.tab(); // blur to reveal the error

    expect(screen.getByRole('alert')).toHaveTextContent(/must contain letters/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: /analyze cv/i })).toBeDisabled();
  });

  it('submits a valid custom role, trimmed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TargetSelectionStep detection={detectResponse()} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('radio', { name: /enter another target role/i }));
    await user.type(screen.getByRole('textbox', { name: /target role/i }), '  Warehouse Operative  ');
    await user.click(screen.getByRole('button', { name: /analyze cv/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      targetSelection: 'custom_role',
      targetRole: 'Warehouse Operative',
    });
  });
});

describe('TargetSelectionStep — General ATS Review', () => {
  it('submits the generic selection', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TargetSelectionStep detection={detectResponse()} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('radio', { name: /general ats review/i }));
    await user.click(screen.getByRole('button', { name: /analyze cv/i }));

    expect(onSubmit).toHaveBeenCalledWith({ targetSelection: 'generic' });
  });
});

describe('TargetSelectionStep — explicit regulated target', () => {
  it('shows the non-blocking regulated notice but still allows submission', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const detection = detectResponse({
      detected: { occupation: 'administrator', label: 'Administrator', confidence: 'high', regulated: false },
      activeProfile: profileOption({
        profileId: 'p1',
        label: 'Nursing track',
        occupation: 'registered_nurse',
        occupationLabel: 'Registered Nurse',
        regulated: true,
      }),
      savedProfiles: [
        profileOption({
          profileId: 'p1',
          label: 'Nursing track',
          occupation: 'registered_nurse',
          occupationLabel: 'Registered Nurse',
          regulated: true,
        }),
      ],
      mismatch: {
        detectedOccupation: 'administrator',
        detectedLabel: 'Administrator',
        profileOccupation: 'registered_nurse',
        profileLabel: 'Registered Nurse',
      },
    });
    render(<TargetSelectionStep detection={detection} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('radio', { name: /use active profile target/i }));
    expect(
      screen.getByText(/does not currently show evidence confirming the selected regulated profession/i)
    ).toBeInTheDocument();

    // Non-blocking: submission still proceeds.
    await user.click(screen.getByRole('button', { name: /analyze cv/i }));
    expect(onSubmit).toHaveBeenCalledWith({ targetSelection: 'active_profile' });
  });
});

describe('TargetSelectionStep — API error and duplicate submit', () => {
  it('surfaces a server error as an alert', () => {
    render(
      <TargetSelectionStep
        detection={detectResponse()}
        onSubmit={vi.fn()}
        error="The selected profile target could not be found."
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be found/i);
  });

  it('prevents duplicate submissions while a request is in flight', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <TargetSelectionStep detection={detectResponse()} onSubmit={onSubmit} isSubmitting />
    );

    const submit = screen.getByRole('button', { name: /analyzing/i });
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('TargetSelectionStep — accessibility', () => {
  it('exposes a labelled radiogroup with five named radios', () => {
    render(<TargetSelectionStep detection={detectResponse()} onSubmit={vi.fn()} />);
    const group = screen.getByRole('radiogroup');
    expect(group).toHaveAttribute('aria-required', 'true');
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(5);
    // Every radio has an accessible name (getByRole with name would throw otherwise).
    for (const radio of radios) {
      expect(radio).toHaveAccessibleName();
    }
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('is operable by keyboard — arrow keys move the selection within the group', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    // Medium confidence → nothing preselected, so keyboard drives the choice.
    const detection = detectResponse({
      detected: { occupation: 'software_engineer', label: 'Software Engineer', confidence: 'medium', regulated: false },
    });
    render(<TargetSelectionStep detection={detection} onSubmit={onSubmit} />);

    await user.tab(); // focus the first radio in the group
    const detectedRadio = screen.getByRole('radio', { name: /use detected target/i });
    expect(detectedRadio).toHaveFocus();

    await user.keyboard('[Space]'); // select the focused radio
    expect(detectedRadio).toBeChecked();

    await user.keyboard('[ArrowDown]'); // move to the next radio (selects it natively)
    expect(screen.getByRole('radio', { name: /use active profile target/i })).toBeChecked();
  });
});
