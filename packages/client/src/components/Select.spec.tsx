// SelectContent portals to document.body, so its stacking has to be resolved
// against whatever dialog it happens to be inside. It previously carried a
// hard-coded `z-40`, which put every Select opened inside an OGDialog (content
// z-index 140) behind the dialog — visible, but unclickable.

import { render, screen } from '@testing-library/react';
import { OGDialog, OGDialogContent } from './OriginalDialog';
import { Select, SelectItem, SelectValue, SelectContent, SelectTrigger } from './Select';

function Picker() {
  return (
    <Select defaultValue="a" open>
      <SelectTrigger aria-label="pick">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="a">first</SelectItem>
        <SelectItem value="b">second</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** Radix hoists the content's z-index onto the wrapper it portals to body. */
function popperZIndex(): number {
  const wrapper = document.querySelector<HTMLElement>('[data-radix-popper-content-wrapper]');
  if (wrapper && wrapper.style.zIndex) {
    return Number(wrapper.style.zIndex);
  }
  const content = screen.getByRole('listbox');
  return Number(content.style.zIndex);
}

describe('SelectContent stacking', () => {
  it('sits on the standard popover layer outside a dialog', () => {
    render(<Picker />);
    expect(popperZIndex()).toBe(50);
  });

  it('sits above the dialog content when opened inside one', () => {
    render(
      <OGDialog open>
        <OGDialogContent>
          <Picker />
        </OGDialogContent>
      </OGDialog>,
    );

    // OGDialogContent renders at 140 for a top-level dialog.
    expect(popperZIndex()).toBeGreaterThan(140);
  });

  it('still lets a caller override the z-index', () => {
    render(
      <Select defaultValue="a" open>
        <SelectTrigger aria-label="pick">
          <SelectValue />
        </SelectTrigger>
        <SelectContent style={{ zIndex: 9001 }}>
          <SelectItem value="a">first</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(popperZIndex()).toBe(9001);
  });
});
