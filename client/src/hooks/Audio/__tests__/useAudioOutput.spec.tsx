import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { act, render, screen, renderHook } from '@testing-library/react';
import useAudioOutput from '~/hooks/Audio/useAudioOutput';
import store from '~/store';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <RecoilRoot>{children}</RecoilRoot>;
}

function SpeakingReader() {
  const isSpeaking = useRecoilValue(store.isSpeakingFamily(0));
  return <span data-testid="is-speaking">{String(isSpeaking)}</span>;
}

function Player() {
  const { setIsSpeaking } = useAudioOutput({ index: 0 });
  React.useEffect(() => setIsSpeaking(true), [setIsSpeaking]);
  return null;
}

describe('useAudioOutput', () => {
  it('reports the assistant as speaking until every source has stopped', () => {
    const { result } = renderHook(
      () => ({
        first: useAudioOutput({ index: 0 }),
        second: useAudioOutput({ index: 0 }),
        isSpeaking: useRecoilValue(store.isSpeakingFamily(0)),
      }),
      { wrapper: Wrapper },
    );

    expect(result.current.isSpeaking).toBe(false);

    act(() => result.current.first.setIsSpeaking(true));
    act(() => result.current.second.setIsSpeaking(true));
    expect(result.current.isSpeaking).toBe(true);

    act(() => result.current.first.setIsSpeaking(false));
    expect(result.current.isSpeaking).toBe(true);
    expect(result.current.first.isSpeaking).toBe(false);
    expect(result.current.second.isSpeaking).toBe(true);

    act(() => result.current.second.setIsSpeaking(false));
    expect(result.current.isSpeaking).toBe(false);
  });

  it('keeps each source scoped to its own conversation index', () => {
    const { result } = renderHook(
      () => ({
        output: useAudioOutput({ index: 0 }),
        isSpeakingHere: useRecoilValue(store.isSpeakingFamily(0)),
        isSpeakingElsewhere: useRecoilValue(store.isSpeakingFamily(1)),
      }),
      { wrapper: Wrapper },
    );

    act(() => result.current.output.setIsSpeaking(true));

    expect(result.current.isSpeakingHere).toBe(true);
    expect(result.current.isSpeakingElsewhere).toBe(false);
  });

  it('mirrors state to the supplied onChange listener, without repeats', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useAudioOutput({ index: 0, onChange }), {
      wrapper: Wrapper,
    });

    act(() => result.current.setIsSpeaking(true));
    act(() => result.current.setIsSpeaking(true));
    act(() => result.current.setIsSpeaking(false));

    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('deregisters a torn-down player so the gate cannot stay closed', () => {
    function Harness({ playing }: { playing: boolean }) {
      return (
        <RecoilRoot>
          <SpeakingReader />
          {playing && <Player />}
        </RecoilRoot>
      );
    }

    const { rerender } = render(<Harness playing={true} />);
    expect(screen.getByTestId('is-speaking')).toHaveTextContent('true');

    rerender(<Harness playing={false} />);
    expect(screen.getByTestId('is-speaking')).toHaveTextContent('false');
  });
});
