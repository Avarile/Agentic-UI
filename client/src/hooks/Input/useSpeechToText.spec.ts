import { act, renderHook } from '@testing-library/react';
import useSpeechToText from './useSpeechToText';

let mockSpeechToTextEndpoint = 'external';
let mockBrowserIsListening = false;
let mockExternalIsListening = false;

const mockStartSpeechRecordingBrowser = jest.fn();
const mockStopSpeechRecordingBrowser = jest.fn();
const mockAbortSpeechRecordingBrowser = jest.fn();
const mockStartSpeechRecordingExternal = jest.fn();
const mockStopSpeechRecordingExternal = jest.fn();
const mockAbortSpeechRecordingExternal = jest.fn();

jest.mock('./useGetAudioSettings', () => ({
  __esModule: true,
  default: () => ({ speechToTextEndpoint: mockSpeechToTextEndpoint }),
}));

jest.mock('./useSpeechToTextBrowser', () => ({
  __esModule: true,
  default: () => ({
    isListening: mockBrowserIsListening,
    isLoading: false,
    startRecording: mockStartSpeechRecordingBrowser,
    stopRecording: mockStopSpeechRecordingBrowser,
    abortRecording: mockAbortSpeechRecordingBrowser,
  }),
}));

jest.mock('./useSpeechToTextExternal', () => ({
  __esModule: true,
  default: () => ({
    isListening: mockExternalIsListening,
    isLoading: false,
    externalStartRecording: mockStartSpeechRecordingExternal,
    externalStopRecording: mockStopSpeechRecordingExternal,
    externalAbortRecording: mockAbortSpeechRecordingExternal,
  }),
}));

describe('useSpeechToText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSpeechToTextEndpoint = 'external';
    mockBrowserIsListening = false;
    mockExternalIsListening = false;
  });

  it('selects the externally seeded engine after settings change', () => {
    mockSpeechToTextEndpoint = 'browser';
    const { result, rerender } = renderHook(() => useSpeechToText(jest.fn(), jest.fn()));

    mockSpeechToTextEndpoint = 'external';
    rerender();

    act(() => result.current.startRecording());

    expect(mockStartSpeechRecordingExternal).toHaveBeenCalledTimes(1);
    expect(mockStartSpeechRecordingBrowser).not.toHaveBeenCalled();
  });

  it('selects the browser engine', () => {
    mockSpeechToTextEndpoint = 'browser';
    const { result } = renderHook(() => useSpeechToText(jest.fn(), jest.fn()));

    act(() => result.current.startRecording());

    expect(mockStartSpeechRecordingBrowser).toHaveBeenCalledTimes(1);
    expect(mockStartSpeechRecordingExternal).not.toHaveBeenCalled();
  });

  it('selects the active engine stop handler', () => {
    mockExternalIsListening = true;
    const { result } = renderHook(() => useSpeechToText(jest.fn(), jest.fn()));

    act(() => result.current.stopRecording());

    expect(mockStopSpeechRecordingExternal).toHaveBeenCalledTimes(1);
    expect(mockStartSpeechRecordingExternal).not.toHaveBeenCalled();
    expect(mockStopSpeechRecordingBrowser).not.toHaveBeenCalled();
  });

  it('selects the active engine abort handler', () => {
    mockExternalIsListening = true;
    const { result } = renderHook(() => useSpeechToText(jest.fn(), jest.fn()));

    act(() => result.current.abortRecording());

    expect(mockAbortSpeechRecordingExternal).toHaveBeenCalledTimes(1);
    expect(mockStopSpeechRecordingExternal).not.toHaveBeenCalled();
    expect(mockAbortSpeechRecordingBrowser).not.toHaveBeenCalled();
  });

  it('aborts through the browser engine when it is active', () => {
    mockSpeechToTextEndpoint = 'browser';
    mockBrowserIsListening = true;
    const { result } = renderHook(() => useSpeechToText(jest.fn(), jest.fn()));

    act(() => result.current.abortRecording());

    expect(mockAbortSpeechRecordingBrowser).toHaveBeenCalledTimes(1);
    expect(mockAbortSpeechRecordingExternal).not.toHaveBeenCalled();
  });
});
