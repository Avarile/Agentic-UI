// The default preset and the preset modal's visibility.
//
// Small by design: presets are otherwise handled through hooks/Conversations, and
// only these two values need to be reachable from unrelated parts of the tree (the
// endpoint menus and the settings panel).

import { atom } from 'recoil';
import { TPreset } from 'librechat-data-provider';

const defaultPreset = atom<TPreset | null>({
  key: 'defaultPreset',
  default: null,
});

const presetModalVisible = atom<boolean>({
  key: 'presetModalVisible',
  default: false,
});

export default {
  defaultPreset,
  presetModalVisible,
};
