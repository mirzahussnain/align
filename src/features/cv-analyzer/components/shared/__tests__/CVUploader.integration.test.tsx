// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DetectResponse } from '@/shared/types/target-detection';

// framer-motion's exit animations don't settle under jsdom; render children
// directly so view swaps are synchronous and assertable.
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...rest }: { children?: React.ReactNode }) => {
          // Drop motion-only props that React would warn about.
          const domProps = Object.fromEntries(
            Object.entries(rest).filter(
              ([k]) => !['initial', 'animate', 'exit', 'transition', 'variants'].includes(k)
            )
          );
          return <div {...domProps}>{children}</div>;
        },
    }
  ),
}));

// react-dropzone reads dropped files asynchronously via file-selector, which
// does not run under jsdom+user-event. Mock it to a plain dropzone and capture
// the component's own onDrop so a test can hand it a File deterministically.
let dropFile: ((files: File[]) => void) | null = null;
vi.mock('react-dropzone', () => ({
  useDropzone: (opts: { onDrop: (files: File[]) => void }) => {
    dropFile = opts.onDrop;
    return {
      getRootProps: () => ({}),
      getInputProps: () => ({ type: 'file' }),
      isDragActive: false,
    };
  },
}));

// The progress screen renders during analysis; keep it trivial.
vi.mock('../AnalysisProgress', () => ({
  default: () => <div data-testid="analysis-progress" />,
}));

import CVUploader from '../CVUploader';

/** Deterministically hand the mocked dropzone a PDF, as if the user dropped one. */
async function dropPdf() {
  await act(async () => {
    dropFile?.([pdf()]);
  });
}

const detectBody: DetectResponse = {
  detected: {
    occupation: 'software_engineer',
    label: 'Software Engineer',
    confidence: 'high',
    regulated: false,
  },
  activeProfile: {
    profileId: 'p1',
    label: 'Software track',
    isDefault: true,
    occupation: 'software_engineer',
    occupationLabel: 'Software Engineer',
    roleTitle: 'Backend Engineer',
    regulated: false,
  },
  savedProfiles: [
    {
      profileId: 'p1',
      label: 'Software track',
      isDefault: true,
      occupation: 'software_engineer',
      occupationLabel: 'Software Engineer',
      roleTitle: 'Backend Engineer',
      regulated: false,
    },
  ],
  mismatch: null,
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

function pdf(): File {
  return new File([new Uint8Array([1, 2, 3, 4])], 'cv.pdf', { type: 'application/pdf' });
}

beforeEach(() => {
  vi.restoreAllMocks();
  dropFile = null;
});
afterEach(cleanup);

describe('CVUploader ATS flow — detect then target-select then analyze', () => {
  it('uploads, runs deterministic detect, shows the target step, and submits the choice', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn() as Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(detectBody))
      .mockResolvedValueOnce(jsonResponse({ overallScore: 71, analysisId: 'an-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const onComplete = vi.fn();
    render(<CVUploader mode="ats" profileId="p1" onAnalysisComplete={onComplete} />);

    await dropPdf();
    await user.click(await screen.findByRole('button', { name: /continue/i }));

    // First call is the DETERMINISTIC detect endpoint (no analyze yet).
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/analyze/detect');

    // The target step appears with the detected target preselected (high conf).
    expect(
      await screen.findByRole('heading', { name: /what is this cv intended for/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /use detected target/i })).toBeChecked();

    await user.click(screen.getByRole('button', { name: /analyze cv/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith({ overallScore: 71, analysisId: 'an-1' }));
    // The analyze call carries the explicit selection.
    expect(fetchMock.mock.calls[1][0]).toBe('/api/analyze');
    const body = fetchMock.mock.calls[1][1].body as FormData;
    expect(body.get('targetSelection')).toBe('detected');
    expect(body.get('mode')).toBe('ats');
    expect(body.get('profileId')).toBe('p1');
  });

  it('never auto-uses the active Profile — a custom role is submitted as the target', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn() as Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(detectBody))
      .mockResolvedValueOnce(jsonResponse({ overallScore: 60 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<CVUploader mode="ats" profileId="p1" onAnalysisComplete={vi.fn()} />);

    await dropPdf();
    await user.click(await screen.findByRole('button', { name: /continue/i }));
    await screen.findByRole('heading', { name: /what is this cv intended for/i });

    await user.click(screen.getByRole('radio', { name: /enter another target role/i }));
    await user.type(screen.getByRole('textbox', { name: /target role/i }), 'Warehouse Operative');
    await user.click(screen.getByRole('button', { name: /analyze cv/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = fetchMock.mock.calls[1][1].body as FormData;
    expect(body.get('targetSelection')).toBe('custom_role');
    expect(body.get('targetRole')).toBe('Warehouse Operative');
  });

  it('surfaces a detect failure without advancing to the target step', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn() as Mock;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'Could not extract text from PDF.' }, false, 400)
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<CVUploader mode="ats" profileId="p1" onAnalysisComplete={vi.fn()} />);

    await dropPdf();
    await user.click(await screen.findByRole('button', { name: /continue/i }));

    expect(await screen.findByText(/could not extract text from pdf/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /what is this cv intended for/i })
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces an analyze error on the target step and allows a retry', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn() as Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(detectBody))
      .mockResolvedValueOnce(jsonResponse({ error: 'Analysis failed integrity validation.' }, false, 502))
      .mockResolvedValueOnce(jsonResponse({ overallScore: 80 }));
    vi.stubGlobal('fetch', fetchMock);

    const onComplete = vi.fn();
    render(<CVUploader mode="ats" profileId="p1" onAnalysisComplete={onComplete} />);

    await dropPdf();
    await user.click(await screen.findByRole('button', { name: /continue/i }));
    await screen.findByRole('heading', { name: /what is this cv intended for/i });

    await user.click(screen.getByRole('button', { name: /analyze cv/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/integrity validation/i);

    // The step is still shown; the user can retry.
    await user.click(screen.getByRole('button', { name: /analyze cv/i }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith({ overallScore: 80 }));
  });
});

describe('CVUploader job-match flow — no target step, JD is the target', () => {
  it('analyzes directly without calling detect', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn() as Mock;
    fetchMock.mockResolvedValueOnce(jsonResponse({ overallScore: 55, mode: 'job_match' }));
    vi.stubGlobal('fetch', fetchMock);

    const onComplete = vi.fn();
    render(<CVUploader mode="job_match" onAnalysisComplete={onComplete} />);

    await user.type(screen.getByPlaceholderText(/paste the full job advert/i), 'Warehouse Operative role');
    await dropPdf();
    await user.click(await screen.findByRole('button', { name: /run job match analysis/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    // Only the analyze endpoint was hit — no detect, no target step.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/analyze');
    expect(
      screen.queryByRole('heading', { name: /what is this cv intended for/i })
    ).not.toBeInTheDocument();
  });
});
